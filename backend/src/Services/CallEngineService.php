<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Services\CampaignActivityLogger;
use RuntimeException;

class CallEngineService
{
    private const THROTTLE_MICROSECONDS = 1_200_000; // 1.2 seconds
    private const STALE_CALL_MINUTES = 30;

    public function __construct(
        private Database $db,
        private BrokerRouteService $routeService,
    ) {}

    public function processActiveCampaigns(): int
    {
        $campaigns = $this->db->fetchAll(
            "SELECT c.*, b.name as broker_name
             FROM campaigns c
             JOIN brokers b ON b.id = c.broker_id
             WHERE c.status = 'active'"
        );

        $totalCalled = 0;
        foreach ($campaigns as $campaign) {
            $totalCalled += $this->processCampaign($campaign);
        }

        return $totalCalled;
    }

    public function processCampaign(array $campaign): int
    {
        // Check call window in campaign timezone
        if (!$this->isWithinCallWindow($campaign)) {
            return 0;
        }

        // Look up broker route for this broker+country
        $route = $this->routeService->getRoute((int)$campaign['broker_id'], (int)$campaign['country_id']);
        if (!$route) {
            return 0;
        }

        // Count active calls for concurrency check
        $activeCalls = (int)$this->db->fetch(
            'SELECT COUNT(*) as cnt FROM active_calls WHERE campaign_id = ?',
            [$campaign['id']]
        )['cnt'];

        $availableSlots = (int)$campaign['concurrency_limit'] - $activeCalls;
        if ($availableSlots <= 0) {
            return 0;
        }

        // Fetch queued leads up to available slots (join lead_pool for funnel)
        $leads = $this->db->fetchAll(
            "SELECT l.*, lp.funnel AS pool_funnel FROM leads l
             LEFT JOIN lead_pool lp ON lp.id = l.lead_pool_id
             WHERE l.campaign_id = ? AND l.status = 'queued'
             ORDER BY l.uploaded_at ASC
             LIMIT ?",
            [$campaign['id'], $availableSlots]
        );

        $called = 0;
        foreach ($leads as $lead) {
            $scriptVersion = $lead['next_script_version'] ?: 'A';
            $scriptField = match ($scriptVersion) {
                'A' => 'script_a_id',
                'B' => 'script_b_id',
                'C' => 'script_c_id',
                default => 'script_a_id',
            };
            $scriptId = $campaign[$scriptField] ?? $campaign['script_a_id'];

            $script = $scriptId ? $this->db->fetch('SELECT * FROM scripts WHERE id = ?', [$scriptId]) : null;

            $detectorPrompt = '';
            if (!empty($campaign['detector_id'])) {
                $detector = $this->db->fetch('SELECT * FROM detectors WHERE id = ?', [$campaign['detector_id']]);
                $detectorPrompt = $detector['content'] ?? '';
            }

            $broker = $this->db->fetch('SELECT agent_phone FROM brokers WHERE id = ?', [$campaign['broker_id']]);

            // Replace template variables in script and detector content
            $leadName = trim($lead['first_name'] ?? '') ?: 'there';
            $leadFunnel = $lead['pool_funnel'] ?? '';
            $templateVars = ['{{name}}' => $leadName, '{{campaign}}' => $leadFunnel];
            $scriptContent = str_replace(array_keys($templateVars), array_values($templateVars), $script['content'] ?? '');
            $detectorContent = str_replace(array_keys($templateVars), array_values($templateVars), $detectorPrompt);

            // Strip any non-digit characters from phone
            $phoneToCall = preg_replace('/\D/', '', $lead['phone_normalized']);

            $customData = json_encode([
                'lead_id'        => $lead['id'],
                'campaign_id'    => $campaign['id'],
                'campaign'       => $leadFunnel,
                'phone'          => $phoneToCall,
                'name'           => $leadName,
                'funnel'         => $leadFunnel,
                'caller_id'      => $campaign['caller_id'] ?? '',
                'agent_phone'    => $broker['agent_phone'] ?? '',
                'script_version' => $scriptVersion,
                'script_body'    => $scriptContent,
                'detector_body'  => $detectorContent,
                'agent_type'     => match ($script['language_code'] ?? 'en') {
                    'it' => 2,
                    'es' => 3,
                    'fr' => 4,
                    default => 1,
                },
                'webhook_url'    => rtrim($_ENV['APP_URL'] ?? '', '/') . '/api/webhook/voximplant',
                'webhook_secret' => $_ENV['VOXIMPLANT_WEBHOOK_SECRET'] ?? '',
            ]);

            $callId = $this->callVoximplant($route, $customData);
            if (!$callId) {
                CampaignActivityLogger::log((int)$campaign['id'], 'error', "Failed to initiate call to {$lead['phone']}", (int)$lead['id']);
                continue;
            }

            // Clear any stale active call, then insert new one
            $this->db->query('DELETE FROM active_calls WHERE lead_id = ?', [$lead['id']]);
            $this->db->insert('active_calls', [
                'lead_id'            => $lead['id'],
                'campaign_id'        => $campaign['id'],
                'voximplant_call_id' => $callId,
            ]);

            // Create lead attempt
            $this->db->insert('lead_attempts', [
                'lead_id'         => $lead['id'],
                'campaign_id'     => $campaign['id'],
                'script_version'  => $scriptVersion,
                'attempt_number'  => (int)$lead['attempt_count'] + 1,
                'call_id'         => $callId,
                'started_at'      => date('Y-m-d H:i:s'),
            ]);

            // Update lead status to called
            $this->db->update('leads', [
                'status'        => 'called',
                'attempt_count' => (int)$lead['attempt_count'] + 1,
            ], 'id = ?', [$lead['id']]);

            CampaignActivityLogger::log(
                (int)$campaign['id'], 'call_initiated',
                "Call initiated to {$lead['phone']} (script {$scriptVersion})",
                (int)$lead['id'],
                details: ['call_id' => $callId, 'script_version' => $scriptVersion]
            );

            $called++;

            // Throttle between calls
            if ($called < count($leads)) {
                usleep(self::THROTTLE_MICROSECONDS);
            }
        }

        return $called;
    }

