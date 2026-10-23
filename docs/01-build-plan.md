# Kaizen — build plan

**Kaizen** (改善, continuous improvement): a case recording and governance system for children's homes in England, built to the Children's Homes (England) Regulations 2015, the Quality Standards and Ofsted's SCCIF. Multi-tenant SaaS; RJS Social Care Limited is tenant #1.

## Principles

1. Every screen traces to a regulation, quality standard or SCCIF judgement area.
2. The system creates the follow-up work; staff don't have to remember it.
3. Records are never silently edited. Sign-off locks; amendments are versioned.
4. Deterministic audit rules first; AI drafts on top, humans sign.
5. Mobile-first for anything a care worker does on shift.

## Slices (each deployable and testable on its own)

| # | Slice | Delivers | Status |
|---|-------|----------|--------|
| 1 | Foundation | Repo, Next.js/TypeScript, Postgres, auth, organisation → home → staff, roles, append-only audit log | **Done** (22 Oct 2026) |
| 2 | Child record | Schedule 3 fields, placement plan, risk assessments with review cycles, chronology, documents | **Done** (22 Oct 2026) |
| 3 | Daily recording | Daily logs, handovers, key-work sessions, child's voice, offline-tolerant mobile UI | **Done** (22 Oct 2026) |
| 4 | Incidents | Incident / missing / physical intervention / complaint / safeguarding, with auto-created follow-ups (debrief, child's view, Reg 40 notification, manager review) | **Done** (22 Oct 2026) |
| 5 | Home operations | Supervision, appraisal, training matrix, medication (MAR), H&S and fire checks, maintenance, petty cash, Statement of Purpose & Children's Guide versioning | **Done** (22 Oct 2026) |
| 6 | Governance | Reg 44 independent visitor workflow, Reg 45 quality review, director/RI cross-home dashboard, action tracker | **Done** (23 Oct 2026) |
| 7 | Inspection window | Time-boxed read-only inspector role, scoped per home, every access logged, SCCIF-ordered export pack | Next |
| 8 | Audit engine | Continuous rules producing actions with owner + deadline; compliance score per home | |
| 9 | AI layer | Claude: Reg 45 draft, chronology summary, log-quality feedback, mock SCCIF inspection with action plan | |

Done in slice 2 from the slice 1 leftovers: grant/revoke access from the UI, password change. Still carried: TOTP MFA for deputy and above; documents to move from Postgres to object storage once hosting is chosen.

## Done criteria for every slice

- Runs locally with one command and seeded demo data
- Automated tests on the business rules
- Audit log captures every create/update/read of child data
- Reviewed against the regulation map (docs/04)
- Ryan has clicked through it

## Roles

| Role | Scope | Typical user |
|------|-------|--------------|
| Owner / Director | Organisation | Company director |
| Responsible Individual | Organisation | RI |
| Registered Manager | Home | RM |
| Deputy / Senior | Home | Deputy, team leader |
| Care Worker | Home | Residential support worker |
| Independent Visitor | Home, Reg 44 only | External Reg 44 person |
| Inspector | Home, read-only, time-boxed | Ofsted |
| System Admin | Organisation, no child data by default | IT / owner |

## Hosting and compliance baseline

- UK region only (AWS eu-west-2 or Azure UK South)
- Encryption at rest and in transit, secrets in a managed vault
- Daily encrypted backups, 30-day point-in-time restore
- Retention: child records retained to 75th birthday (or 15 years from death if under 18), then destroyed per policy
- Subject access export per child
- Cyber Essentials Plus as the first certification target
