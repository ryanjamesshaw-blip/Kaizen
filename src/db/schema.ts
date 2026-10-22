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
