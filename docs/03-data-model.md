# Data model

Slice 1 tables are live in `src/db/schema.ts`. Later tables are the plan.

All child/home tables carry `organisation_id`, `home_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `status` (draft/submitted/reviewed/locked), `version`.

## Core (slice 1 — live)

- **organisations** — name, company number
- **homes** — organisation, name, Ofsted URN, address, capacity, age range, active
- **users** — email (unique, case-insensitive), name, password hash, MFA fields, lockout counters
- **memberships** — user × organisation × role, optional home; validFrom/validTo for time-boxed grants; grantedBy, revokedAt/revokedBy
- **sessions** — hashed token, IP, user agent, expiry, revocation
- **audit_events** — append-only, hash-chained (see architecture)

## Child (Schedule 3) — slice 2 (live)

- **children** — Schedule 3 fields as columns; `contacts` jsonb array of people (role, name, organisation, phone, email, address, religion, parental responsibility); `homeId` is the current home; `archivedAt` set on discharge
- **placements** — child × home, admission date, planned end, reason, emergency flag, discharge date / destination / type / reason, Reg 41 notification stamps
- **placement_plans** — Reg 17 headings; lifecycle columns (status, version, supersedesId, amendmentReason, submitted/reviewed/locked by+at)
- **care_plan_document** — uploaded LA care plan, pathway plan, EHCP, PEP, health assessment, with dates
- **risk_assessments** — type, title, description, triggers, controls, level, child's views, reviewDueOn; same lifecycle columns
- **chronology_entries** — occurredOn, category, summary, detail, significant, sourceType/sourceId when system-generated (admission and discharge are)
- **documents** — typed, title, file metadata, bytes in `content` (bytea, ≤10 MB) until object storage is chosen

## Daily recording — slice 3 (live)

- **daily_logs** — child × date × shift; mood; prompts (education, meals, activities, contact, health, medication, bedtime, sleep); narrative, positives, concerns; lifecycle columns
- **handovers** — home × date, from/to shift, `childNotes` jsonb, home notes, tasks carried forward, staff on duty, receivedBy/At
- **keywork_sessions** — child × date, duration, topics, discussion, child's words, actions agreed, next session; lifecycle columns
- **child_voice** — child × date, method, what the child said, immediate response, outcome + respondedBy/At

## Incidents — slice 4 (live)

- **incidents** — type (10 types), severity, occurredAt, location, staff, witnesses, antecedent, narrative, immediate actions, injuries, notify* flags, manager review notes, lessons learned; lifecycle columns
- **physical_interventions** — one per restraint incident; every Reg 35(3) field incl. child's view (+ recorded by/at), staff debrief, manager signature
- **missing_episodes** — left at, classification, police informed/reference, returned at/how/condition, welcome-back conversation, independent return interview offered/held/by
- **notifications** — recipient, sent at/by, method, reference, acknowledged
- **follow_up_tasks** — ruleKey, title, detail, regulation, ownerRole/ownerUserId, dueAt, status (open/done/not_applicable), completion note
- Complaint stages table: slice 6

## Home operations — slice 5

- **staff_record** — role, start date, DBS, references, qualifications (Level 3/5), induction, probation
- **supervision**, **appraisal**, **training**
- **medication** and **mar_entry**
- **check** — fire alarm, drill, water, electrical, vehicle, first aid, window restrictors
- **maintenance_item**, **petty_cash_entry**, **child_money**

## Governance — slice 6

- **reg44_visit**, **reg45_review**, **action**, **inspection_grant**

## Automation / AI — slices 8–9

- **rule**, **rule_run**, **ai_draft**

## Retention

Each table maps to a retention class: `child_record_75` (to 75th birthday), `staff_record_7`, `operational_3`, `financial_6`. A scheduled job flags due-for-destruction records for RM/RI approval; destruction is logged.
