<?php

declare(strict_types=1);

/**
 * Cron: Lead Release
 * Releases pool leads back to 'available' after a campaign completes,
 * if the lead had a bad outcome (no_answer, voicemail, not_interested, failed).
 * Only releases leads from campaigns completed >= 2 days ago.
 */

define('ROOT_PATH', dirname(__DIR__));
require_once ROOT_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(ROOT_PATH);
$dotenv->safeLoad();

use App\Core\Application;
use App\Core\Database;

$app = new Application();
$db  = $app->container->make(Database::class);

// Bad outcomes that should be released
$badOutcomes = ['no_answer', 'voicemail', 'not_interested', 'failed'];
// Good outcomes that should NOT be released
// curious, activation_requested, transferred, closed, human

// Find campaigns completed >= 2 days ago
$cutoff = date('Y-m-d H:i:s', strtotime('-2 days'));
$completedCampaigns = $db->fetchAll(
    "SELECT id FROM campaigns WHERE status = 'completed' AND completed_at <= ?",
    [$cutoff]
);

$released = 0;

foreach ($completedCampaigns as $campaign) {
    $campaignId = $campaign['id'];

    // Find leads in this campaign that came from the pool and had bad outcomes
    $badStatuses = implode(',', array_map(fn($s) => "'{$s}'", $badOutcomes));
    $poolLeads = $db->fetchAll(
        "SELECT l.lead_pool_id FROM leads l
         WHERE l.campaign_id = ?
           AND l.lead_pool_id IS NOT NULL
           AND l.status IN ({$badStatuses})",
        [$campaignId]
    );

    $poolIds = array_filter(array_column($poolLeads, 'lead_pool_id'));
    if (empty($poolIds)) continue;

    $placeholders = implode(',', array_fill(0, count($poolIds), '?'));
    $db->query(
        "UPDATE lead_pool SET status = 'available', claimed_by_campaign_id = NULL, claimed_at = NULL
         WHERE id IN ({$placeholders}) AND status = 'claimed'",
        $poolIds
    );

    $released += count($poolIds);
}

echo date('Y-m-d H:i:s') . " - Lead release: {$released} pool leads released back to available\n";
