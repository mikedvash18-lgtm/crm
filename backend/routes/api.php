<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\BrokerController;
use App\Controllers\CampaignController;
use App\Controllers\LeadController;
use App\Controllers\ScriptController;
use App\Controllers\StatsController;
use App\Controllers\TransferController;
use App\Controllers\VoximplantController;
use App\Controllers\LeadPoolController;
use App\Middleware\AuthMiddleware;

// ─── Auth (public) ────────────────────────────────────────────
$router->post('/api/auth/login',   AuthController::class, 'login');
$router->post('/api/auth/refresh', AuthController::class, 'refresh');
$router->get( '/api/auth/me',      AuthController::class, 'me',      [AuthMiddleware::class]);

// ─── Countries ───────────────────────────────────────────────
$router->get('/api/countries', BrokerController::class, 'countries', [AuthMiddleware::class]);

// ─── Brokers ─────────────────────────────────────────────────
$router->get(   '/api/brokers',          BrokerController::class, 'index',   [AuthMiddleware::class]);
$router->get(   '/api/brokers/{id}',     BrokerController::class, 'show',    [AuthMiddleware::class]);
$router->post(  '/api/brokers',          BrokerController::class, 'store',   [AuthMiddleware::class]);
$router->put(   '/api/brokers/{id}',     BrokerController::class, 'update',  [AuthMiddleware::class]);
$router->delete('/api/brokers/{id}',     BrokerController::class, 'destroy', [AuthMiddleware::class]);

// ─── Broker Routes ──────────────────────────────────────────
$router->get(   '/api/brokers/{id}/routes',            BrokerController::class, 'routes',      [AuthMiddleware::class]);
$router->post(  '/api/brokers/{id}/routes',            BrokerController::class, 'storeRoute',  [AuthMiddleware::class]);
$router->put(   '/api/brokers/{id}/routes/{routeId}',  BrokerController::class, 'updateRoute', [AuthMiddleware::class]);
$router->delete('/api/brokers/{id}/routes/{routeId}',  BrokerController::class, 'deleteRoute', [AuthMiddleware::class]);

// ─── Voximplant Accounts ─────────────────────────────────────
$router->get(   '/api/voximplant-accounts',          VoximplantController::class, 'index',   [AuthMiddleware::class]);
$router->get(   '/api/voximplant-accounts/{id}',     VoximplantController::class, 'show',    [AuthMiddleware::class]);
$router->post(  '/api/voximplant-accounts',          VoximplantController::class, 'store',   [AuthMiddleware::class]);
$router->put(   '/api/voximplant-accounts/{id}',     VoximplantController::class, 'update',  [AuthMiddleware::class]);
$router->delete('/api/voximplant-accounts/{id}',     VoximplantController::class, 'destroy', [AuthMiddleware::class]);

// ─── Scripts ─────────────────────────────────────────────────
$router->get(   '/api/scripts',          ScriptController::class, 'index',   [AuthMiddleware::class]);
$router->get(   '/api/scripts/{id}',     ScriptController::class, 'show',    [AuthMiddleware::class]);
$router->post(  '/api/scripts',          ScriptController::class, 'store',   [AuthMiddleware::class]);
$router->put(   '/api/scripts/{id}',     ScriptController::class, 'update',  [AuthMiddleware::class]);
$router->delete('/api/scripts/{id}',     ScriptController::class, 'destroy', [AuthMiddleware::class]);

// ─── Campaigns ────────────────────────────────────────────────
$router->get(   '/api/campaigns',               CampaignController::class, 'index',  [AuthMiddleware::class]);
$router->get(   '/api/campaigns/{id}',           CampaignController::class, 'show',   [AuthMiddleware::class]);
$router->post(  '/api/campaigns',               CampaignController::class, 'store',  [AuthMiddleware::class]);
$router->put(   '/api/campaigns/{id}',           CampaignController::class, 'update', [AuthMiddleware::class]);
$router->post(  '/api/campaigns/{id}/start',        CampaignController::class, 'start',       [AuthMiddleware::class]);
$router->post(  '/api/campaigns/{id}/pause',        CampaignController::class, 'pause',       [AuthMiddleware::class]);
$router->post(  '/api/campaigns/{id}/resume',       CampaignController::class, 'resume',      [AuthMiddleware::class]);
$router->get(   '/api/campaigns/{id}/pool-preview',  CampaignController::class, 'poolPreview',  [AuthMiddleware::class]);
$router->get(   '/api/campaigns/{id}/activity-log', CampaignController::class, 'activityLog', [AuthMiddleware::class]);

// ─── Lead Pool ──────────────────────────────────────────────────
$router->get(  '/api/lead-pool',                LeadPoolController::class, 'index',        [AuthMiddleware::class]);
$router->post( '/api/lead-pool/upload',         LeadPoolController::class, 'upload',       [AuthMiddleware::class]);
$router->post( '/api/lead-pool/parse-headers',  LeadPoolController::class, 'parseHeaders', [AuthMiddleware::class]);
$router->get(  '/api/lead-pool/preview',        LeadPoolController::class, 'preview',      [AuthMiddleware::class]);
$router->get(  '/api/lead-pool/sources',        LeadPoolController::class, 'sources',      [AuthMiddleware::class]);

// ─── Leads ────────────────────────────────────────────────────
$router->get(  '/api/leads',              LeadController::class, 'index',        [AuthMiddleware::class]);
$router->get(  '/api/leads/{id}',          LeadController::class, 'show',         [AuthMiddleware::class]);
$router->post( '/api/leads/upload',       LeadController::class, 'upload',       [AuthMiddleware::class]);
$router->put(  '/api/leads/{id}/status',  LeadController::class, 'updateStatus', [AuthMiddleware::class]);
$router->post( '/api/leads/{id}/retry',    LeadController::class, 'retry',        [AuthMiddleware::class]);
$router->get(  '/api/leads/{id}/attempts', LeadController::class, 'attempts',     [AuthMiddleware::class]);

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
