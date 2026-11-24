
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api";
import type { Attachment, ChatMessage, Profile, Provider } from "../types";
import FilePreview from "./FilePreview";
import { bookablePathways, ProviderBadges } from "./ScheduleView";
import type { ScheduleIntent } from "./ScheduleView";

const scenarios = [
  { title: "Acute Fever / Dengue", text: "I have fever, headache, and vomiting. Could this be dengue?", tone: "fever", label: "Nearby clinical care" },
  { title: "Anxiety & Stress", text: "I have been feeling anxious and cannot sleep. I would like mental health support.", tone: "mental", label: "Specialist consult" },
  { title: "Emergency Red-Flag Test", text: "I have severe chest pain and I cannot breathe properly.", tone: "emergency", label: "Emergency care" },
  { title: "Allergy & Prescription", text: "I am allergic to penicillin. I would like a doctor to review my prescription.", tone: "allergy", label: "Clinician review" },
  { title: "Reschedule Request", text: "Move my next appointment to Friday evening.", tone: "schedule", label: "Change appointment" },
];

interface Props {
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  profile: Profile;
  providers: Provider[];
  onSchedule: (intent: ScheduleIntent) => void;
  onUpdate: () => void;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ChatView({ messages, setMessages, profile, providers, onSchedule, onUpdate }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const additions = Array.from(selected);
    const accepted = additions.filter((file) => allowed.includes(file.type) && file.size <= 10 * 1024 * 1024);
    if (accepted.length !== additions.length) setError("Choose PDF, JPG, or PNG files up to 10 MB each.");
    else if (files.length + accepted.length > 5) setError("You can attach up to five files.");
    else setError("");
    setFiles((current) => [...current, ...accepted].slice(0, 5));
  }

  async function send(preset?: string) {
    const outgoing = (preset ?? text).trim();
    if (sending || (!outgoing && !files.length)) return;
    if (/^(?:please )?(?:reschedule|move)\b/i.test(outgoing) && /\bappointment\b/i.test(outgoing) && !files.length) {
      onSchedule({ preference: outgoing });
      return;
    }
    setSending(true);
    setError("");
    const form = new FormData();
    if (outgoing) form.append("text", outgoing);
    files.forEach((file) => form.append("files", file));
    try {
      await api<ChatMessage>("/api/chat/messages", { method: "POST", body: form });
      setText("");
      setFiles([]);
      onUpdate();
      setMessages(await api<ChatMessage[]>("/api/chat/messages"));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSending(false);
    }
  }

  const intakeText = messages.filter((message) => message.role === "user").map((message) => message.text.toLowerCase()).join(" ");
  const intake = [
    ["Primary Symptoms", /\b(fever|pain|headache|anxious|anxiety|vomiting)\b/.test(intakeText)],
    ["Duration & Onset", /\b(yesterday|since|onset)\b/.test(intakeText)],
    ["Severity", /\b(mild|moderate|severe)\b/.test(intakeText)],
    ["Allergies", profile.allergies.length > 0 || /\ballerg/.test(intakeText)],
    ["Current Medications", profile.medications.length > 0 || /\bmedication/.test(intakeText)],
    ["Jurisdiction", Boolean(profile.country)],
  ] as const;
  const latest = [...messages].reverse().find((message) => message.status)?.status;
  const emergency = latest?.urgency === "EMERGENCY";
  const pathway = latest?.care_pathway ?? "LOCAL_CLINICAL";
  const matches = providers.filter((provider) => bookablePathways(provider, profile.country).includes(pathway));