    public function callVoximplant(array $route, string $scriptCustomData): ?string
    {
        $url = 'https://api.voximplant.com/platform_api/StartScenarios/';

        $params = [
            'account_id'        => $route['voximplant_acct_id'],
            'api_key'           => $route['voximplant_api_key'],
            'rule_name'         => $route['voximplant_rule_name'],
            'script_custom_data'=> $scriptCustomData,
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($params),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            error_log("Voximplant API error: HTTP {$httpCode} - {$response}");
            return null;
        }

        $data = json_decode($response, true);
        if (!empty($data['error'])) {
            error_log("Voximplant API error: " . ($data['error']['msg'] ?? json_encode($data['error'])));
            return null;
        }

        return (string)($data['media_session_access_url'] ?? $data['result'] ?? uniqid('vox_'));
    }

    public function removeActiveCall(int $leadId): void
    {
        $this->db->query('DELETE FROM active_calls WHERE lead_id = ?', [$leadId]);
    }

    public function cleanupStaleCalls(): int
    {
        $cutoff = date('Y-m-d H:i:s', time() - self::STALE_CALL_MINUTES * 60);
        $stale = $this->db->fetchAll(
            'SELECT * FROM active_calls WHERE started_at < ?',
            [$cutoff]
        );

        foreach ($stale as $call) {
            $this->db->query('DELETE FROM active_calls WHERE id = ?', [$call['id']]);
        }

        return count($stale);
    }

    private function isWithinCallWindow(array $campaign): bool
    {
        $tz = new \DateTimeZone($campaign['call_window_timezone'] ?: 'UTC');
        $now = new \DateTime('now', $tz);
        $start = \DateTime::createFromFormat('H:i:s', $campaign['call_window_start'], $tz);
        $end = \DateTime::createFromFormat('H:i:s', $campaign['call_window_end'], $tz);

        if (!$start || !$end) return true;

        return $now >= $start && $now <= $end;
    }
}
