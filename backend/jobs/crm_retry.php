<?php

declare(strict_types=1);

/**
 * Cron: CRM Sync Retry
 * Run every 5 minutes: * /5 * * * * php /path/to/backend/jobs/crm_retry.php
 */

define('ROOT_PATH', dirname(__DIR__));
require_once ROOT_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(ROOT_PATH);
$dotenv->safeLoad();

use App\Core\Application;
use App\Core\Database;
use App\Services\CrmSyncService;

$app     = new Application();
$db      = $app->container->make(Database::class);
$service = new CrmSyncService($db);

$count = $service->retryFailed();
echo date('Y-m-d H:i:s') . " - CRM retry: {$count} events processed\n";
