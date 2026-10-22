# Regulation map

Source: The Children's Homes (England) Regulations 2015 (SI 2015/541), verified against legislation.gov.uk 22 Oct 2026. Every feature in the system cites its row here. SCCIF judgement areas (overall experiences and progress; how well children are helped and protected; effectiveness of leaders and managers) are mapped at the end.

## Quality standards (Regs 6–14) → where the evidence lives

| Reg | Standard | Evidence in system |
|-----|----------|--------------------|
| 6 | Quality and purpose of care | Statement of Purpose (versioned), placement plan, daily logs, child voice |
| 7 | Children's views, wishes and feelings | Child voice records, key-work sessions, complaints, Reg 44 "children spoken to" |
| 8 | Education | Education section of child record, PEP, school reports (Sch 3 para 18), attendance in daily logs |
| 9 | Enjoyment and achievement | Activities in daily logs, achievements in chronology |
| 10 | Health and well-being | Health section (Sch 3 paras 21–26), MAR, health appointments, risk assessments |
| 11 | Positive relationships | Key-work, contact records (Sch 3 para 16), behaviour support plans |
| 12 | Protection of children | Risk assessments, safeguarding incidents, missing episodes, Reg 40 notifications, policies (Reg 34) |
| 13 | Leadership and management | Supervision, training matrix, Reg 44/45, action tracker, audit engine dashboard. **Slice 1:** organisation → home → staff structure, scoped roles, audit log |
| 14 | Care planning | Placement plan (Regs 17/18), LA care plan copies (Sch 3 para 19), review outcomes (Sch 3 para 20) |

## Conduct of the home (Regs 16–25)

| Reg | Subject | Feature |
|-----|---------|---------|
| 16 | Statement of purpose (Schedule 1) | Versioned SoP with Schedule 1 section template; change triggers Reg 49 notice task |
| 17 / 18 | Placement plans | Placement plan entity, must exist before/at admission; rule: missing plan → RM action |
| 19 | Behaviour management and discipline | Behaviour support plan per child; measures of control recorded (Sch 3 para 15) |
| 20 | Restraint and deprivation of liberty | Physical intervention record with Reg 35(3) fields; auto follow-ups |
| 21 | Privacy and access | Record of searches / room checks; child access to own record |
| 22 | Contact and communications | Contact arrangements and restrictions per child |
| 23 | Medicines | Medication register and MAR; stock reconciliation; error reporting |
| 24 | Monitoring and surveillance | Register of surveillance measures and consents |
| 25 | Fire precautions | Fire checks and drills (Sch 4 para 6) |

## Registered persons and staffing (Regs 26–33)

| Reg | Subject | Feature |
|-----|---------|---------|
| 27 / 28 | Manager appointment and fitness | Home record: RM, qualification, date appointed, Ofsted registration. **Slice 1:** home record with URN, RM membership |
| 29 | CPD of RP and RI | Training record for RI and directors |
| 31 | Staffing | Rota (Sch 4 para 3) and ratios check against SoP |
| 32 | Fitness of workers (Schedule 2) | Staff record: ID, DBS, two references, qualifications, employment history, gaps explained; rule: no shift until complete |
| 33 | Employment of staff | Supervision (frequency rule), appraisal, induction, training matrix |

## Policies, records, complaints, notifications (Regs 34–42)

| Reg | Subject | Feature |
|-----|---------|---------|
| 34 | Child protection, bullying, missing policies | Policy library with version and review date |
| 35 | Behaviour management policies and records | Measures of control / restraint register, reviewed and signed by RM |
| 36 | Children's case records (Schedule 3) | Child record; every Schedule 3 paragraph is a field group; completeness score |
| 37 | Other records (Schedule 4) | Register of children, staff register, rota, residents/workers, visitors book, fire drills, accounts |
| 38 | Storage of records | Encryption, retention (child records to 75th birthday), access control, backup. **Slice 1:** append-only hash-chained `audit_events`, DB-backed sessions, scoped access |
| 39 | Complaints and representations | Complaint workflow with stages and timescales |
| 40 | Notification of a serious event | Notification entity; rule from incident type → notify Ofsted / LA / police; tracked to acknowledgement |
| 41 | Admissions and discharges | Placement create/close triggers notification task |
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
| Inspector reads records on site or remotely | **Slice 1:** `inspector` role — read-only, home-scoped, time-boxed grant; every read audited |
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
