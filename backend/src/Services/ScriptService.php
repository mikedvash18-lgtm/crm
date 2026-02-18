<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class ScriptService
{
    public function __construct(private Database $db) {}

    public function getAll(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['language_code'])) {
            $where[]  = 's.language_code = ?';
            $params[] = $filters['language_code'];
        }
        if (!empty($filters['version'])) {
            $where[]  = 's.version = ?';
            $params[] = $filters['version'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $scripts = $this->db->fetchAll(
            "SELECT s.*, u.name as created_by_name
             FROM scripts s
             LEFT JOIN users u ON u.id = s.created_by
             WHERE {$whereStr}
             ORDER BY s.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM scripts s WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $scripts, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getById(int $id): ?array
    {
        return $this->db->fetch(
            'SELECT s.*, u.name as created_by_name
             FROM scripts s
             LEFT JOIN users u ON u.id = s.created_by
             WHERE s.id = ?',
            [$id]
        );
    }

    public function create(array $data, int $userId): int
    {
        $this->validate($data);

        return $this->db->insert('scripts', [
            'name'          => $data['name'],
            'version'       => $data['version'] ?? 'A',
            'language_code' => $data['language_code'] ?? 'en',
            'content'       => $data['content'],
            'ai_prompt'     => $data['ai_prompt'] ?? null,
            'detector_prompt' => $data['detector_prompt'] ?? null,
            'created_by'    => $userId,
        ]);
    }

    public function update(int $id, array $data): bool
    {
        $script = $this->getById($id);
        if (!$script) throw new RuntimeException('Script not found', 404);

        $allowed = ['name', 'version', 'language_code', 'content', 'ai_prompt', 'detector_prompt'];
        $update  = array_intersect_key($data, array_flip($allowed));

        if (empty($update)) return false;

        $this->db->update('scripts', $update, 'id = ?', [$id]);
        return true;
    }

    public function delete(int $id): bool
    {
        $script = $this->getById($id);
        if (!$script) throw new RuntimeException('Script not found', 404);

        $usedIn = $this->db->fetch(
            'SELECT COUNT(*) as cnt FROM campaigns
             WHERE script_a_id = ? OR script_b_id = ? OR script_c_id = ?',
            [$id, $id, $id]
        )['cnt'];

        if ($usedIn > 0) {
            throw new RuntimeException('Cannot delete script that is used in campaigns', 422);
        }

        $this->db->query('DELETE FROM scripts WHERE id = ?', [$id]);
        return true;
    }

    private function validate(array $data): void
    {
        foreach (['name', 'content'] as $field) {
            if (empty($data[$field])) {
                throw new RuntimeException("Field '{$field}' is required", 422);
            }
        }

        if (!empty($data['version']) && !in_array($data['version'], ['A', 'B', 'C'])) {
            throw new RuntimeException("Version must be A, B, or C", 422);
        }
    }
}
