
import { useEffect } from "react";
import type { TraceEvent } from "../types";

interface Props {
  open: boolean;
  events: TraceEvent[];
  onClose: () => void;
}

export default function BenchmarkModal({ open, events, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  if (!open) return null;

  const recorded = [
    ["Emergency alerts", events.filter((event) => event.type === "red_flag_guard").length],
    ["Bookings made", events.filter((event) => event.type === "appointment.booked").length],
    ["Clinician reviews signed", events.filter((event) => event.type === "review.signed").length],
  ] as const;

  return (
    <div className="benchmark-backdrop" role="dialog" aria-modal="true" aria-label="40-case evaluation plan"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="benchmark-modal">
        <div className="benchmark-header">
          <h2>40-Case Evaluation Plan</h2>
          <button type="button" onClick={onClose} aria-label="Close evaluation">×</button>
        </div>
        <div className="benchmark-strata" aria-label="Planned scenario breakdown">
          <article><strong>10</strong><span>Emergency red flags</span></article>
          <article><strong>12</strong><span>Local acute and infectious cases</span></article>
          <article><strong>10</strong><span>Cross-border specialist cases</span></article>
          <article><strong>8</strong><span>Safety and scheduling edge cases</span></article>
        </div>
        <p>Benchmark results are pending.</p>
        <h3>Recorded workspace activity</h3>
        <dl className="details-grid">
          {recorded.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}
