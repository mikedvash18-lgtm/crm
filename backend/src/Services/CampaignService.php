<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class CampaignService
{
    public function __construct(private Database $db) {}

    public function getAll(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['status'])) {
            $where[]  = 'c.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['broker_id'])) {
            $where[]  = 'c.broker_id = ?';
            $params[] = $filters['broker_id'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $campaigns = $this->db->fetchAll(
            "SELECT c.*, b.name as broker_name, co.name as country_name,
                    u.name as created_by_name,
                    (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) as total_leads
             FROM campaigns c
             JOIN brokers b ON b.id = c.broker_id
             JOIN countries co ON co.id = c.country_id
             JOIN users u ON u.id = c.created_by
             WHERE {$whereStr}
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM campaigns c WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $campaigns, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getById(int $id): ?array
    {
        return $this->db->fetch(
            'SELECT c.*, b.name as broker_name, co.name as country_name
             FROM campaigns c
             JOIN brokers b ON b.id = c.broker_id
             JOIN countries co ON co.id = c.country_id
             WHERE c.id = ?',
            [$id]
        );
    }

    public function create(array $data, int $userId): int
    {
        $this->validateCampaignData($data);

        return $this->db->insert('campaigns', [
            'broker_id'               => $data['broker_id'],
            'country_id'              => $data['country_id'],
            'created_by'              => $userId,
            'name'                    => $data['name'],
            'script_a_id'             => $data['script_a_id'] ?? null,
            'script_b_id'             => $data['script_b_id'] ?? null,
            'script_c_id'             => $data['script_c_id'] ?? null,
            'concurrency_limit'       => $data['concurrency_limit'] ?? 10,
            'max_attempts'            => $data['max_attempts'] ?? 3,
            'retry_interval_minutes'  => $data['retry_interval_minutes'] ?? 60,
            'call_window_start'       => $data['call_window_start'] ?? '09:00:00',
            'call_window_end'         => $data['call_window_end'] ?? '20:00:00',
            'call_window_timezone'    => $data['call_window_timezone'] ?? 'UTC',
            'caller_id'               => $data['caller_id'] ?? null,
            'voximplant_app_id'       => $data['voximplant_app_id'] ?? null,
            'status'                  => 'draft',
        ]);
    }

    public function update(int $id, array $data): bool
    {
        $campaign = $this->getById($id);
        if (!$campaign) throw new RuntimeException('Campaign not found', 404);
        if (in_array($campaign['status'], ['completed', 'archived'])) {
            throw new RuntimeException('Cannot modify a completed or archived campaign', 422);
        }

        $allowed = ['name','script_a_id','script_b_id','script_c_id','concurrency_limit',
                    'max_attempts','retry_interval_minutes','call_window_start','call_window_end',
                    'call_window_timezone','caller_id','voximplant_app_id'];
        $update  = array_intersect_key($data, array_flip($allowed));

        if (empty($update)) return false;

        $this->db->update('campaigns', $update, 'id = ?', [$id]);
        return true;
    }

    public function start(int $id): bool
    {
        $campaign = $this->getById($id);
        if (!$campaign) throw new RuntimeException('Campaign not found', 404);
        if (!in_array($campaign['status'], ['draft', 'paused'])) {
            throw new RuntimeException('Campaign cannot be started in its current state', 422);
        }

        $this->db->update('campaigns', ['status' => 'active', 'started_at' => date('Y-m-d H:i:s')], 'id = ?', [$id]);
        return true;
    }

    public function pause(int $id): bool
    {
        $this->db->update('campaigns', ['status' => 'paused', 'paused_at' => date('Y-m-d H:i:s')], 'id = ?', [$id]);
        return true;
    }

    public function resume(int $id): bool
    {
        $this->db->update('campaigns', ['status' => 'active', 'paused_at' => null], 'id = ?', [$id]);
        return true;
    }

    private function validateCampaignData(array $data): void
    {
        $required = ['name', 'broker_id', 'country_id'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                throw new RuntimeException("Field '{$field}' is required", 422);
            }
        }
    }
}
