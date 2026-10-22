# Regulation map

Source: The Children's Homes (England) Regulations 2015 (SI 2015/541), verified against legislation.gov.uk 22 Oct 2026. Every feature in the system cites its row here. SCCIF judgement areas (overall experiences and progress; how well children are helped and protected; effectiveness of leaders and managers) are mapped at the end.

## Quality standards (Regs 6–14) → where the evidence lives

| Reg | Standard | Evidence in system |
|-----|----------|--------------------|
| 6 | Quality and purpose of care | Statement of Purpose (versioned), placement plan, daily logs, child voice. **Slice 3:** daily log per child per shift with structured prompts and narrative |
| 7 | Children's views, wishes and feelings | Child voice records, key-work sessions, complaints, Reg 44 "children spoken to". **Slice 2:** child's-views field on every risk assessment and placement plan. **Slice 3:** child's voice records (what was said, response, outcome; unanswered ones flagged); key-work child's-words auto-recorded |
| 8 | Education | Education section of child record, PEP, school reports (Sch 3 para 18), attendance in daily logs. **Slice 3:** attended-education prompt on every log |
| 9 | Enjoyment and achievement | Activities in daily logs, achievements in chronology. **Slice 3:** activities and positives prompts |
| 10 | Health and well-being | Health section (Sch 3 paras 21–26), MAR, health appointments, risk assessments |
| 11 | Positive relationships | Key-work, contact records (Sch 3 para 16), behaviour support plans. **Slice 3:** key-work sessions with actions agreed and next date |
| 12 | Protection of children | Risk assessments, safeguarding incidents, missing episodes, Reg 40 notifications, policies (Reg 34). **Slice 2:** versioned risk assessments with review dates; overdue reviews surfaced on the home page. **Slice 4:** incidents, safeguarding concerns, missing episodes; rules create referral/review tasks |
| 13 | Leadership and management | Supervision, training matrix, Reg 44/45, action tracker, audit engine dashboard. **Slice 1:** organisation → home → staff structure, scoped roles, audit log. **Slice 4:** manager review of every incident; follow-up tasks with owners, deadlines and regulation; RI informed on critical events |
| 14 | Care planning | Placement plan (Regs 17/18), LA care plan copies (Sch 3 para 19), review outcomes (Sch 3 para 20). **Slice 2:** placement plan with lifecycle; documents of type care plan / review record |

## Conduct of the home (Regs 16–25)

| Reg | Subject | Feature |
|-----|---------|---------|
| 16 | Statement of purpose (Schedule 1) | Versioned SoP with Schedule 1 section template; change triggers Reg 49 notice task |
| 17 / 18 | Placement plans | **Slice 2:** placement plan entity, versioned, draft → submitted → reviewed → locked → amend; child page warns when none exists. Rule for RM action: slice 8 |
| 19 | Behaviour management and discipline | Behaviour support plan per child; measures of control recorded (Sch 3 para 15) |
| 20 | Restraint and deprivation of liberty | **Slice 4:** physical intervention record with Reg 35(3) fields; rules create child's view (24h), staff debrief (24h), manager sign-off (48h), risk review (5d), medical check if injured |
| 21 | Privacy and access | Record of searches / room checks; child access to own record |
| 22 | Contact and communications | Contact arrangements and restrictions per child |
| 23 | Medicines | Medication register and MAR; stock reconciliation (slice 5). **Slice 4:** medication error incident type with pharmacist-advice and MAR-review tasks |
| 24 | Monitoring and surveillance | Register of surveillance measures and consents |
| 25 | Fire precautions | Fire checks and drills (Sch 4 para 6) |

## Registered persons and staffing (Regs 26–33)

| Reg | Subject | Feature |
|-----|---------|---------|
| 27 / 28 | Manager appointment and fitness | Home record: RM, qualification, date appointed, Ofsted registration. **Slice 1:** home record with URN, RM membership |
| 29 | CPD of RP and RI | Training record for RI and directors |
| 31 | Staffing | Rota (Sch 4 para 3) and ratios check against SoP. **Slice 3:** shift handover with staff on duty and received-by acknowledgement |
| 32 | Fitness of workers (Schedule 2) | Staff record: ID, DBS, two references, qualifications, employment history, gaps explained; rule: no shift until complete |
| 33 | Employment of staff | Supervision (frequency rule), appraisal, induction, training matrix |

