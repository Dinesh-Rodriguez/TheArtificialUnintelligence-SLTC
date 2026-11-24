
from datetime import date as Date, datetime, time as Time
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["patient", "doctor", "lab", "admin"]
ProviderType = Literal["doctor", "lab"]
AccountStatus = Literal["pending", "approved", "rejected"]
CarePathway = Literal["LOCAL_CLINICAL", "GLOBAL_CONSULT"]
Urgency = Literal["ROUTINE", "URGENT", "EMERGENCY"]
VisitMode = Literal["consultation", "lab_visit", "home_collection"]


class Profile(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    age: int = Field(ge=0, le=120)
    country: str = Field(min_length=1, max_length=80)
    preferred_language: str = "English"
    allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    consent: dict[str, bool] = Field(default_factory=dict)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(max_length=128)


class Registration(Credentials):
    full_name: str = Field(min_length=1, max_length=120)
    role: Literal["patient", "doctor", "lab"]


class User(BaseModel):
    id: str
    email: str
    full_name: str
    role: Role
    status: AccountStatus


class Session(BaseModel):
    token: str
    user: User


class Attachment(BaseModel):
    id: str
    filename: str
    content_type: str
    size: int
    url: str


class VerificationDetails(BaseModel):
    registration_number: str
    authority: str
    jurisdiction: str
    specialty: str = ""
    global_consult: bool = False
    test_panels: list[str] = Field(default_factory=list)
    lab_visit: bool = False
    home_collection: bool = False


class Verification(BaseModel):
    id: str
    provider_id: str
    provider_name: str
    provider_type: ProviderType
    status: AccountStatus
    details: VerificationDetails | None = None
    documents: list[Attachment] = Field(default_factory=list)
    submitted_at: datetime | None = None
    rejection_note: str = ""


class VerificationDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=1000)
    submitted_at: datetime | None = None


class Provider(BaseModel):
    id: str
    name: str
    type: ProviderType
    specialty: str
    jurisdiction: str
    authority: str
    slmc_verified: bool
    pathways: list[CarePathway]
    test_panels: list[str]
    visit_modes: list[VisitMode]


class Slot(BaseModel):
    date: Date
    time: Time


class ChatStatus(BaseModel):
    urgency: Urgency
    care_pathway: CarePathway
    human_review: bool


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    text: str
    timestamp: datetime
    attachments: list[Attachment] = Field(default_factory=list)
    status: ChatStatus | None = None


class AppointmentCreate(BaseModel):
    provider_id: str
    date: Date
    time: Time
    care_pathway: CarePathway
    visit_mode: VisitMode = "consultation"
    test_panel: str | None = None
    pickup_address: str | None = Field(default=None, max_length=300)
    reason: str = Field(min_length=1, max_length=500)
    notes: str = Field(default="", max_length=1000)


class Appointment(AppointmentCreate):
    id: str
    patient_id: str
    patient_name: str
    provider_type: ProviderType
    clinician: str
    specialty: str
    status: Literal["scheduled", "rescheduled", "cancelled"] = "scheduled"
    has_signed_plan: bool = False


class AppointmentPatch(BaseModel):
    date: Date | None = None
    time: Time | None = None
    natural_language: str | None = Field(default=None, max_length=500)


class ClinicalReview(BaseModel):
    subjective: str = Field(default="", max_length=4000)
    objective: str = Field(default="", max_length=4000)
    assessment: str = Field(default="", max_length=4000)
    plan: str = Field(default="", max_length=4000)
    signed_at: datetime | None = None


class SignedVisitPlan(BaseModel):
    plan: str
    clinician: str
    signed_at: datetime
