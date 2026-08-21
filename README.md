# CampusMate AI

CampusMate AI is a single-repository React, Express, Supabase, Groq, and
WhatsApp college assistant. One Node.js process serves the admin frontend,
JSON API, WhatsApp webhook, health endpoints, and reminder scheduler.

## Repository layout

```text
.
|-- src/                 React + Vite frontend
|-- server/              Express API, webhook, services, and scheduler
|-- shared/              Shared TypeScript types
|-- supabase/            Schema, seed, and safe migrations
|-- dist/                Generated Vite build
|-- dist-server/         Generated backend build
|-- package.json         Root development and production commands
|-- Dockerfile
|-- render.yaml
`-- vite.config.ts
```

The frontend intentionally remains in the root `src/` directory. There are no
separate client or server packages, and the repository uses one npm lockfile.

## Routes

| Purpose | Route |
| --- | --- |
| Frontend | `/` |
| Admin API | `/api/admin/*` |
| Authentication | `/api/auth/*` |
| Health | `/api/health` |
| Database health | `/api/health/database` |
| WhatsApp webhook | `/webhook/whatsapp` |

In production, Express serves `dist/`. API and webhook routes are registered
before static files and the Express 5 `*splat` SPA fallback. Unknown API and
webhook routes return JSON `404` responses instead of `index.html`.

## Local development

1. Install the Node.js version declared in `package.json` (`>=20`).
2. Copy `.env.example` to `.env` and enter your backend secrets.
3. Apply the required SQL from `supabase/` to your Supabase project.
4. Install and start both processes:

```bash
npm ci
npm run dev
```

The frontend runs at `http://localhost:5173`. The API runs at
`http://localhost:3000`. Vite proxies `/api` and `/webhook` to port 3000, so
frontend code uses relative API paths in development and production.

## Commands

```bash
npm run dev           # Vite and the TypeScript backend watcher
npm run dev:web       # Vite only
npm run dev:server    # backend watcher only
npm run clean         # remove generated production output
npm run build:client  # Vite -> dist/
npm run build:server  # TypeScript -> dist-server/
npm run build         # complete production build
npm start             # dist-server/server/index.js
npm run typecheck
npm run lint
npm test
```

## Environment variables

All secrets are backend-only. Do not prefix a secret with `VITE_`.

| Variable | Required | Visibility | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | production | Backend | Runtime mode |
| `PORT` | platform-provided | Backend | HTTP port |
| `APP_URL` | yes | Backend | Public application origin |
| `CLIENT_URL` | yes | Backend | Allowed development origin(s), comma-separated |
| `COLLEGE_TIMEZONE` | yes | Backend | Scheduler timezone |
| `SUPABASE_URL` | yes | Backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Backend secret | Privileged database access |
| `GROQ_API_KEY` | yes | Backend secret | AI responses |
| `GROQ_MODEL` | yes | Backend | Groq model name |
| `WHATSAPP_ACCESS_TOKEN` | yes | Backend secret | Meta API authorization |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | Backend | WhatsApp sender ID |
| `WHATSAPP_VERIFY_TOKEN` | yes | Backend secret | Webhook verification |
| `WHATSAPP_APP_SECRET` | yes | Backend secret | POST signature verification |
| `WHATSAPP_API_VERSION` | yes | Backend | Meta Graph API version |
| `WHATSAPP_TIMETABLE_TEMPLATE` | production reminders | Backend | Approved template; parameters: first name, date, schedule |
| `WHATSAPP_TIMETABLE_UPDATE_TEMPLATE` | production updates | Backend | Approved template; parameters: day, start time, subject, room |
| `WHATSAPP_ASSIGNMENT_TEMPLATE` | production reminders | Backend | Approved template; parameters: title, subject, due time |
| `WHATSAPP_EXAM_TEMPLATE` | production reminders | Backend | Approved template; parameters: title, subject, date, start time |
| `WHATSAPP_EVENT_TEMPLATE` | production reminders | Backend | Approved template; parameters: title, start time, venue |
| `WHATSAPP_NOTIFICATION_TEMPLATE` | production broadcasts | Backend | Approved template; parameters: title, message |
| `JWT_SECRET` | yes | Backend secret | Admin session signing |
| `ADMIN_EMAIL` | yes | Backend secret | Administrator login |
| `ADMIN_PASSWORD` | yes | Backend secret | Administrator login or bcrypt hash |
| `SCHEDULER_ENABLED` | yes | Backend | Start reminder jobs on this instance |
| `VITE_API_BASE_URL` | no | Browser-visible | Optional API origin; empty means same origin |
| `LOG_LEVEL` | no | Backend | Pino log level |

The browser never receives the Supabase service-role key, Groq key, Meta
tokens, JWT secret, or admin credentials. The frontend API client defaults to
same-origin requests. Set `VITE_API_BASE_URL` only when the frontend and API
are deliberately deployed on different origins.

## Production deployment

The standard commands for Railway, Render, Koyeb, and similar Node platforms
are:

```text
Build command: npm ci --include=dev && npm run build
Start command: npm start
Health check: /api/health
```

Set the platform's public HTTPS origin as `APP_URL`. Platforms provide `PORT`;
do not hardcode it. The server binds to `0.0.0.0`.

### Railway

1. Push the repository to GitHub.
2. In Railway, select **New Project** and **Deploy from GitHub repo**.
3. Select this repository and its production branch.
4. Set the build command to `npm ci --include=dev && npm run build`.
5. Set the start command to `npm start`.
6. Add all required backend environment variables from `.env.example`.
7. Set `NODE_ENV=production` and `SCHEDULER_ENABLED=true`.
8. Generate a Railway domain, then set `APP_URL` to that exact HTTPS origin.
9. Set the health-check path to `/api/health` if the service settings expose it.
10. Register `https://YOUR_DOMAIN/webhook/whatsapp` in Meta.

### Render

Create one Web Service from the repository root. Use the standard build and
start commands above, or use `render.yaml`. Set `APP_URL` to the generated
HTTPS origin and register `/webhook/whatsapp` with Meta.

### Koyeb

Create one Web Service from GitHub, use the standard build and start commands,
set the required environment variables, expose the platform-provided HTTP
port, and configure `/api/health` as the health check.

### Google Cloud Run

Build and deploy the included Dockerfile. Cloud Run provides `PORT`; set all
backend variables as runtime environment variables or secrets. Configure the
container health check for `/api/health`.

## Docker

```bash
docker build -t campusmate-ai .
docker run --env-file .env -p 3000:3000 campusmate-ai
```

The multi-stage image installs from `package-lock.json`, builds both targets,
copies only production dependencies and generated output, and runs as the
non-root `node` user. `.env` files are excluded from the image.

## WhatsApp and scheduler safety

Incoming POST requests retain the raw JSON bytes captured by Express so
`X-Hub-Signature-256` verification remains valid. Delivery and read-status
events are ignored by the student-message handler.

The scheduler starts only from the `app.listen` callback, never during imports
or builds. `scheduled_job_runs` prevents duplicate daily job execution. Enable
the scheduler on exactly one service instance. Free services that sleep cannot
guarantee scheduled reminder execution; use an always-on instance or an
external scheduled trigger for production reminders.

Proactive WhatsApp messages outside Meta's customer-service window require
approved templates and student opt-in. In production, automatic timetable,
assignment, exam, and event reminders are skipped when their corresponding
template variable is empty. Scheduled notifications are checked every minute.
The timetable job runs at 07:00 Monday-Saturday, assignment reminders at
18:00, exam reminders at 08:05, and next-day event reminders at 08:10 in
`COLLEGE_TIMEZONE`.

## Security

- Keep `.env` untracked and store production secrets in the hosting platform.
- Use a bcrypt hash for `ADMIN_PASSWORD` in production.
- Never place the service-role key or private tokens in `VITE_*` variables.
- Rotate Supabase, Groq, Meta, and JWT credentials regularly.
- Review retention and deletion rules for `message_logs`.
