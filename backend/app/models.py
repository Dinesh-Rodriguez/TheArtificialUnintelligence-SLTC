from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Profile(BaseModel):
    full_name: str = Field(min_length=1)
    age: int = Field(ge=0, le=120)
    country: str = Field(min_length=1)
    preferred_language: str = "English"
    allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    consent: dict[str, bool] = Field(default_factory=dict)


class Attachment(BaseModel):
    id: str
    filename: str
    content_type: str
    size: int
    url: str


class ChatStatus(BaseModel):
    urgency: Literal["ROUTINE", "URGENT", "EMERGENCY"]
    care_pathway: Literal["LOCAL_CLINICAL", "GLOBAL_CONSULT"]
    human_review: bool


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    text: str
    timestamp: datetime
    attachments: list[Attachment] = Field(default_factory=list)
    status: ChatStatus | None = None


class AppointmentCreate(BaseModel):
    date: str
    time: str
    clinician: str
    specialty: str
    care_pathway: Literal["LOCAL_CLINICAL", "GLOBAL_CONSULT"]
    reason: str
    status: Literal["scheduled", "rescheduled", "cancelled"] = "scheduled"
    notes: str = ""


class Appointment(BaseModel):
    id: str
    date: str
    time: str
    clinician: str
    specialty: str
    care_pathway: Literal["LOCAL_CLINICAL", "GLOBAL_CONSULT"]
    reason: str
    status: Literal["scheduled", "rescheduled", "cancelled"]
    notes: str = ""


class AppointmentPatch(BaseModel):
    date: str | None = None
    time: str | None = None
    clinician: str | None = None
    specialty: str | None = None
    care_pathway: Literal["LOCAL_CLINICAL", "GLOBAL_CONSULT"] | None = None
    reason: str | None = None
    status: Literal["scheduled", "rescheduled", "cancelled"] | None = None
    notes: str | None = None
    natural_language: str | None = None
