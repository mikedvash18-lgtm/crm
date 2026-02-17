<?php

declare(strict_types=1);

use App\Controllers\WebhookController;

$router->post('/webhook/voximplant', WebhookController::class, 'voximplant');
