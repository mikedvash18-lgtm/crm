<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\StatsService;

class StatsController
{
    private StatsService $service;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->service = new StatsService($db);
    }

    public function dashboard(Request $request): Response
    {
        return Response::success($this->service->getDashboard());
    }

    public function campaign(Request $request): Response
    {
        $id = (int)$request->param(0);
        $data = $this->service->getCampaignStats(
            $id,
            $request->get('from'),
            $request->get('to'),
        );
        return Response::success($data);
    }

    public function broker(Request $request): Response
    {
        $id = (int)$request->param(0);
        return Response::success($this->service->getBrokerStats($id, $request->get('from'), $request->get('to')));
    }
}
