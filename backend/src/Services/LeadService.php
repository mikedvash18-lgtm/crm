<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Services\CampaignActivityLogger;
use RuntimeException;

class LeadService
{
    public function __construct(private Database $db) {}

    // ---------------------------------------------------------
    // Query
    // ---------------------------------------------------------
    public function getAll(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['campaign_id'])) {
            $where[] = 'l.campaign_id = ?';
            $params[] = $filters['campaign_id'];
        }
        if (!empty($filters['status'])) {
            $where[] = 'l.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['phone'])) {
            $where[] = 'l.phone LIKE ?';
            $params[] = '%' . $filters['phone'] . '%';
        }
        if (!empty($filters['broker_id'])) {
            $where[] = 'l.broker_id = ?';
            $params[] = $filters['broker_id'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $leads = $this->db->fetchAll(
            "SELECT l.id, l.first_name, l.last_name, l.phone, l.email,
                    l.status, l.score, l.attempt_count, l.next_retry_at,
                    c.name as campaign_name, b.name as broker_name, co.name as country_name
             FROM leads l
             JOIN campaigns c ON c.id = l.campaign_id
             JOIN brokers b ON b.id = l.broker_id
             JOIN countries co ON co.id = l.country_id
             WHERE {$whereStr}
             ORDER BY l.uploaded_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM leads l WHERE {$whereStr}",
            $params
        )['cnt'];

        return ['data' => $leads, 'total' => (int)$total, 'page' => $page, 'per_page' => $perPage];
    }

    public function getById(int $id): ?array
    {
        return $this->db->fetch('SELECT * FROM leads WHERE id = ?', [$id]);
    }

    // ---------------------------------------------------------
    // CSV Upload
    // ---------------------------------------------------------
    public function uploadFromCsv(string $filePath, int $campaignId, array $columnMap): array
    {
        $campaign = $this->db->fetch('SELECT * FROM campaigns WHERE id = ?', [$campaignId]);
        if (!$campaign) throw new RuntimeException('Campaign not found', 404);

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

                $phone = $this->normalizePhone($mapped['phone'] ?? '', $campaign['country_id']);
                if (!$phone) { $skipped++; continue; }

                // Duplicate detection
                $exists = $this->db->fetch(
                    'SELECT id FROM leads WHERE phone_normalized = ? AND campaign_id = ?',
                    [$phone, $campaignId]
                );
                if ($exists) { $duplicates++; continue; }

                $this->db->insert('leads', [
                    'campaign_id'       => $campaignId,
                    'broker_id'         => $campaign['broker_id'],
                    'country_id'        => $campaign['country_id'],
                    'first_name'        => $mapped['first_name'] ?? null,
                    'last_name'         => $mapped['last_name'] ?? null,
                    'phone'             => $mapped['phone'],
                    'phone_normalized'  => $phone,
                    'email'             => $mapped['email'] ?? null,
                    'status'            => 'new',
                    'next_script_version' => 'A',
                ]);
                $inserted++;
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        fclose($handle);
        return ['inserted' => $inserted, 'skipped' => $skipped, 'duplicates' => $duplicates];
    }

    // ---------------------------------------------------------
    // Excel Upload
    // ---------------------------------------------------------
    public function uploadFromExcel(string $filePath, int $campaignId, array $columnMap): array
    {
        $campaign = $this->db->fetch('SELECT * FROM campaigns WHERE id = ?', [$campaignId]);
        if (!$campaign) throw new RuntimeException('Campaign not found', 404);

        if (!file_exists($filePath)) throw new RuntimeException('Upload file not found', 500);

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($filePath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, false);

        if (count($rows) < 2) throw new RuntimeException('Empty spreadsheet', 422);

        // Skip header row
        array_shift($rows);

        $inserted = $skipped = $duplicates = 0;

        $this->db->beginTransaction();
        try {
            foreach ($rows as $row) {
                if (!is_array($row) || count($row) < 1) continue;

                $mapped = [];
                foreach ($columnMap as $dbField => $csvIndex) {
                    $mapped[$dbField] = isset($row[$csvIndex]) ? trim((string)$row[$csvIndex]) : null;
                }

                $phone = $this->normalizePhone($mapped['phone'] ?? '', $campaign['country_id']);
                if (!$phone) { $skipped++; continue; }

                $exists = $this->db->fetch(
                    'SELECT id FROM leads WHERE phone_normalized = ? AND campaign_id = ?',
                    [$phone, $campaignId]
                );
                if ($exists) { $duplicates++; continue; }

                $this->db->insert('leads', [
                    'campaign_id'       => $campaignId,
                    'broker_id'         => $campaign['broker_id'],
                    'country_id'        => $campaign['country_id'],
                    'first_name'        => $mapped['first_name'] ?? null,
                    'last_name'         => $mapped['last_name'] ?? null,
                    'phone'             => $mapped['phone'],
                    'phone_normalized'  => $phone,
                    'email'             => $mapped['email'] ?? null,
                    'status'            => 'new',
                    'next_script_version' => 'A',
                ]);
                $inserted++;
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        return ['inserted' => $inserted, 'skipped' => $skipped, 'duplicates' => $duplicates];
    }

    // ---------------------------------------------------------
    // Status transitions
    // ---------------------------------------------------------
    public function updateStatus(int $leadId, string $status, array $extra = []): bool
    {
        $allowed = ['new','queued','called','human','voicemail','not_interested',
                    'curious','activation_requested','transferred','closed','archived'];
        if (!in_array($status, $allowed)) throw new RuntimeException('Invalid status', 422);

        $data = array_merge(['status' => $status], $extra);
        return (bool)$this->db->update('leads', $data, 'id = ?', [$leadId]);
    }

    public function scheduleRetry(int $leadId, int $delayMinutes, string $reason = ''): void
    {
        $lead = $this->getById($leadId);
        if (!$lead) return;

        $nextVersion = $this->nextScriptVersion($lead['next_script_version']);
        $retryAt = date('Y-m-d H:i:s', time() + $delayMinutes * 60);

        $this->db->update('leads', [
            'next_retry_at'       => $retryAt,
            'next_script_version' => $nextVersion,
        ], 'id = ?', [$leadId]);

        $this->db->insert('retry_queue', [
            'lead_id'       => $leadId,
            'campaign_id'   => $lead['campaign_id'],
            'script_version'=> $nextVersion,
            'reason'        => $reason,
            'scheduled_at'  => $retryAt,
        ]);

        CampaignActivityLogger::log(
            (int)$lead['campaign_id'], 'retry_scheduled',
            "Retry scheduled for {$lead['phone']} at {$retryAt} (script {$nextVersion}, reason: {$reason})",
            $leadId,
            details: ['retry_at' => $retryAt, 'script_version' => $nextVersion, 'reason' => $reason]
        );
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    private function normalizePhone(string $phone, int $countryId): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (strlen($phone) < 7 || strlen($phone) > 15) return '';
        return $phone;
    }

    private function nextScriptVersion(string $current): string
    {
        return match($current) {
            'A' => 'B',
            'B' => 'C',
            default => 'C',
        };
    }
}
