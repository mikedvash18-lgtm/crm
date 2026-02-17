<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class BrokerService
{
    public function __construct(private Database $db) {}

    public function getAll(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['1=1'];
        $params = [];

        if (isset($filters['is_active']) && $filters['is_active'] !== '') {
            $where[]  = 'b.is_active = ?';
            $params[] = (int)$filters['is_active'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $brokers = $this->db->fetchAll(
            "SELECT b.*,
                    (SELECT COUNT(*) FROM campaigns c WHERE c.broker_id = b.id) as campaign_count
             FROM brokers b
             WHERE {$whereStr}
             ORDER BY b.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM brokers b WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $brokers, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getById(int $id): ?array
    {
        return $this->db->fetch('SELECT * FROM brokers WHERE id = ?', [$id]);
    }

    public function create(array $data): int
    {
        $this->validate($data);

        return $this->db->insert('brokers', [
            'name'                  => $data['name'],
            'code'                  => $data['code'],
            'crm_endpoint'          => $data['crm_endpoint'] ?? null,
            'crm_api_key'           => $data['crm_api_key'] ?? null,
            'crm_payload_template'  => isset($data['crm_payload_template']) ? json_encode($data['crm_payload_template']) : null,
            'is_active'             => (int)($data['is_active'] ?? 1),
        ]);
    }

    public function update(int $id, array $data): bool
    {
        $broker = $this->getById($id);
        if (!$broker) throw new RuntimeException('Broker not found', 404);

        $allowed = ['name', 'code', 'crm_endpoint', 'crm_api_key', 'crm_payload_template', 'is_active'];
        $update  = array_intersect_key($data, array_flip($allowed));

        if (isset($update['crm_payload_template']) && is_array($update['crm_payload_template'])) {
            $update['crm_payload_template'] = json_encode($update['crm_payload_template']);
        }
        if (isset($update['is_active'])) {
            $update['is_active'] = (int)$update['is_active'];
        }

        if (empty($update)) return false;

        $this->db->update('brokers', $update, 'id = ?', [$id]);
        return true;
    }

    public function delete(int $id): bool
    {
        $broker = $this->getById($id);
        if (!$broker) throw new RuntimeException('Broker not found', 404);

        $campaignCount = $this->db->fetch(
            'SELECT COUNT(*) as cnt FROM campaigns WHERE broker_id = ?', [$id]
        )['cnt'];

        if ($campaignCount > 0) {
            throw new RuntimeException('Cannot delete broker with existing campaigns. Deactivate it instead.', 422);
        }

        $this->db->query('DELETE FROM brokers WHERE id = ?', [$id]);
        return true;
    }

    private function validate(array $data): void
    {
        foreach (['name', 'code'] as $field) {
            if (empty($data[$field])) {
                throw new RuntimeException("Field '{$field}' is required", 422);
            }
        }

        $existing = $this->db->fetch('SELECT id FROM brokers WHERE code = ?', [$data['code']]);
        if ($existing) {
            throw new RuntimeException("Broker code '{$data['code']}' already exists", 422);
        }
    }
}
