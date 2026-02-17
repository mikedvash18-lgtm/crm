<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\BrokerService;

class BrokerController
{
    private BrokerService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new BrokerService($db);
    }

    public function index(Request $request): Response
    {
        $result = $this->service->getAll(
            filters: [
                'is_active' => $request->get('is_active'),
            ],
            page:    (int)$request->get('page', 1),
            perPage: (int)$request->get('per_page', 50),
        );
        return Response::success($result);
    }

    public function show(Request $request): Response
    {
        $id = (int)$request->param(0);
        $broker = $this->service->getById($id);
        if (!$broker) return Response::error('Broker not found', 404);
        return Response::success($broker);
    }

    public function store(Request $request): Response
    {
        try {
            $id = $this->service->create($request->body());
            return Response::success(['id' => $id], 'Broker created', 201);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), $e->getCode() ?: 422);
        }
    }

    public function update(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->update($id, $request->body());
            return Response::success(null, 'Broker updated');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), $e->getCode() ?: 422);
        }
    }

    public function countries(Request $request): Response
    {
        $db = Application::getInstance()->container->make(Database::class);
        $countries = $db->fetchAll('SELECT * FROM countries WHERE is_active = 1 ORDER BY name');
        return Response::success($countries);
    }

    public function destroy(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->delete($id);
            return Response::success(null, 'Broker deleted');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), $e->getCode() ?: 422);
        }
    }
}
