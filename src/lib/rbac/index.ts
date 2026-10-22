/**
 * Role-based access control. Pure functions — no I/O.
 *
 * Scope model:
 *   organisation-scope roles see every home in the organisation.
 *   home-scope roles see only the homes they hold a membership for.
 *   inspector and independent_visitor are read-only / Reg-44-only and
 *   only valid inside their validFrom..validTo window.
 */
import type { Role } from "@/db/schema";

export type Permission =
  | "org:read"
  | "org:manage"
  | "home:read"
  | "home:manage"
  | "staff:read"
  | "staff:manage"
  | "access:grant"
  | "child:read"
  | "child:write"
  | "record:submit"
  | "record:review"
  | "record:lock"
  | "record:amend"
  | "audit:read"
  | "audit:verify"
  | "reg44:write"
  | "inspection:export";

const ORG_SCOPE: ReadonlySet<Role> = new Set(["director", "responsible_individual", "system_admin"]);

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  director: new Set([
    "org:read", "org:manage", "home:read", "home:manage", "staff:read", "staff:manage",
    "access:grant", "child:read", "child:write", "record:submit", "record:review",
    "record:lock", "record:amend", "audit:read", "audit:verify", "inspection:export",
  ]),
  responsible_individual: new Set([
    "org:read", "home:read", "home:manage", "staff:read", "staff:manage", "access:grant",
    "child:read", "child:write", "record:submit", "record:review", "record:lock",
    "record:amend", "audit:read", "audit:verify", "inspection:export",
  ]),
  registered_manager: new Set([
    "home:read", "home:manage", "staff:read", "staff:manage", "access:grant", "child:read",
    "child:write", "record:submit", "record:review", "record:lock", "record:amend",
    "audit:read", "inspection:export",
  ]),
  deputy: new Set([
    "home:read", "staff:read", "child:read", "child:write", "record:submit", "record:review",
    "audit:read",
  ]),
  care_worker: new Set(["home:read", "child:read", "child:write", "record:submit"]),
  independent_visitor: new Set(["home:read", "child:read", "reg44:write"]),
  inspector: new Set(["home:read", "staff:read", "child:read", "audit:read", "inspection:export"]),
  // No child data by default — system_admin manages users and settings only.
  system_admin: new Set(["org:read", "org:manage", "home:read", "staff:read", "staff:manage", "access:grant", "audit:read", "audit:verify"]),
};

export type Grant = {
  role: Role;
  organisationId: string;
  homeId: string | null;
  validFrom: Date;
  validTo: Date | null;
  revokedAt: Date | null;
};

export function isOrgScope(role: Role): boolean {
  return ORG_SCOPE.has(role);
}

export function isGrantActive(g: Grant, now: Date = new Date()): boolean {
  if (g.revokedAt) return false;
  if (g.validFrom > now) return false;
  if (g.validTo && g.validTo <= now) return false;
  return true;
}

export function roleHas(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].has(permission);
}

/**
 * Does this set of grants allow `permission` on `homeId` (or on the
 * organisation when homeId is null)?
 */
export function can(
  grants: Grant[],
  permission: Permission,
  target: { organisationId: string; homeId?: string | null },
  now: Date = new Date(),
): boolean {
  for (const g of grants) {
    if (!isGrantActive(g, now)) continue;
    if (g.organisationId !== target.organisationId) continue;
    if (!roleHas(g.role, permission)) continue;
    if (isOrgScope(g.role)) return true;
    if (target.homeId && g.homeId === target.homeId) return true;
  }
  return false;
}

/** Home ids this set of grants can see, or "all" for org-scope. */
export function visibleHomes(grants: Grant[], organisationId: string, now = new Date()): "all" | string[] {
  const ids = new Set<string>();
  for (const g of grants) {
    if (!isGrantActive(g, now) || g.organisationId !== organisationId) continue;
    if (isOrgScope(g.role)) return "all";
    if (g.homeId) ids.add(g.homeId);
  }
  return [...ids];
}

/** Highest-privilege active role, used for the audit actorRole field. */
export function primaryRole(grants: Grant[], now = new Date()): Role | null {
  const order: Role[] = [
    "director", "responsible_individual", "registered_manager", "deputy",
    "care_worker", "independent_visitor", "inspector", "system_admin",
  ];
  const active = grants.filter((g) => isGrantActive(g, now)).map((g) => g.role);
  for (const r of order) if (active.includes(r)) return r;
  return null;
}

/** Roles that must use MFA. */
export function requiresMfa(role: Role): boolean {
  return role !== "care_worker";
}

export const ROLE_LABELS: Record<Role, string> = {
  director: "Director",
  responsible_individual: "Responsible Individual",
  registered_manager: "Registered Manager",
  deputy: "Deputy / Senior",
  care_worker: "Care Worker",
  independent_visitor: "Independent Visitor (Reg 44)",
  inspector: "Inspector",
  system_admin: "System Admin",
};
