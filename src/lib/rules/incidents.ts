/**
 * Incident follow-up rules. Declarative and pure (hard rule #8).
 *
 * Each rule says: for this incident type (and condition), create this task,
 * owned by this role, due this many hours after the incident, citing this
 * regulation. The engine (src/lib/incidents/actions.ts) materialises them.
 */
import type { IncidentType, Role } from "@/db/schema";

export type IncidentFacts = {
  type: IncidentType;
  severity: "low" | "medium" | "high" | "critical";
  occurredAt: Date;
  injuries: boolean;
  policeInvolved: boolean;
  childId: string | null;
};

export type TaskSpec = {
  key: string;
  title: string;
  detail?: string;
  regulation: string;
  ownerRole: Role;
  dueHours: number;
};

export type Rule = {
  key: string;
  appliesTo: IncidentType[] | "all";
  when?: (f: IncidentFacts) => boolean;
  task: Omit<TaskSpec, "key">;
};

const H = 1, D = 24;

export const INCIDENT_RULES: Rule[] = [
  // ---- every incident ----
  {
    key: "incident.manager_review",
    appliesTo: "all",
    task: { title: "Manager review of incident record", detail: "Read the record, check actions taken, decide on notifications and lessons learned, then lock the record.", regulation: "Reg 13 (leadership), Reg 36", ownerRole: "registered_manager", dueHours: 2 * D },
  },
  {
    key: "incident.childs_view",
    appliesTo: "all",
    when: (f) => !!f.childId && f.type !== "property_damage",
    task: { title: "Record the child's view of what happened", detail: "In their own words. Add to Child's voice.", regulation: "Reg 7", ownerRole: "care_worker", dueHours: 2 * D },
  },
  {
    key: "incident.placing_authority",
    appliesTo: "all",
    when: (f) => !!f.childId && (f.severity === "high" || f.severity === "critical" || ["missing", "physical_intervention", "safeguarding", "allegation_against_staff", "police_involvement", "accident"].includes(f.type)),
    task: { title: "Inform the placing authority (social worker)", regulation: "Reg 5, Reg 40", ownerRole: "deputy", dueHours: 1 * D },
  },

  // ---- physical intervention (Reg 20, Reg 35(3)) ----
  {
    key: "pi.childs_view",
    appliesTo: ["physical_intervention"],
    task: { title: "Child's view of the restraint recorded on the Reg 35 record", detail: "Must be in the restraint record itself, in the child's words where possible.", regulation: "Reg 35(3)(h)", ownerRole: "care_worker", dueHours: 1 * D },
  },
  {
    key: "pi.staff_debrief",
    appliesTo: ["physical_intervention"],
    task: { title: "Staff debrief after physical intervention", detail: "What led to it, what was tried first, what could be different next time.", regulation: "Reg 35, Guide to the Quality Standards 9.36", ownerRole: "deputy", dueHours: 1 * D },
  },
  {
    key: "pi.manager_sign",
    appliesTo: ["physical_intervention"],
    task: { title: "Registered manager signs the restraint record", detail: "Confirm the measure was necessary, proportionate and in line with the behaviour management policy.", regulation: "Reg 35(3)(i)", ownerRole: "registered_manager", dueHours: 2 * D },
  },
  {
    key: "pi.medical_check",
    appliesTo: ["physical_intervention"],
    when: (f) => f.injuries,
    task: { title: "Medical attention arranged and recorded", regulation: "Reg 10", ownerRole: "care_worker", dueHours: 4 * H },
  },
  {
    key: "pi.risk_assessment_review",
    appliesTo: ["physical_intervention"],
    task: { title: "Review the child's risk assessment and behaviour support plan", regulation: "Reg 12, Reg 19", ownerRole: "deputy", dueHours: 5 * D },
  },

  // ---- missing (Reg 34(4) missing policy; statutory guidance 2014) ----
  {
    key: "missing.police",
    appliesTo: ["missing"],
    task: { title: "Police informed and reference recorded", regulation: "Reg 34(4), missing-from-care policy", ownerRole: "care_worker", dueHours: 1 * H },
  },
  {
    key: "missing.return_conversation",
    appliesTo: ["missing"],
    task: { title: "Welcome-back conversation with the child on return", regulation: "Reg 34(4)", ownerRole: "care_worker", dueHours: 1 * D },
  },
  {
    key: "missing.independent_interview",
    appliesTo: ["missing"],
    task: { title: "Independent return interview offered (within 72 hours of return)", detail: "Carried out by someone independent of the home, arranged with the placing authority.", regulation: "DfE statutory guidance on children who run away or go missing (2014)", ownerRole: "deputy", dueHours: 3 * D },
  },
  {
    key: "missing.ofsted",
    appliesTo: ["missing"],
    task: { title: "Notify Ofsted of the missing episode", regulation: "Reg 40(4)(e)", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "missing.risk_review",
    appliesTo: ["missing"],
    task: { title: "Review the missing risk assessment and trigger plan", regulation: "Reg 12", ownerRole: "deputy", dueHours: 3 * D },
  },

  // ---- safeguarding / allegations ----
  {
    key: "safeguarding.referral",
    appliesTo: ["safeguarding"],
    task: { title: "Safeguarding referral made to the placing authority and local authority", regulation: "Reg 12, Reg 34(1), Working Together", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "safeguarding.ofsted",
    appliesTo: ["safeguarding", "allegation_against_staff"],
    task: { title: "Notify Ofsted", regulation: "Reg 40(4)", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "allegation.lado",
    appliesTo: ["allegation_against_staff"],
    task: { title: "Refer to the LADO within one working day", regulation: "Reg 34(1), Working Together, KCSIE", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "allegation.ri",
    appliesTo: ["allegation_against_staff"],
    task: { title: "Inform the Responsible Individual", regulation: "Reg 13", ownerRole: "registered_manager", dueHours: 4 * H },
  },

  // ---- police involvement / accidents / medication ----
  {
    key: "police.ofsted",
    appliesTo: ["police_involvement"],
    task: { title: "Notify Ofsted of police involvement", regulation: "Reg 40(4)(d)", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "accident.ofsted",
    appliesTo: ["accident"],
    when: (f) => f.severity === "high" || f.severity === "critical",
    task: { title: "Notify Ofsted of serious accident or injury", regulation: "Reg 40(4)(c)", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "accident.riddor",
    appliesTo: ["accident"],
    when: (f) => f.severity === "critical",
    task: { title: "Consider RIDDOR report", regulation: "RIDDOR 2013", ownerRole: "registered_manager", dueHours: 1 * D },
  },
  {
    key: "medication.pharmacist",
    appliesTo: ["medication_error"],
    task: { title: "Advice sought from pharmacist / GP / 111 and recorded", regulation: "Reg 23", ownerRole: "care_worker", dueHours: 2 * H },
  },
  {
    key: "medication.mar_review",
    appliesTo: ["medication_error"],
    task: { title: "MAR chart and medication procedure reviewed with staff involved", regulation: "Reg 23, Reg 33", ownerRole: "deputy", dueHours: 3 * D },
  },

  // ---- complaints (Reg 39) ----
  {
    key: "complaint.acknowledge",
    appliesTo: ["complaint"],
    task: { title: "Acknowledge the complaint to the complainant in writing", regulation: "Reg 39", ownerRole: "registered_manager", dueHours: 3 * D },
  },
  {
    key: "complaint.respond",
    appliesTo: ["complaint"],
    task: { title: "Investigate and respond to the complaint", regulation: "Reg 39", ownerRole: "registered_manager", dueHours: 28 * D },
  },

  // ---- any high/critical ----
  {
    key: "incident.ri_informed",
    appliesTo: "all",
    when: (f) => f.severity === "critical",
    task: { title: "Responsible Individual informed", regulation: "Reg 13", ownerRole: "registered_manager", dueHours: 4 * H },
  },
];

/** Default notification flags by type — shown pre-ticked; manager can override. */
export function defaultNotifications(f: Pick<IncidentFacts, "type" | "severity">) {
  const t = f.type;
  return {
    notifyOfsted: ["missing", "safeguarding", "allegation_against_staff", "police_involvement"].includes(t) || (t === "accident" && (f.severity === "high" || f.severity === "critical")),
    notifyPlacingAuthority: t !== "property_damage",
    notifyPolice: ["missing", "police_involvement"].includes(t),
    notifyLado: t === "allegation_against_staff",
  };
}

export function tasksFor(f: IncidentFacts): TaskSpec[] {
  const out: TaskSpec[] = [];
  for (const r of INCIDENT_RULES) {
    if (r.appliesTo !== "all" && !r.appliesTo.includes(f.type)) continue;
    if (r.when && !r.when(f)) continue;
    out.push({ key: r.key, ...r.task });
  }
  return out;
}

export function dueDate(occurredAt: Date, dueHours: number): Date {
  return new Date(occurredAt.getTime() + dueHours * 3_600_000);
}

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  incident: "Incident",
  missing: "Missing / absent",
  physical_intervention: "Physical intervention",
  safeguarding: "Safeguarding concern",
  complaint: "Complaint",
  accident: "Accident / injury",
  medication_error: "Medication error",
  property_damage: "Property damage",
  police_involvement: "Police involvement",
  allegation_against_staff: "Allegation against staff",
};
