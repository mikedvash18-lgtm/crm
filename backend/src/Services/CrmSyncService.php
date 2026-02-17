<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;

class CrmSyncService
{
    public function __construct(private Database $db) {}

    public function trigger(int $leadId, string $eventType, array $data): void
    {
        $lead   = $this->db->fetch('SELECT * FROM leads WHERE id = ?', [$leadId]);
        $broker = $this->db->fetch('SELECT * FROM brokers WHERE id = ?', [$lead['broker_id']]);

        if (!$broker || !$broker['crm_endpoint']) return;

        $payload = $this->buildPayload($lead, $broker, $eventType, $data);

        $logId = $this->db->insert('crm_event_logs', [
            'lead_id'    => $leadId,
            'broker_id'  => $broker['id'],
            'event_type' => $eventType,
            'payload'    => json_encode($payload),
            'status'     => 'pending',
        ]);

        $this->sendRequest($broker, $payload, $logId);
    }

    private function sendRequest(array $broker, array $payload, int $logId): void
    {
        $ch = curl_init($broker['crm_endpoint']);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Api-Key: ' . $broker['crm_api_key'],
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        $success = $httpCode >= 200 && $httpCode < 300;

        $this->db->update('crm_event_logs', [
            'status'        => $success ? 'sent' : 'failed',
            'response_code' => $httpCode,
            'response_body' => $response ?: $error,
            'sent_at'       => date('Y-m-d H:i:s'),
            'attempt_count' => 1,
            'next_retry_at' => $success ? null : date('Y-m-d H:i:s', time() + 300),
        ], 'id = ?', [$logId]);
    }

    public function retryFailed(): int
    {
        $failed = $this->db->fetchAll(
            "SELECT cel.*, b.crm_endpoint, b.crm_api_key
             FROM crm_event_logs cel
             JOIN brokers b ON b.id = cel.broker_id
             WHERE cel.status IN ('failed','retry')
               AND cel.attempt_count < 5
               AND cel.next_retry_at <= NOW()"
        );

        foreach ($failed as $log) {
            $payload = json_decode($log['payload'], true);
            $this->sendRequest($log, $payload, $log['id']);
        }

        return count($failed);
    }

    private function buildPayload(array $lead, array $broker, string $event, array $data): array
    {
        $template = $broker['crm_payload_template']
            ? json_decode($broker['crm_payload_template'], true)
            : [];

        return array_merge($template, [
            'event'      => $event,
            'timestamp'  => date('c'),
            'lead'       => [
                'id'         => $lead['id'],
                'first_name' => $lead['first_name'],
                'last_name'  => $lead['last_name'],
                'phone'      => $lead['phone'],
                'email'      => $lead['email'],
            ],
            'data' => $data,
        ]);
    }
}
