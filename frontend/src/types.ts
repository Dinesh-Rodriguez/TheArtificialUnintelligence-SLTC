export type CarePathway = "LOCAL_CLINICAL" | "GLOBAL_CONSULT";
export type Urgency = "ROUTINE" | "URGENT" | "EMERGENCY";

export interface Profile {
  full_name: string;
  age: number;
  country: string;
  preferred_language: string;
  allergies: string[];
  chronic_conditions: string[];
  medications: string[];
  consent: Record<string, boolean>;
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

export interface ChatStatus {
  urgency: Urgency;
  care_pathway: CarePathway;
  human_review: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  attachments: Attachment[];
  status?: ChatStatus;
}

export type AppointmentStatus = "scheduled" | "rescheduled" | "cancelled";

export interface Appointment {
  id: string;
  date: string;
  time: string;
  clinician: string;
  specialty: string;
  care_pathway: CarePathway;
  reason: string;
  status: AppointmentStatus;
  notes: string;
}

export interface TraceEvent {
  id: string;
  type: string;
  timestamp: string;
  details: string;
  trace_id?: string;
  actor?: string;
  status?: "allowed" | "blocked" | "review_required";
}
