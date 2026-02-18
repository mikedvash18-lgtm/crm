<?php

declare(strict_types=1);

/**
 * Cron: Retry Engine
 * Run every minute: * * * * * php /path/to/backend/jobs/retry.php
 */

define('ROOT_PATH', dirname(__DIR__));
require_once ROOT_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(ROOT_PATH);
$dotenv->safeLoad();

use App\Core\Application;
use App\Core\Database;
use App\Services\LeadService;
use App\Services\CampaignActivityLogger;

$app = new Application();
$db  = $app->container->make(Database::class);

// Fetch due retries
$due = $db->fetchAll(
    "SELECT rq.*, c.status as campaign_status, c.call_window_start, c.call_window_end, c.call_window_timezone
     FROM retry_queue rq
     JOIN campaigns c ON c.id = rq.campaign_id
     WHERE rq.processed = 0
       AND rq.scheduled_at <= NOW()
       AND c.status = 'active'
     LIMIT 500"
);

$leadService = new LeadService($db);
$processed = 0;

foreach ($due as $item) {
    // Check call window
    $tz   = new DateTimeZone($item['call_window_timezone'] ?: 'UTC');
    $now  = new DateTime('now', $tz);
    $start = DateTime::createFromFormat('H:i:s', $item['call_window_start'], $tz);
    $end   = DateTime::createFromFormat('H:i:s', $item['call_window_end'],   $tz);

    if ($now < $start || $now > $end) continue;

    $db->update('leads', [
        'status'              => 'queued',
        'next_script_version' => $item['script_version'],
    ], 'id = ?', [$item['lead_id']]);

    $db->update('retry_queue', [
        'processed'    => 1,
        'processed_at' => date('Y-m-d H:i:s'),
    ], 'id = ?', [$item['id']]);

    CampaignActivityLogger::log(
        (int)$item['campaign_id'], 'retry_queued',
        "Lead #{$item['lead_id']} re-queued for calling (script {$item['script_version']})",
        (int)$item['lead_id'],
        details: ['script_version' => $item['script_version']]
    );

    $processed++;
}

echo date('Y-m-d H:i:s') . " - Retry engine: {$processed} leads queued\n";
