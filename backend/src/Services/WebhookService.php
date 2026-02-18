<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Services\CampaignActivityLogger;
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
        // Link call_id to latest pending attempt
        $callId = $payload['call_id'] ?? null;
        if ($callId) {
            $this->db->query(
                "UPDATE lead_attempts SET call_id = ? WHERE lead_id = ? AND outcome = 'pending' ORDER BY id DESC LIMIT 1",
                [$callId, $lead['id']]
            );
        }

        $this->db->update('leads', [
            'status'        => 'called',
            'attempt_count' => $lead['attempt_count'] + 1,
        ], 'id = ?', [$lead['id']]);
    }

    private function onHumanDetected(array $lead, array $payload): void
    {
        $this->updateLatestAttemptOutcome($lead['id'], 'human');
        $this->leadService->updateStatus($lead['id'], 'human');
        CampaignActivityLogger::log((int)$lead['campaign_id'], 'human_detected', "Human detected on {$lead['phone']}", (int)$lead['id']);
    }

    private function onVoicemailDetected(array $lead, array $payload): void
    {
        $this->removeActiveCall($lead['id']);
        $this->updateLatestAttemptOutcome($lead['id'], 'voicemail');
        $this->leadService->updateStatus($lead['id'], 'voicemail');
        $this->scheduleRetryIfEligible($lead);
        CampaignActivityLogger::log((int)$lead['campaign_id'], 'voicemail_detected', "Voicemail detected on {$lead['phone']}", (int)$lead['id']);
    }

    private function onNoAnswer(array $lead, array $payload): void
    {
        $this->removeActiveCall($lead['id']);
        $this->updateLatestAttemptOutcome($lead['id'], 'no_answer');
        $this->scheduleRetryIfEligible($lead);
        CampaignActivityLogger::log((int)$lead['campaign_id'], 'no_answer', "No answer on {$lead['phone']}", (int)$lead['id']);
    }

    private function onAiClassification(array $lead, array $payload): void
    {
        $classification = $payload['classification'] ?? null;
        $confidence     = $payload['confidence'] ?? null;
        $transcript     = $payload['transcript'] ?? null;
        $summary        = $payload['summary'] ?? null;

        // Store AI data on call_logs
        $this->db->update('call_logs', [
            'ai_classification' => $classification,
            'ai_confidence'     => $confidence,
            'transcript'        => $transcript,
            'ai_summary'        => $summary,
        ], 'voximplant_call_id = ? AND lead_id = ?', [$payload['call_id'] ?? '', $lead['id']]);

        // Store AI data on the latest attempt
        $this->db->query(
            "UPDATE lead_attempts SET ai_classification = ?, ai_confidence = ?, transcript = ?, ai_summary = ?
             WHERE lead_id = ? ORDER BY id DESC LIMIT 1",
            [$classification, $confidence, $transcript, $summary, $lead['id']]
        );

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

        CampaignActivityLogger::log(
            (int)$lead['campaign_id'], 'ai_classified',
            "AI classified {$lead['phone']} as {$classification} (confidence: {$confidence})",
            (int)$lead['id'],
            details: ['classification' => $classification, 'confidence' => $confidence]
        );
    }

    private function onTransferStarted(array $lead, array $payload): void
    {
        $this->leadService->updateStatus($lead['id'], 'transferred');
        CampaignActivityLogger::log((int)$lead['campaign_id'], 'transfer_initiated', "Transfer initiated for {$lead['phone']}", (int)$lead['id']);
    }

    private function onTransferCompleted(array $lead, array $payload): void
    {
        $this->crmSync->trigger($lead['id'], 'transfer_completed', [
            'lead_id'   => $lead['id'],
            'outcome'   => $payload['outcome'] ?? null,
        ]);
        CampaignActivityLogger::log(
            (int)$lead['campaign_id'], 'transfer_completed',
            "Transfer completed for {$lead['phone']} — outcome: " . ($payload['outcome'] ?? 'unknown'),
            (int)$lead['id'],
            details: ['outcome' => $payload['outcome'] ?? null]
        );
    }

    private function onCallEnded(array $lead, array $payload): void
    {
        $this->removeActiveCall($lead['id']);

        $duration = (int)($payload['duration_seconds'] ?? 0);
        $this->db->query(
            'UPDATE lead_attempts SET duration_seconds = ?, ended_at = NOW() WHERE lead_id = ? ORDER BY id DESC LIMIT 1',
            [$duration, $lead['id']]
        );

        // Mark any still-pending attempts as 'failed'
        $this->db->query(
            "UPDATE lead_attempts SET outcome = 'failed', ended_at = NOW() WHERE lead_id = ? AND outcome = 'pending'",
            [$lead['id']]
        );

        CampaignActivityLogger::log(
            (int)$lead['campaign_id'], 'call_completed',
            "Call ended for {$lead['phone']} — duration: {$duration}s",
            (int)$lead['id'],
            details: ['duration_seconds' => $duration]
        );
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    private function updateLatestAttemptOutcome(int $leadId, string $outcome): void
    {
        $this->db->query(
            'UPDATE lead_attempts SET outcome = ? WHERE lead_id = ? ORDER BY id DESC LIMIT 1',
            [$outcome, $leadId]
        );
    }

    private function removeActiveCall(int $leadId): void
    {
        $this->db->query('DELETE FROM active_calls WHERE lead_id = ?', [$leadId]);
    }

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
