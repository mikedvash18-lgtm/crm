<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\HotLeadService;

class HotLeadController
{
    private HotLeadService $service;
    private Database $db;

    public function __construct()
    {
        $this->db = Application::getInstance()->container->make(Database::class);
        $this->service = new HotLeadService($this->db);
    }

    public function index(Request $request): Response
    {
        $filters = [
            'broker_id'   => $request->get('broker_id'),
            'campaign_id' => $request->get('campaign_id'),
            'status'      => $request->get('status'),
            'date_from'   => $request->get('date_from'),
            'date_to'     => $request->get('date_to'),
        ];

        // If agent, auto-filter by their broker
        $userId = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        $agent = $this->db->fetch('SELECT * FROM agents WHERE user_id = ?', [$userId]);
        if ($agent) {
            $filters['broker_id'] = $agent['broker_id'];
        }

        $result = $this->service->getHotLeads(
            filters: $filters,
            page:    (int)$request->get('page', 1),
            perPage: (int)$request->get('per_page', 20),
        );
        return Response::success($result);
    }

    public function show(Request $request): Response
    {
        $id = (int)$request->param(0);
        $lead = $this->service->getHotLeadDetail($id);
        if (!$lead) return Response::error('Lead not found', 404);

        // If agent, verify lead belongs to their broker
        $userId = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        $agent = $this->db->fetch('SELECT * FROM agents WHERE user_id = ?', [$userId]);
        if ($agent && (int)$lead['broker_id'] !== (int)$agent['broker_id']) {
            return Response::error('Unauthorized', 403);
        }

        return Response::success($lead);
    }
}
