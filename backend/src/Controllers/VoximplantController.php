<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\VoximplantAccountService;

class VoximplantController
{
    private VoximplantAccountService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new VoximplantAccountService($db);
    }

    public function index(Request $request): Response
    {
        return Response::success($this->service->getAll());
    }

    public function show(Request $request): Response
    {
        $id = (int)$request->param(0);
        $account = $this->service->getById($id);
        if (!$account) return Response::error('Account not found', 404);
        return Response::success($account);
    }

    public function store(Request $request): Response
    {
        try {
            $id = $this->service->create($request->body());
            return Response::success(['id' => $id], 'Voximplant account created', 201);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function update(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->update($id, $request->body());
            return Response::success(null, 'Voximplant account updated');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function destroy(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->delete($id);
            return Response::success(null, 'Voximplant account deleted');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }
}
