import { useEffect } from "react";
import type { TraceEvent } from "../types";

interface Props {
  open: boolean;
  events: TraceEvent[];
  onClose: () => void;
}

export default function TraceDrawer({ open, events, onClose }: Props) {
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
          <div><span className="eyebrow">OBSERVABILITY</span><h2>Trace & Guardrails</h2></div>
          <button type="button" onClick={onClose} aria-label="Close trace drawer">×</button>
        </div>
        <div className="trace-summary">
          <span><strong>{events.length}</strong> events</span>
          <span><i /> Safety monitor active</span>
        </div>
        <section className="mcp-matrix" aria-label="Scoped MCP permission summary">
          <div className="mcp-heading"><span className="eyebrow">SCOPED ACCESS CONTROL</span><strong>MCP Permission Summary</strong></div>
          {[
            ["Records MCP", "Read own record", "Patient-scoped"],
            ["Scheduling MCP", "Read / write own appointments", "Consent-scoped"],
            ["Lab MCP", "Read authorized results", "Patient-scoped"],
            ["Knowledge MCP", "Read guidelines", "No patient identity"],
            ["Notification MCP", "Send approved alerts", "Human-approved"],
          ].map(([name, scope, enforcement]) => (
            <div className="mcp-row" key={name}><span className="mcp-dot" /><div><strong>{name}</strong><small>{scope}</small></div><span className="mcp-status">{enforcement}</span></div>
          ))}
        </section>
        <div className="trace-list">
          {[...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((event) => (
            <article className="trace-item" key={event.id}>
              <div className="trace-rail"><span /></div>
              <div>
                <div className="trace-title"><strong>{event.type}</strong><span className={`safety-status ${event.status || "allowed"}`}>{event.status || "allowed"}</span></div>
                <p>{event.details}</p>
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
