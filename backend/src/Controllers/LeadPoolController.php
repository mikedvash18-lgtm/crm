<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\LeadPoolService;

class LeadPoolController
{
    private LeadPoolService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new LeadPoolService($db);
    }

    public function index(Request $request): Response
    {
        $result = $this->service->getAll(
            filters: [
                'country_id' => $request->get('country_id'),
                'source'     => $request->get('source'),
                'status'     => $request->get('status'),
                'phone'      => $request->get('phone'),
                'date_from'  => $request->get('date_from'),
                'date_to'    => $request->get('date_to'),
            ],
            page:    (int)$request->get('page', 1),
            perPage: (int)$request->get('per_page', 50),
        );
        return Response::success($result);
    }

    public function upload(Request $request): Response
    {
        $countryId = (int)$request->input('country_id');
        $source    = $request->input('source') ?: null;
        $columnMap = $request->input('column_map', []);

        if (!$countryId) return Response::error('country_id required', 422);
        if (!isset($_FILES['file'])) return Response::error('File required', 422);

        $tmpPath = $_FILES['file']['tmp_name'];
        $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['csv', 'txt', 'xlsx', 'xls'])) {
            return Response::error('Only CSV or Excel files accepted', 422);
        }

        try {
            $defaultMap = $columnMap ?: [
                'phone'      => 0,
                'first_name' => 1,
                'last_name'  => 2,
                'email'      => 3,
            ];

            if (in_array($ext, ['xlsx', 'xls'])) {
                $result = $this->service->uploadFromExcel($tmpPath, $countryId, $source, $defaultMap);
            } else {
                $result = $this->service->uploadFromCsv($tmpPath, $countryId, $source, $defaultMap);
            }
            return Response::success($result, 'Leads uploaded to pool successfully', 201);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), $e->getCode() ?: 422);
        }
    }

    public function preview(Request $request): Response
    {
        $countryId = (int)$request->get('country_id');
        if (!$countryId) return Response::error('country_id required', 422);

        $count = $this->service->previewCount(
            $countryId,
            $request->get('source') ?: null,
            $request->get('date_from') ?: null,
            $request->get('date_to') ?: null,
        );

        return Response::success(['count' => $count]);
    }

    public function sources(Request $request): Response
    {
        $sources = $this->service->getSources();
        return Response::success(array_column($sources, 'source'));
    }
}
