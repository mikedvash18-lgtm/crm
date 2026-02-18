<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\CampaignService;

class CampaignController
{
    private CampaignService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new CampaignService($db);
    }

    public function index(Request $request): Response
    {
        $result = $this->service->getAll(
            filters: [
                'status'    => $request->get('status'),
                'broker_id' => $request->get('broker_id'),
            ],
            page:    (int)$request->get('page', 1),
            perPage: (int)$request->get('per_page', 20),
        );
        return Response::success($result);
    }

    public function show(Request $request): Response
    {
        $id = (int)$request->param(0);
        $campaign = $this->service->getById($id);
        if (!$campaign) return Response::error('Campaign not found', 404);
        return Response::success($campaign);
    }

    public function store(Request $request): Response
    {
        try {
            $userId = (int)$_SERVER['AUTH_USER_ID'];
            $id = $this->service->create($request->body(), $userId);
            return Response::success(['id' => $id], 'Campaign created', 201);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function update(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->update($id, $request->body());
            return Response::success(null, 'Campaign updated');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function start(Request $request): Response
    {
        try {
            $this->service->start((int)$request->param(0));
            return Response::success(null, 'Campaign started');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function pause(Request $request): Response
    {
        try {
            $this->service->pause((int)$request->param(0));
            return Response::success(null, 'Campaign paused');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function resume(Request $request): Response
    {
        try {
            $this->service->resume((int)$request->param(0));
            return Response::success(null, 'Campaign resumed');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function testCall(Request $request): Response
    {
        try {
            $leadId = $request->body()['lead_id'] ?? null;
            $result = $this->service->testCall((int)$request->param(0), $leadId ? (int)$leadId : null);
            return Response::success($result, 'Test call initiated');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function poolPreview(Request $request): Response
    {
        try {
            $count = $this->service->poolPreview((int)$request->param(0));
            return Response::success(['count' => $count]);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function activityLog(Request $request): Response
    {
        $campaignId = (int)$request->param(0);
        $page       = (int)$request->get('page', 1);
        $perPage    = (int)$request->get('per_page', 50);
        $eventType  = $request->get('event_type');
        $offset     = ($page - 1) * $perPage;

        $where  = ['cal.campaign_id = ?'];
        $params = [$campaignId];

        if ($eventType) {
            $where[]  = 'cal.event_type = ?';
            $params[] = $eventType;
        }

        $whereStr = implode(' AND ', $where);
        $db = Application::getInstance()->container->make(Database::class);

        $rows = $db->fetchAll(
            "SELECT cal.*,
                    CONCAT_WS(' ', l.first_name, l.last_name) as lead_name,
                    l.phone as lead_phone,
                    u.name as user_name
             FROM campaign_activity_log cal
             LEFT JOIN leads l ON l.id = cal.lead_id
             LEFT JOIN users u ON u.id = cal.user_id
             WHERE {$whereStr}
             ORDER BY cal.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $db->fetch(
            "SELECT COUNT(*) as cnt FROM campaign_activity_log cal WHERE {$whereStr}",
            array_slice($params, 0, count($where))
        )['cnt'];

        return Response::success([
            'data'     => $rows,
            'total'    => (int)$total,
            'page'     => $page,
            'per_page' => $perPage,
        ]);
    }
}
