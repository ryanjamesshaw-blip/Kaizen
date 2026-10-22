# CLAUDE.md — conventions for any Claude session on this repo

## What this is
Kaizen: case recording and governance for children's homes in England. Built to the Children's Homes (England) Regulations 2015 and Ofsted's SCCIF. Multi-tenant. Design docs live in `docs/`.

## Hard rules — never break these
1. `audit_events` is append-only. Database triggers block UPDATE/DELETE/TRUNCATE for every role. Never remove them.
2. Every table holding child or home data has `organisation_id` and `home_id`. Never query child or home data without applying the user's grant scope (`lib/rbac` → `visibleHomes` / `can`).
3. Locked records are immutable. Changes create a new version with a mandatory reason. Never mutate in place.
4. Reads of child records (and home records) are audited, not just writes.
5. AI output lands in `ai_draft` with status `draft`. AI never submits, locks or notifies.
6. No secrets in the repo. `.env.example` lists every variable.
7. Every feature cites its regulation in `docs/04-regulation-map.md`; add a row if one is missing.
8. Automation rules live in `src/lib/rules/` as declarative objects with a `regulation` field. No ad-hoc cron logic elsewhere.

## Stack
Next.js 16 App Router (`cacheComponents` off — everything is per-user), TypeScript strict, Tailwind 4, Drizzle ORM + PostgreSQL 16, custom DB-backed sessions (`lib/auth`), Zod, Vitest, Playwright.

Prisma was dropped because its engine binaries cannot be downloaded in restricted environments. Drizzle is pure TypeScript.

## Conventions
- Domain logic in `src/lib/` as pure functions with unit tests in `tests/`. Server actions call `lib/`, never contain business rules.
- Schema in `src/db/schema.ts`; migrations in `drizzle/` via `npm run db:generate`. Never edit a migration that has shipped; database guards (triggers, grants) go in `--custom` migrations.
- Seed (`src/db/seed.ts`) gives a demo organisation with two homes and a login for every role. All names fictional.
- Dates stored UTC, displayed Europe/London (`en-GB`).
- Mobile-first: every care-worker screen must work at 375px wide.
- Accessibility: WCAG 2.1 AA.
- `next/font/google` is not used (no network at build time); system font stack in `globals.css`.

## Commands
```
npm run dev          # local
npm run db:reset     # drop + migrate + seed (local only)
npm run db:generate  # new migration from schema changes
npm run test         # vitest
npm run typecheck
npm run lint
```

## Definition of done for a slice
Runs with `npm run db:reset && npm run dev`, tests pass, audit coverage verified, regulation map updated, screenshots checked at desktop and 375px.
