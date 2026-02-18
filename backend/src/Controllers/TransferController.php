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

    public function myLeads(Request $request): Response
    {
        $agent = $this->resolveAgent();
        if (!$agent) return Response::error('Agent not found', 403);

        $where  = ['l.broker_id = ?'];
        $params = [(int)$agent['broker_id']];

        if ($search = $request->get('search')) {
            $where[]  = '(l.first_name LIKE ? OR l.last_name LIKE ? OR l.phone LIKE ?)';
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
        }
        if ($status = $request->get('status')) {
            $where[]  = 'l.status = ?';
            $params[] = $status;
        }

        $whereStr = implode(' AND ', $where);
        $page     = (int)$request->get('page', 1);
        $perPage  = (int)$request->get('per_page', 50);
        $offset   = ($page - 1) * $perPage;

        $leads = $this->db->fetchAll(
            "SELECT l.*,
                    c.name as campaign_name,
                    cl.ai_classification, cl.ai_summary,
                    cl.created_at as last_call_date
             FROM leads l
             LEFT JOIN campaigns c ON c.id = l.campaign_id
             LEFT JOIN call_logs cl ON cl.id = (
                 SELECT cl2.id FROM call_logs cl2
                 WHERE cl2.lead_id = l.id
                 ORDER BY cl2.created_at DESC LIMIT 1
             )
             WHERE {$whereStr}
             ORDER BY l.updated_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        $total = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM leads l WHERE {$whereStr}",
            array_slice($params, 0, count($where))
        )['cnt'];

        return Response::success([
            'data'     => $leads,
            'total'    => (int)$total,
            'page'     => $page,
            'per_page' => $perPage,
        ]);
    }

    public function leadDetail(Request $request): Response
    {
        $agent = $this->resolveAgent();
        if (!$agent) return Response::error('Agent not found', 403);

        $id = (int)$request->param(0);
        $lead = $this->db->fetch(
            "SELECT l.*, c.name as campaign_name, b.name as broker_name
             FROM leads l
             LEFT JOIN campaigns c ON c.id = l.campaign_id
             LEFT JOIN brokers b ON b.id = l.broker_id
             WHERE l.id = ? AND l.broker_id = ?",
            [$id, (int)$agent['broker_id']]
        );

        if (!$lead) return Response::error('Lead not found', 404);

        $lead['call_logs'] = $this->db->fetchAll(
            "SELECT * FROM call_logs WHERE lead_id = ? ORDER BY created_at DESC",
            [$id]
        );

        $lead['attempts'] = $this->db->fetchAll(
            "SELECT * FROM lead_attempts WHERE lead_id = ? ORDER BY started_at DESC",
            [$id]
        );

        return Response::success($lead);
    }

    private function resolveAgent(): ?array
    {
        $userId = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        if (!$userId) return null;

        return $this->db->fetch('SELECT * FROM agents WHERE user_id = ?', [$userId]);
    }
}
