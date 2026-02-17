<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class BrokerRouteService
{
    public function __construct(private Database $db) {}

    public function getByBroker(int $brokerId): array
    {
        return $this->db->fetchAll(
            'SELECT br.*, co.name as country_name, va.name as voximplant_account_name
             FROM broker_routes br
             JOIN countries co ON co.id = br.country_id
             LEFT JOIN voximplant_accounts va ON va.id = br.voximplant_account_id
             WHERE br.broker_id = ?
             ORDER BY co.name',
            [$brokerId]
        );
    }

    public function getRoute(int $brokerId, int $countryId): ?array
    {
        return $this->db->fetch(
            'SELECT br.*, va.account_id as voximplant_acct_id, va.api_key as voximplant_api_key
             FROM broker_routes br
             JOIN voximplant_accounts va ON va.id = br.voximplant_account_id
             WHERE br.broker_id = ? AND br.country_id = ? AND br.is_active = 1 AND va.is_active = 1',
            [$brokerId, $countryId]
        );
    }

    public function create(int $brokerId, array $data): int
    {
        $this->validate($data);

        $existing = $this->db->fetch(
            'SELECT id FROM broker_routes WHERE broker_id = ? AND country_id = ?',
            [$brokerId, (int)$data['country_id']]
        );
        if ($existing) {
            throw new RuntimeException('Route for this broker+country already exists', 422);
        }

        return $this->db->insert('broker_routes', [
            'broker_id'             => $brokerId,
            'country_id'            => (int)$data['country_id'],
            'voximplant_account_id' => (int)$data['voximplant_account_id'],
            'voximplant_rule_name'  => $data['voximplant_rule_name'],
            'is_active'             => (int)($data['is_active'] ?? 1),
        ]);
    }

    public function update(int $brokerId, int $routeId, array $data): bool
    {
        $route = $this->db->fetch(
            'SELECT * FROM broker_routes WHERE id = ? AND broker_id = ?',
            [$routeId, $brokerId]
        );
        if (!$route) throw new RuntimeException('Route not found', 404);

        $allowed = ['voximplant_account_id', 'voximplant_rule_name', 'is_active'];
        $update = array_intersect_key($data, array_flip($allowed));

        if (isset($update['voximplant_account_id'])) {
            $update['voximplant_account_id'] = (int)$update['voximplant_account_id'];
        }
        if (isset($update['is_active'])) {
            $update['is_active'] = (int)$update['is_active'];
        }

        if (empty($update)) return false;

        $this->db->update('broker_routes', $update, 'id = ? AND broker_id = ?', [$routeId, $brokerId]);
        return true;
    }

    public function delete(int $brokerId, int $routeId): bool
    {
        $route = $this->db->fetch(
            'SELECT * FROM broker_routes WHERE id = ? AND broker_id = ?',
            [$routeId, $brokerId]
        );
        if (!$route) throw new RuntimeException('Route not found', 404);

        $this->db->query('DELETE FROM broker_routes WHERE id = ?', [$routeId]);
        return true;
    }

    private function validate(array $data): void
    {
        $required = ['country_id', 'voximplant_account_id', 'voximplant_rule_name'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                throw new RuntimeException("Field '{$field}' is required", 422);
            }
        }
    }
}
