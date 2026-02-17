<?php

declare(strict_types=1);

/**
 * Cron: Call Engine
 * Processes active campaigns, picks up queued leads, calls Voximplant API.
 * Uses file locking to prevent overlapping runs.
 */

define('ROOT_PATH', dirname(__DIR__));
require_once ROOT_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(ROOT_PATH);
$dotenv->safeLoad();

// File lock to prevent overlapping runs
$lockFile = sys_get_temp_dir() . '/call_engine.lock';
$lockFp = fopen($lockFile, 'w');
if (!flock($lockFp, LOCK_EX | LOCK_NB)) {
    echo date('Y-m-d H:i:s') . " - Call engine: already running, skipping\n";
    exit(0);
}

use App\Core\Application;
use App\Core\Database;
use App\Services\BrokerRouteService;
use App\Services\CallEngineService;

$app = new Application();
$db  = $app->container->make(Database::class);

$routeService = new BrokerRouteService($db);
$engine = new CallEngineService($db, $routeService);

// Cleanup stale calls first
$stale = $engine->cleanupStaleCalls();
if ($stale > 0) {
    echo date('Y-m-d H:i:s') . " - Call engine: cleaned up {$stale} stale calls\n";
}

// Process active campaigns
$called = $engine->processActiveCampaigns();
echo date('Y-m-d H:i:s') . " - Call engine: {$called} calls initiated\n";

// Release lock
flock($lockFp, LOCK_UN);
fclose($lockFp);
