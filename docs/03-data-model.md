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

## Child (Schedule 3) — slice 2

- **child** — identifiers, name, DOB, sex, ethnicity, religion, language, legal status, placing authority, social worker, IRO, parents/carers and contact arrangements, GP, dentist, optician, school/education provider, health conditions, allergies, consent flags, photo
- **placement** — child × home, admission date, planned end, reason, placing authority ref, emergency flag, discharge date and destination
- **placement_plan** — versioned; needs, objectives, arrangements for education/health/contact/independence
- **care_plan_document** — uploaded LA care plan, pathway plan, EHCP, PEP, health assessment, with dates
- **risk_assessment** — type (individual, missing, self-harm, online, activity), level, controls, review date, next review, versions
- **chronology** — significant events, auto-fed from incidents and placements plus manual entries
- **document** — any file, typed, with retention category

## Daily recording — slice 3

- **daily_log** — child, shift, author, free text + structured prompts (mood, meals, school, activities, contact, bedtime), countersign
- **handover** — home, shift, author, per-child notes, home notes, tasks carried forward
- **keywork_session** — child, keyworker, topics, child's words, actions
- **child_voice** — child, how captured, content, response given, linked record

## Incidents — slice 4

- **incident** — type (incident, missing, physical intervention, complaint, safeguarding concern, accident, medication error), child(ren), staff involved, date/time, narrative, immediate actions, injuries, witnesses
- **physical_intervention** — hold type, duration, justification, de-escalation attempted, injuries, child's view, debrief, manager review (Reg 35 fields)
- **missing_episode** — time left, time returned, police ref, return interview, risk triggers
- **complaint** — complainant, stage, outcome, timescales
- **notification** — Reg 40 to Ofsted/LA/police: type, sent at, by, method, reference, response
- **follow_up_task** — auto-created from rules; owner, due, done, evidence link

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
