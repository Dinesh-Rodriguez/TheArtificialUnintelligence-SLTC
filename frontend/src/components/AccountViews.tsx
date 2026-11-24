
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage, jsonRequest } from "../api";
import type { Attachment, Role, Session, User, Verification } from "../types";
import FilePreview from "./FilePreview";

export const roleLabels: Record<Role, string> = {
  patient: "Patient", doctor: "Doctor", lab: "Laboratory", admin: "Admin",
};

const demoAccounts = [
  ["Patient", "patient"], ["Pending Doctor", "pending-doctor"], ["Approved Doctor", "doctor"],
  ["Pending Lab", "pending-lab"], ["Approved Lab", "lab"], ["Admin", "admin"],
];

export function AccountEntry({ onSession, sessionMessage }: {
  onSession: (session: Session) => void; sessionMessage: string;
}) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = { email, password };
    const payload = registering ? { ...credentials, full_name: form.get("full_name"), role: form.get("role") } : credentials;
    setBusy(true);
    setError("");
    try {
      onSession(await api<Session>(
        registering ? "/api/auth/register" : "/api/auth/login", jsonRequest("POST", payload), null,
      ));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="entry-layout">
      <section className="entry-intro">
        <div className="brand"><span className="brand-mark">M</span><div><strong>MedBridge AI</strong><span>Human-Centric Telemedicine</span></div></div>
        <h1>Connect with verified care.</h1>
        <p>Book a clinician or laboratory visit, or sign in to manage your professional workspace.</p>
        <div className="demo-access">
          <h2>Demo accounts</h2>
          <p>Choose a role to fill in its sign-in details.</p>
          <div className="demo-buttons">
            {demoAccounts.map(([label, address]) => (
              <button key={address} type="button" className="secondary" disabled={busy} onClick={() => {
                setRegistering(false);
                setEmail(address + "@medbridge.demo");
                setPassword("12345");
                setError("");
              }}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="entry-card profile-card">
        <h2>{registering ? "Create an account" : "Sign in"}</h2>
        {sessionMessage && <p role="status">{sessionMessage}</p>}
        <form className="stack-form" onSubmit={submit}>
          {registering && <>
            <label><span>Full name or laboratory name</span><input name="full_name" autoComplete="name" required maxLength={120} /></label>
            <label><span>Account type</span><select name="role"><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="lab">Laboratory</option></select></label>
          </>}
          <label><span>Email</span><input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>Password</span><input required type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <small>Shared demo password <code>12345</code></small>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Please wait…" : registering ? "Create account" : "Sign in"}</button>
          <button className="secondary" type="button" disabled={busy} onClick={() => { setRegistering(!registering); setError(""); }}>
            {registering ? "Back to sign in" : "Create an account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: Verification["status"] }) {
  const label = { pending: "Pending Admin Approval", rejected: "Rejected — Resubmit Documents", approved: "Admin Approved" };
  return <span className={"verification-badge " + status}>{label[status]}</span>;
}

function Documents({ documents, onPreview }: { documents: Attachment[]; onPreview: (file: Attachment) => void }) {
  return <div className="document-links">
    {documents.map((file) => (
      <button className="secondary" type="button" key={file.id} onClick={() => onPreview(file)}>View {file.filename}</button>
    ))}
  </div>;
}

export function VerificationWorkspace({ user, onUpdate }: { user: User; onUpdate: () => void }) {
  const [application, setApplication] = useState<Verification | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const entries = await api<Verification[]>("/api/verifications");
      setApplication(entries[0]);
      setError("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setApplication(await api<Verification>("/api/verifications/submit", { method: "POST", body: new FormData(event.currentTarget) }));
      onUpdate();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const details = application?.details;
  return (
    <section className="profile-card workspace-card verification-workspace">
      <div className="section-heading"><h1>Verification &amp; Document Submission</h1><StatusBadge status={user.status} /></div>
      <p>Submit your registration details and official documents. Admin approval opens your workspace and publishes your listing.</p>
      {application?.rejection_note && <p className="form-error" role="status">Admin note · {application.rejection_note}</p>}
      {application?.submitted_at && <div className="submitted-documents">
        <strong>Documents submitted {new Date(application.submitted_at).toLocaleDateString()}</strong>
        <Documents documents={application.documents} onPreview={setPreview} />
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p>Loading application…</p>}
      {!loading && !application && <button type="button" className="secondary" onClick={() => void load()}>Retry</button>}
      {application && (
        <form key={application.submitted_at ?? "new"} className="stack-form" onSubmit={submit}>
          <div className="form-grid">
            <label><span>{user.role === "doctor" ? "Medical license number" : "Laboratory registration number"}</span><input name="registration_number" required maxLength={100} defaultValue={details?.registration_number} /></label>
            <label><span>Issuing authority</span><input name="authority" required maxLength={120} placeholder={user.role === "doctor" ? "e.g. SLMC" : "e.g. PHSRC"} defaultValue={details?.authority} /></label>
            <label><span>Jurisdiction</span><input name="jurisdiction" required maxLength={80} defaultValue={details?.jurisdiction ?? "Sri Lanka"} /></label>
            {user.role === "doctor"
              ? <label><span>Specialty</span><input name="specialty" required maxLength={100} defaultValue={details?.specialty} /></label>
              : <label><span>Test panels, separated by commas</span><input name="test_panels" required maxLength={600} defaultValue={details?.test_panels.join(", ")} /></label>}
          </div>
          <div className="check-options">
            {user.role === "doctor"
              ? <label><input type="checkbox" name="global_consult" value="true" defaultChecked={details?.global_consult} /> Eligible for global consults</label>
              : <>
                <label><input type="checkbox" name="lab_visit" value="true" defaultChecked={details?.lab_visit ?? true} /> Lab visits</label>
                <label><input type="checkbox" name="home_collection" value="true" defaultChecked={details?.home_collection} /> Home sample collection</label>
              </>}
          </div>
          <label><span>Official documents</span><input name="files" type="file" required multiple accept=".pdf,.jpg,.jpeg,.png" /><small>PDF, JPG, or PNG. Up to five files, 10 MB each.</small></label>
          <button className="primary" disabled={busy}>{busy ? "Submitting…" : application.submitted_at ? "Resubmit documents" : "Submit for admin review"}</button>
        </form>
      )}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

function ApplicationCard({ application, onDecision, onPreview }: {
  application: Verification;
  onDecision: (updated: Verification) => void;
  onPreview: (attachment: Attachment) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const details = application.details;

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError("");
    try {
      onDecision(await api<Verification>(
        "/api/verifications/" + application.id + "/decision",
        jsonRequest("POST", { decision, note, submitted_at: application.submitted_at }),
      ));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="application-card">
      <div className="section-heading">
        <div><h2>{application.provider_name}</h2><p>{roleLabels[application.provider_type]} · {details?.jurisdiction}</p></div>
        <StatusBadge status={application.status} />
      </div>
      {details && <dl className="details-grid">
        <div><dt>Registration</dt><dd>{details.registration_number}</dd></div>
        <div><dt>Issuing authority</dt><dd>{details.authority}</dd></div>
        <div><dt>{application.provider_type === "doctor" ? "Specialty" : "Test panels"}</dt><dd>{details.specialty || details.test_panels.join(", ")}</dd></div>
        <div><dt>{application.provider_type === "doctor" ? "Care pathways" : "Collection options"}</dt><dd>
          {application.provider_type === "doctor"
            ? details.global_consult ? "Local clinical care and global consults" : "Local clinical care"
            : [details.lab_visit && "Lab visit", details.home_collection && "Home sample collection"].filter(Boolean).join(", ")}
        </dd></div>
      </dl>}
      <Documents documents={application.documents} onPreview={onPreview} />
      {application.status === "pending" && <div className="stack-form">
        <label><span>Optional rejection note</span><input maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <div className="action-row">
          <button className="primary" disabled={busy} onClick={() => void decide("approved")}>Approve</button>
          <button className="secondary" disabled={busy} onClick={() => void decide("rejected")}>Reject</button>
        </div>
      </div>}
      {application.rejection_note && <p>Rejection note · {application.rejection_note}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  );
}

export function AdminQueue({ onUpdate }: { onUpdate: () => void }) {
  const [applications, setApplications] = useState<Verification[]>([]);
  const [mode, setMode] = useState<"pending" | "decided">("pending");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setApplications(await api<Verification[]>("/api/verifications"));
      setError("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  const shown = applications.filter((application) => (application.status === "pending") === (mode === "pending"));
  return (
    <section className="profile-card workspace-card">
      <div className="section-heading"><h1>Admin Verification Queue</h1><button className="secondary" onClick={() => void load()}>Refresh queue</button></div>
      <div className="action-row queue-tabs">
        <button className={mode === "pending" ? "primary" : "secondary"} onClick={() => setMode("pending")}>Pending applications</button>
        <button className={mode === "decided" ? "primary" : "secondary"} onClick={() => setMode("decided")}>Decided applications</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p>Loading applications…</p>}
      {!loading && !error && !shown.length && <p>No {mode} applications.</p>}
      <div className="applications">
        {shown.map((application) => <ApplicationCard key={application.id + application.submitted_at} application={application} onPreview={setPreview} onDecision={(updated) => {
          setApplications((current) => current.map((item) => item.id === updated.id ? updated : item));
          onUpdate();
        }} />)}
      </div>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
