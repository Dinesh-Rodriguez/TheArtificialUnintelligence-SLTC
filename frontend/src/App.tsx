import { FormEvent, useEffect, useState } from "react";
import type { Appointment, ChatMessage, Profile, TraceEvent } from "./types";
import ChatView from "./components/ChatView";
import TraceDrawer from "./components/TraceDrawer";
import BenchmarkModal from "./components/BenchmarkModal";

const API = "http://localhost:8000";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "The request could not be completed.");
  }
  return response.json();
}

function TagEditor({ values, onChange, placeholder }: { values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft("");
  };
  return (
    <div>
      <div className="tag-row">
        {values.map((value) => (
          <span className="tag" key={value}>{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>
        ))}
      </div>
      <div className="inline-entry">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={placeholder} />
        <button type="button" className="secondary" onClick={add}>Add</button>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"chat" | "profile" | "schedule">("chat");
  const [rolePreview, setRolePreview] = useState<"patient" | "doctor">("patient");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);

  const load = async () => {
    try {
      const [nextMessages, nextProfile, nextAppointments] = await Promise.all([
        api<ChatMessage[]>("/api/chat/messages"),
        api<Profile>("/api/profile"),
        api<Appointment[]>("/api/appointments"),
      ]);
      setMessages(nextMessages);
      setProfile(nextProfile);
      setAppointments(nextAppointments);
      try {
        const events = await api<TraceEvent[]>("/api/events");
        setTraceEvents(events.map((event) => ({
          ...event,
          trace_id: `MB-${event.id.toUpperCase()}`,
          actor: event.type.includes("appointment") ? "Appointment Service" : "MedBridge Care System",
          status: event.type.includes("red_flag") ? "blocked" : "allowed",
        })));
      } catch {
        // The local trace stream remains available when the event endpoint is unavailable.
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to connect to the backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const reset = async () => {
    try {
      await api("/api/reset", { method: "POST" });
    } catch {
      setMessages([]);
      setAppointments([]);
    }
    await load();
    setTab("chat");
    setToast("Sample workspace restored.");
  };

  const addTrace = (event: Omit<TraceEvent, "id" | "timestamp">) => {
    setTraceEvents((current) => [{
      id: `local-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      trace_id: `MB-LOCAL-${Date.now().toString(36).toUpperCase()}`,
      ...event,
    }, ...current]);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M</span><div><strong>MedBridge AI</strong><span>Human-Centric Telemedicine</span></div></div>
        <div className="header-actions">
          <button className="role-toggle" type="button" onClick={() => setRolePreview(rolePreview === "patient" ? "doctor" : "patient")}>
            <span className={rolePreview === "patient" ? "active" : ""}>Patient View</span>
            <span className={rolePreview === "doctor" ? "active" : ""}>Doctor Review Preview</span>
          </button>
          <button className="trace-button" type="button" onClick={() => setTraceOpen((open) => !open)}>Safety & Activity</button>
          <button className="benchmark-button" type="button" onClick={() => setBenchmarkOpen(true)}>40-Case Evaluation</button>
          <button className="reset-button" type="button" onClick={() => void reset()}><span>↻</span> Restore Sample Data</button>
        </div>
      </header>

      <nav className="nav-tabs" aria-label="Primary navigation">
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><span>◉</span> Chat</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><span>◎</span> Profile</button>
        <button className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}><span>▦</span> Schedule Calendar</button>
      </nav>

      <main className="main-content">
        {loading ? <div className="loading">Loading your care workspace…</div> : (
          <>
            {tab === "chat" && <ChatView messages={messages} setMessages={setMessages} rolePreview={rolePreview} profile={profile} notify={setToast} addTrace={addTrace} setTab={setTab} />}
            {tab === "profile" && profile && <ProfileView profile={profile} setProfile={setProfile} notify={setToast} />}
            {tab === "schedule" && <ScheduleView appointments={appointments} setAppointments={setAppointments} notify={setToast} />}
          </>
        )}
      </main>
      <TraceDrawer open={traceOpen} events={traceEvents} onClose={() => setTraceOpen(false)} />
      <BenchmarkModal open={benchmarkOpen} events={traceEvents} onClose={() => setBenchmarkOpen(false)} />
      {toast && <button className="toast" onClick={() => setToast("")}>{toast}<span>×</span></button>}
    </div>
  );
}

function ProfileView({ profile, setProfile, notify }: { profile: Profile; setProfile: (profile: Profile) => void; notify: (value: string) => void }) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const auditEntries = [
    { timestamp: new Date().toISOString(), actor: "Dr. N. Perera", role: "Clinician", action: "Viewed clinical summary", server: "Health Records", consent: "Authorized" },
    { timestamp: new Date(Date.now() - 3600000).toISOString(), actor: "Care Intake", role: "Automated check", action: "Checked profile & allergies", server: "Health Records", consent: "Consent verified" },
    { timestamp: new Date(Date.now() - 86400000).toISOString(), actor: "Appointment Service", role: "Care scheduling", action: "Checked appointment availability", server: "Appointments", consent: "Authorized" },
  ];

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.full_name.trim() || !draft.country.trim() || draft.age < 0) { notify("Please complete the required profile fields."); return; }
    try {
      const updated = await api<Profile>("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      setProfile(updated); setDraft(updated); setSaved(true); notify("Profile saved successfully.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save profile."); }
  };

  return (
    <form className="profile-layout" onSubmit={save}>
      <section className="profile-card">
        <div className="section-heading"><div><span className="eyebrow">PATIENT PROFILE</span><h1>Personal details</h1></div>{dirty ? <span className="unsaved">Unsaved changes</span> : saved ? <span className="saved">✓ Saved</span> : null}</div>
        <div className="form-grid">
          <label><span>Full name *</span><input value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
          <label><span>Age *</span><input type="number" min="0" max="120" value={draft.age} onChange={(event) => setDraft({ ...draft, age: Number(event.target.value) })} /></label>
          <label><span>Country / jurisdiction *</span><input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} /></label>
          <label><span>Preferred language</span><select value={draft.preferred_language} onChange={(event) => setDraft({ ...draft, preferred_language: event.target.value })}><option>English</option><option>Sinhala</option><option>Tamil</option></select></label>
        </div>
      </section>
      <section className="profile-card">
        <div className="section-heading"><div><span className="eyebrow">CLINICAL CONTEXT</span><h2>Health information</h2></div></div>
        <div className="clinical-grid">
          <label><span>Allergies</span><TagEditor values={draft.allergies} onChange={(allergies) => setDraft({ ...draft, allergies })} placeholder="Add allergy" /></label>
          <label><span>Chronic conditions</span><TagEditor values={draft.chronic_conditions} onChange={(chronic_conditions) => setDraft({ ...draft, chronic_conditions })} placeholder="Add condition" /></label>
          <label><span>Current medications</span><TagEditor values={draft.medications} onChange={(medications) => setDraft({ ...draft, medications })} placeholder="Add medication" /></label>
        </div>
      </section>
      <section className="profile-card consent-card">
        <div className="section-heading"><div><span className="eyebrow">PRIVACY & CONSENT</span><h2>How your information is used</h2></div></div>
        {[
          ["data_sharing", "Allow care summary sharing", "Share relevant information with clinicians involved in my care."],
          ["human_review", "Human clinical review", "Permit a clinician to review my conversations and attachments."],
          ["audio", "Clinical audio consent", "Permit approved audio capture or dictation for a clinician-authored summary."],
          ["emergency_contact", "Emergency contact notification", "Contact my saved emergency contact in an urgent situation."],
        ].map(([key, title, description]) => (
          <label className="consent-row" key={key}><div><strong>{title}</strong><p>{description}</p></div><input type="checkbox" checked={draft.consent[key] || false} onChange={(event) => setDraft({ ...draft, consent: { ...draft.consent, [key]: event.target.checked } })} /><span className="switch" /></label>
        ))}
        <button className="primary save-button" type="submit">Save profile</button>
      </section>
      <section className="profile-card audit-card">
        <div className="section-heading"><div><span className="eyebrow">YOUR PRIVACY RECORD</span><h2>Who accessed your health information</h2></div><span className="saved">Secure activity log</span></div>
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead><tr><th>Date & time</th><th>Who accessed it</th><th>What they did</th><th>Protected service</th><th>Permission</th></tr></thead>
            <tbody>{auditEntries.map((entry, index) => (
              <tr key={index}>
                <td>{new Date(entry.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                <td><strong>{entry.actor}</strong><small>{entry.role}</small></td>
                <td>{entry.action}</td>
                <td><span className="server-tag">{entry.server}</span></td>
                <td><span className="consent-status">✓ {entry.consent}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </form>
  );
}

function ScheduleView({ appointments, setAppointments, notify }: { appointments: Appointment[]; setAppointments: (value: Appointment[]) => void; notify: (value: string) => void }) {
  const [showBook, setShowBook] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [weekStart, setWeekStart] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date;
  });
  const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date; });

  const patchAppointment = async (id: string, payload: Record<string, unknown>) => {
    try {
      const updated = await api<Appointment>(`/api/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setAppointments(appointments.map((item) => item.id === id ? updated : item));
      setSelected(null);
      notify("Appointment updated.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not update appointment."); }
  };

  const cancel = async (id: string) => {
    await api(`/api/appointments/${id}`, { method: "DELETE" });
    setAppointments(appointments.filter((item) => item.id !== id));
    setSelected(null);
    notify("Appointment cancelled.");
  };

  const book = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const created = await api<Appointment>("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        date: data.get("date"), time: data.get("time"), clinician: "Dr. L. Silva", specialty: data.get("specialty"),
        care_pathway: data.get("pathway"), reason: data.get("reason"), status: "scheduled", notes: data.get("notes") || "",
      }) });
      setAppointments([...appointments, created]); setShowBook(false); notify("Appointment booked.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not book appointment."); }
  };

  return (
    <div className="schedule-layout">
      <section className="calendar-card">
        <div className="section-heading calendar-heading"><div><span className="eyebrow">YOUR CARE PLAN</span><h1>Schedule</h1></div><button className="primary" onClick={() => setShowBook(true)}>+ Book appointment</button></div>
        <div className="calendar-controls"><button onClick={() => setWeekStart((date) => { const next = new Date(date); next.setDate(next.getDate() - 7); return next; })}>‹</button><strong>{weekStart.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><button onClick={() => setWeekStart((date) => { const next = new Date(date); next.setDate(next.getDate() + 7); return next; })}>›</button></div>
        <div className="week-grid">
          {week.map((date) => {
            const iso = date.toISOString().slice(0, 10);
            const dayAppointments = appointments.filter((item) => item.date === iso);
            return <div className="day-column" key={iso}><div className="day-header"><span>{date.toLocaleDateString([], { weekday: "short" })}</span><strong className={date.toDateString() === new Date().toDateString() ? "today" : ""}>{date.getDate()}</strong></div><div className="day-events">
              {dayAppointments.map((appointment) => <button className={`calendar-event ${appointment.status}`} key={appointment.id} onClick={() => setSelected(appointment)}><strong>{appointment.time}</strong><span>{appointment.specialty}</span><small>{appointment.status}</small></button>)}
            </div></div>;
          })}
        </div>
      </section>
      <aside className="appointments-card">
        <div className="section-heading"><div><span className="eyebrow">UPCOMING</span><h2>Appointments</h2></div></div>
        <div className="appointment-list">
          {appointments.filter((item) => item.status !== "cancelled").sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((appointment) => (
            <button className="appointment-item" key={appointment.id} onClick={() => setSelected(appointment)}>
              <div className="date-box"><strong>{new Date(`${appointment.date}T12:00:00`).getDate()}</strong><span>{new Date(`${appointment.date}T12:00:00`).toLocaleDateString([], { month: "short" })}</span></div>
              <div className="appointment-info"><strong>{appointment.specialty}</strong><span>{appointment.time} · {appointment.clinician}</span><small className={`pathway-label ${appointment.care_pathway === "GLOBAL_CONSULT" ? "global" : ""}`}>{appointment.care_pathway === "LOCAL_CLINICAL" ? "Nearby clinical care" : "Specialist consult"}</small></div>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      </aside>

      {showBook && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowBook(false); }}><form className="dialog" onSubmit={book}><div className="dialog-heading"><div><span className="eyebrow">NEW APPOINTMENT</span><h2>Book a clinician</h2></div><button type="button" onClick={() => setShowBook(false)}>×</button></div><div className="form-grid"><label><span>Date</span><input name="date" type="date" required /></label><label><span>Time</span><input name="time" type="time" required /></label><label><span>Specialty</span><select name="specialty"><option>Internal Medicine</option><option>Mental Health</option><option>Dermatology</option><option>Cardiology</option></select></label><label><span>Care pathway</span><select name="pathway"><option value="LOCAL_CLINICAL">LOCAL_CLINICAL</option><option value="GLOBAL_CONSULT">GLOBAL_CONSULT</option></select></label></div><label className="full-field"><span>Reason</span><input name="reason" required placeholder="Brief reason for the visit" /></label><label className="full-field"><span>Notes</span><textarea name="notes" placeholder="Optional notes" /></label><button className="primary full-button" type="submit">Confirm booking</button></form></div>}

      {selected && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><RescheduleDialog appointment={selected} onClose={() => setSelected(null)} onReschedule={(payload) => void patchAppointment(selected.id, payload)} onCancel={() => void cancel(selected.id)} /></div>}
    </div>
  );
}

function RescheduleDialog({ appointment, onClose, onReschedule, onCancel }: { appointment: Appointment; onClose: () => void; onReschedule: (payload: Record<string, unknown>) => void; onCancel: () => void }) {
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time);
  const [preference, setPreference] = useState("");
  return (
    <div className="dialog"><div className="dialog-heading"><div><span className="eyebrow">APPOINTMENT</span><h2>{appointment.specialty}</h2></div><button onClick={onClose}>×</button></div>
      <p className="appointment-detail">{appointment.clinician} · {appointment.care_pathway}</p>
      <div className="form-grid"><label><span>New date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span>New time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
      <button className="primary full-button" onClick={() => onReschedule({ date, time, status: "rescheduled" })}>Save new date & time</button>
      <div className="divider"><span>or describe a preference</span></div>
      <label className="full-field"><span>Natural-language preference</span><textarea value={preference} onChange={(event) => setPreference(event.target.value)} placeholder="Move to Friday evening" /></label>
      <button className="secondary full-button" disabled={!preference.trim()} onClick={() => onReschedule({ natural_language: preference, status: "rescheduled" })}>Apply preference</button>
      <button className="cancel-button" onClick={onCancel}>Cancel appointment</button>
    </div>
  );
}
