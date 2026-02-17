<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\CampaignController;
use App\Controllers\LeadController;
use App\Controllers\StatsController;
use App\Controllers\TransferController;
use App\Middleware\AuthMiddleware;

// ─── Auth (public) ────────────────────────────────────────────
$router->post('/api/auth/login',   AuthController::class, 'login');
$router->post('/api/auth/refresh', AuthController::class, 'refresh');
$router->get( '/api/auth/me',      AuthController::class, 'me',      [AuthMiddleware::class]);

// ─── Campaigns ────────────────────────────────────────────────
$router->get(   '/api/campaigns',               CampaignController::class, 'index',  [AuthMiddleware::class]);
$router->get(   '/api/campaigns/{id}',           CampaignController::class, 'show',   [AuthMiddleware::class]);
$router->post(  '/api/campaigns',               CampaignController::class, 'store',  [AuthMiddleware::class]);
$router->put(   '/api/campaigns/{id}',           CampaignController::class, 'update', [AuthMiddleware::class]);
$router->post(  '/api/campaigns/{id}/start',     CampaignController::class, 'start',  [AuthMiddleware::class]);
$router->post(  '/api/campaigns/{id}/pause',     CampaignController::class, 'pause',  [AuthMiddleware::class]);
$router->post(  '/api/campaigns/{id}/resume',    CampaignController::class, 'resume', [AuthMiddleware::class]);

// ─── Leads ────────────────────────────────────────────────────
$router->get(  '/api/leads',              LeadController::class, 'index',        [AuthMiddleware::class]);
$router->get(  '/api/leads/{id}',          LeadController::class, 'show',         [AuthMiddleware::class]);
$router->post( '/api/leads/upload',       LeadController::class, 'upload',       [AuthMiddleware::class]);
$router->put(  '/api/leads/{id}/status',  LeadController::class, 'updateStatus', [AuthMiddleware::class]);
$router->post( '/api/leads/{id}/retry',   LeadController::class, 'retry',        [AuthMiddleware::class]);

// ─── Stats ────────────────────────────────────────────────────
$router->get('/api/stats/dashboard',          StatsController::class, 'dashboard', [AuthMiddleware::class]);
$router->get('/api/stats/campaign/{id}',      StatsController::class, 'campaign',  [AuthMiddleware::class]);
$router->get('/api/stats/broker/{id}',        StatsController::class, 'broker',    [AuthMiddleware::class]);

// ─── Transfers ────────────────────────────────────────────────
$router->post('/api/transfers',                  TransferController::class, 'initiate', [AuthMiddleware::class]);
$router->get( '/api/transfers/pending',          TransferController::class, 'pending',  [AuthMiddleware::class]);
$router->post('/api/transfers/{id}/accept',      TransferController::class, 'accept',   [AuthMiddleware::class]);
$router->post('/api/transfers/{id}/reject',      TransferController::class, 'reject',   [AuthMiddleware::class]);
$router->post('/api/transfers/{id}/complete',    TransferController::class, 'complete', [AuthMiddleware::class]);
