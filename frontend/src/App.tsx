
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage, getToken, setToken } from "./api";
import type { Appointment, ChatMessage, Profile, Provider, Session, TraceEvent, User } from "./types";
import { AccountEntry, AdminQueue, roleLabels, VerificationWorkspace } from "./components/AccountViews";
import BenchmarkModal from "./components/BenchmarkModal";
import ChatView from "./components/ChatView";
import ProfileView from "./components/ProfileView";
import ProviderWorkspace from "./components/ProviderWorkspace";
import ScheduleView from "./components/ScheduleView";
import type { ScheduleIntent } from "./components/ScheduleView";
import TraceDrawer from "./components/TraceDrawer";

type Tab = "chat" | "profile" | "schedule";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [sessionMessage, setSessionMessage] = useState("");

  const refreshIdentity = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const identity = await api<User>("/api/auth/me", undefined, token);
      if (getToken() !== token) return;
      setUser(identity);
      setSessionMessage("");
    } catch (failure) {
      if (getToken() !== token) return;
      if (failure instanceof ApiError && failure.status === 401) {
        setToken(null);
        setUser(null);
        setSessionMessage("Your session has ended. Please sign in again.");
      } else {
        setSessionMessage(errorMessage(failure));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshIdentity();
    const refresh = () => { void refreshIdentity(); };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshIdentity]);

  function startSession(session: Session) {
    setToken(session.token);
    setUser(session.user);
    setSessionMessage("");
  }

  function signOut() {
    const token = getToken();
    setToken(null);
    setUser(null);
    setSessionMessage("");
    void api("/api/auth/logout", { method: "POST" }, token).catch(() => {});
  }

  if (loading) return <div className="loading">Checking your session…</div>;
  if (!user) return <AccountEntry onSession={startSession} sessionMessage={sessionMessage} />;

  return <Workspace key={user.id + ":" + user.status} user={user} onSignOut={signOut} refreshIdentity={refreshIdentity} />;
}

