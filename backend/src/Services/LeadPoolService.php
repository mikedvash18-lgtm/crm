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
    public function uploadFromCsv(string $filePath, ?string $source, array $columnMap): array
    {
        if (!file_exists($filePath)) throw new RuntimeException('Upload file not found', 500);

        $handle = fopen($filePath, 'r');
        $headers = fgetcsv($handle);
        if (!$headers) throw new RuntimeException('Empty CSV file', 422);

        $countryLookup = $this->buildCountryLookup();
        $stats = ['inserted' => 0, 'duplicates' => 0, 'invalid_phone' => 0, 'invalid_email' => 0, 'invalid_country' => 0, 'empty_row' => 0];

        $this->db->beginTransaction();
        try {
            while (($row = fgetcsv($handle)) !== false) {
                if (count($row) < 1) { $stats['empty_row']++; continue; }
                $mapped = [];
                foreach ($columnMap as $dbField => $csvIndex) {
                    $mapped[$dbField] = $row[$csvIndex] ?? null;
                }

                $result = $this->insertPoolLead($mapped, $source, $countryLookup);
                $stats[$result]++;
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        fclose($handle);
        return $this->formatUploadResult($stats);
    }

    public function uploadFromExcel(string $filePath, ?string $source, array $columnMap): array
    {
        if (!file_exists($filePath)) throw new RuntimeException('Upload file not found', 500);

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($filePath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, false);

        if (count($rows) < 2) throw new RuntimeException('Empty spreadsheet', 422);

        array_shift($rows); // skip header

        $countryLookup = $this->buildCountryLookup();
        $stats = ['inserted' => 0, 'duplicates' => 0, 'invalid_phone' => 0, 'invalid_email' => 0, 'invalid_country' => 0, 'empty_row' => 0];

        $this->db->beginTransaction();
        try {
            foreach ($rows as $row) {
                if (!is_array($row) || count($row) < 1) { $stats['empty_row']++; continue; }
                $mapped = [];
                foreach ($columnMap as $dbField => $csvIndex) {
                    $mapped[$dbField] = isset($row[$csvIndex]) ? trim((string)$row[$csvIndex]) : null;
                }

                $result = $this->insertPoolLead($mapped, $source, $countryLookup);
                $stats[$result]++;
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        return $this->formatUploadResult($stats);
    }

    public function parseFileHeaders(string $filePath, string $ext): array
    {
        if (in_array($ext, ['xlsx', 'xls'])) {
            // Only read first 4 rows to avoid loading the entire file
            $filter = new class extends \PhpOffice\PhpSpreadsheet\Reader\DefaultReadFilter {
                public function readCell(string $columnAddress, int $row, string $worksheetName = ''): bool {
                    return $row <= 4;
                }
            };
            $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($filePath);
            $reader->setReadFilter($filter);
            $reader->setReadDataOnly(true);
            $spreadsheet = $reader->load($filePath);
            $sheet = $spreadsheet->getActiveSheet();
            $rows = $sheet->toArray(null, true, true, false);
            if (count($rows) < 1) throw new RuntimeException('Empty spreadsheet', 422);
            $headers = array_map(fn($v) => trim((string)($v ?? '')), $rows[0]);
            $preview = [];
            for ($i = 1; $i <= min(3, count($rows) - 1); $i++) {
                $preview[] = array_map(fn($v) => trim((string)($v ?? '')), $rows[$i]);
            }
            return ['headers' => $headers, 'preview' => $preview];
        }

        // CSV/TXT
        $handle = fopen($filePath, 'r');
        $headerRow = fgetcsv($handle);
        if (!$headerRow) throw new RuntimeException('Empty CSV file', 422);
        $headers = array_map(fn($v) => trim((string)($v ?? '')), $headerRow);
        $preview = [];
        for ($i = 0; $i < 3; $i++) {
            $row = fgetcsv($handle);
            if ($row === false) break;
            $preview[] = array_map(fn($v) => trim((string)($v ?? '')), $row);
        }
        fclose($handle);
        return ['headers' => $headers, 'preview' => $preview];
    }

    // ---------------------------------------------------------
    // Claim / Release
    // ---------------------------------------------------------
    public function claimLeads(int $campaignId, int $countryId, ?string $source = null, ?string $dateFrom = null, ?string $dateTo = null, ?int $limit = null): array
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

        $limitClause = '';
        if ($limit !== null && $limit > 0) {
            $limitClause = ' LIMIT ?';
            $params[] = $limit;
        }

        // SELECT FOR UPDATE to lock rows
        $poolLeads = $this->db->fetchAll(
            "SELECT * FROM lead_pool WHERE {$whereStr} ORDER BY uploaded_at ASC{$limitClause} FOR UPDATE",
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
    private function insertPoolLead(array $mapped, ?string $source, array $countryLookup): string
    {
        $phone = $this->normalizePhone($mapped['phone'] ?? '');
        if (!$phone) return 'invalid_phone';

        // Resolve country from row data
        $countryId = $this->resolveCountryId($mapped['country'] ?? '', $countryLookup);
        if (!$countryId) return 'invalid_country';

        // Validate email if provided
        $email = trim($mapped['email'] ?? '');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'invalid_email';
        }

        // Handle full_name → first_name + last_name
        $firstName = $mapped['first_name'] ?? null;
        $lastName  = $mapped['last_name'] ?? null;
        if (empty($firstName) && empty($lastName) && !empty($mapped['full_name'])) {
            $parts = explode(' ', trim($mapped['full_name']), 2);
            $firstName = $parts[0];
            $lastName  = $parts[1] ?? null;
        }

        // Global dedup by normalized phone
        $exists = $this->db->fetch(
            'SELECT id FROM lead_pool WHERE phone_normalized = ?',
            [$phone]
        );
        if ($exists) return 'duplicates';

        $this->db->insert('lead_pool', [
            'phone'            => $mapped['phone'],
            'phone_normalized' => $phone,
            'first_name'       => $firstName,
            'last_name'        => $lastName,
            'email'            => $email ?: null,
            'country_id'       => $countryId,
            'source'           => $source,
            'funnel'           => $mapped['funnel'] ?? null,
            'registration_date'=> $this->parseDate($mapped['registration_date'] ?? null),
            'status'           => 'available',
        ]);

        return 'inserted';
    }

    private function formatUploadResult(array $stats): array
    {
        $skipped = $stats['invalid_phone'] + $stats['invalid_email'] + $stats['invalid_country'] + $stats['empty_row'];
        return [
            'inserted'        => $stats['inserted'],
            'duplicates'      => $stats['duplicates'],
            'skipped'         => $skipped,
            'invalid_phone'   => $stats['invalid_phone'],
            'invalid_email'   => $stats['invalid_email'],
            'invalid_country' => $stats['invalid_country'],
            'empty_row'       => $stats['empty_row'],
        ];
    }

    private function resolveCountryId(string $value, array $countryLookup): ?int
    {
        $value = trim($value);
        if ($value === '') return null;
        $lower = strtolower($value);

        // Try ISO2 code first
        if (isset($countryLookup['code'][$lower])) {
            return $countryLookup['code'][$lower];
        }
        // Try full name
        if (isset($countryLookup['name'][$lower])) {
            return $countryLookup['name'][$lower];
        }
        return null;
    }

    private function buildCountryLookup(): array
    {
        $rows = $this->db->fetchAll('SELECT id, code, name FROM countries');
        $byCode = [];
        $byName = [];
        foreach ($rows as $row) {
            $byCode[strtolower($row['code'])] = (int)$row['id'];
            $byName[strtolower($row['name'])] = (int)$row['id'];
        }
        return ['code' => $byCode, 'name' => $byName];
    }

    private function parseDate($value): ?string
    {
        if ($value === null || trim((string)$value) === '') return null;
        $value = trim((string)$value);

        // Excel serial date number (e.g. 46031.42569444444)
        if (is_numeric($value) && (float)$value > 25569) {
            $unix = ((float)$value - 25569) * 86400;
            return date('Y-m-d H:i:s', (int)$unix);
        }

        // Try common date formats
        $formats = [
            'Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d',
            'd/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y',
            'm/d/Y H:i:s', 'm/d/Y H:i', 'm/d/Y',
            'd-m-Y H:i:s', 'd-m-Y H:i', 'd-m-Y',
            'd.m.Y H:i:s', 'd.m.Y H:i', 'd.m.Y',
        ];
        foreach ($formats as $fmt) {
            $dt = \DateTime::createFromFormat($fmt, $value);
            if ($dt && $dt->format($fmt) === $value) {
                return $dt->format('Y-m-d H:i:s');
            }
        }

        // Fallback: let PHP try to parse it
        try {
            $dt = new \DateTime($value);
            return $dt->format('Y-m-d H:i:s');
        } catch (\Exception $e) {
            return null;
        }
    }

    private function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (strlen($phone) < 7 || strlen($phone) > 15) return '';
        return $phone;
    }
}
