<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Services\CampaignActivityLogger;
use RuntimeException;

class CampaignService
{
    private LeadPoolService $poolService;

    public function __construct(private Database $db)
    {
        $this->poolService = new LeadPoolService($db);
    }

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
            'script_a_id'             => !empty($data['script_a_id']) ? $data['script_a_id'] : null,
            'script_b_id'             => !empty($data['script_b_id']) ? $data['script_b_id'] : null,
            'script_c_id'             => !empty($data['script_c_id']) ? $data['script_c_id'] : null,
            'concurrency_limit'       => $data['concurrency_limit'] ?? 10,
            'max_attempts'            => $data['max_attempts'] ?? 3,
            'retry_interval_minutes'  => $data['retry_interval_minutes'] ?? 60,
            'call_window_start'       => $data['call_window_start'] ?? '09:00:00',
            'call_window_end'         => $data['call_window_end'] ?? '20:00:00',
            'call_window_timezone'    => $data['call_window_timezone'] ?? 'UTC',
            'caller_id'               => !empty($data['caller_id']) ? $data['caller_id'] : null,
            'voximplant_app_id'       => !empty($data['voximplant_app_id']) ? $data['voximplant_app_id'] : null,
            'pool_source_filter'      => !empty($data['pool_source_filter']) ? $data['pool_source_filter'] : null,
            'pool_date_from'          => !empty($data['pool_date_from']) ? $data['pool_date_from'] : null,
            'pool_date_to'            => !empty($data['pool_date_to']) ? $data['pool_date_to'] : null,
            'lead_limit'              => !empty($data['lead_limit']) ? (int)$data['lead_limit'] : null,
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
                    'call_window_timezone','caller_id','voximplant_app_id',
                    'pool_source_filter','pool_date_from','pool_date_to','lead_limit'];
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

        // Validate broker route exists for this broker+country
        $route = $this->db->fetch(
            'SELECT id FROM broker_routes WHERE broker_id = ? AND country_id = ? AND is_active = 1',
            [$campaign['broker_id'], $campaign['country_id']]
        );
        if (!$route) {
            throw new RuntimeException('No active Voximplant route configured for this broker+country. Add one in Broker Routes first.', 422);
        }

        $this->db->beginTransaction();
        try {
            $this->db->update('campaigns', ['status' => 'active', 'started_at' => date('Y-m-d H:i:s')], 'id = ?', [$id]);

            // Only claim + queue on draft→active, not paused→active
            if ($campaign['status'] === 'draft') {
                // Claim leads from pool
                $poolLeads = $this->poolService->claimLeads(
                    $id,
                    (int)$campaign['country_id'],
                    $campaign['pool_source_filter'] ?: null,
                    $campaign['pool_date_from'] ?: null,
                    $campaign['pool_date_to'] ?: null,
                    $campaign['lead_limit'] !== null ? (int)$campaign['lead_limit'] : null,
                );

                // Bulk insert claimed pool leads into leads table
                foreach ($poolLeads as $pl) {
                    $this->db->insert('leads', [
                        'lead_pool_id'        => $pl['id'],
                        'campaign_id'         => $id,
                        'broker_id'           => $campaign['broker_id'],
                        'country_id'          => $campaign['country_id'],
                        'first_name'          => $pl['first_name'],
                        'last_name'           => $pl['last_name'],
                        'phone'               => $pl['phone'],
                        'phone_normalized'    => $pl['phone_normalized'],
                        'email'               => $pl['email'],
                        'status'              => 'queued',
                        'next_script_version' => 'A',
                    ]);
                }

                // Also queue any legacy directly-uploaded leads (backward compat)
                $this->db->query(
                    "UPDATE leads SET status = 'queued' WHERE campaign_id = ? AND status = 'new'",
                    [$id]
                );
            }

            $this->db->commit();

            CampaignActivityLogger::log($id, 'campaign_started', "Campaign started (from {$campaign['status']})");
            if ($campaign['status'] === 'draft' && !empty($poolLeads)) {
                CampaignActivityLogger::log($id, 'leads_claimed', count($poolLeads) . ' leads claimed from pool', details: ['count' => count($poolLeads)]);
            }
        } catch (\Exception $e) {
            $this->db->rollback();
            throw $e;
        }

        return true;
    }

    public function poolPreview(int $id): int
    {
        $campaign = $this->getById($id);
        if (!$campaign) throw new RuntimeException('Campaign not found', 404);

        return $this->poolService->previewCount(
            (int)$campaign['country_id'],
            $campaign['pool_source_filter'] ?: null,
            $campaign['pool_date_from'] ?: null,
            $campaign['pool_date_to'] ?: null,
        );
    }

    public function testCall(int $id, ?int $leadId = null): array
    {
        $campaign = $this->getById($id);
        if (!$campaign) throw new RuntimeException('Campaign not found', 404);
        if ($campaign['status'] !== 'active') {
            throw new RuntimeException('Campaign must be active to test a call', 422);
        }

        if ($leadId) {
            // Specific lead requested
            $lead = $this->db->fetch(
                "SELECT * FROM leads WHERE id = ? AND campaign_id = ?",
                [$leadId, $id]
            );
            if (!$lead) throw new RuntimeException('Lead not found in this campaign', 404);
            if ($lead['status'] !== 'queued') {
                // Force back to queued so we can test again
                $this->db->update('leads', ['status' => 'queued'], 'id = ?', [$leadId]);
                $lead['status'] = 'queued';
            }
        } else {
            $lead = $this->db->fetch(
                "SELECT * FROM leads WHERE campaign_id = ? AND status = 'queued' ORDER BY id ASC LIMIT 1",
                [$id]
            );
        }
        if (!$lead) {
            throw new RuntimeException('No queued leads available for testing', 422);
        }

        // Get broker route
        $routeService = new BrokerRouteService($this->db);
        $route = $routeService->getRoute((int)$campaign['broker_id'], (int)$campaign['country_id']);
        if (!$route) {
            throw new RuntimeException('No active Voximplant route for this broker+country', 422);
        }

        // Build call (same logic as CallEngineService)
        $scriptVersion = $lead['next_script_version'] ?: 'A';
        $scriptField = match ($scriptVersion) {
            'A' => 'script_a_id', 'B' => 'script_b_id', 'C' => 'script_c_id', default => 'script_a_id',
        };
        $scriptId = $campaign[$scriptField] ?? $campaign['script_a_id'];
        $script = $scriptId ? $this->db->fetch('SELECT * FROM scripts WHERE id = ?', [$scriptId]) : null;

        $customData = json_encode([
            'lead_id'        => $lead['id'],
            'campaign_id'    => $campaign['id'],
            'campaign'       => $campaign['name'],
            'phone'          => $lead['phone_normalized'],
            'name'           => trim(($lead['first_name'] ?? '') . ' ' . ($lead['last_name'] ?? '')) ?: 'there',
            'funnel'         => '',
            'caller_id'      => $campaign['caller_id'] ?? '',
            'script_version' => $scriptVersion,
            'agent_type'     => match ($script['language_code'] ?? 'en') {
                'it' => 2, 'es' => 3, default => 1,
            },
            'webhook_url'    => rtrim($_ENV['APP_URL'] ?? '', '/') . '/webhook/voximplant',
            'webhook_secret' => $_ENV['VOXIMPLANT_WEBHOOK_SECRET'] ?? '',
        ]);

        $engine = new CallEngineService($this->db, $routeService);
        $callId = $engine->callVoximplant($route, $customData);
        if (!$callId) {
            throw new RuntimeException('Voximplant API call failed — check broker route credentials', 500);
        }

        // Insert active call + attempt + update lead
        $this->db->insert('active_calls', [
            'lead_id'            => $lead['id'],
            'campaign_id'        => $campaign['id'],
            'voximplant_call_id' => $callId,
        ]);
        $this->db->insert('lead_attempts', [
            'lead_id'        => $lead['id'],
            'campaign_id'    => $campaign['id'],
            'script_version' => $scriptVersion,
            'attempt_number' => (int)$lead['attempt_count'] + 1,
            'call_id'        => $callId,
            'started_at'     => date('Y-m-d H:i:s'),
        ]);
        $this->db->update('leads', [
            'status'        => 'called',
            'attempt_count' => (int)$lead['attempt_count'] + 1,
        ], 'id = ?', [$lead['id']]);

        CampaignActivityLogger::log($id, 'call_initiated',
            "Test call initiated to {$lead['phone']} (script {$scriptVersion})",
            (int)$lead['id'],
            details: ['call_id' => $callId, 'script_version' => $scriptVersion, 'test' => true]
        );

        return [
            'lead_id'  => $lead['id'],
            'phone'    => $lead['phone'],
            'name'     => trim(($lead['first_name'] ?? '') . ' ' . ($lead['last_name'] ?? '')),
            'call_id'  => $callId,
            'script'   => $scriptVersion,
        ];
    }

    public function pause(int $id): bool
    {
        $this->db->update('campaigns', ['status' => 'paused', 'paused_at' => date('Y-m-d H:i:s')], 'id = ?', [$id]);
        CampaignActivityLogger::log($id, 'campaign_paused', 'Campaign paused');
        return true;
    }

    public function resume(int $id): bool
    {
        $this->db->update('campaigns', ['status' => 'active', 'paused_at' => null], 'id = ?', [$id]);
        CampaignActivityLogger::log($id, 'campaign_resumed', 'Campaign resumed');
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
