"use client";

import { useActionState, useState } from "react";
import { createIncident } from "@/lib/incidents/actions";
import { defaultNotifications, INCIDENT_TYPE_LABEL } from "@/lib/rules/incidents";
import type { ActionState } from "@/lib/children/actions";
import type { IncidentType } from "@/db/schema";
import { DraftRecovery } from "@/components/draft-recovery";

type Kid = { id: string; name: string };
type Home = { id: string; name: string; kids: Kid[] };

function nowLocal() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function IncidentForm({ homes, initialHome, initialChild, initialType }: { homes: Home[]; initialHome: string; initialChild?: string; initialType?: IncidentType }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createIncident, {});
  const [homeId, setHomeId] = useState(initialHome);
  const [type, setType] = useState<IncidentType>(initialType ?? "incident");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const home = homes.find((h) => h.id === homeId) ?? homes[0];
  const defaults = defaultNotifications({ type, severity });
  const needsChild = type === "physical_intervention" || type === "missing";

  return (
    <form action={action} className="space-y-5">
      <fieldset className="card space-y-4">
        <legend className="px-1 text-base font-semibold">What happened</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="homeId">Home</label>
            <select id="homeId" name="homeId" className="input" value={homeId} onChange={(e) => setHomeId(e.target.value)}>{homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
          <div><label className="label" htmlFor="childId">Child{needsChild ? "" : " (if about a child)"}</label>
            <select id="childId" name="childId" className="input" defaultValue={initialChild ?? ""} required={needsChild}>
              <option value="">— Not about one child —</option>{home.kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="type">Type</label>
            <select id="type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
              {(Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[]).map((t) => <option key={t} value={t}>{INCIDENT_TYPE_LABEL[t]}</option>)}
            </select></div>
          <div><label className="label" htmlFor="severity">Severity</label>
            <select id="severity" name="severity" className="input" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              <option value="low">Low — no harm, handled on shift</option><option value="medium">Medium — needs manager awareness</option><option value="high">High — harm or serious risk</option><option value="critical">Critical — serious harm, emergency services</option>
            </select></div>
          <div><label className="label" htmlFor="occurredAt">When</label><input id="occurredAt" name="occurredAt" type="datetime-local" className="input" defaultValue={nowLocal()} required /></div>
          <div><label className="label" htmlFor="location">Where</label><input id="location" name="location" className="input" placeholder="Lounge, school, town centre…" /></div>
          <div><label className="label" htmlFor="staffInvolved">Staff involved</label><input id="staffInvolved" name="staffInvolved" className="input" /></div>
          <div><label className="label" htmlFor="witnesses">Witnesses</label><input id="witnesses" name="witnesses" className="input" /></div>
        </div>
        <div><label className="label" htmlFor="antecedent">What led up to it</label><textarea id="antecedent" name="antecedent" rows={2} className="input" /></div>
        <div><label className="label" htmlFor="narrative">What happened</label><textarea id="narrative" name="narrative" rows={6} className="input" required placeholder="Factual, in order, what you saw and did. Avoid opinions and labels." /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="immediateActions">What was done straight away</label><textarea id="immediateActions" name="immediateActions" rows={3} className="input" /></div>
          <div><label className="label" htmlFor="injuries">Injuries (anyone)</label><textarea id="injuries" name="injuries" rows={3} className="input" placeholder="None, or describe and say what first aid / medical attention was given" /></div>
        </div>
      </fieldset>

      {type === "physical_intervention" && (
        <fieldset className="card space-y-4 border-amber-300">
          <legend className="px-1 text-base font-semibold">Restraint record — Regulation 35(3)</legend>
          <p className="-mt-2 text-sm text-muted">Every field here is required by law. The child&apos;s view and the manager&apos;s signature are added afterwards as follow-ups.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="holdType">Measure / hold used</label><input id="holdType" name="holdType" className="input" required placeholder="e.g. Team Teach single-elbow, guided walk" /></div>
            <div><label className="label" htmlFor="staffApplying">Staff applying it</label><input id="staffApplying" name="staffApplying" className="input" required /></div>
            <div><label className="label" htmlFor="startedAt">Started at</label><input id="startedAt" name="startedAt" type="datetime-local" className="input" defaultValue={nowLocal()} required /></div>
            <div><label className="label" htmlFor="durationMinutes">Duration (minutes)</label><input id="durationMinutes" name="durationMinutes" type="number" min={0} className="input" required /></div>
          </div>
          <div><label className="label" htmlFor="deEscalationAttempted">De-escalation tried first</label><textarea id="deEscalationAttempted" name="deEscalationAttempted" rows={3} className="input" required /></div>
          <div><label className="label" htmlFor="justification">Why it was necessary (risk of serious harm to whom)</label><textarea id="justification" name="justification" rows={3} className="input" required /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="label" htmlFor="injuriesChild">Injuries to child</label><input id="injuriesChild" name="injuriesChild" className="input" placeholder="None" /></div>
            <div><label className="label" htmlFor="injuriesStaff">Injuries to staff</label><input id="injuriesStaff" name="injuriesStaff" className="input" placeholder="None" /></div>
            <div><label className="label" htmlFor="medicalAttention">Medical attention</label><input id="medicalAttention" name="medicalAttention" className="input" placeholder="None needed / first aid / GP" /></div>
          </div>
          <div><label className="label" htmlFor="effectiveness">Effectiveness and any consequences</label><textarea id="effectiveness" name="effectiveness" rows={2} className="input" /></div>
        </fieldset>
      )}

      {type === "missing" && (
        <fieldset className="card space-y-4 border-amber-300">
          <legend className="px-1 text-base font-semibold">Missing episode</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="leftAt">Left / last seen at</label><input id="leftAt" name="leftAt" type="datetime-local" className="input" defaultValue={nowLocal()} required /></div>
            <div><label className="label" htmlFor="classification">Classification</label>
              <select id="classification" name="classification" className="input" defaultValue="missing"><option value="missing">Missing — whereabouts unknown, risk (police)</option><option value="absent">Absent — unauthorised but whereabouts known / low risk</option></select></div>
            <div><label className="label" htmlFor="policeInformedAt">Police informed at (if already done)</label><input id="policeInformedAt" name="policeInformedAt" type="datetime-local" className="input" /></div>
            <div><label className="label" htmlFor="policeReference">Police reference</label><input id="policeReference" name="policeReference" className="input" /></div>
          </div>
          <div><label className="label" htmlFor="circumstances">Circumstances and what the child was wearing / had with them</label><textarea id="circumstances" name="circumstances" rows={3} className="input" /></div>
        </fieldset>
      )}

      <fieldset className="card space-y-3">
        <legend className="px-1 text-base font-semibold">Who needs to be told</legend>
        <p className="-mt-2 text-sm text-muted">Pre-set from the type and severity (Reg 40). The manager confirms at review. Follow-up tasks are created automatically either way.</p>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="notifyOfsted" key={`o${type}${severity}`} defaultChecked={defaults.notifyOfsted} />Ofsted (Reg 40)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="notifyPlacingAuthority" key={`p${type}${severity}`} defaultChecked={defaults.notifyPlacingAuthority} />Placing authority / social worker</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="notifyPolice" key={`c${type}${severity}`} defaultChecked={defaults.notifyPolice} />Police</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="notifyLado" key={`l${type}${severity}`} defaultChecked={defaults.notifyLado} />LADO</label>
        </div>
      </fieldset>

      <DraftRecovery formKey={`incident:${homeId}`} />
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn">{pending ? "Saving…" : "Submit incident record"}</button>
    </form>
  );
}
