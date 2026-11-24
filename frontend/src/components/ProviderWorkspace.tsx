
import { useEffect, useState } from "react";
import { api, errorMessage, jsonRequest } from "../api";
import type { Appointment, ClinicalReview, User } from "../types";
import { appointmentLabel, Calendar, displayTime, todayInSriLanka, useSlots, visitLabels } from "./ScheduleView";

const reviewFields = [
  ["subjective", "Subjective"], ["objective", "Objective"], ["assessment", "Assessment"], ["plan", "Plan"],
] as const;

function DoctorReview({ appointment, onUpdate }: { appointment: Appointment; onUpdate: () => void }) {
  const [draft, setDraft] = useState<ClinicalReview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const path = "/api/appointments/" + appointment.id + "/review";

  useEffect(() => {
    const controller = new AbortController();
    void api<ClinicalReview>(path, { signal: controller.signal }).then(setDraft).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    });
    return () => controller.abort();
  }, [path]);

  async function save(sign: boolean) {
    if (sign && !window.confirm("Sign this review and share the Plan with the patient?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setDraft(await api<ClinicalReview>(path + (sign ? "?sign=true" : ""), jsonRequest("PUT", draft)));
      setNotice(sign ? "Visit review signed." : "Draft saved.");
      onUpdate();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-form">
      <h3>Clinician review</h3>
      <p>Signing shares the Plan with the patient and closes this visit.</p>
      {!draft && !error && <p>Loading review…</p>}
      {draft && <>
        <div className="form-grid">
          {reviewFields.map(([field, label]) => <label key={field}><span>{label}</span>
            <textarea maxLength={4000} value={draft[field]} disabled={busy || Boolean(draft.signed_at) || appointment.status === "cancelled"}
              onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
          </label>)}
        </div>
        {draft.signed_at
          ? <p>Signed {new Date(draft.signed_at).toLocaleString()}</p>
          : appointment.status !== "cancelled" && <div className="action-row">
            <button className="secondary" disabled={busy} onClick={() => void save(false)}>Save draft</button>
            <button className="primary" disabled={busy || !draft.plan.trim()} onClick={() => void save(true)}>Sign review</button>
          </div>}
      </>}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export default function ProviderWorkspace({ user, appointments, onUpdate }: {
  user: User; appointments: Appointment[]; onUpdate: () => void;
}) {
  const doctor = user.role === "doctor";
  const [tab, setTab] = useState<"visits" | "slots">("visits");
  const [selectedId, setSelectedId] = useState("");
  const [day, setDay] = useState(todayInSriLanka);
  const [revision, setRevision] = useState(0);
  const selected = appointments.find((item) => item.id === selectedId);
  const { slots, loading, error } = useSlots(tab === "slots" ? user.id : "", day, revision);

  return (
    <div className="patient-schedule">
      <div className="section-heading"><h1>{doctor ? "Doctor Workspace" : "Laboratory Workspace"}</h1><span className="verification-badge approved">Admin Approved</span></div>
      <nav className="action-row queue-tabs" aria-label="Provider views">
        <button className={tab === "visits" ? "primary" : "secondary"} onClick={() => setTab("visits")}>{doctor ? "Review & Schedule" : "Lab Orders"}</button>
        <button className={tab === "slots" ? "primary" : "secondary"} onClick={() => setTab("slots")}>Available Slots</button>
      </nav>
      {tab === "slots" ? (
        <section className="profile-card workspace-card">
          <div className="section-heading"><h2>Available slots</h2><button className="secondary" onClick={() => setRevision((value) => value + 1)}>Refresh slots</button></div>
          <label className="slot-date"><span>Date · Sri Lanka time</span><input type="date" min={todayInSriLanka()} value={day} onChange={(event) => setDay(event.target.value)} /></label>
          {loading && <p>Loading slots…</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {!loading && !error && <div className="pills">
            {slots.length ? slots.map((slot) => <span className="pill pathway" key={slot.time}>{displayTime(slot.time)}</span>) : <p>No slots available for this day.</p>}
          </div>}
        </section>
      ) : (
        <div className="schedule-layout">
          <Calendar appointments={appointments} onSelect={(item) => setSelectedId(item.id)} />
          <aside className="appointments-card">
            <h2>{doctor ? "Assigned visits" : "Orders"}</h2>
            {!appointments.length && <p>{doctor ? "No visits have been booked." : "No lab orders have been booked."}</p>}
            <div className="appointment-list">
              {appointments.map((item) => <button className="appointment-item" key={item.id} onClick={() => setSelectedId(item.id)}>
                <div className="appointment-info"><strong>{item.patient_name}</strong><span>{item.date} at {displayTime(item.time)} · {appointmentLabel(item)}</span>
                  {!doctor && <small>{item.test_panel} · {visitLabels[item.visit_mode]}</small>}
                </div><span className="chevron">›</span>
              </button>)}
            </div>
          </aside>
        </div>
      )}
      {selected && tab === "visits" && <section className="profile-card workspace-card">
        <div className="section-heading"><h2>{selected.patient_name}</h2><button className="secondary" onClick={() => setSelectedId("")}>Close details</button></div>
        <p>{selected.date} at {displayTime(selected.time)} · {appointmentLabel(selected)}</p>
        <p>{selected.reason}</p>
        {selected.notes && <p>{selected.notes}</p>}
        {selected.pickup_address && <p className="visit-text"><strong>Pickup address</strong><br />{selected.pickup_address}</p>}
        {doctor
          ? <DoctorReview key={selected.id} appointment={selected} onUpdate={onUpdate} />
          : <p>{selected.test_panel} · {visitLabels[selected.visit_mode]}</p>}
      </section>}
    </div>
  );
}
