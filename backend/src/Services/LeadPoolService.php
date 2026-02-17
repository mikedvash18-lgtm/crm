<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

class LeadPoolService
{
    public function __construct(private Database $db) {}

    // ---------------------------------------------------------
    // Query
    // ---------------------------------------------------------
    public function getAll(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['country_id'])) {
            $where[]  = 'lp.country_id = ?';
            $params[] = $filters['country_id'];
        }
        if (!empty($filters['source'])) {
            $where[]  = 'lp.source = ?';
            $params[] = $filters['source'];
        }
        if (!empty($filters['status'])) {
            $where[]  = 'lp.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['phone'])) {
            $where[]  = 'lp.phone LIKE ?';
            $params[] = '%' . $filters['phone'] . '%';
        }
        if (!empty($filters['date_from'])) {
            $where[]  = 'lp.uploaded_at >= ?';
            $params[] = $filters['date_from'] . ' 00:00:00';
        }
        if (!empty($filters['date_to'])) {
            $where[]  = 'lp.uploaded_at <= ?';
            $params[] = $filters['date_to'] . ' 23:59:59';
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $leads = $this->db->fetchAll(
            "SELECT lp.*, co.name as country_name, c.name as claimed_by_campaign_name
             FROM lead_pool lp
             JOIN countries co ON co.id = lp.country_id
             LEFT JOIN campaigns c ON c.id = lp.claimed_by_campaign_id
             WHERE {$whereStr}
             ORDER BY lp.uploaded_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM lead_pool lp WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $leads, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getSources(): array
    {
        return $this->db->fetchAll(
            "SELECT DISTINCT source FROM lead_pool WHERE source IS NOT NULL AND source != '' ORDER BY source"
        );
    }

    public function previewCount(int $countryId, ?string $source = null, ?string $dateFrom = null, ?string $dateTo = null): int
    {
        $where  = ["status = 'available'", 'country_id = ?'];
        $params = [$countryId];

        if ($source) {
            $where[]  = 'source = ?';
            $params[] = $source;
        }
        if ($dateFrom) {
            $where[]  = 'uploaded_at >= ?';
            $params[] = $dateFrom . ' 00:00:00';
        }
        if ($dateTo) {
            $where[]  = 'uploaded_at <= ?';
            $params[] = $dateTo . ' 23:59:59';
        }

        $whereStr = implode(' AND ', $where);
        $row = $this->db->fetch("SELECT COUNT(*) as cnt FROM lead_pool WHERE {$whereStr}", $params);
        return (int)$row['cnt'];
    }

    // ---------------------------------------------------------
    // Upload
    // ---------------------------------------------------------
    public function uploadFromCsv(string $filePath, int $countryId, ?string $source, array $columnMap): array
    {
        if (!file_exists($filePath)) throw new RuntimeException('Upload file not found', 500);

        $handle = fopen($filePath, 'r');
        $headers = fgetcsv($handle);
        if (!$headers) throw new RuntimeException('Empty CSV file', 422);

        $inserted = $skipped = $duplicates = 0;

        $this->db->beginTransaction();
        try {
            while (($row = fgetcsv($handle)) !== false) {
                if (count($row) < 1) continue;
                $mapped = [];
                foreach ($columnMap as $dbField => $csvIndex) {
                    $mapped[$dbField] = $row[$csvIndex] ?? null;
                }

                $result = $this->insertPoolLead($mapped, $countryId, $source);
                match ($result) {
                    'inserted'  => $inserted++,
                    'duplicate' => $duplicates++,
                    'skipped'   => $skipped++,
                };
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        fclose($handle);
        return ['inserted' => $inserted, 'skipped' => $skipped, 'duplicates' => $duplicates];
    }

    public function uploadFromExcel(string $filePath, int $countryId, ?string $source, array $columnMap): array
    {
        if (!file_exists($filePath)) throw new RuntimeException('Upload file not found', 500);

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($filePath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, false);

        if (count($rows) < 2) throw new RuntimeException('Empty spreadsheet', 422);

        array_shift($rows); // skip header

        $inserted = $skipped = $duplicates = 0;

        $this->db->beginTransaction();
        try {
            foreach ($rows as $row) {
                if (!is_array($row) || count($row) < 1) continue;
                $mapped = [];
                foreach ($columnMap as $dbField => $csvIndex) {
                    $mapped[$dbField] = isset($row[$csvIndex]) ? trim((string)$row[$csvIndex]) : null;
                }

                $result = $this->insertPoolLead($mapped, $countryId, $source);
                match ($result) {
                    'inserted'  => $inserted++,
                    'duplicate' => $duplicates++,
                    'skipped'   => $skipped++,
                };
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        return ['inserted' => $inserted, 'skipped' => $skipped, 'duplicates' => $duplicates];
    }

    // ---------------------------------------------------------
    // Claim / Release
    // ---------------------------------------------------------
    public function claimLeads(int $campaignId, int $countryId, ?string $source = null, ?string $dateFrom = null, ?string $dateTo = null): array
    {
        $where  = ["status = 'available'", 'country_id = ?'];
        $params = [$countryId];

        if ($source) {
            $where[]  = 'source = ?';
            $params[] = $source;
        }
        if ($dateFrom) {
            $where[]  = 'uploaded_at >= ?';
            $params[] = $dateFrom . ' 00:00:00';
        }
        if ($dateTo) {
            $where[]  = 'uploaded_at <= ?';
            $params[] = $dateTo . ' 23:59:59';
        }

        $whereStr = implode(' AND ', $where);

        // SELECT FOR UPDATE to lock rows
        $poolLeads = $this->db->fetchAll(
            "SELECT * FROM lead_pool WHERE {$whereStr} ORDER BY uploaded_at ASC FOR UPDATE",
            $params
        );

        if (empty($poolLeads)) return [];

        $now = date('Y-m-d H:i:s');
        $ids = array_column($poolLeads, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        $this->db->query(
            "UPDATE lead_pool SET status = 'claimed', claimed_by_campaign_id = ?, claimed_at = ? WHERE id IN ({$placeholders})",
            [$campaignId, $now, ...$ids]
        );

        return $poolLeads;
    }

    public function releaseLeads(array $poolIds): int
    {
        if (empty($poolIds)) return 0;

        $placeholders = implode(',', array_fill(0, count($poolIds), '?'));
        $this->db->query(
            "UPDATE lead_pool SET status = 'available', claimed_by_campaign_id = NULL, claimed_at = NULL WHERE id IN ({$placeholders})",
            $poolIds
        );

        return count($poolIds);
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    private function insertPoolLead(array $mapped, int $countryId, ?string $source): string
    {
        $phone = $this->normalizePhone($mapped['phone'] ?? '');
        if (!$phone) return 'skipped';

        // Global dedup by normalized phone
        $exists = $this->db->fetch(
            'SELECT id FROM lead_pool WHERE phone_normalized = ?',
            [$phone]
        );
        if ($exists) return 'duplicate';

        $this->db->insert('lead_pool', [
            'phone'            => $mapped['phone'],
            'phone_normalized' => $phone,
            'first_name'       => $mapped['first_name'] ?? null,
            'last_name'        => $mapped['last_name'] ?? null,
            'email'            => $mapped['email'] ?? null,
            'country_id'       => $countryId,
            'source'           => $source,
            'status'           => 'available',
        ]);

        return 'inserted';
    }

    private function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (strlen($phone) < 7 || strlen($phone) > 15) return '';
        return $phone;
    }
}
