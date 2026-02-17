<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\LeadService;

class LeadController
{
    private LeadService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new LeadService($db);
    }

    public function index(Request $request): Response
    {
        $result = $this->service->getAll(
            filters: [
                'campaign_id' => $request->get('campaign_id'),
                'status'      => $request->get('status'),
                'phone'       => $request->get('phone'),
                'broker_id'   => $request->get('broker_id'),
            ],
            page: (int)$request->get('page', 1),
            perPage: (int)$request->get('per_page', 50),
        );
        return Response::success($result);
    }

    public function show(Request $request): Response
    {
        $lead = $this->service->getById((int)$request->param(0));
        if (!$lead) return Response::error('Lead not found', 404);
        return Response::success($lead);
    }

    public function upload(Request $request): Response
    {
        $campaignId = (int)$request->input('campaign_id');
        $columnMap  = $request->input('column_map', []);

        if (!$campaignId) return Response::error('campaign_id required', 422);
        if (!isset($_FILES['file'])) return Response::error('CSV file required', 422);

        $tmpPath = $_FILES['file']['tmp_name'];
        $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['csv', 'txt'])) {
            return Response::error('Only CSV files accepted', 422);
        }

        try {
            $result = $this->service->uploadFromCsv($tmpPath, $campaignId, $columnMap ?: [
                'phone'      => 0,
                'first_name' => 1,
                'last_name'  => 2,
                'email'      => 3,
            ]);
            return Response::success($result, 'Leads uploaded successfully', 201);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), $e->getCode() ?: 422);
        }
    }

    public function updateStatus(Request $request): Response
    {
        $id     = (int)$request->param(0);
        $status = $request->input('status');

        if (!$status) return Response::error('Status required', 422);

        try {
            $this->service->updateStatus($id, $status);
            return Response::success(null, 'Lead status updated');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), 422);
        }
    }

    public function retry(Request $request): Response
    {
        $id = (int)$request->param(0);
        $this->service->scheduleRetry($id, 0, 'manual_retry');
        return Response::success(null, 'Lead queued for retry');
    }
}
