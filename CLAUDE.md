# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Call Platform — an event-driven call automation system that uses Voximplant + ElevenLabs AI to place outbound calls, qualify leads via AI conversation, and transfer hot leads to live agents. Built with a PHP backend, React frontend, and MySQL database, deployed via Docker.

## Architecture

### Backend (PHP 8.1+, no framework)
- **Entry point**: `backend/public/index.php` — boots Application, loads routes, dispatches via custom Router
- **Custom micro-framework** in `backend/src/Core/`: Application (singleton + DI container), Router (regex-based pattern matching with `{param}` placeholders), Database (PDO wrapper with `fetch`/`fetchAll`/`insert`/`update`), Request, Response
- **Controllers** (`backend/src/Controllers/`) handle HTTP; **Services** (`backend/src/Services/`) contain business logic. Controllers instantiate services manually (no auto-injection).
- **Routes** defined in `backend/routes/api.php` and `backend/routes/webhook.php` using `$router->get()`/`post()`/`put()`/`delete()` with optional middleware array
- **Auth**: JWT (access + refresh tokens) via `firebase/php-jwt`. AuthMiddleware validates Bearer tokens.
- **Env**: `vlucas/phpdotenv` loads `backend/.env`

### Frontend (React 18 + Vite + Tailwind)
- **SPA** with React Router v6. Two layout shells: `AdminLayout` (admin panel at `/`) and `AgentLayout` (agent panel at `/agent`)
- **API client**: `frontend/src/api/index.js` — Axios instance with JWT interceptor (auto-refresh on 401). All API modules exported as named objects (`campaignApi`, `leadApi`, `brokerApi`, etc.)
- **State**: React Query for server state, AuthContext for user session
- **Env var**: `VITE_API_URL` sets the backend base URL

### Call Flow (critical path)
1. **Cron** (`backend/jobs/call_engine.php`) runs `CallEngineService::processActiveCampaigns()` every 30s
2. For each active campaign within its call window, it fetches queued leads up to `concurrency_limit - active_calls`
3. Calls Voximplant `StartScenarios` API with `script_custom_data` containing lead info, script body, detector prompt, webhook URL
4. **Voximplant scenario** (`voximplant/scenario.js`) places SIP call, connects ElevenLabs Conversational AI agent
5. AI agent uses tool calls (`transfer_connected`, `voicemail_detected`, `transfer_to_agent`, `end_call`, `book_appointment`) to classify and act
6. Scenario sends webhooks back to `POST /webhook/voximplant` (or `/api/webhook/voximplant`)
7. **WebhookService** processes events (`call_started`, `human_detected`, `voicemail_detected`, `ai_classification`, `transfer_started`, `transfer_completed`, `call_ended`), updates lead status, logs attempts, updates campaign stats, triggers CRM sync, and manages retries

### Cron Jobs (`backend/jobs/`)
All four jobs run in a loop every 30s inside the `acp_cron` container:
- `call_engine.php` — processes active campaigns, places outbound calls
- `retry.php` — re-queues leads with retry_after in the past
- `crm_retry.php` — retries failed CRM sync entries
- `lead_release.php` — releases stale leads

### Database
- MySQL 8.0 with numbered migrations in `database/migrations/` (001 through 015)
- Seeds in `database/seeds/001_seed.sql` (roles, countries, admin user)
- Key tables: `leads`, `lead_pool`, `campaigns`, `brokers`, `broker_routes`, `active_calls`, `lead_attempts`, `call_logs`, `campaign_stats`, `scripts`, `detectors`, `voximplant_accounts`, `appointments`

### Lead State Machine
```
new → queued → called → human → activation_requested → transferred → closed
                     ↘ voicemail → (retry)
                     ↘ not_interested
                     ↘ curious → (follow-up)
                     ↘ no_engagement → (retry)
                     ↘ appointment_booked
```

## Commands

### Docker (production)
```bash
docker-compose up -d                    # start all services
docker-compose restart frontend backend cron  # restart after code changes
docker-compose logs -f backend          # tail backend logs
docker-compose logs -f cron             # tail cron logs
```

### Frontend development
```bash
cd frontend && npm install && npm run dev    # dev server on :3000
cd frontend && npm run build                 # production build
```

### Backend
```bash
cd backend && composer install               # install PHP deps
cd backend && composer test                  # run PHPUnit tests
```

### Database migrations
```bash
# Run a specific migration on the server:
docker exec -i acp_mysql mysql -u acp_user -pCHANGE_TO_STRONG_PASSWORD ai_call_platform < database/migrations/<NNN_name>.sql
```

## Key Conventions

- **PHP**: strict_types declared in every file, PSR-4 autoloading under `App\` namespace
- **Database access**: Always use the `Database` class methods (`fetch`, `fetchAll`, `insert`, `update`, `query`) with parameterized queries — never raw string interpolation for user values
- **API responses**: Controllers return `Response` objects with `['success' => bool, 'data' => ...]` shape
- **Webhook signature**: Validated via HMAC-SHA256 or direct token match in WebhookService
- **Template variables**: Scripts and detector prompts support `{{name}}` and `{{campaign}}` placeholders, replaced at call time in CallEngineService
- **Migration naming**: Sequential numbered prefix `NNN_description.sql`
- **Roles**: `super_admin`, `admin`, `campaign_manager`, `agent` — agents see only `/agent` routes
