<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class VoximplantAccountService
{
    public function __construct(private Database $db) {}

    public function getAll(): array
    {
        return $this->db->fetchAll('SELECT * FROM voximplant_accounts ORDER BY name');
    }

    public function getById(int $id): ?array
    {
        return $this->db->fetch('SELECT * FROM voximplant_accounts WHERE id = ?', [$id]);
    }

    public function create(array $data): int
    {
        $this->validate($data);

        return $this->db->insert('voximplant_accounts', [
            'name'       => $data['name'],
            'account_id' => $data['account_id'],
            'api_key'    => $data['api_key'],
            'is_active'  => (int)($data['is_active'] ?? 1),
        ]);
    }

    public function update(int $id, array $data): bool
    {
        $account = $this->getById($id);
        if (!$account) throw new RuntimeException('Voximplant account not found', 404);

        $allowed = ['name', 'account_id', 'api_key', 'is_active'];
        $update = array_intersect_key($data, array_flip($allowed));

        if (isset($update['is_active'])) {
            $update['is_active'] = (int)$update['is_active'];
        }

        if (empty($update)) return false;

        $this->db->update('voximplant_accounts', $update, 'id = ?', [$id]);
        return true;
    }

    public function delete(int $id): bool
    {
        $account = $this->getById($id);
        if (!$account) throw new RuntimeException('Voximplant account not found', 404);

        $routeCount = $this->db->fetch(
            'SELECT COUNT(*) as cnt FROM broker_routes WHERE voximplant_account_id = ?', [$id]
        )['cnt'];

        if ($routeCount > 0) {
            throw new RuntimeException('Cannot delete account used by broker routes. Remove routes first.', 422);
        }

        $this->db->query('DELETE FROM voximplant_accounts WHERE id = ?', [$id]);
        return true;
    }

    private function validate(array $data): void
    {
        foreach (['name', 'account_id', 'api_key'] as $field) {
            if (empty($data[$field])) {
                throw new RuntimeException("Field '{$field}' is required", 422);
            }
        }
    }
}
