<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class WebhookService
{
    public function __construct(
        private Database $db,
        private CrmSyncService $crmSync,
        private LeadService $leadService,
        private TransferService $transferService,
    ) {}

    public function process(array $payload, string $signature, string $rawBody): void
    {
        $this->validateSignature($signature, $rawBody);

        $eventType = $payload['event'] ?? throw new RuntimeException('Missing event type', 400);
        $callId    = $payload['call_id'] ?? null;
        $leadId    = $this->resolveLeadId($payload);

        if (!$leadId) {
            throw new RuntimeException("Cannot resolve lead from payload", 422);
        }

        $lead = $this->db->fetch('SELECT * FROM leads WHERE id = ?', [$leadId]);
        if (!$lead) throw new RuntimeException("Lead not found: {$leadId}", 404);

        $this->db->insert('call_logs', [
            'lead_id'           => $leadId,
            'campaign_id'       => $lead['campaign_id'],
            'broker_id'         => $lead['broker_id'],
            'voximplant_call_id'=> $callId,
            'event_type'        => $eventType,
            'event_payload'     => json_encode($payload),
        ]);

        match ($eventType) {
            'call_started'       => $this->onCallStarted($lead, $payload),
            'human_detected'     => $this->onHumanDetected($lead, $payload),
            'voicemail_detected' => $this->onVoicemailDetected($lead, $payload),
            'no_answer'          => $this->onNoAnswer($lead, $payload),
            'ai_classification'  => $this->onAiClassification($lead, $payload),
            'transfer_started'   => $this->onTransferStarted($lead, $payload),
            'transfer_completed' => $this->onTransferCompleted($lead, $payload),
            'call_ended'         => $this->onCallEnded($lead, $payload),
            default              => null,
        };

        $this->updateCampaignStats($lead['campaign_id'], $lead['broker_id'], $eventType);
    }

    // ---------------------------------------------------------
    // Event handlers
    // ---------------------------------------------------------
    private function onCallStarted(array $lead, array $payload): void
    {
        $this->db->update('leads', [
            'status'        => 'called',
            'attempt_count' => $lead['attempt_count'] + 1,
        ], 'id = ?', [$lead['id']]);
    }

    private function onHumanDetected(array $lead, array $payload): void
    {
        $this->leadService->updateStatus($lead['id'], 'human');
    }

    private function onVoicemailDetected(array $lead, array $payload): void
    {
        $this->leadService->updateStatus($lead['id'], 'voicemail');
        $this->scheduleRetryIfEligible($lead);
    }

    private function onNoAnswer(array $lead, array $payload): void
    {
        $this->scheduleRetryIfEligible($lead);
    }

    private function onAiClassification(array $lead, array $payload): void
    {
        $classification = $payload['classification'] ?? null;
        $confidence     = $payload['confidence'] ?? null;
        $transcript     = $payload['transcript'] ?? null;
        $summary        = $payload['summary'] ?? null;

        $this->db->update('call_logs', [
            'ai_classification' => $classification,
            'ai_confidence'     => $confidence,
            'transcript'        => $transcript,
            'ai_summary'        => $summary,
        ], 'voximplant_call_id = ? AND lead_id = ?', [$payload['call_id'] ?? '', $lead['id']]);

        $newStatus = match ($classification) {
            'not_interested'      => 'not_interested',
            'curious'             => 'curious',
            'activation_requested'=> 'activation_requested',
            default               => null,
        };

        if ($newStatus) {
            $this->leadService->updateStatus($lead['id'], $newStatus);
        }

        if ($classification === 'activation_requested') {
            $this->transferService->initiate($lead['id'], $lead['campaign_id']);
        }

        $this->crmSync->trigger($lead['id'], 'ai_classification', [
            'lead_id'        => $lead['id'],
            'classification' => $classification,
            'confidence'     => $confidence,
            'transcript'     => $transcript,
        ]);
    }

    private function onTransferStarted(array $lead, array $payload): void
    {
        $this->leadService->updateStatus($lead['id'], 'transferred');
    }

    private function onTransferCompleted(array $lead, array $payload): void
    {
        $this->crmSync->trigger($lead['id'], 'transfer_completed', [
            'lead_id'   => $lead['id'],
            'outcome'   => $payload['outcome'] ?? null,
        ]);
    }

    private function onCallEnded(array $lead, array $payload): void
    {
        $duration = (int)($payload['duration_seconds'] ?? 0);
        if ($duration > 0) {
            $this->db->query(
                'UPDATE lead_attempts SET duration_seconds = ?, ended_at = NOW() WHERE lead_id = ? ORDER BY id DESC LIMIT 1',
                [$duration, $lead['id']]
            );
        }
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    private function scheduleRetryIfEligible(array $lead): void
    {
        $campaign = $this->db->fetch('SELECT * FROM campaigns WHERE id = ?', [$lead['campaign_id']]);
        if (!$campaign) return;

        if ($lead['attempt_count'] < $campaign['max_attempts']) {
            $this->leadService->scheduleRetry(
                $lead['id'],
                $campaign['retry_interval_minutes'],
                'auto_retry'
            );
        }
    }

    private function resolveLeadId(array $payload): ?int
    {
        if (!empty($payload['lead_id'])) return (int)$payload['lead_id'];
        if (!empty($payload['phone'])) {
            $phone = preg_replace('/\D/', '', $payload['phone']);
            $lead  = $this->db->fetch('SELECT id FROM leads WHERE phone_normalized = ? LIMIT 1', [$phone]);
            return $lead ? (int)$lead['id'] : null;
        }
        return null;
    }

    private function validateSignature(string $signature, string $rawBody): void
    {
        $secret   = $_ENV['VOXIMPLANT_WEBHOOK_SECRET'] ?? '';
        $expected = hash_hmac('sha256', $rawBody, $secret);
        if (!hash_equals($expected, $signature)) {
            throw new RuntimeException('Invalid webhook signature', 403);
        }
    }

    private function updateCampaignStats(int $campaignId, int $brokerId, string $eventType): void
    {
        $date = date('Y-m-d');
        $hour = (int)date('H');

        $col = match($eventType) {
            'call_started'       => 'total_calls',
            'human_detected'     => 'human_detected',
            'voicemail_detected' => 'voicemail_detected',
            'no_answer'          => 'no_answer',
            'transfer_completed' => 'transferred',
            default              => null,
        };
        if (!$col) return;

        $this->db->query(
            "INSERT INTO campaign_stats (campaign_id, broker_id, stat_date, stat_hour, {$col})
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE {$col} = {$col} + 1",
            [$campaignId, $brokerId, $date, $hour]
        );
    }
}
