# 🤖 AI Call Platform

An intelligent, event-driven call automation system with AI-powered lead qualification, real-time agent transfers, CRM sync, and advanced analytics.

## 🏗 Architecture

```
├── backend/          PHP 8.1+ REST API + Webhook processor
│   ├── src/
│   │   ├── Controllers/   HTTP request handlers
│   │   ├── Services/      Business logic
│   │   ├── Core/          Framework (Router, DB, Container)
│   │   └── Middleware/    Auth guards
│   ├── routes/            API & webhook routes
│   ├── jobs/              Cron job scripts
│   └── public/            Web root (index.php)
│
├── frontend/         React 18 + Vite + Tailwind
│   └── src/
│       ├── pages/
│       │   ├── admin/     Dashboard, Campaigns, Leads, Stats
│       │   └── agent/     Agent panel with live transfers
│       ├── components/    Layout components
│       ├── api/           Axios API client
│       └── context/       Auth context
│
└── database/
    ├── migrations/    Full MySQL schema
    └── seeds/         Default roles, countries, admin user
```

## 🚀 Quick Start

### With Docker
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your secrets
docker-compose up -d
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api

### Manual Setup

**Backend (PHP)**
```bash
cd backend
composer install
cp .env.example .env
# Edit .env
```

**Database**
```sql
CREATE DATABASE ai_call_platform;
USE ai_call_platform;
SOURCE database/migrations/001_schema.sql;
SOURCE database/seeds/001_seed.sql;
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## 🔑 Default Login
- Email: `admin@platform.com`
- Password: `Admin@123456`
- **⚠️ Change immediately after first login!**

## 📡 Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login & get JWT |
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| POST | `/api/campaigns/{id}/start` | Start campaign |
| POST | `/api/leads/upload` | Upload CSV leads |
| GET | `/api/stats/dashboard` | Live dashboard |
| POST | `/webhook/voximplant` | Event webhook |

## ⚙️ Webhook Setup (Voximplant)

Point your Voximplant application webhook to:
```
POST https://your-domain.com/webhook/voximplant
Header: X-Voximplant-Signature: <hmac_sha256>
```

Set `VOXIMPLANT_WEBHOOK_SECRET` in `.env` to match your Voximplant config.

## 🔄 Cron Jobs

```cron
* * * * *   php /path/to/backend/jobs/retry.php
*/5 * * * * php /path/to/backend/jobs/crm_retry.php
```

## 🧩 Extending

The system uses interface-based abstraction for easy provider swapping:
- Replace Voximplant → implement `CallProviderInterface`
- Replace ElevenLabs → implement `VoiceEngineInterface`
- Add new CRM → implement `CRMProviderInterface`

## 🔐 Security

- JWT with access + refresh token rotation
- HMAC signature verification on all webhooks
- Role-based access control (super_admin, admin, campaign_manager, agent)
- Full audit logging

## 📊 Lead States

```
new → queued → called → human → activation_requested → transferred → closed
                      ↘ voicemail → (retry)
                      ↘ not_interested
                      ↘ curious → (follow-up)
```
