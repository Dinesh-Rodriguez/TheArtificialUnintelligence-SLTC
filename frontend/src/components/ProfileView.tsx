import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { Profile, TraceEvent } from "../types";

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

export default function ProfileView({ profile, setProfile, notify, events }: {
  profile: Profile; setProfile: (profile: Profile) => void; notify: (value: string) => void; events: TraceEvent[];
}) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const profileEvents = events.filter((event) => event.type.startsWith("profile."));
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
        <div className="section-heading"><h2>Profile activity</h2></div>
        {profileEvents.length > 0
          ? <ul className="profile-activity">{profileEvents.map((event) => (
            <li key={event.id}><time>{new Date(event.timestamp).toLocaleString()}</time> ? {event.details}</li>
          ))}</ul>
          : <p>No profile activity recorded.</p>}
      </section>
    </form>
  );
}
