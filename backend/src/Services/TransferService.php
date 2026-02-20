<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class TransferService
{
    public function __construct(private Database $db) {}

    public function initiate(int $leadId, int $campaignId): int
    {
        $agent = $this->findAvailableAgent($campaignId);

        $transferId = $this->db->insert('transfers', [
            'lead_id'      => $leadId,
            'campaign_id'  => $campaignId,
            'agent_id'     => $agent ? $agent['id'] : null,
            'status'       => $agent ? 'ringing' : 'initiated',
            'initiated_at' => date('Y-m-d H:i:s'),
        ]);

        if ($agent) {
            $this->db->update('agents', ['status' => 'busy'], 'id = ?', [$agent['id']]);
        }

        return $transferId;
    }

    public function accept(int $transferId, int $agentId): void
    {
        $this->db->update('transfers', [
            'status'      => 'accepted',
            'accepted_at' => date('Y-m-d H:i:s'),
        ], 'id = ? AND agent_id = ?', [$transferId, $agentId]);

        $this->db->update('agents', ['status' => 'on_call'], 'id = ?', [$agentId]);
    }

    public function reject(int $transferId, int $agentId): void
    {
        $this->db->update('transfers', ['status' => 'rejected'], 'id = ?', [$transferId]);
        $this->db->update('agents', ['status' => 'available'], 'id = ?', [$agentId]);

        // Try to reassign
        $transfer = $this->db->fetch('SELECT * FROM transfers WHERE id = ?', [$transferId]);
        if ($transfer) {
            $newAgent = $this->findAvailableAgent($transfer['campaign_id'], $agentId);
            if ($newAgent) {
                $this->db->update('transfers', [
                    'status'   => 'ringing',
                    'agent_id' => $newAgent['id'],
                ], 'id = ?', [$transferId]);
                $this->db->update('agents', ['status' => 'busy'], 'id = ?', [$newAgent['id']]);
            }
        }
    }

    public function complete(int $transferId, string $outcome, ?string $notes = null): void
    {
        $transfer = $this->db->fetch('SELECT * FROM transfers WHERE id = ?', [$transferId]);
        if (!$transfer) return;

        $this->db->update('transfers', [
            'status'       => 'completed',
            'outcome'      => $outcome,
            'agent_notes'  => $notes,
            'completed_at' => date('Y-m-d H:i:s'),
        ], 'id = ?', [$transferId]);

        if ($transfer['agent_id']) {
            $this->db->update('agents', ['status' => 'available'], 'id = ?', [$transfer['agent_id']]);
        }

        $leadStatus = match($outcome) {
            'converted'      => 'closed',
            'not_interested' => 'not_interested',
            default          => 'called',
        };
        $this->db->update('leads', ['status' => $leadStatus], 'id = ?', [$transfer['lead_id']]);
    }

    private function findAvailableAgent(int $campaignId, int $excludeAgentId = 0): ?array
    {
        $campaign = $this->db->fetch('SELECT broker_id FROM campaigns WHERE id = ?', [$campaignId]);
        if (!$campaign) return null;

        $excludeClause = $excludeAgentId > 0 ? 'AND a.id != ?' : '';
        $params = [$campaign['broker_id']];
        if ($excludeAgentId > 0) $params[] = $excludeAgentId;

        return $this->db->fetch(
            "SELECT a.* FROM agents a
             WHERE a.broker_id = ? AND a.status = 'available' {$excludeClause}
             ORDER BY a.last_seen_at DESC
             LIMIT 1",
            $params
        );
    }

    public function getAgentTransfers(int $agentId, string $status = 'ringing'): array
    {
        return $this->db->fetchAll(
            "SELECT t.*, l.first_name, l.last_name, l.phone, l.email,
                    cl.transcript, cl.ai_summary, cl.ai_classification
             FROM transfers t
             JOIN leads l ON l.id = t.lead_id
             LEFT JOIN call_logs cl ON cl.lead_id = t.lead_id AND cl.event_type = 'ai_classification'
             WHERE t.agent_id = ? AND t.status = ?
             ORDER BY t.initiated_at DESC",
            [$agentId, $status]
        );
    }

    public function getPendingForBroker(int $agentId, int $brokerId): array
    {
        return $this->db->fetchAll(
            "SELECT t.*, l.first_name, l.last_name, l.phone, l.email,
                    cl.transcript, cl.ai_summary, cl.ai_classification
             FROM transfers t
             JOIN leads l ON l.id = t.lead_id
             LEFT JOIN call_logs cl ON cl.lead_id = t.lead_id AND cl.event_type = 'ai_classification'
             WHERE t.agent_id = ? AND t.status = 'ringing' AND l.broker_id = ?
             ORDER BY t.initiated_at DESC",
            [$agentId, $brokerId]
        );
    }
}
