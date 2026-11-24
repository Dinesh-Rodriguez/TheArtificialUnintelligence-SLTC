
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage, jsonRequest } from "../api";
import type { Appointment, CarePathway, Provider, SignedVisitPlan, Slot, VisitMode } from "../types";

export const pathwayLabels: Record<CarePathway, string> = {
  LOCAL_CLINICAL: "Local clinical care", GLOBAL_CONSULT: "Global consult",
};
export const visitLabels: Record<VisitMode, string> = {
  consultation: "Consultation", lab_visit: "Lab visit", home_collection: "Home sample collection",
};

export function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function todayInSriLanka() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts();
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export const displayTime = (time: string) => time.slice(0, 5);
export const appointmentLabel = (item: Appointment) => item.has_signed_plan ? "Completed" : item.status;

const calendarDate = (date: string) => new Date(date + "T12:00:00");

export function bookablePathways(provider: Provider, country: string) {
  return provider.pathways.filter((pathway) => (
    pathway === "GLOBAL_CONSULT" || provider.jurisdiction.toLowerCase() === country.trim().toLowerCase()
  ));
}

export function ProviderBadges({ provider }: { provider: Provider }) {
  return (
    <div className="pills provider-badges">
      <span className="pill review">{provider.slmc_verified ? "SLMC verified" : "Admin verified"}</span>
      <span className="pill">{provider.jurisdiction}</span>
      {provider.specialty && <span className="pill">{provider.specialty}</span>}
      {provider.type === "doctor" && provider.pathways.map((pathway) => <span key={pathway} className="pill pathway" title={pathway}>{pathwayLabels[pathway]}</span>)}
      {provider.type === "lab" && provider.visit_modes.map((mode) => <span key={mode} className="pill pathway">{visitLabels[mode]}</span>)}
    </div>
  );
}

export function useSlots(providerId: string, date: string, revision = 0) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setSlots([]);
    setError("");
    if (!providerId || !date) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = new URLSearchParams({ start: date, days: "1" });
    void api<Slot[]>("/api/providers/" + providerId + "/slots?" + query, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setSlots(data);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [providerId, date, revision]);
  return { slots, loading, error };
}

