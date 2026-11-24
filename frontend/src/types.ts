
export type CarePathway = "LOCAL_CLINICAL" | "GLOBAL_CONSULT";
export type Urgency = "ROUTINE" | "URGENT" | "EMERGENCY";
export type Role = "patient" | "doctor" | "lab" | "admin";
export type ProviderType = "doctor" | "lab";
export type AccountStatus = "pending" | "approved" | "rejected";
export type VisitMode = "consultation" | "lab_visit" | "home_collection";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: AccountStatus;
}

export interface Session {
  token: string;
  user: User;
}

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

export interface VerificationDetails {
  registration_number: string;
  authority: string;
  jurisdiction: string;
  specialty: string;
  global_consult: boolean;
  test_panels: string[];
  lab_visit: boolean;
  home_collection: boolean;
}

export interface Verification {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_type: ProviderType;
  status: AccountStatus;
  details: VerificationDetails | null;
  documents: Attachment[];
  submitted_at: string | null;
  rejection_note: string;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  specialty: string;
  jurisdiction: string;
  authority: string;
  slmc_verified: boolean;
  pathways: CarePathway[];
  test_panels: string[];
  visit_modes: VisitMode[];
}

export interface Slot {
  date: string;
  time: string;
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
  status: ChatStatus | null;
}

export interface Appointment extends Slot {
  id: string;
  patient_id: string;
  patient_name: string;
  provider_id: string;
  provider_type: ProviderType;
  clinician: string;
  specialty: string;
  care_pathway: CarePathway;
  visit_mode: VisitMode;
  test_panel: string | null;
  pickup_address: string | null;
  has_signed_plan: boolean;
  reason: string;
  status: "scheduled" | "rescheduled" | "cancelled";
  notes: string;
}

export interface SignedVisitPlan {
  plan: string;
  clinician: string;
  signed_at: string;
}

export interface ClinicalReview {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  signed_at: string | null;
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
