# CampusMate AI

CampusMate is a WhatsApp-first college assistant with a responsive administration console. It authenticates students by their registered phone number, retrieves authorized college data from Supabase, and uses Groq to turn that verified context into concise replies.

## What is included

- WhatsApp Cloud API webhook verification, inbound messages, delivery status handling, and outbound replies
- Student phone authentication and student-scoped academic information
- Grounded Groq responses for timetables, assignments, exams, attendance, faculty, events, placements, emergencies, and FAQs
- Admin dashboard with CRUD management for students and college data
- Targeted or college-wide WhatsApp notifications
- Daily schedule and next-day assignment reminder jobs with idempotency protection
- Supabase schema, indexes, row-level security activation, seed data, structured logs, rate limits, and centralized errors
- A single Render deployment serving both the API and production admin interface

## Architecture

```text
Student -> WhatsApp Cloud API -> Express webhook
                                  |-> student verification (Supabase)
                                  |-> intent + scoped retrieval (Supabase)
                                  |-> grounded response (Groq)
                                  |-> WhatsApp reply

Admin browser -> React console -> Express admin API -> Supabase
Scheduler -> scoped reminders -> WhatsApp Cloud API
```

The service role key exists only on the backend. The browser never connects to Supabase directly. Groq receives the minimum student profile fields and query-specific records; it is instructed to refuse unsupported answers.

## Local setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Optionally run [`supabase/seed.sql`](supabase/seed.sql), then replace its sample contacts with real college information.
2. Create a Groq API key and a Meta WhatsApp app with the WhatsApp product enabled.
3. Copy `.env.example` to `.env` and fill every secret. Phone numbers in `students.phone` must include country code and digits only, for example `919876543210`.
4. Install and run:

```bash
npm install
npm run dev
```

The admin UI is available at `http://localhost:5173`; the API runs at `http://localhost:3000`.

For a local WhatsApp webhook, expose port 3000 with an HTTPS tunnel and register:

```text
https://YOUR_HTTPS_HOST/webhook/whatsapp
```

Use the same value for Meta's verify token and `WHATSAPP_VERIFY_TOKEN`. Add the app secret as `WHATSAPP_APP_SECRET` so POST signatures can be validated. Subscribe the webhook to `messages`.

## WhatsApp production notes

Free-form replies can be sent inside Meta's 24-hour customer service window. Proactive reminders and broadcasts outside that window require approved WhatsApp message templates. `sendTemplate()` is included in [`server/services/whatsapp.ts`](server/services/whatsapp.ts); configure approved template names before using production-initiated messaging. Obtain student opt-in and keep `whatsapp_opt_in` accurate.

Incoming Meta POST requests are validated with `X-Hub-Signature-256` and the raw request body. Requests with missing or invalid signatures are rejected.

## Render deployment

1. Push the project to a private GitHub repository.
2. In Render, create a Blueprint from [`render.yaml`](render.yaml).
3. Add the secret environment variables listed in `.env.example`. Set `APP_URL` to the final Render HTTPS URL.
4. Deploy, verify `https://YOUR_SERVICE.onrender.com/api/health`, and register the HTTPS webhook URL with Meta.

Run scheduled jobs on exactly one service instance by leaving `SCHEDULER_ENABLED=true` there and setting it to `false` on any additional web instances. For larger deployments, move jobs to a dedicated worker and queue deliveries to respect Meta throughput limits.

## Commands

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm start
```

## Security checklist

- Replace the seed emergency contacts before launch.
- Use a bcrypt hash in `ADMIN_PASSWORD` for production; plain text is accepted only to simplify first-time setup.
- Rotate service, Groq, Meta, and JWT secrets regularly and store them only in Render.
- Review college retention policy for `message_logs` and schedule deletion or anonymization.
- Use approved WhatsApp templates and documented student consent for proactive messaging.

## Extending CampusMate

The retrieval logic lives in [`server/services/knowledge.ts`](server/services/knowledge.ts), independent from prompt composition. New verified sources should be added there and represented in the database before they are exposed to Groq. This preserves the central rule: Supabase supplies facts; Groq supplies phrasing.
