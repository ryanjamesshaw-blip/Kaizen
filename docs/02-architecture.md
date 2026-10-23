# Architecture

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Web app | Next.js 16 (App Router), TypeScript, React 19 | One codebase for desktop and mobile web; server components keep child data off the client until needed. `cacheComponents` is off: every page is per-user. |
| UI | Tailwind 4, hand-rolled components in `globals.css` | Small, accessible, themeable per tenant; no component library dependency |
| API | Next.js server actions, Zod validation | No separate API service in phase 1 |
| Database | PostgreSQL 16 via Drizzle ORM | Pure-TypeScript ORM (Prisma's engine binaries can't be fetched in restricted environments); SQL-level guards via custom migrations |
| Auth | Custom DB-backed sessions (`src/lib/auth`), bcrypt, lockout after 5 failures, 20-min idle timeout | Full control and auditability; TOTP MFA to follow |
| Files | S3-compatible object store, UK region, server-side encryption, signed URLs | Documents, photos, uploads (slice 2) |
| Jobs | Postgres-backed queue (pg-boss) | Audit rules, reminders, exports (slice 8) |
| AI | Claude API | Drafting and analysis; zero-retention configuration (slice 9) |
| Hosting | Vercel (UK) or AWS eu-west-2 containers + RDS | Decide at first deploy |
| Email/SMS | Resend / Twilio UK | Notifications and Reg 40 escalation |

## Tenancy model

```
Organisation (tenant)
 └── Home (registered setting, URN)
      ├── Memberships (user × role, optionally × home; time-boxed for inspector / Reg 44)
      ├── Children (placements)           ← slice 2
      └── Records                          ← slices 2–6
```

- Every row carrying child or home data has `organisation_id` and `home_id`.
- Scope is enforced in the data-access layer from the user's grants (`lib/rbac`), never from the UI. Postgres row-level security is added once the app connects as a dedicated role in production.
- Organisation-level roles (Director, RI, System Admin) see all homes; home-level roles see one.
- Inspector and Independent Visitor are home-scoped, time-boxed grants.

## Audit log

- Append-only table `audit_events`: actor, role, action, entity, entity id, before/after JSON diff, IP, user agent, timestamp, reason.
- Database triggers raise on UPDATE, DELETE and TRUNCATE for every role, including the owner. In production the app role additionally has INSERT/SELECT only.
- Hash chain: `hash = sha256(prev_hash + canonical_json(content))`, appended under an advisory lock so the chain is linear. `verifyAuditChain()` walks it; the audit page shows the result to Director/RI/System Admin.
- Reads of home and child records are logged, not just writes.

## Record lifecycle

```
draft → submitted → reviewed (manager) → locked
                                  └→ amendment (new version, reason required, original retained)
```

Care workers can edit their own drafts. Once submitted, only a manager can return it for correction (logged) or review and lock it.

## Automation engine (slice 8)

- Two kinds of rule, both declarative and both citing a regulation: event rules fire when an incident is submitted (`lib/rules/incidents.ts`); continuous rules run on a schedule (`lib/rules/engine.ts` + `lib/engine/detectors.ts`).
- The engine reconciles findings against engine-owned tasks by `(home, rule, subjectKey)`: new finding → task; finding gone → task auto-resolved; task overdue beyond the rule's window → one escalation task for the senior role. Running twice changes nothing (`reconcile()` is pure and tested).
- Compliance score = 100 − weighted, per-rule-capped deductions for open findings.
- Triggers: `npm run engine` (CLI), `POST /api/engine/run` with `ENGINE_SECRET` (hosting cron, hourly), and "Run checks now" on the compliance page.

## AI boundary (slice 9)

- AI never writes to a locked record and never auto-submits. It produces drafts into a clearly marked AI-draft state.
- Prompts include the home's own records only, under the user's existing permissions.
- Every AI output stores prompt version, model, and the human who accepted or rejected it.

## Security baseline (slice 1)

- Security headers set in `next.config.ts`; HSTS at the edge in production
- Sessions: 12h absolute, 20 min idle, revocable, hashed tokens
- Lockout: 5 failed attempts → 15 minutes; every attempt audited
- Secrets never in repo; `.env.example` only
- MFA (TOTP) for Deputy and above: slice 2

## Repository layout

```
src/app            Next.js routes  ((auth) login, (app) everything behind sign-in)
src/db             schema, client, migrate, seed, reset
src/lib/audit      hash chain (pure) + writer + queries
src/lib/auth       sessions, guard, actions
src/lib/rbac       permissions (pure)
src/lib/homes      scoped queries
src/lib/rules      automation rules catalogue (slice 8)
drizzle/           migrations (incl. custom SQL guards)
tests/             vitest unit tests
docs/              this folder
CLAUDE.md          conventions for any Claude session
```
