<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class AgentService
{
    public function __construct(private Database $db) {}

    public function getAll(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['broker_id'])) {
            $where[]  = 'a.broker_id = ?';
            $params[] = $filters['broker_id'];
        }
        if (!empty($filters['status'])) {
            $where[]  = 'a.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['search'])) {
            $where[]  = '(u.name LIKE ? OR u.email LIKE ?)';
            $params[] = '%' . $filters['search'] . '%';
            $params[] = '%' . $filters['search'] . '%';
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $agents = $this->db->fetchAll(
            "SELECT a.*, u.name, u.email, u.is_active as user_active,
                    b.name as broker_name,
                    a.role
             FROM agents a
             JOIN users u ON u.id = a.user_id
             LEFT JOIN brokers b ON b.id = a.broker_id
             WHERE {$whereStr}
             ORDER BY a.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        // Attach broker_ids for desk managers
        foreach ($agents as &$ag) {
            if ($ag['role'] === 'desk_manager') {
                $ag['broker_ids'] = array_column(
                    $this->db->fetchAll(
                        "SELECT broker_id FROM agent_brokers WHERE agent_id = ?",
                        [$ag['id']]
                    ),
                    'broker_id'
                );
            } else {
                $ag['broker_ids'] = [];
            }
        }
        unset($ag);

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt
             FROM agents a
             JOIN users u ON u.id = a.user_id
             LEFT JOIN brokers b ON b.id = a.broker_id
             WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $agents, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getById(int $id): ?array
    {
        $agent = $this->db->fetch(
            "SELECT a.*, u.name, u.email, u.is_active as user_active,
                    b.name as broker_name
             FROM agents a
             JOIN users u ON u.id = a.user_id
             LEFT JOIN brokers b ON b.id = a.broker_id
             WHERE a.id = ?",
            [$id]
        );

        if ($agent && $agent['role'] === 'desk_manager') {
            $agent['broker_ids'] = array_column(
                $this->db->fetchAll(
                    "SELECT broker_id FROM agent_brokers WHERE agent_id = ?",
                    [$agent['id']]
                ),
                'broker_id'
            );
        }

        return $agent;
    }

    public function create(array $data): int
    {
        $this->validate($data, true);

        // Find agent role id
        $userRole = $this->db->fetch("SELECT id FROM roles WHERE slug = 'agent'");
        if (!$userRole) throw new RuntimeException('Agent role not found', 500);

        // Check email uniqueness
        $existing = $this->db->fetch("SELECT id FROM users WHERE email = ?", [$data['email']]);
        if ($existing) throw new RuntimeException('Email already in use', 422);

        // Create user
        $userId = $this->db->insert('users', [
            'role_id'       => $userRole['id'],
            'name'          => $data['name'],
            'email'         => $data['email'],
            'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
            'is_active'     => 1,
        ]);

        // Create agent
        $languageCodes = $data['language_codes'] ?? null;
        if (is_array($languageCodes)) {
            $languageCodes = json_encode($languageCodes);
        }

        $role = $data['role'] ?? 'agent';

        $agentId = $this->db->insert('agents', [
            'user_id'        => $userId,
            'broker_id'      => $data['broker_id'],
            'role'           => $role,
            'extension'      => $data['extension'] ?? null,
            'language_codes' => $languageCodes,
            'status'         => 'offline',
        ]);

        // Sync broker mappings for desk managers
        if ($role === 'desk_manager' && !empty($data['broker_ids'])) {
            $this->syncAgentBrokers($agentId, $data['broker_ids']);
        }

        return $agentId;
    }

    public function update(int $id, array $data): bool
    {
        $agent = $this->getById($id);
        if (!$agent) throw new RuntimeException('Agent not found', 404);

        // Update user fields
        $userUpdate = [];
        if (!empty($data['name']))  $userUpdate['name']  = $data['name'];
        if (!empty($data['email'])) {
            $existing = $this->db->fetch("SELECT id FROM users WHERE email = ? AND id != ?", [$data['email'], $agent['user_id']]);
            if ($existing) throw new RuntimeException('Email already in use', 422);
            $userUpdate['email'] = $data['email'];
        }
        if (!empty($data['password'])) {
            $userUpdate['password_hash'] = password_hash($data['password'], PASSWORD_BCRYPT);
        }
        if ($userUpdate) {
            $this->db->update('users', $userUpdate, 'id = ?', [$agent['user_id']]);
        }

        // Update agent fields
        $agentUpdate = [];
        if (isset($data['broker_id']))      $agentUpdate['broker_id']  = $data['broker_id'];
        if (isset($data['role']))           $agentUpdate['role']       = $data['role'];
        if (isset($data['extension']))       $agentUpdate['extension']  = $data['extension'];
        if (isset($data['status']))          $agentUpdate['status']     = $data['status'];
        if (isset($data['language_codes'])) {
            $lc = $data['language_codes'];
            $agentUpdate['language_codes'] = is_array($lc) ? json_encode($lc) : $lc;
        }
        if ($agentUpdate) {
            $this->db->update('agents', $agentUpdate, 'id = ?', [$id]);
        }

        // Sync broker mappings for desk managers
        $role = $data['role'] ?? $agent['role'] ?? 'agent';
        if ($role === 'desk_manager' && isset($data['broker_ids'])) {
            $this->syncAgentBrokers($id, $data['broker_ids']);
        } elseif ($role === 'agent') {
            // Clear broker mappings when switching back to agent
            $this->db->query('DELETE FROM agent_brokers WHERE agent_id = ?', [$id]);
        }

        return true;
    }

    public function delete(int $id): bool
    {
        $agent = $this->getById($id);
        if (!$agent) throw new RuntimeException('Agent not found', 404);

        // Check for active transfers
        $activeTransfers = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM transfers
             WHERE agent_id = ? AND status IN ('ringing','accepted')",
            [$id]
        )['cnt'];

        if ($activeTransfers > 0) {
            throw new RuntimeException('Cannot delete agent with active transfers', 422);
        }

        $this->db->query('DELETE FROM agents WHERE id = ?', [$id]);
        $this->db->query('DELETE FROM users WHERE id = ?', [$agent['user_id']]);

        return true;
    }

    private function syncAgentBrokers(int $agentId, array $brokerIds): void
    {
        $this->db->query('DELETE FROM agent_brokers WHERE agent_id = ?', [$agentId]);
        foreach ($brokerIds as $brokerId) {
            $this->db->insert('agent_brokers', [
                'agent_id'  => $agentId,
                'broker_id' => (int)$brokerId,
            ]);
        }
    }

    private function validate(array $data, bool $isCreate = false): void
    {
        if ($isCreate) {
            foreach (['name', 'email', 'password', 'broker_id'] as $field) {
                if (empty($data[$field])) {
                    throw new RuntimeException("Field '{$field}' is required", 422);
                }
            }
        }
    }
}
