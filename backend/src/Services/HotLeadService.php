<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;

class HotLeadService
{
    private const HOT_STATUSES = ['activation_requested', 'transferred', 'curious'];

    public function __construct(private Database $db) {}

    public function getHotLeads(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ["(l.status IN ('activation_requested','transferred','curious') OR t.outcome = 'converted')"];
        $params = [];

        if (!empty($filters['broker_id'])) {
            $where[]  = 'l.broker_id = ?';
            $params[] = $filters['broker_id'];
        }
        if (!empty($filters['campaign_id'])) {
            $where[]  = 'l.campaign_id = ?';
            $params[] = $filters['campaign_id'];
        }
        if (!empty($filters['status'])) {
            $where[]  = 'l.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['date_from'])) {
            $where[]  = 'l.updated_at >= ?';
            $params[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[]  = 'l.updated_at <= ?';
            $params[] = $filters['date_to'] . ' 23:59:59';
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $leads = $this->db->fetchAll(
            "SELECT l.*,
                    c.name as campaign_name,
                    b.name as broker_name,
                    cl.ai_classification, cl.ai_confidence, cl.ai_summary, cl.transcript,
                    cl.created_at as call_date,
                    t.id as transfer_id, t.outcome as transfer_outcome, t.agent_notes,
                    t.status as transfer_status,
                    u.name as agent_name
             FROM leads l
             LEFT JOIN campaigns c ON c.id = l.campaign_id
             LEFT JOIN brokers b ON b.id = l.broker_id
             LEFT JOIN call_logs cl ON cl.id = (
                 SELECT cl2.id FROM call_logs cl2
                 WHERE cl2.lead_id = l.id
                 ORDER BY cl2.created_at DESC LIMIT 1
             )
             LEFT JOIN transfers t ON t.id = (
                 SELECT t2.id FROM transfers t2
                 WHERE t2.lead_id = l.id
                 ORDER BY t2.initiated_at DESC LIMIT 1
             )
             LEFT JOIN agents ag ON ag.id = t.agent_id
             LEFT JOIN users u ON u.id = ag.user_id
             WHERE {$whereStr}
             ORDER BY l.updated_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(DISTINCT l.id) as cnt
             FROM leads l
             LEFT JOIN transfers t ON t.lead_id = l.id
             WHERE {$whereStr}",
            $params
        )['cnt'];

        // Stats
        $statsParams = $params;
        $stats = $this->db->fetch(
            "SELECT
                COUNT(DISTINCT l.id) as total,
                COUNT(DISTINCT CASE WHEN t.outcome = 'converted' THEN l.id END) as converted
             FROM leads l
             LEFT JOIN transfers t ON t.lead_id = l.id
             WHERE {$whereStr}",
            $statsParams
        );

        return [
            'data'    => $leads,
            'total'   => (int)$total,
            'page'    => $page,
            'per_page'=> $perPage,
            'stats'   => [
                'total_hot'       => (int)$stats['total'],
                'converted'       => (int)$stats['converted'],
                'conversion_rate' => $stats['total'] > 0
                    ? round(($stats['converted'] / $stats['total']) * 100, 1)
                    : 0,
            ],
        ];
    }

    public function getHotLeadDetail(int $id): ?array
    {
        $lead = $this->db->fetch(
            "SELECT l.*, c.name as campaign_name, b.name as broker_name
             FROM leads l
             LEFT JOIN campaigns c ON c.id = l.campaign_id
             LEFT JOIN brokers b ON b.id = l.broker_id
             WHERE l.id = ?",
            [$id]
        );
        if (!$lead) return null;

        $lead['call_logs'] = $this->db->fetchAll(
            "SELECT * FROM call_logs WHERE lead_id = ? ORDER BY created_at DESC",
            [$id]
        );

        $lead['transfers'] = $this->db->fetchAll(
            "SELECT t.*, u.name as agent_name
             FROM transfers t
             LEFT JOIN agents ag ON ag.id = t.agent_id
             LEFT JOIN users u ON u.id = ag.user_id
             WHERE t.lead_id = ?
             ORDER BY t.initiated_at DESC",
            [$id]
        );

        $lead['attempts'] = $this->db->fetchAll(
            "SELECT * FROM lead_attempts WHERE lead_id = ? ORDER BY started_at DESC",
            [$id]
        );

        return $lead;
    }
}
