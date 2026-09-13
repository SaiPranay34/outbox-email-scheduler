# Outbox - Email Job Scheduler

Full-stack email scheduler built for the ReachInbox assignment.

## Stack

- React, TypeScript, Tailwind CSS
- Express, TypeScript, Knex, PostgreSQL
- BullMQ, Redis, Elasticsearch
- Ethereal SMTP, Google OAuth, Slack OAuth, Bull Board

## Features

- Google login with user name, email, and avatar
- CSV/TXT recipient upload with deduplication
- Delayed BullMQ job per recipient
- Scheduled and sent/failed email dashboard
- Ethereal preview links and Elasticsearch search
- Redis-backed hourly rate limit and configurable concurrency
- Slack alert when an hourly limit is reached
- Restart recovery and Bull Board monitoring

## Run locally

Requirements: Node.js 22.12+ and Docker Desktop.

```powershell
docker compose up -d
cd backend
npm ci
Copy-Item .env.example .env
```

Set these values in `backend/.env`:

```env
SESSION_SECRET=at-least-32-random-characters
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ETHEREAL_USER=
ETHEREAL_PASS=
```

Google callback URL:

```text
http://localhost:3001/api/auth/google/callback
```

Start the API:

```powershell
cd backend
npm run migrate
npm run dev
```

Start the worker in another terminal:

```powershell
cd backend
npm run dev:worker
```

Start the frontend in a third terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `ELASTICSEARCH_URL` | Elasticsearch connection |
| `SESSION_SECRET` | Session secret, 32+ characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `ETHEREAL_USER`, `ETHEREAL_PASS` | Ethereal SMTP credentials |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Optional Slack OAuth credentials |
| `ADMIN_EMAIL` | Bull Board administrator email |
| `WORKER_CONCURRENCY` | Worker concurrency, default `5` |
| `MIN_DELAY_MS_BETWEEN_SENDS` | Minimum send gap, default `2000` |
| `MAX_EMAILS_PER_HOUR` | Per-user hourly maximum, default `200` |

## Flow

1. Frontend submits a validated batch with a request UUID.
2. PostgreSQL stores one email row per recipient.
3. BullMQ stores one delayed Redis job per row.
4. Worker checks the hourly limit, applies the send gap, and sends through Ethereal.
5. Worker records sent/failed status and indexes the email in Elasticsearch.
6. A delayed BullMQ maintenance job recovers missing scheduled jobs after a restart.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/google` | Google OAuth login |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/emails` | Schedule emails |
| `GET` | `/api/emails` | List/search emails |
| `GET` | `/api/slack/connect` | Connect Slack |
| `DELETE` | `/api/slack` | Disconnect Slack |
| `GET` | `/admin/queues` | Admin Bull Board |

## Checks

```powershell
cd backend
npm run build
npm test

cd ../frontend
npm run build
```

## Trade-offs

- Plain-text email only; no attachments, drafts, cancellation, or rich editor.
- Ethereal is for testing; recipients do not receive real mail.
- Interrupted SMTP delivery is not automatically retried to avoid duplicates.
- PostgreSQL is the source of truth; Elasticsearch indexing is eventually consistent.
- Use `docker compose stop` to preserve data. Do not use `docker compose down -v` unless you want to erase it.
