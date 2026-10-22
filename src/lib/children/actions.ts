"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  children,
  chronologyEntries,
  documents,
  homes,
  placementPlans,
  placements,
  riskAssessments,
  type ContactPerson,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser, Forbidden } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { canTransition, type Transition } from "@/lib/records/lifecycle";
import { applyTransition, type LifecycleTable } from "@/lib/records/transition";

export type ActionState = { error?: string; ok?: boolean };

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00Z`));
const optDate = z.string().optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null));
const optText = z.string().optional().transform((s) => (s?.trim() ? s.trim() : null));

function diffOf<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a };
}

// ---------------------------------------------------------------------------
// Child + admission
// ---------------------------------------------------------------------------

const childSchema = z.object({
  homeId: z.string().uuid(),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  preferredName: optText,
  dateOfBirth: dateStr,
  sex: z.enum(["female", "male", "other", "not_recorded"]),
  religion: optText,
  ethnicity: optText,
  culturalBackground: optText,
  firstLanguage: optText,
  nhsNumber: optText,
  uniquePupilNumber: optText,
  addressBeforeAdmission: optText,
  legalStatus: z.enum(["s20", "s31", "s38", "s25", "remand", "placed_for_adoption", "other", "not_recorded"]),
  legalStatusDetail: optText,
  placingAuthority: optText,
  placingAuthorityRef: optText,
  educationProvider: optText,
  educationProviderContact: optText,
  yearGroup: optText,
  employer: optText,
  contactArrangements: optText,
  contactRestrictions: optText,
  gpDetails: optText,
  dentistDetails: optText,
  opticianDetails: optText,
  healthConditions: optText,
  allergies: optText,
  immunisations: optText,
  dietaryNeeds: optText,
  disabilitiesAndNeeds: optText,
  keyWorkerUserId: z.string().uuid().optional().or(z.literal("")).transform((s) => (s ? s : null)),
  notes: optText,
});

function readChildForm(fd: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") obj[k] = v;
  return obj;
}

function parseContacts(fd: FormData): ContactPerson[] {
  const raw = fd.get("contactsJson");
  if (typeof raw !== "string" || !raw.trim()) return [];
  const parsed = z
    .array(
      z.object({
        role: z.string().trim().min(1),
        name: z.string().trim().min(1),
        organisation: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        religion: z.string().optional(),
        notes: z.string().optional(),
        parentalResponsibility: z.boolean().optional(),
      }),
    )
    .safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Contacts are not valid");
  return parsed.data;
}

export async function admitChild(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = childSchema.safeParse(readChildForm(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const admission = z
    .object({ admittedOn: dateStr, emergency: z.string().optional(), reasonForPlacement: optText, plannedEndOn: optDate })
    .safeParse({
      admittedOn: fd.get("admittedOn"),
      emergency: fd.get("emergency") ?? undefined,
      reasonForPlacement: fd.get("reasonForPlacement") ?? undefined,
      plannedEndOn: fd.get("plannedEndOn") ?? undefined,
    });
  if (!admission.success) return { error: "Admission date is required" };

  const [home] = await db.select().from(homes).where(eq(homes.id, parsed.data.homeId)).limit(1);
  if (!home) return { error: "Home not found" };
  const user = await requirePermission("child:write", { organisationId: home.organisationId, homeId: home.id });
  let contacts: ContactPerson[];
  try {
    contacts = parseContacts(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const meta = await requestMeta();

  const childId = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(children)
      .values({
        ...parsed.data,
        organisationId: home.organisationId,
        contacts,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: children.id });
    const [p] = await tx
      .insert(placements)
      .values({
        organisationId: home.organisationId,
        homeId: home.id,
        childId: c.id,
        admittedOn: admission.data.admittedOn,
        emergency: admission.data.emergency === "on",
        reasonForPlacement: admission.data.reasonForPlacement,
        plannedEndOn: admission.data.plannedEndOn,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: placements.id });
    await tx.insert(chronologyEntries).values({
      organisationId: home.organisationId,
      homeId: home.id,
      childId: c.id,
      occurredOn: admission.data.admittedOn,
      category: "placement",
      summary: `Admitted to ${home.name}${admission.data.emergency === "on" ? " (emergency placement)" : ""}`,
      significant: true,
      sourceType: "placement",
      sourceId: p.id,
      createdBy: user.id,
    });
    return c.id;
  });

  await audit({
    organisationId: home.organisationId, homeId: home.id, actorUserId: user.id, actorRole: user.role,
    action: "create", entityType: "child", entityId: childId, diff: { after: { name: `${parsed.data.firstName} ${parsed.data.lastName}`, admittedOn: admission.data.admittedOn } }, ...meta,
  });
  redirect(`/children/${childId}`);
}

export async function updateChild(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [existing] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!existing) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: existing.organisationId, homeId: existing.homeId });
  const parsed = childSchema.omit({ homeId: true }).safeParse(readChildForm(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  let contacts: ContactPerson[];
  try {
    contacts = parseContacts(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const after = { ...parsed.data, contacts };
  const diff = diffOf(existing as unknown as Record<string, unknown>, after);
  await db.update(children).set({ ...after, updatedAt: new Date(), updatedBy: user.id }).where(eq(children.id, childId));
  await audit({
    organisationId: existing.organisationId, homeId: existing.homeId, actorUserId: user.id, actorRole: user.role,
    action: "update", entityType: "child", entityId: childId, diff, ...(await requestMeta()),
  });
  revalidatePath(`/children/${childId}`);
  redirect(`/children/${childId}`);
}

export async function dischargeChild(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [existing] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!existing) return { error: "Child not found" };
  const user = await requirePermission("record:review", { organisationId: existing.organisationId, homeId: existing.homeId });
  const parsed = z
    .object({ dischargedOn: dateStr, dischargeDestination: z.string().trim().min(1, "Destination is required"), dischargeDestinationType: optText, dischargeReason: optText })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [current] = await db
    .select()
    .from(placements)
    .where(and(eq(placements.childId, childId), isNull(placements.dischargedOn)))
    .limit(1);
  if (!current) return { error: "No open placement to discharge" };
  await db.transaction(async (tx) => {
    await tx.update(placements).set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id }).where(eq(placements.id, current.id));
    await tx.update(children).set({ archivedAt: new Date(), updatedAt: new Date(), updatedBy: user.id }).where(eq(children.id, childId));
    await tx.insert(chronologyEntries).values({
      organisationId: existing.organisationId, homeId: existing.homeId, childId,
      occurredOn: parsed.data.dischargedOn, category: "placement",
      summary: `Placement ended — moved to ${parsed.data.dischargeDestination}`,
      detail: parsed.data.dischargeReason, significant: true, sourceType: "placement", sourceId: current.id, createdBy: user.id,
    });
  });
  await audit({
    organisationId: existing.organisationId, homeId: existing.homeId, actorUserId: user.id, actorRole: user.role,
    action: "update", entityType: "placement", entityId: current.id, diff: { after: parsed.data }, ...(await requestMeta()),
  });
  redirect(`/children/${childId}`);
}

// ---------------------------------------------------------------------------
// Risk assessments
// ---------------------------------------------------------------------------

const riskSchema = z.object({
  type: z.enum(["general", "missing", "self_harm", "online", "exploitation", "substance", "behaviour", "health", "activity", "other"]),
  title: z.string().trim().min(1, "Title is required"),
  description: optText,
  triggers: optText,
  controls: optText,
  level: z.enum(["low", "medium", "high", "very_high"]),
  childsViews: optText,
  reviewDueOn: dateStr,
});

export async function createRiskAssessment(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const parsed = riskSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [r] = await db
    .insert(riskAssessments)
    .values({ ...parsed.data, organisationId: child.organisationId, homeId: child.homeId, childId, createdBy: user.id, updatedBy: user.id })
    .returning({ id: riskAssessments.id });
  await audit({
    organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role,
    action: "create", entityType: "risk_assessment", entityId: r.id, diff: { after: parsed.data }, ...(await requestMeta()),
  });
  redirect(`/children/${childId}/risk/${r.id}`);
}

export async function updateRiskAssessment(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [existing] = await db.select().from(riskAssessments).where(eq(riskAssessments.id, id)).limit(1);
  if (!existing) return { error: "Not found" };
  const user = await requireUser();
  const ok = canTransition("edit", {
    grants: user.grants, userId: user.id, organisationId: existing.organisationId, homeId: existing.homeId,
    record: { status: existing.status, createdBy: existing.createdBy },
  });
  if (!ok) return { error: "This record can no longer be edited. Locked records are amended as a new version." };
  const parsed = riskSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const diff = diffOf(existing as unknown as Record<string, unknown>, parsed.data);
  await db.update(riskAssessments).set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id }).where(eq(riskAssessments.id, id));
  await audit({
    organisationId: existing.organisationId, homeId: existing.homeId, actorUserId: user.id, actorRole: user.role,
    action: "update", entityType: "risk_assessment", entityId: id, diff, ...(await requestMeta()),
  });
  redirect(`/children/${existing.childId}/risk/${id}`);
}

// ---------------------------------------------------------------------------
// Placement plans
// ---------------------------------------------------------------------------

const planSchema = z.object({
  needsAndObjectives: optText,
  healthArrangements: optText,
  educationArrangements: optText,
  contactArrangements: optText,
  behaviourSupport: optText,
  independenceSkills: optText,
  culturalReligiousNeeds: optText,
  childsViews: optText,
  reviewDueOn: optDate,
});

export async function createPlacementPlan(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const parsed = planSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [current] = await db.select({ id: placements.id }).from(placements).where(and(eq(placements.childId, childId), isNull(placements.dischargedOn))).limit(1);
  const [r] = await db
    .insert(placementPlans)
    .values({ ...parsed.data, organisationId: child.organisationId, homeId: child.homeId, childId, placementId: current?.id ?? null, createdBy: user.id, updatedBy: user.id })
    .returning({ id: placementPlans.id });
  await audit({
    organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role,
    action: "create", entityType: "placement_plan", entityId: r.id, ...(await requestMeta()),
  });
  redirect(`/children/${childId}/plan/${r.id}`);
}

export async function updatePlacementPlan(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [existing] = await db.select().from(placementPlans).where(eq(placementPlans.id, id)).limit(1);
  if (!existing) return { error: "Not found" };
  const user = await requireUser();
  const ok = canTransition("edit", {
    grants: user.grants, userId: user.id, organisationId: existing.organisationId, homeId: existing.homeId,
    record: { status: existing.status, createdBy: existing.createdBy },
  });
  if (!ok) return { error: "This record can no longer be edited. Locked records are amended as a new version." };
  const parsed = planSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const diff = diffOf(existing as unknown as Record<string, unknown>, parsed.data);
  await db.update(placementPlans).set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id }).where(eq(placementPlans.id, id));
  await audit({
    organisationId: existing.organisationId, homeId: existing.homeId, actorUserId: user.id, actorRole: user.role,
    action: "update", entityType: "placement_plan", entityId: id, diff, ...(await requestMeta()),
  });
  redirect(`/children/${existing.childId}/plan/${id}`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function transitionRecord(table: LifecycleTable, id: string, childId: string, transition: Transition, fd: FormData): Promise<void> {
  const user = await requireUser();
  const reason = fd.get("reason");
  let newId: string;
  try {
    newId = await applyTransition(user, table, id, transition, typeof reason === "string" ? reason : undefined);
  } catch (e) {
    if (e instanceof Forbidden) throw e;
    throw e;
  }
  const target: Record<LifecycleTable, string> = {
    risk_assessment: `/children/${childId}/risk/${newId}`,
    placement_plan: `/children/${childId}/plan/${newId}`,
    daily_log: `/shift/log/${newId}`,
    keywork_session: `/children/${childId}/keywork/${newId}`,
    incident: `/incidents/${newId}`,
  };
  redirect(target[table]);
}

// ---------------------------------------------------------------------------
// Chronology
// ---------------------------------------------------------------------------

export async function addChronologyEntry(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const parsed = z
    .object({
      occurredOn: dateStr,
      category: z.enum(["placement", "education", "health", "contact", "incident", "missing", "safeguarding", "achievement", "review", "other"]),
      summary: z.string().trim().min(1, "Summary is required"),
      detail: optText,
      significant: z.string().optional(),
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [e] = await db
    .insert(chronologyEntries)
    .values({ ...parsed.data, significant: parsed.data.significant === "on", organisationId: child.organisationId, homeId: child.homeId, childId, createdBy: user.id })
    .returning({ id: chronologyEntries.id });
  await audit({
    organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role,
    action: "create", entityType: "chronology_entry", entityId: e.id, diff: { after: { summary: parsed.data.summary } }, ...(await requestMeta()),
  });
  revalidatePath(`/children/${childId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);

export async function uploadDocument(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  if (file.size > MAX_DOC_BYTES) return { error: "File is larger than 10 MB" };
  if (!ALLOWED_MIME.has(file.type)) return { error: "Only PDF, Word, JPEG, PNG or text files are accepted" };
  const parsed = z
    .object({
      type: z.enum(["care_plan", "pathway_plan", "placement_plan", "pep", "ehcp", "health_assessment", "school_report", "review_record", "court_order", "consent", "photo", "other"]),
      title: z.string().trim().min(1, "Title is required"),
      documentDate: optDate,
      notes: optText,
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const content = Buffer.from(await file.arrayBuffer());
  const [d] = await db
    .insert(documents)
    .values({
      ...parsed.data, organisationId: child.organisationId, homeId: child.homeId, childId,
      fileName: file.name, mimeType: file.type, sizeBytes: file.size, content, createdBy: user.id,
    })
    .returning({ id: documents.id });
  await audit({
    organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role,
    action: "create", entityType: "document", entityId: d.id, diff: { after: { title: parsed.data.title, fileName: file.name, type: parsed.data.type } }, ...(await requestMeta()),
  });
  revalidatePath(`/children/${childId}`);
  return { ok: true };
}
