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
    private Database $db;

    public function __construct()
    {
        $this->db = Application::getInstance()->container->make(Database::class);
        $this->service = new TransferService($this->db);
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
        $agent = $this->resolveAgent();
        if (!$agent) return Response::error('Agent not found', 403);

        $transferId = (int)$request->param(0);
        $this->service->accept($transferId, (int)$agent['id']);
        return Response::success(null, 'Transfer accepted');
    }

    public function reject(Request $request): Response
    {
        $agent = $this->resolveAgent();
        if (!$agent) return Response::error('Agent not found', 403);

        $transferId = (int)$request->param(0);
        $this->service->reject($transferId, (int)$agent['id']);
        return Response::success(null, 'Transfer rejected');
    }

    public function complete(Request $request): Response
    {
        $agent = $this->resolveAgent();
        if (!$agent) return Response::error('Agent not found', 403);

        $transferId = (int)$request->param(0);
        $outcome    = $request->input('outcome');
        $notes      = $request->input('notes');
        $this->service->complete($transferId, $outcome, $notes);
        return Response::success(null, 'Transfer completed');
    }

    public function pending(Request $request): Response
    {
        $agent = $this->resolveAgent();
        if (!$agent) return Response::error('Agent not found', 403);

        $data = $this->service->getPendingForBroker((int)$agent['id'], (int)$agent['broker_id']);
        return Response::success($data);
    }

    private function resolveAgent(): ?array
    {
        $userId = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        if (!$userId) return null;

        return $this->db->fetch('SELECT * FROM agents WHERE user_id = ?', [$userId]);
    }
}
