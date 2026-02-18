<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\ScriptService;

class ScriptController
{
    private ScriptService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new ScriptService($db);
    }

    public function index(Request $request): Response
    {
        $result = $this->service->getAll(
            filters: [
                'language_code' => $request->get('language_code'),
                'version'       => $request->get('version'),
            ],
            page:    (int)$request->get('page', 1),
            perPage: (int)$request->get('per_page', 50),
        );
        return Response::success($result);
    }

    public function show(Request $request): Response
    {
        $id = (int)$request->param(0);
        $script = $this->service->getById($id);
        if (!$script) return Response::error('Script not found', 404);
        return Response::success($script);
    }

    public function store(Request $request): Response
    {
        try {
            $userId = (int)$_SERVER['AUTH_USER_ID'];
            $id = $this->service->create($request->body(), $userId);
            return Response::success(['id' => $id], 'Script created', 201);
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function update(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->update($id, $request->body());
            return Response::success(null, 'Script updated');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }

    public function destroy(Request $request): Response
    {
        try {
            $id = (int)$request->param(0);
            $this->service->delete($id);
            return Response::success(null, 'Script deleted');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 422));
        }
    }
}