## Policies, records, complaints, notifications (Regs 34–42)

| Reg | Subject | Feature |
|-----|---------|---------|
| 34 | Child protection, bullying, missing policies | Policy library (slice 5). **Slice 4:** missing episode record — police informed, return, welcome-back conversation, independent return interview within 72h; LADO referral task for allegations |
| 35 | Behaviour management policies and records | **Slice 4:** `physical_interventions` table holds every Reg 35(3) field; manager cannot sign until the child's view is recorded; register = incidents filtered by type |
| 36 | Children's case records (Schedule 3) | **Slice 2:** child record with Schedule 3 field groups (paras 1–6, 8–13, 16–26); contacts as structured people; chronology; documents (paras 17–20). Para 7 (money) slice 5; para 15 (measures of control) slice 4. Completeness score: slice 8 |
| 37 | Other records (Schedule 4) | Register of children, staff register, rota, residents/workers, visitors book, fire drills, accounts |
| 38 | Storage of records | Encryption, retention (child records to 75th birthday), access control, backup. **Slice 1:** append-only hash-chained `audit_events`, DB-backed sessions, scoped access |
| 39 | Complaints and representations | **Slice 4:** complaint incident type with acknowledge (3d) and respond (28d) tasks. Full stages: slice 6 |
| 40 | Notification of a serious event | **Slice 4:** notification flags pre-set by type/severity, manager confirms; `notifications` table records what was sent, when, by whom, reference; required-but-missing shown in red; rules create Ofsted tasks for missing, safeguarding, allegations, police involvement, serious accidents |
| 41 | Admissions and discharges | **Slice 2:** placement opened at admission and closed at discharge with destination (Sch 3 para 6); `admissionNotifiedAt` / `dischargeNotifiedAt` columns ready for the slice 8 rule |
| 42 | Notification of offences | Staff record flag → notification task |

## Monitoring and review (Regs 43–47)

| Reg | Subject | Feature |
|-----|---------|---------|
| 43 / 44 | Independent person visits and reports | Monthly Reg 44 workflow; report, RM response, copy to Ofsted; rule: no visit in month → RI alert. **Slice 1:** `independent_visitor` role, home-scoped and time-boxed |
| 45 | Review of quality of care | 6-monthly Reg 45 review built from system data; AI draft; RI sign-off |
| 46 | Review of premises | Annual premises review task |
| 47 | Financial position | Accounts (Sch 4 para 7), petty cash, child money (Sch 3 para 7) |

## Part 7

| Reg | Subject | Feature |
|-----|---------|---------|
| 48 | Notice of absence (RM absent 28+ days) | Rule: RM absence recorded → notice task |
| 49 | Notice of changes | Change to SoP, RM, RI, premises → notice task |

## Ofsted inspection access

| Need | Feature |
|------|---------|
| Inspector reads records on site or remotely | **Slice 1:** `inspector` role — read-only, home-scoped, time-boxed grant; every read audited. **Slice 2:** managers grant and revoke it from Staff & access; end date mandatory |
| SCCIF evidence pack | Slice 7 export |

## Schedule 3 → child record field groups

Para 1–8 personal details and legal status · 9–13 contacts (parents, SW, school, employer) · 14–16 care/protection/safety incl. measures of control and contact restrictions · 17–20 plans, school reports, care plan copies, review results · 21–26 health, accidents, immunisations/allergies, examinations, medicines, dietary needs.

## SCCIF judgement areas → dashboard tiles

| Judgement | Evidence pulled |
|-----------|----------------|
| Overall experiences and progress | Education, health, enjoyment, child voice, placement stability, key-work quality |
| How well children are helped and protected | Risk assessment currency, incidents and trends, missing episodes and return interviews, restraint review, safeguarding referrals, Reg 40 timeliness |
| Effectiveness of leaders and managers | Reg 44/45 completion and action closure, supervision compliance, training matrix, staff fitness completeness, notification timeliness, complaint handling |

Mock inspection (slice 9) scores each tile from the rules engine and Claude writes the narrative and actions.
