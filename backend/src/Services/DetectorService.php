<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class DetectorService
{
    public function __construct(private Database $db) {}

    public function getAll(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['language_code'])) {
            $where[]  = 'd.language_code = ?';
            $params[] = $filters['language_code'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $detectors = $this->db->fetchAll(
            "SELECT d.*, u.name as created_by_name
             FROM detectors d
             LEFT JOIN users u ON u.id = d.created_by
             WHERE {$whereStr}
             ORDER BY d.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM detectors d WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $detectors, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getById(int $id): ?array
    {
        return $this->db->fetch(
            'SELECT d.*, u.name as created_by_name
             FROM detectors d
             LEFT JOIN users u ON u.id = d.created_by
             WHERE d.id = ?',
            [$id]
        );
    }

    public function create(array $data, int $userId): int
    {
        $this->validate($data);

        return $this->db->insert('detectors', [
            'name'          => $data['name'],
            'language_code' => $data['language_code'] ?? 'en',
            'content'       => $data['content'],
            'created_by'    => $userId,
        ]);
    }

    public function update(int $id, array $data): bool
    {
        $detector = $this->getById($id);
        if (!$detector) throw new RuntimeException('Detector not found', 404);

        $allowed = ['name', 'language_code', 'content'];
        $update  = array_intersect_key($data, array_flip($allowed));

        if (empty($update)) return false;

        $this->db->update('detectors', $update, 'id = ?', [$id]);
        return true;
    }

    public function delete(int $id): bool
    {
        $detector = $this->getById($id);
        if (!$detector) throw new RuntimeException('Detector not found', 404);

        $usedIn = $this->db->fetch(
            'SELECT COUNT(*) as cnt FROM campaigns WHERE detector_id = ?',
            [$id]
        )['cnt'];

        if ($usedIn > 0) {
            throw new RuntimeException('Cannot delete detector that is used in campaigns', 422);
        }

        $this->db->query('DELETE FROM detectors WHERE id = ?', [$id]);
        return true;
    }

    private function validate(array $data): void
    {
        foreach (['name', 'content'] as $field) {
            if (empty($data[$field])) {
                throw new RuntimeException("Field '{$field}' is required", 422);
            }
        }
    }
}
