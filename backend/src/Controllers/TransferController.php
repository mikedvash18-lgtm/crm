<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\TransferService;

class TransferController
{
    private TransferService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new TransferService($db);
    }

    public function initiate(Request $request): Response
    {
        $leadId     = (int)$request->input('lead_id');
        $campaignId = (int)$request->input('campaign_id');

        if (!$leadId || !$campaignId) {
            return Response::error('lead_id and campaign_id required', 422);
        }

        $transferId = $this->service->initiate($leadId, $campaignId);
        return Response::success(['transfer_id' => $transferId], 'Transfer initiated', 201);
    }

    public function accept(Request $request): Response
    {
        $transferId = (int)$request->param(0);
        $agentId    = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        $this->service->accept($transferId, $agentId);
        return Response::success(null, 'Transfer accepted');
    }

    public function reject(Request $request): Response
    {
        $transferId = (int)$request->param(0);
        $agentId    = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        $this->service->reject($transferId, $agentId);
        return Response::success(null, 'Transfer rejected');
    }

    public function complete(Request $request): Response
    {
        $transferId = (int)$request->param(0);
        $outcome    = $request->input('outcome');
        $notes      = $request->input('notes');
        $this->service->complete($transferId, $outcome, $notes);
        return Response::success(null, 'Transfer completed');
    }

    public function pending(Request $request): Response
    {
        $agentId = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        $data = $this->service->getAgentTransfers($agentId, 'ringing');
        return Response::success($data);
    }
}
