# Regulation map

Source: The Children's Homes (England) Regulations 2015 (SI 2015/541), verified against legislation.gov.uk 22 Oct 2026. Every feature in the system cites its row here. SCCIF judgement areas (overall experiences and progress; how well children are helped and protected; effectiveness of leaders and managers) are mapped at the end.

## Quality standards (Regs 6–14) → where the evidence lives

| Reg | Standard | Evidence in system |
|-----|----------|--------------------|
| 6 | Quality and purpose of care | Statement of Purpose (versioned), placement plan, daily logs, child voice. **Slice 3:** daily log per child per shift with structured prompts and narrative |
| 7 | Children's views, wishes and feelings | Child voice records, key-work sessions, complaints, Reg 44 "children spoken to". **Slice 2:** child's-views field on every risk assessment and placement plan. **Slice 3:** child's voice records (what was said, response, outcome; unanswered ones flagged); key-work child's-words auto-recorded |
| 8 | Education | Education section of child record, PEP, school reports (Sch 3 para 18), attendance in daily logs. **Slice 3:** attended-education prompt on every log |
| 9 | Enjoyment and achievement | Activities in daily logs, achievements in chronology. **Slice 3:** activities and positives prompts |
| 10 | Health and well-being | Health section (Sch 3 paras 21–26), MAR, health appointments, risk assessments. **Slice 5:** medication register and MAR; allergies shown on the medication page |
| 11 | Positive relationships | Key-work, contact records (Sch 3 para 16), behaviour support plans. **Slice 3:** key-work sessions with actions agreed and next date |
| 12 | Protection of children | Risk assessments, safeguarding incidents, missing episodes, Reg 40 notifications, policies (Reg 34). **Slice 2:** versioned risk assessments with review dates; overdue reviews surfaced on the home page. **Slice 4:** incidents, safeguarding concerns, missing episodes; rules create referral/review tasks |
| 13 | Leadership and management | **Slice 8:** audit engine — 19 continuous rules, idempotent, self-resolving, escalating; compliance score per home; `incident.unreviewed` and `logs.unreviewed` rules. **Slice 6:** cross-home dashboard for directors and the RI; organisation-wide action tracker (incidents, Reg 44, Reg 45). **Slice 1:** organisation → home → staff structure, scoped roles, audit log. **Slice 4:** manager review of every incident; follow-up tasks with owners, deadlines and regulation; RI informed on critical events |
| 14 | Care planning | Placement plan (Regs 17/18), LA care plan copies (Sch 3 para 19), review outcomes (Sch 3 para 20). **Slice 2:** placement plan with lifecycle; documents of type care plan / review record |

## Conduct of the home (Regs 16–25)

| Reg | Subject | Feature |
|-----|---------|---------|
| 16 | Statement of purpose (Schedule 1) | **Slice 5:** versioned SoP and Children's Guide with effective date, review date, Ofsted-notified date; missing SoP or un-notified version flagged. **Slice 8:** `sop.missing` rule (missing or not notified). Schedule 1 template: later |
| 17 / 18 | Placement plans | **Slice 2:** placement plan entity, versioned, lifecycle; child page warns when none exists. **Slice 8:** engine rule `plan.missing` (RM task after 5 days, escalates to RI) and `plan.review_overdue` |
| 19 | Behaviour management and discipline | Behaviour support plan per child; measures of control recorded (Sch 3 para 15) |
| 20 | Restraint and deprivation of liberty | **Slice 4:** physical intervention record with Reg 35(3) fields; rules create child's view (24h), staff debrief (24h), manager sign-off (48h), risk review (5d), medical check if injured |
| 21 | Privacy and access | Record of searches / room checks; child access to own record |
| 22 | Contact and communications | Contact arrangements and restrictions per child |
| 23 | Medicines | **Slice 5:** medication register per child (PRN, controlled drug, homely remedy, consent), MAR chart with outcome/witness/stock; controlled drugs require a witness; errors require a note. **Slice 4:** medication error incident type |
| 24 | Monitoring and surveillance | Register of surveillance measures and consents |
| 25 | Fire precautions | **Slice 5:** scheduled checks — alarm weekly, day and night drills, emergency lighting, extinguishers — with pass/fail and overdue status |

## Registered persons and staffing (Regs 26–33)

| Reg | Subject | Feature |
|-----|---------|---------|
| 27 / 28 | Manager appointment and fitness | Home record: RM, qualification, date appointed, Ofsted registration. **Slice 1:** home record with URN, RM membership |
| 29 | CPD of RP and RI | Training record for RI and directors |
| 31 | Staffing | Rota (Sch 4 para 3) and ratios check against SoP. **Slice 3:** shift handover with staff on duty and received-by acknowledgement |
| 32 | Fitness of workers (Schedule 2) | **Slice 5:** staff record with every Schedule 2 item dated; missing items listed; DBS renew after 3 years unless update service; Level 3 within two years of start tracked. **Slice 8:** `schedule2.incomplete` and `staff.level3_overdue` engine rules |
| 33 | Employment of staff | **Slice 5:** supervision and appraisal records with staff and supervisor signature; monthly in probation then six-weekly; training records with expiry; mandatory course list; induction date |

## Policies, records, complaints, notifications (Regs 34–42)

