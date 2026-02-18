<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\WebhookService;
use App\Services\LeadService;
use App\Services\CrmSyncService;
use App\Services\TransferService;

class WebhookController
{
    private WebhookService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new WebhookService(
            $db,
            new CrmSyncService($db),
            new LeadService($db),
            new TransferService($db),
        );
    }

    public function voximplant(Request $request): Response
    {
        $signature = $request->header('X-Voximplant-Signature') ?? '';
        $rawBody   = $request->rawBody();
        $payload   = json_decode($rawBody, true) ?? [];

        try {
            $this->service->process($payload, $signature, $rawBody);
            return Response::json(['received' => true]);
        } catch (\RuntimeException $e) {
            $code = (int)$e->getCode();
            return Response::json(['received' => false, 'error' => $e->getMessage()], $code >= 400 ? $code : 500);
        }
    }
}
