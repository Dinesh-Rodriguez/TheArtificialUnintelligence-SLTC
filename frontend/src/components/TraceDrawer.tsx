import { useEffect } from "react";
import type { TraceEvent } from "../types";

interface Props {
  open: boolean;
  events: TraceEvent[];
  onClose: () => void;
}

export default function TraceDrawer({ open, events, onClose }: Props) {
  const plainEventName: Record<string, string> = {
    "intake.completed": "Care information captured",
    "triage.completed": "Care priority checked",
    "red_flag_guard": "Emergency warning checked",
    "mcp_scope_check": "Permission & privacy check",
    "BLOCKED_AT_MCP_LAYER": "Unsafe request blocked",
    "appointment.booked": "Appointment booked",
    "appointment.rescheduled": "Appointment rescheduled",
    "appointment.cancelled": "Appointment cancelled",
    "prescription.approved": "Treatment plan approved",
    "profile.updated": "Profile updated",
  };
  const plainDetails = (event: TraceEvent) => {
    const details = event.details
      .replace(/MCP/g, "protected health service")
      .replace(/Urgency=/g, "Priority=")
      .replace(/pathway=/g, "care route=")
      .replace(/LOCAL_CLINICAL/g, "Nearby clinical care")
      .replace(/GLOBAL_CONSULT/g, "Specialist consult");
    return details;
  };
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {open && <button className="drawer-backdrop" aria-label="Close trace drawer" onClick={onClose} />}
      <aside className={`trace-drawer ${open ? "open" : ""}`} aria-hidden={!open} aria-label="Trace and guardrails inspector">
        <div className="drawer-header">
          <div><span className="eyebrow">YOUR SAFETY RECORD</span><h2>Safety & Activity</h2></div>
          <button type="button" onClick={onClose} aria-label="Close trace drawer">×</button>
        </div>
        <div className="trace-summary">
          <span><strong>{events.length}</strong> events</span>
          <span><i /> Privacy and safety checks active</span>
        </div>
        <section className="mcp-matrix" aria-label="Scoped MCP permission summary">
          <div className="mcp-heading"><span className="eyebrow">WHAT THE SYSTEM MAY ACCESS</span><strong>Protected Information Services</strong></div>
          {[
            ["Health Records", "Read only your health record", "Your records only"],
            ["Appointments", "View and manage your appointments", "Your consent"],
            ["Lab Results", "View authorized test results", "Your results only"],
            ["Care Guidance", "Use approved clinical guidance", "No personal identity"],
            ["Patient Alerts", "Send approved notifications", "Clinician approved"],
          ].map(([name, scope, enforcement]) => (
            <div className="mcp-row" key={name}><span className="mcp-dot" /><div><strong>{name}</strong><small>{scope}</small></div><span className="mcp-status">{enforcement}</span></div>
          ))}
        </section>
        <div className="trace-list">
          {[...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((event) => (
            <article className="trace-item" key={event.id}>
              <div className="trace-rail"><span /></div>
              <div>
                <div className="trace-title"><strong>{plainEventName[event.type] || event.type}</strong><span className={`safety-status ${event.status || "allowed"}`}>{event.status === "blocked" ? "Blocked safely" : event.status === "review_required" ? "Needs review" : "Allowed"}</span></div>
                <p>{plainDetails(event)}</p>
                <div className="trace-meta">
                  <span>{event.actor || "MedBridge System"}</span>
                  <span>{event.trace_id || `MB-${event.id.toUpperCase()}`}</span>
                  <time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                </div>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}