export function Calendar({ appointments, onSelect }: { appointments: Appointment[]; onSelect: (item: Appointment) => void }) {
  const today = todayInSriLanka();
  const [weekStart, setWeekStart] = useState(() => {
    const date = calendarDate(today);
    date.setDate(date.getDate() - date.getDay());
    return date;
  });

  function moveWeek(offset: number) {
    setWeekStart((date) => {
      const result = new Date(date);
      result.setDate(result.getDate() + offset);
      return result;
    });
  }

  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    return day;
  });
  return (
    <section className="calendar-card">
      <div className="calendar-controls">
        <button type="button" aria-label="Previous week" onClick={() => moveWeek(-7)}>‹</button>
        <strong>{weekStart.toLocaleDateString([], { month: "long", year: "numeric" })} · Sri Lanka time</strong>
        <button type="button" aria-label="Next week" onClick={() => moveWeek(7)}>›</button>
      </div>
      <div className="week-grid">
        {week.map((day) => {
          const date = localDate(day);
          return (
            <div className="day-column" key={date}>
              <div className="day-header">
                <span>{day.toLocaleDateString([], { weekday: "short" })}</span>
                <strong className={date === today ? "today" : ""}>{day.getDate()}</strong>
              </div>
              <div className="day-events">
                {appointments.filter((item) => item.date === date && item.status !== "cancelled").map((item) => (
                  <button type="button" key={item.id} className={"calendar-event " + item.status} onClick={() => onSelect(item)}>
                    <strong>{displayTime(item.time)}</strong><span>{item.specialty}</span><small>{appointmentLabel(item)}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface SlotFieldsProps {
  providerId: string;
  date: string;
  setDate: (date: string) => void;
  time: string;
  setTime: (time: string) => void;
  revision: number;
}

function SlotFields(props: SlotFieldsProps) {
  const { slots, loading, error } = useSlots(props.providerId, props.date, props.revision);
  return (
    <>
      <div className="form-grid">
        <label><span>Date · Sri Lanka time</span><input required type="date" min={todayInSriLanka()} value={props.date}
          onChange={(event) => { props.setDate(event.target.value); props.setTime(""); }} /></label>
        <label><span>Available time</span><select required value={props.time} disabled={loading || !slots.length} onChange={(event) => props.setTime(event.target.value)}>
          <option value="">{loading ? "Loading slots…" : slots.length ? "Choose a time" : "No available slots"}</option>
          {slots.map((slot) => <option key={slot.time} value={slot.time}>{displayTime(slot.time)}</option>)}
        </select></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

function BookingForm({ provider, country, preferredPathway, onSaved }: {
  provider: Provider; country: string; preferredPathway?: CarePathway; onSaved: (item: Appointment) => void;
}) {
  const pathways = bookablePathways(provider, country);
  const [pathway, setPathway] = useState(pathways.includes(preferredPathway ?? "LOCAL_CLINICAL") ? (preferredPathway ?? "LOCAL_CLINICAL") : pathways[0]);
  const [visitMode, setVisitMode] = useState(provider.visit_modes[0]);
  const [date, setDate] = useState(todayInSriLanka);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      onSaved(await api<Appointment>("/api/appointments", jsonRequest("POST", {
        provider_id: provider.id, date, time, care_pathway: pathway, visit_mode: data.get("visit_mode"),
        test_panel: data.get("test_panel"), pickup_address: data.get("pickup_address"),
        reason: data.get("reason"), notes: data.get("notes"),
      })));
    } catch (failure) {
      setError(errorMessage(failure));
      setTime("");
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!pathways.length) return <p>This provider has no eligible pathway for your profile jurisdiction.</p>;
  return (
    <form className="stack-form" onSubmit={submit}>
      <ProviderBadges provider={provider} />
      <div className="form-grid">
        <label><span>Care pathway</span><select value={pathway} onChange={(event) => setPathway(event.target.value as CarePathway)}>
          {pathways.map((value) => <option key={value} value={value}>{pathwayLabels[value]}</option>)}
        </select></label>
        <label><span>Visit type</span><select name="visit_mode" value={visitMode} onChange={(event) => setVisitMode(event.target.value as VisitMode)}>{provider.visit_modes.map((mode) => (
          <option value={mode} key={mode}>{visitLabels[mode]}</option>
        ))}</select></label>
        {provider.type === "lab" && <label><span>Test panel</span><select name="test_panel" required>
          {provider.test_panels.map((panel) => <option key={panel}>{panel}</option>)}
        </select></label>}
      </div>
      <SlotFields providerId={provider.id} date={date} setDate={setDate} time={time} setTime={setTime} revision={revision} />
      {visitMode === "home_collection" && (
        <label><span>Pickup address</span><textarea name="pickup_address" required maxLength={300} rows={2} autoComplete="street-address" /></label>
      )}
      <label><span>Reason for visit</span><input name="reason" maxLength={500} required /></label>
      <label><span>Notes</span><textarea name="notes" maxLength={1000} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !time}>Confirm booking</button>
    </form>
  );
}

function ManageBooking({ appointment, onSaved, onCancelled, initialPreference }: {
  appointment: Appointment; onSaved: (item: Appointment) => void; onCancelled: (id: string) => void; initialPreference?: string;
}) {
  const [date, setDate] = useState(appointment.date < todayInSriLanka() ? todayInSriLanka() : appointment.date);
  const [time, setTime] = useState("");
  const [preference, setPreference] = useState(initialPreference ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const path = "/api/appointments/" + appointment.id;

  async function reschedule(payload: { date: string; time: string } | { natural_language: string }) {
    setBusy(true);
    setError("");
    try {
      onSaved(await api<Appointment>(path, jsonRequest("PATCH", payload)));
    } catch (failure) {
      setError(errorMessage(failure));
      setTime("");
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this appointment and release its slot?")) return;
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "DELETE" });
      onCancelled(appointment.id);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-form">
      {appointment.pickup_address && <p className="visit-text"><strong>Pickup address</strong><br />{appointment.pickup_address}</p>}
      <p>{appointment.clinician} · {appointment.date} at {displayTime(appointment.time)}</p>
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void reschedule({ date, time }); }}>
        <SlotFields providerId={appointment.provider_id} date={date} setDate={setDate} time={time} setTime={setTime} revision={revision} />
        <button className="primary" disabled={busy || !time}>Confirm new date and time</button>
      </form>
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void reschedule({ natural_language: preference }); }}>
        <label><span>Reschedule by preference</span><input maxLength={500} value={preference} placeholder="Move to Friday evening" onChange={(event) => setPreference(event.target.value)} /></label>
        <button className="secondary" disabled={busy || !preference.trim()}>Apply preference</button>
      </form>
      <button className="cancel-button" type="button" disabled={busy} onClick={() => void cancel()}>Cancel appointment</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function AppointmentRecord({ appointment }: { appointment: Appointment }) {
  const [plan, setPlan] = useState<SignedVisitPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appointment.has_signed_plan) return;
    const controller = new AbortController();
    void api<SignedVisitPlan>("/api/appointments/" + appointment.id + "/visit-plan", { signal: controller.signal })
      .then(setPlan).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [appointment.id, appointment.has_signed_plan]);

  return (
    <div className="stack-form">
      <p>{appointment.clinician} · {appointment.date} at {displayTime(appointment.time)} · {appointmentLabel(appointment)}</p>
      {appointment.has_signed_plan && (
        <section className="signed-plan" aria-label="Signed care plan">
          <h3>Signed care plan</h3>
          {plan && <>
            <p className="visit-text">{plan.plan}</p>
            <small>{plan.clinician} · {new Date(plan.signed_at).toLocaleString()}</small>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {!plan && !error && <p role="status">Loading care plan…</p>}
        </section>
      )}
    </div>
  );
}

const inHistory = (item: Appointment) => item.status === "cancelled" || Boolean(item.has_signed_plan);

export interface ScheduleIntent {
  providerId?: string;
  pathway?: CarePathway;
  preference?: string;
}

interface ScheduleProps {
  appointments: Appointment[];
  providers: Provider[];
  country: string;
  intent: ScheduleIntent | null;
  onChange: (item: Appointment) => void;
  onCancel: (id: string) => void;
}

export default function ScheduleView({ appointments, providers, country, intent, onChange, onCancel }: ScheduleProps) {
  const [providerId, setProviderId] = useState(intent?.providerId ?? "");
  const [appointmentId, setAppointmentId] = useState(() => (
    intent?.preference ? appointments.find((item) => !inHistory(item) && item.date >= todayInSriLanka())?.id ?? "" : ""
  ));
  const [filter, setFilter] = useState<"all" | "doctor" | "lab">("all");
  const [query, setQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const selectedProvider = providers.find((item) => item.id === providerId);
  const selectedAppointment = appointments.find((item) => item.id === appointmentId);
  const history = appointments.filter(inHistory);
  const visibleAppointments = showHistory
    ? [...history].reverse()
    : appointments.filter((item) => !inHistory(item));
  const search = query.trim().toLowerCase();
  const bookable = providers.filter((item) => (
    (filter === "all" || item.type === filter) && bookablePathways(item, country).length &&
    [item.name, item.specialty, item.jurisdiction, ...item.test_panels].some((value) => value.toLowerCase().includes(search))
  ));

  return (
    <div className="patient-schedule">
      <div className="section-heading"><h1>Schedule Calendar</h1></div>
      <div className="schedule-layout">
        <Calendar appointments={appointments} onSelect={(item) => setAppointmentId(item.id)} />
        <aside className="appointments-card">
          <h2>Appointments</h2>
          <div className="action-row queue-tabs" aria-label="Appointment list">
            <button type="button" className="secondary" aria-pressed={!showHistory} onClick={() => setShowHistory(false)}>Active</button>
            <button type="button" className="secondary" aria-pressed={showHistory} onClick={() => setShowHistory(true)}>History ({history.length})</button>
          </div>
          {!visibleAppointments.length && <p>{showHistory ? "No completed or cancelled appointments." : "You have no active appointments."}</p>}
          <div className="appointment-list">
            {visibleAppointments.map((appointment) => (
              <button type="button" className="appointment-item" key={appointment.id} onClick={() => setAppointmentId(appointment.id)}>
                <div className="date-box"><strong>{calendarDate(appointment.date).getDate()}</strong><span>{calendarDate(appointment.date).toLocaleDateString([], { month: "short" })}</span></div>
                <div className="appointment-info"><strong>{appointment.specialty}</strong><span>{displayTime(appointment.time)} · {appointment.clinician}</span><small>{appointment.has_signed_plan ? "Signed care plan" : showHistory ? "Cancelled" : visitLabels[appointment.visit_mode]}</small></div>
                <span className="chevron">›</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
      <section className="profile-card directory-card">
        <div className="section-heading">
          <h2>Approved provider directory</h2>
          <div className="directory-filters">
            <label><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, specialty, or test" /></label>
            <label>Provider type <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All providers</option><option value="doctor">Doctors</option><option value="lab">Laboratories</option></select></label>
          </div>
        </div>
        {!bookable.length && <p>No eligible providers match your filters.</p>}
        <div className="directory-grid">
          {bookable.map((item) => (
            <article className="directory-item" key={item.id}>
              <h3>{item.name}</h3><ProviderBadges provider={item} />
              {item.test_panels.length > 0 && <p>{item.test_panels.join(" · ")}</p>}
              <button type="button" className="primary" onClick={() => setProviderId(item.id)}>Book {item.type === "lab" ? "lab slot" : "consultation"}</button>
            </article>
          ))}
        </div>
      </section>
      {(selectedProvider || selectedAppointment) && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) { setProviderId(""); setAppointmentId(""); }
        }}>
          <section className="dialog booking-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-dialog-title"
            onKeyDown={(event) => { if (event.key === "Escape") { setProviderId(""); setAppointmentId(""); } }}>
            <div className="dialog-heading">
              <h2 id="schedule-dialog-title">{selectedProvider ? "Book " + selectedProvider.name : selectedAppointment && inHistory(selectedAppointment) ? "Appointment record" : "Manage appointment"}</h2>
              <button type="button" autoFocus aria-label="Close appointment dialog" onClick={() => { setProviderId(""); setAppointmentId(""); }}>×</button>
            </div>
            {selectedProvider && <BookingForm key={selectedProvider.id} provider={selectedProvider} country={country} preferredPathway={intent?.pathway} onSaved={(item) => { onChange(item); setProviderId(""); }} />}
            {!selectedProvider && selectedAppointment && (
              inHistory(selectedAppointment)
                ? <AppointmentRecord key={selectedAppointment.id} appointment={selectedAppointment} />
                : <ManageBooking key={selectedAppointment.id} appointment={selectedAppointment}
                    initialPreference={intent?.preference} onSaved={(item) => { onChange(item); setAppointmentId(""); }}
                    onCancelled={(id) => { onCancel(id); setAppointmentId(""); }} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
