# Kaizen

Case recording and governance for children's homes in England, built to the Children's Homes (England) Regulations 2015 and Ofsted's SCCIF.

## Run locally

Requires Node 22 and PostgreSQL 16.

```bash
cp .env.example .env            # then set SESSION_SECRET (openssl rand -base64 32)
createdb kaizen                 # or point DATABASE_URL at an existing local db
npm install
npm run db:reset                # migrate + seed demo data
npm run dev                     # http://localhost:3000
```

Demo logins (password for all: `Kaizen-demo-1`):

| Role | Email |
|------|-------|
| Director | director@demo.kaizen |
| Responsible Individual | ri@demo.kaizen |
| Registered Manager (Oak House) | rm.oak@demo.kaizen |
| Deputy (Oak House) | deputy.oak@demo.kaizen |
| Care Worker (Oak House) | cw1.oak@demo.kaizen |
| Registered Manager (Willow Lodge) | rm.willow@demo.kaizen |
| Care Worker (Willow Lodge) | cw1.willow@demo.kaizen |
| Reg 44 Independent Visitor | reg44@demo.kaizen |
| Inspector (14-day window) | inspector@demo.kaizen |
| System Admin | admin@demo.kaizen |

## Status

Slice 1 (foundation) — done: tenancy, roles, sessions, tamper-evident audit log.
Slice 3 (daily recording) — done: shift board, daily logs with draft recovery, handovers, key-work, child's voice.
Slice 2 (child record) — done: Schedule 3 record, placements, placement plans and risk assessments with a draft → submitted → reviewed → locked → amend lifecycle, chronology, documents, access management.

`npx tsx scripts/verify-audit.mts` walks the audit hash chain from the shell.
See `docs/01-build-plan.md` for the rest.