  return (
    <div className="chat-layout authenticated-chat">
      <section className="conversation">
        {emergency && (
          <div className="emergency-banner" role="alert">
            <span className="emergency-icon">!</span>
            <div><strong>Emergency signs detected</strong><p>Call your local emergency number now. Do not wait for an appointment.</p></div>
          </div>
        )}
        <div className="conversation-heading">
          <div><span className="eyebrow">CARE CONVERSATION</span><h1>Care Assistant</h1></div>
        </div>
        <div className="intake-progress" aria-label="Intake summary">
          <div className="intake-heading"><strong>About this visit</strong><small>{intake.filter(([, captured]) => captured).length}/6 provided</small></div>
          <div className="intake-grid">
            {intake.map(([field, captured]) => (
              <div className={"intake-item " + (captured ? "captured" : "pending")} key={field}>
                <span className="intake-check">{captured ? "✓" : "○"}</span>
                <div><strong>{field}</strong><small>{captured ? "Captured" : "Pending"}</small></div>
              </div>
            ))}
          </div>
        </div>
        <div className="scenario-row" aria-label="Care scenario examples">
          {scenarios.map((scenario) => (
            <button type="button" className={"scenario-chip " + scenario.tone} key={scenario.title}
              onClick={() => scenario.tone === "schedule" ? onSchedule({ preference: scenario.text }) : void send(scenario.text)} disabled={sending}>
              <span>{scenario.title}</span><small>{scenario.label}</small>
            </button>
          ))}
        </div>
        <div className="message-list" ref={messageListRef}>
          {!messages.length && <div className="empty-state"><strong>No messages yet</strong><p>Describe how you feel or attach a file.</p></div>}
          {messages.map((message) => (
            <article className={"message " + message.role} key={message.id}>
              {message.role === "assistant" && <div className="avatar">M</div>}
              <div className="message-body">
                <div className="message-meta"><strong>{message.role === "assistant" ? "MedBridge Assistant" : "You"}</strong><time>{formatTime(message.timestamp)}</time></div>
                <p>{message.text}</p>
                {message.status && <div className="pills">
                  <span className={"pill urgency " + message.status.urgency.toLowerCase()}>{message.status.urgency === "EMERGENCY" ? "Emergency" : message.status.urgency === "URGENT" ? "Prompt care" : "Routine"}</span>
                  <span className="pill pathway">{message.status.care_pathway === "LOCAL_CLINICAL" ? "Nearby clinical care" : "Specialist consult"}</span>
                </div>}
                <div className="document-links">
                  {message.attachments.map((attachment) => (
                    <button type="button" className="secondary" key={attachment.id} onClick={() => setPreview(attachment)}>
                      {attachment.content_type === "application/pdf" ? "PDF" : "Image"} · {attachment.filename}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="composer-wrap">
        <form className={"composer" + (dragging ? " dragging" : "")} onSubmit={(event) => { event.preventDefault(); void send(); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (!sending) addFiles(event.dataTransfer.files); }}>
          {dragging && <div className="drop-overlay">Drop PDF, JPG, or PNG</div>}
          {files.length > 0 && <div className="selected-files">
            {files.map((file, index) => <span className="file-chip" key={file.name + index}>{file.name}
              <button type="button" aria-label={"Remove " + file.name} disabled={sending} onClick={() => setFiles(files.filter((_, item) => item !== index))}>×</button>
            </span>)}
          </div>}
          <textarea aria-label="Care message" value={text} maxLength={10000} disabled={sending} onChange={(event) => setText(event.target.value)}
            placeholder="Describe symptoms or ask a care question…" onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
            }} />
          <div className="composer-actions">
            <label className="attach-button"><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple disabled={sending}
              onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />⊕ <span>Attach</span></label>
            <button className="send-button" disabled={sending || (!text.trim() && !files.length)}>{sending ? "Sending…" : "Send"}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        {!emergency && <section className="chat-provider-list" aria-label="Approved providers">
          <h2>Find verified care</h2>
          {!matches.length && <p>No approved providers match this care pathway.</p>}
          {matches.map((provider) => (
            <article key={provider.id}>
              <strong>{provider.name}</strong>
              <ProviderBadges provider={provider} />
              {provider.test_panels.length > 0 && <p>{provider.test_panels.join(" · ")}</p>}
              <button type="button" className="secondary" onClick={() => onSchedule({ providerId: provider.id, pathway })}>
                {provider.type === "doctor" ? "Select doctor" : "Select lab"}
              </button>
            </article>
          ))}
          <button className="secondary" type="button" onClick={() => onSchedule({})}>Browse the directory</button>
        </section>}
      </aside>
      {preview && <FilePreview file={preview} onClose={() => { setPreview(null); onUpdate(); }} />}
    </div>
  );
}