function Workspace({ user, onSignOut, refreshIdentity }: {
  user: User; onSignOut: () => void; refreshIdentity: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [intent, setIntent] = useState<ScheduleIntent | null>(null);
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetVersion, setResetVersion] = useState(0);
  const [resetting, setResetting] = useState(false);
  const scheduleVersion = useRef(0);
  const patient = user.role === "patient";
  const admin = user.role === "admin";
  const approvedProvider = !patient && !admin && user.status === "approved";

  const refreshEvents = useCallback(async () => {
    try {
      setEvents(await api<TraceEvent[]>("/api/events"));
    } catch (failure) {
      setToast(errorMessage(failure));
    }
  }, []);

  const refreshSchedule = useCallback(async () => {
    if (!patient && !approvedProvider) return;
    const version = ++scheduleVersion.current;
    const [bookings, directory] = await Promise.all([
      api<Appointment[]>("/api/appointments"),
      patient ? api<Provider[]>("/api/providers") : Promise.resolve([]),
    ]);
    if (version !== scheduleVersion.current) return;
    setAppointments(bookings);
    setProviders(directory);
  }, [patient, approvedProvider]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      await Promise.all([
        refreshSchedule(),
        refreshEvents(),
        patient ? Promise.all([api<Profile>("/api/profile"), api<ChatMessage[]>("/api/chat/messages")]).then(([nextProfile, nextMessages]) => {
          setProfile(nextProfile);
          setMessages(nextMessages);
        }) : Promise.resolve(),
      ]);
    } catch (failure) {
      setLoadError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, [patient, refreshEvents, refreshSchedule]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refresh = () => { void refreshSchedule().catch(() => {}); };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshSchedule]);

  useEffect(() => {
    if (!traceOpen) return;
    const interval = window.setInterval(() => void refreshEvents(), 5000);
    return () => window.clearInterval(interval);
  }, [traceOpen, refreshEvents]);

  function updateAppointment(item: Appointment) {
    scheduleVersion.current++;
    setAppointments((current) => [...current.filter((booking) => booking.id !== item.id), item]
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
    setToast(item.status === "rescheduled" ? "Appointment rescheduled." : "Appointment booked.");
    void refreshEvents();
  }

  function cancelAppointment(id: string) {
    scheduleVersion.current++;
    setAppointments((current) => current.map((item) => item.id === id ? { ...item, status: "cancelled" } : item));
    setToast("Appointment cancelled.");
    void refreshEvents();
  }

  function switchTab(next: Tab) {
    setTab(next);
    setIntent(null);
  }

  async function reset() {
    if (!window.confirm("Restore sample data and sign out other demo sessions?")) return;
    setResetting(true);
    try {
      await api("/api/reset", { method: "POST" });
      setResetVersion((current) => current + 1);
      await refreshEvents();
      setToast("Sample data restored.");
    } catch (failure) {
      setToast(errorMessage(failure));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M</span><div><strong>MedBridge AI</strong><span>Human-Centric Telemedicine</span></div></div>
        <div className="header-actions">
          <div className="account-context"><strong>{user.full_name}</strong><small>{roleLabels[user.role]} workspace</small></div>
          <button className="trace-button" type="button" onClick={() => { setTraceOpen(!traceOpen); if (!traceOpen) void refreshEvents(); }}>Trace &amp; Guardrails</button>
          <button className="benchmark-button" type="button" onClick={() => { void refreshEvents(); setBenchmarkOpen(true); }}>40-Case Evaluation</button>
          {admin && <button className="reset-button" type="button" disabled={resetting} onClick={() => void reset()}>↻ Reset Demo Data</button>}
          <button className="secondary sign-out" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {patient && <nav className="nav-tabs" aria-label="Primary navigation">
        <button className={tab === "chat" ? "active" : ""} onClick={() => switchTab("chat")}><span>◉</span> Chat</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => switchTab("profile")}><span>◎</span> Profile</button>
        <button className={tab === "schedule" ? "active" : ""} onClick={() => switchTab("schedule")}><span>▦</span> Schedule Calendar</button>
      </nav>}

      <main className="main-content">
        {loading ? <div className="loading">Loading your workspace…</div> : loadError ? (
          <section className="profile-card workspace-card"><p role="alert">{loadError}</p><button className="secondary" onClick={() => void load()}>Retry</button></section>
        ) : <>
          {patient && profile && tab === "chat" && <ChatView messages={messages} setMessages={setMessages} profile={profile} providers={providers}
            onSchedule={(next) => { setIntent(next); setTab("schedule"); void refreshSchedule().catch(() => {}); }}
            onUpdate={() => void refreshEvents()} />}
          {patient && profile && tab === "profile" && <ProfileView profile={profile} events={events}
            setProfile={(updated) => { setProfile(updated); void refreshEvents(); void refreshIdentity(); }} notify={setToast} />}
          {patient && profile && tab === "schedule" && <ScheduleView appointments={appointments} providers={providers} country={profile.country}
            intent={intent} onChange={updateAppointment} onCancel={cancelAppointment} />}
          {approvedProvider && <ProviderWorkspace user={user} appointments={appointments} onUpdate={() => void refreshEvents()} />}
          {!patient && !admin && !approvedProvider && <VerificationWorkspace user={user} onUpdate={() => { void refreshIdentity(); void refreshEvents(); }} />}
          {admin && <AdminQueue key={resetVersion} onUpdate={() => void refreshEvents()} />}
        </>}
      </main>
      <TraceDrawer open={traceOpen} events={events} onClose={() => setTraceOpen(false)} />
      <BenchmarkModal open={benchmarkOpen} events={events} onClose={() => setBenchmarkOpen(false)} />
      {toast && <button className="toast" type="button" onClick={() => setToast("")}>{toast}<span>×</span></button>}
    </div>
  );
}
