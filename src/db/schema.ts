/**
 * Kaizen — slice 1 schema: tenancy, identity, access and the audit log.
 *
 * Regulation references: docs/04-regulation-map.md
 *  - organisation / home / membership ........ Reg 13 (leadership and management), Reg 27/28 (manager)
 *  - audit_event ............................. Reg 38 (storage of records), Reg 36 (case records integrity)
 *  - access grants (inspector / Reg 44) ...... Reg 44, Ofsted inspection access
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  bigserial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

const customBytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "director", // Owner / Director — organisation scope
  "responsible_individual", // RI — organisation scope
  "registered_manager", // RM — home scope
  "deputy", // Deputy / Senior — home scope
  "care_worker", // Residential support worker — home scope
  "independent_visitor", // Reg 44 person — home scope, time-boxed
  "inspector", // Ofsted — home scope, read-only, time-boxed
  "system_admin", // IT / owner — organisation scope, no child data by default
]);

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "read",
  "update",
  "submit",
  "review",
  "lock",
  "amend",
  "delete",
  "login",
  "login_failed",
  "logout",
  "grant_access",
  "revoke_access",
  "export",
]);

export const recordStatusEnum = pgEnum("record_status", [
  "draft",
  "submitted",
  "reviewed",
  "locked",
]);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  companyNumber: text("company_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const homes = pgTable(
  "homes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    name: text("name").notNull(),
    ofstedUrn: text("ofsted_urn"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    town: text("town"),
    postcode: text("postcode"),
    capacity: integer("capacity"),
    ageRangeMin: integer("age_range_min"),
    ageRangeMax: integer("age_range_max"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("homes_org_idx").on(t.organisationId)],
);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecret: text("mfa_secret"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

/**
 * A membership is a user's role within an organisation, optionally scoped to a
 * home. Organisation-scope roles (director, RI, system_admin) have homeId null.
 * Time-boxed grants (inspector, independent_visitor) carry validFrom/validTo.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    homeId: uuid("home_id").references(() => homes.id),
    role: roleEnum("role").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    grantedBy: uuid("granted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memberships_user_idx").on(t.userId),
    index("memberships_org_idx").on(t.organisationId),
    index("memberships_home_idx").on(t.homeId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sessions_token_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Audit log — append-only, hash-chained.
// The application role has INSERT only on this table (see db/migrate.ts).
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    organisationId: uuid("organisation_id"),
    homeId: uuid("home_id"),
    actorUserId: uuid("actor_user_id"),
    actorRole: roleEnum("actor_role"),
    action: auditActionEnum("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Minimal diff: { before, after } for updates; after only for creates. */
    diff: jsonb("diff"),
    /** Required for amend / revoke / delete. */
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** sha256 of (prevHash + canonical JSON of this row's content). */
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("audit_org_time_idx").on(t.organisationId, t.occurredAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_actor_idx").on(t.actorUserId),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type RecordStatus = (typeof recordStatusEnum.enumValues)[number];

// ===========================================================================
// Slice 2 — Child record (Reg 36, Schedule 3), placements (Regs 17/18/41),
// risk assessments (Reg 12), chronology, documents (Sch 3 paras 17–20).
// Every table here carries organisationId + homeId (hard rule #2).
// ===========================================================================

export const sexEnum = pgEnum("sex", ["female", "male", "other", "not_recorded"]);

export const legalStatusEnum = pgEnum("legal_status", [
  "s20", // Children Act 1989 s.20 accommodated
  "s31", // Full care order
  "s38", // Interim care order
  "s25", // Secure accommodation order
  "remand", // Remand to LA accommodation
  "placed_for_adoption",
  "other",
  "not_recorded",
]);

export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high", "very_high"]);

export const riskTypeEnum = pgEnum("risk_type", [
  "general",
  "missing",
  "self_harm",
  "online",
  "exploitation",
  "substance",
  "behaviour",
  "health",
  "activity",
  "other",
]);

export const chronologyCategoryEnum = pgEnum("chronology_category", [
  "placement",
  "education",
  "health",
  "contact",
  "incident",
  "missing",
  "safeguarding",
  "achievement",
  "review",
  "other",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "care_plan", // Sch 3 para 19
  "pathway_plan",
  "placement_plan",
  "pep", // personal education plan
  "ehcp",
  "health_assessment",
  "school_report", // Sch 3 para 18
  "review_record", // Sch 3 para 20
  "court_order",
  "consent",
  "photo",
  "other",
]);

/** A person connected to the child: parent, carer, social worker, IRO, GP… */
export type ContactPerson = {
  role: string; // e.g. "Mother", "Social worker", "IRO", "GP", "Dentist", "School contact"
  name: string;
  organisation?: string;
  phone?: string;
  email?: string;
  address?: string;
  religion?: string; // Sch 3 para 10 for parents/guardians
  notes?: string;
  parentalResponsibility?: boolean;
};

export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    /** Current home. Updated on transfer; history lives in placements. */
    homeId: uuid("home_id").notNull().references(() => homes.id),

    // Sch 3 paras 1–4
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    dateOfBirth: timestamp("date_of_birth", { mode: "date" }).notNull(),
    sex: sexEnum("sex").notNull().default("not_recorded"),
    religion: text("religion"),
    ethnicity: text("ethnicity"),
    culturalBackground: text("cultural_background"),
    firstLanguage: text("first_language"),
    nhsNumber: text("nhs_number"),
    uniquePupilNumber: text("unique_pupil_number"),

    // Sch 3 para 5
    addressBeforeAdmission: text("address_before_admission"),

    // Sch 3 para 8
    legalStatus: legalStatusEnum("legal_status").notNull().default("not_recorded"),
    legalStatusDetail: text("legal_status_detail"),
    placingAuthority: text("placing_authority"),
    placingAuthorityRef: text("placing_authority_ref"),

    // Sch 3 paras 9–13: people
    contacts: jsonb("contacts").$type<ContactPerson[]>().notNull().default([]),

    // Sch 3 para 12–13: education / employment
    educationProvider: text("education_provider"),
    educationProviderContact: text("education_provider_contact"),
    yearGroup: text("year_group"),
    employer: text("employer"),

    // Sch 3 para 16
    contactArrangements: text("contact_arrangements"),
    contactRestrictions: text("contact_restrictions"),

    // Sch 3 paras 21–26: health
    gpDetails: text("gp_details"),
    dentistDetails: text("dentist_details"),
    opticianDetails: text("optician_details"),
    healthConditions: text("health_conditions"),
    allergies: text("allergies"),
    immunisations: text("immunisations"),
    dietaryNeeds: text("dietary_needs"),
    disabilitiesAndNeeds: text("disabilities_and_needs"),

    // Housekeeping
    keyWorkerUserId: uuid("key_worker_user_id").references(() => users.id),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [index("children_home_idx").on(t.homeId), index("children_org_idx").on(t.organisationId)],
);

export const placements = pgTable(
  "placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    admittedOn: timestamp("admitted_on", { mode: "date" }).notNull(),
    plannedEndOn: timestamp("planned_end_on", { mode: "date" }),
    emergency: boolean("emergency").notNull().default(false),
    reasonForPlacement: text("reason_for_placement"),
    /** Sch 3 para 6 — where the child went on leaving */
    dischargedOn: timestamp("discharged_on", { mode: "date" }),
    dischargeDestination: text("discharge_destination"),
    dischargeDestinationType: text("discharge_destination_type"),
    dischargeReason: text("discharge_reason"),
    /** Reg 41 notification tracking (slice 4 wires the rule) */
    admissionNotifiedAt: timestamp("admission_notified_at", { withTimezone: true }),
    dischargeNotifiedAt: timestamp("discharge_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [index("placements_child_idx").on(t.childId), index("placements_home_idx").on(t.homeId)],
);

/**
 * Versioned, lifecycle-governed records share these columns.
 *  status: draft → submitted → reviewed → locked
 *  version / supersedesId / amendmentReason: an amendment of a locked record
 *  is a NEW row (version+1) pointing at the original; the original is never
 *  mutated (hard rule #3).
 */
const lifecycleColumns = {
  status: recordStatusEnum("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  amendmentReason: text("amendment_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: uuid("submitted_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: uuid("locked_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
};

/** Reg 17/18 placement plan — versioned. */
export const placementPlans = pgTable(
  "placement_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    placementId: uuid("placement_id").references(() => placements.id),
    supersedesId: uuid("supersedes_id"),
    // Reg 17(1) / Sch 1 headings
    needsAndObjectives: text("needs_and_objectives"),
    healthArrangements: text("health_arrangements"),
    educationArrangements: text("education_arrangements"),
    contactArrangements: text("contact_arrangements"),
    behaviourSupport: text("behaviour_support"),
    independenceSkills: text("independence_skills"),
    culturalReligiousNeeds: text("cultural_religious_needs"),
    childsViews: text("childs_views"),
    reviewDueOn: timestamp("review_due_on", { mode: "date" }),
    ...lifecycleColumns,
  },
  (t) => [index("placement_plans_child_idx").on(t.childId)],
);

export const riskAssessments = pgTable(
  "risk_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    supersedesId: uuid("supersedes_id"),
    type: riskTypeEnum("type").notNull().default("general"),
    title: text("title").notNull(),
    description: text("description"),
    triggers: text("triggers"),
    controls: text("controls"),
    level: riskLevelEnum("level").notNull().default("medium"),
    childsViews: text("childs_views"),
    reviewDueOn: timestamp("review_due_on", { mode: "date" }).notNull(),
    ...lifecycleColumns,
  },
  (t) => [index("risk_child_idx").on(t.childId), index("risk_review_idx").on(t.reviewDueOn)],
);

export const chronologyEntries = pgTable(
  "chronology_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    occurredOn: timestamp("occurred_on", { mode: "date" }).notNull(),
    category: chronologyCategoryEnum("category").notNull().default("other"),
    summary: text("summary").notNull(),
    detail: text("detail"),
    significant: boolean("significant").notNull().default(false),
    /** Set when generated by the system from another record (e.g. placement). */
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [index("chronology_child_idx").on(t.childId, t.occurredOn)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").references(() => children.id),
    type: documentTypeEnum("type").notNull().default("other"),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Stored in-database for now; moves to object storage when hosting is decided. */
    content: customBytea("content").notNull(),
    documentDate: timestamp("document_date", { mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [index("documents_child_idx").on(t.childId)],
);

export type Child = typeof children.$inferSelect;
export type Placement = typeof placements.$inferSelect;
export type PlacementPlan = typeof placementPlans.$inferSelect;
export type RiskAssessment = typeof riskAssessments.$inferSelect;
export type ChronologyEntry = typeof chronologyEntries.$inferSelect;
export type Document = typeof documents.$inferSelect;

// ===========================================================================
// Slice 3 — Daily recording: daily logs (Reg 36 case records), handovers
// (Sch 4 para 3 staffing context), key-work (Reg 7, Reg 11), child's voice
// (Reg 7). Every table carries organisationId + homeId (hard rule #2).
// ===========================================================================

export const shiftEnum = pgEnum("shift", ["early", "late", "night", "day"]);
export const moodEnum = pgEnum("mood", ["settled", "happy", "anxious", "low", "angry", "mixed", "not_seen"]);
export const voiceMethodEnum = pgEnum("voice_method", [
  "conversation",
  "keywork",
  "house_meeting",
  "written",
  "advocate",
  "complaint",
  "survey",
  "other",
]);

/** One record per child per shift. Structured prompts + narrative. */
export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    logDate: timestamp("log_date", { mode: "date" }).notNull(),
    shift: shiftEnum("shift").notNull(),
    mood: moodEnum("mood").notNull().default("settled"),
    // Structured prompts (Reg 6 quality of care; Reg 8 education; Reg 10 health; Reg 9 enjoyment)
    attendedEducation: boolean("attended_education"),
    educationNotes: text("education_notes"),
    meals: text("meals"),
    activities: text("activities"),
    contactWithFamily: text("contact_with_family"),
    healthNotes: text("health_notes"),
    medicationGiven: boolean("medication_given"),
    bedtime: text("bedtime"),
    sleep: text("sleep"),
    // Narrative
    narrative: text("narrative").notNull(),
    positives: text("positives"),
    concerns: text("concerns"),
    /** Links to incidents raised this shift (slice 4 will populate) */
    incidentRaised: boolean("incident_raised").notNull().default(false),
    supersedesId: uuid("supersedes_id"),
    ...lifecycleColumns,
  },
  (t) => [index("daily_logs_child_date_idx").on(t.childId, t.logDate), index("daily_logs_home_date_idx").on(t.homeId, t.logDate)],
);

/** Shift handover for the whole home. */
export const handovers = pgTable(
  "handovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    handoverDate: timestamp("handover_date", { mode: "date" }).notNull(),
    fromShift: shiftEnum("from_shift").notNull(),
    toShift: shiftEnum("to_shift").notNull(),
    /** Per-child one-liners: [{ childId, note }] */
    childNotes: jsonb("child_notes").$type<Array<{ childId: string; note: string }>>().notNull().default([]),
    homeNotes: text("home_notes"),
    tasksCarriedForward: text("tasks_carried_forward"),
    staffOnDuty: text("staff_on_duty"),
    /** Who received the handover */
    receivedBy: uuid("received_by").references(() => users.id),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [index("handovers_home_date_idx").on(t.homeId, t.handoverDate)],
);

/** Planned one-to-one session between a child and their key worker. */
export const keyworkSessions = pgTable(
  "keywork_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    sessionDate: timestamp("session_date", { mode: "date" }).notNull(),
    durationMinutes: integer("duration_minutes"),
    topics: text("topics").notNull(),
    discussion: text("discussion").notNull(),
    childsWords: text("childs_words"),
    actionsAgreed: text("actions_agreed"),
    nextSessionOn: timestamp("next_session_on", { mode: "date" }),
    supersedesId: uuid("supersedes_id"),
    ...lifecycleColumns,
  },
  (t) => [index("keywork_child_idx").on(t.childId, t.sessionDate)],
);

/** Something the child said or asked for, and what happened as a result (Reg 7). */
export const childVoice = pgTable(
  "child_voice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
    homeId: uuid("home_id").notNull().references(() => homes.id),
    childId: uuid("child_id").notNull().references(() => children.id),
    recordedOn: timestamp("recorded_on", { mode: "date" }).notNull(),
    method: voiceMethodEnum("method").notNull().default("conversation"),
    /** In the child's own words wherever possible */
    whatTheChildSaid: text("what_the_child_said").notNull(),
    response: text("response"),
    outcome: text("outcome"),
    respondedBy: uuid("responded_by").references(() => users.id),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [index("child_voice_child_idx").on(t.childId, t.recordedOn)],
);

export type DailyLog = typeof dailyLogs.$inferSelect;
export type Handover = typeof handovers.$inferSelect;
export type KeyworkSession = typeof keyworkSessions.$inferSelect;
export type ChildVoice = typeof childVoice.$inferSelect;
