# Pulse: live Q&A, polls and quizzes

A Slido-style audience engagement app. Hosts create events. Participants join from any device with a 6-digit code (no account needed) to ask and upvote questions, answer live polls, surveys and quizzes. A full-screen present mode shows everything on the projector in real time.

## Features

| Area | What's included |
| --- | --- |
| Events | Host accounts (email + password), event dashboard, 6-digit join code, QR code, archive/restore, delete |
| Q&A | Ask anonymously or with a name, upvote, sort by Popular/Recent, edit/delete own questions, moderation queue (approve/reject), highlight on screen, star, mark answered, archive, pause Q&A, disallow anonymous |
| Polls | Multiple choice (single/multi-select), word cloud, rating, open text, ranking. Live results, show/hide results to participants, lock voting, participants can change their vote |
| Surveys | Any poll with several questions; participants step through them and the host picks which question is on screen |
| Quizzes | Timed questions, speed-based scoring (500–1000 pts), auto-reveal when the timer ends, live leaderboard, personal rank/score, restart |
| Present mode | Join code and QR, highlighted question, top questions, live charts, word cloud, quiz timer and leaderboard, full screen |
| Analytics | Participant/engagement counts, question stats, per-poll responses, CSV export of questions and poll responses |

## Tech stack

- **Next.js 15** (App Router, TypeScript) and Tailwind CSS 4
- **Socket.IO** on a custom Node server (`server.ts`) sharing the port with Next.js
- **Prisma** with SQLite locally (switch `provider` in `prisma/schema.prisma` to `postgresql` for production)
- `jose` JWT sessions in an httpOnly cookie, `bcryptjs` password hashes, `zod` validation, `d3-cloud` word cloud, `qrcode.react`

## Getting started

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET to a long random string
npx prisma migrate dev        # creates prisma/dev.db
npm run db:seed               # optional demo data
npm run dev                   # http://localhost:3000
```

Demo login after seeding: `demo@example.com` / `password123`, event code **123456**.

Try it: open `/admin/123456` as the host, `/event/123456` in another browser or an incognito window as a participant, and **Present mode** in a third tab.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with Socket.IO (`tsx server.ts`) |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Vitest unit tests (results aggregation, quiz scoring, CSV, security helpers) |
| `npm run lint` | ESLint |
| `npm run db:migrate` / `npm run db:seed` | Prisma migrations / demo data |

## How it fits together

```
server.ts                 HTTP server: Next.js request handler + Socket.IO
src/server/
  socket.ts               Socket event handlers (join, qa:*, poll:*, quiz:control), auth checks
  realtime.ts             Room-aware broadcasts, debounced per event
  services/               qa.ts, polls.ts, quiz.ts, events.ts: all validation and DB writes
  auth.ts, session.ts     JWT sessions for hosts
src/lib/                  Shared types, results aggregation, scoring, socket client hook
src/app/
  event/[code]            Participant view (mobile-first)
  admin/[code]            Host console: Q&A, Polls, Analytics, Settings
  present/[code]          Projector view
  dashboard, login, signup, api/…
```

Each event has three Socket.IO rooms: participants, admins and present. Every change goes through a service function and then triggers a broadcast of fresh state to each room. Each room gets the view it's allowed to see. For example, pending questions go only to admins, hidden poll results aren't sent to participants, and quiz answers and future quiz questions are withheld until they're revealed.

Participants are identified by a random token stored in `localStorage`, so they keep their votes and identity across reloads.

## Security

- **Hosts:** bcrypt password hashes and an httpOnly `SameSite=lax` session cookie. Every host action checks that the user owns the event.
- **Secret key:** in production the server refuses to start without a strong `AUTH_SECRET` (32+ random characters, not the placeholder).
- **Rate limits:** logins (10 per email and 30 per IP per 15 min), signups, questions (5 per minute per participant), votes and responses, new participant identities per IP, and wrong event codes (100 per IP per 10 min).
- **Real-time connections:** browsers from other sites are rejected (Origin check). Set `ALLOWED_ORIGINS` if the public URL differs from the host header.
- **Headers:** Content-Security-Policy, `X-Frame-Options: DENY` (no clickjacking), `nosniff`, a referrer policy, and HSTS in production.
- **CSV exports:** cells that spreadsheets would run as formulas (`=`, `+`, `-`, `@`) are neutralised.
- **Participants:** anonymous, so one person can still vote again from a new browser (Slido has the same limit). The per-IP limits cap how far this goes. Use moderation for Q&A.
- **Behind a reverse proxy:** set `TRUST_PROXY=true` so rate limits use the real client IP from `X-Forwarded-For`. Don't set it otherwise, because clients could then spoof their IP.

> The server keeps Socket.IO state and rate-limit counters in one process. To run several instances, add the Socket.IO Redis adapter and move quiz timers and rate limits to Redis.