| Reg | Subject | Feature |
|-----|---------|---------|
| 34 | Child protection, bullying, missing policies | **Slice 5:** policy library with versions and review dates (overdue flagged). **Slice 4:** missing episode record — police informed, return, welcome-back conversation, independent return interview within 72h; LADO referral task for allegations |
| 35 | Behaviour management policies and records | **Slice 4:** `physical_interventions` table holds every Reg 35(3) field; manager cannot sign until the child's view is recorded; register = incidents filtered by type |
| 36 | Children's case records (Schedule 3) | **Slice 8:** `logs.missing` and `logs.unreviewed` rules. **Slice 2:** child record with Schedule 3 field groups (paras 1–6, 8–13, 16–26); contacts as structured people; chronology; documents (paras 17–20). Para 7 (money) slice 5; para 15 (measures of control) slice 4. Completeness score: compliance score per home (slice 8) |
| 37 | Other records (Schedule 4) | **Slice 7:** register of children (para 1), staff register (para 2), visitors book (para 5), fire drills (para 6) all in the evidence pack; accounts via money ledger (para 7). Rota (para 3): slice 8 |
| 38 | Storage of records | Encryption, retention (child records to 75th birthday), access control, backup. **Slice 1:** append-only hash-chained `audit_events`, DB-backed sessions, scoped access. **Slice 7:** per-account access trail (what an inspector or departed staff member opened) |
| 39 | Complaints and representations | **Slice 4:** complaint incident type with acknowledge (3d) and respond (28d) tasks. Full stages: slice 6 |
| 40 | Notification of a serious event | **Slice 4:** notification flags pre-set by type/severity, manager confirms; `notifications` table records what was sent, when, by whom, reference; required-but-missing shown in red; rules create Ofsted tasks for missing, safeguarding, allegations, police involvement, serious accidents. **Slice 8:** `notification.unsent` rule — flagged but unsent after 24h → RM, escalates to RI after 2 days |
| 41 | Admissions and discharges | **Slice 2:** placement opened at admission and closed at discharge with destination (Sch 3 para 6); `admissionNotifiedAt` / `dischargeNotifiedAt` columns ready for the slice 8 rule |
| 42 | Notification of offences | Staff record flag → notification task |

## Monitoring and review (Regs 43–47)

| Reg | Subject | Feature |
|-----|---------|---------|
| 43 / 44 | Independent person visits and reports | **Slice 6:** visit report with Reg 44(4) opinions (safeguarding; conduct promotes wellbeing), children/staff spoken to, recommendations; submitting turns each recommendation into a tracked action plus manager-response (Reg 44(6)) and Ofsted-copy (Reg 44(7)(c)) tasks; monthly cadence tracked and shown overdue on the dashboard. **Slice 8:** `reg44.overdue` rule → RI task. **Slice 1:** `independent_visitor` role, time-boxed |
| 45 | Review of quality of care | **Slice 6:** six-monthly review created with a data snapshot from the system (incidents, restraint, missing, follow-ups, logs, key-work, voice, medication, supervision, Sch 2, training, checks, Reg 44); rating + evidence + actions per quality standard (Regs 6–14); actions become tracked; RI signs and locks; Reg 45(4) copy date. **Slice 8:** `reg45.due` rule. **Slice 9:** AI narrative draft from the data snapshot, inserted into the summary only when the manager chooses |
| 46 | Review of premises | **Slice 5:** maintenance log with urgent/safety flags; gas, EICR, PAT, legionella and window-restrictor checks on the schedule. **Slice 8:** `checks.overdue` rule with escalation |
| 47 | Financial position | **Slice 5:** petty cash ledger (receipts flagged when missing, witness) and per-child money ledger (Sch 3 para 7) |

## Part 7

| Reg | Subject | Feature |
|-----|---------|---------|
| 48 | Notice of absence (RM absent 28+ days) | Rule: RM absence recorded → notice task |
| 49 | Notice of changes | Change to SoP, RM, RI, premises → notice task |

## Ofsted inspection access

| Need | Feature |
|------|---------|
| Inspector reads records on site or remotely | **Slice 1:** `inspector` role — read-only, home-scoped, time-boxed grant; every read audited. **Slice 2:** managers grant and revoke it from Staff & access; end date mandatory |
| SCCIF evidence pack | **Slice 7:** printable evidence pack per home, organised by the three SCCIF judgement areas, drawn live from the records (registers, restraint register with gaps in red, missing episodes, notifications, risk assessments, staff fitness, Reg 44/45, fire checks); generation is audited as an export |

## Schedule 3 → child record field groups

Para 1–8 personal details and legal status · 9–13 contacts (parents, SW, school, employer) · 14–16 care/protection/safety incl. measures of control and contact restrictions · 17–20 plans, school reports, care plan copies, review results · 21–26 health, accidents, immunisations/allergies, examinations, medicines, dietary needs.

## SCCIF judgement areas → dashboard tiles

| Judgement | Evidence pulled |
|-----------|----------------|
| Overall experiences and progress | Education, health, enjoyment, child voice, placement stability, key-work quality |
| How well children are helped and protected | Risk assessment currency, incidents and trends, missing episodes and return interviews, restraint review, safeguarding referrals, Reg 40 timeliness |
| Effectiveness of leaders and managers | Reg 44/45 completion and action closure, supervision compliance, training matrix, staff fitness completeness, notification timeliness, complaint handling |

**Slice 9:** mock inspection — `lib/rules/inspection.ts` scores the three judgement areas deterministically from `HomeMetrics` and open engine findings (tested); Claude writes the report and a JSON action plan on top; a manager chooses whether to turn the plan into tracked follow-ups. Also: chronology summary per child (Reg 36) and daily-log writing feedback (Reg 36, Reg 7). Every draft stores model, prompt version, input hash and the human decision; AI never submits, locks or notifies.
