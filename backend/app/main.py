import re
from datetime import datetime
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .models import (
    Appointment,
    AppointmentCreate,
    AppointmentPatch,
    ChatMessage,
    Profile,
)
from .state import AppState

app = FastAPI(title="MedBridge AI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state = AppState()
state.reset()

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_FILE_SIZE = 10 * 1024 * 1024


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "MedBridge AI"}


@app.get("/api/profile", response_model=Profile)
def get_profile():
    return state.profile


@app.put("/api/profile", response_model=Profile)
def update_profile(profile: Profile):
    state.profile = profile
    state.add_event("profile.updated", "Patient profile and consent preferences updated")
    return state.profile


@app.get("/api/chat/messages", response_model=list[ChatMessage])
def get_messages():
    return state.messages


def triage(text: str) -> tuple[str, str, bool, str]:
    lower = text.lower()
    emergency_terms = [
        "chest pain", "cannot breathe", "can't breathe", "severe breathing",
        "stroke", "face drooping", "dengue bleeding", "black stool",
        "fainting", "suicidal",
    ]
    for term in emergency_terms:
        if term in lower:
            return (
                "EMERGENCY",
                "LOCAL_CLINICAL",
                True,
                "Emergency signs detected. Call your local emergency number now; if safe, keep the patient with you and do not delay professional care.",
            )
    fever_terms = ["fever", "dengue", "vomiting", "dehydrated"]
    mental_terms = ["anxiety", "stress", "depressed", "therapy", "mental"]
    if any(term in lower for term in fever_terms):
        return ("URGENT", "LOCAL_CLINICAL", True, "This may need local clinical assessment. Monitor symptoms and arrange prompt evaluation.")
    if any(term in lower for term in mental_terms):
        return ("ROUTINE", "GLOBAL_CONSULT", True, "A licensed mental-health clinician can provide a consultative review.")
    return ("ROUTINE", "LOCAL_CLINICAL", True, "A human clinician will review your intake. For sudden or severe symptoms, seek urgent care.")


@app.post("/api/chat/messages", response_model=ChatMessage)
async def post_message(
    text: Annotated[str | None, Form()] = None,
    files: list[UploadFile] = File(default=[]),
):
    if not text and not files:
        raise HTTPException(status_code=400, detail="Enter a message or attach a file.")

    stored_attachments = []
    for upload in files:
        content_type = upload.content_type
        if content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=415, detail=f"{upload.filename}: unsupported file type")
        content = await upload.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"{upload.filename}: file exceeds 10 MB")
        attachment_id = f"att-{len(state.attachments) + 1}"
        state.attachments[attachment_id] = {
            "filename": upload.filename or "attachment",
            "content_type": content_type,
            "bytes": content,
        }
        stored_attachments.append(
            {
                "id": attachment_id,
                "filename": upload.filename or "attachment",
                "content_type": content_type,
                "size": len(content),
                "url": f"/api/chat/attachments/{attachment_id}",
            }
        )

    user_message = ChatMessage(
        id=f"msg-{len(state.messages) + 1}",
        role="user",
        text=text or "Attached file",
        timestamp=datetime.now(),
        attachments=stored_attachments,
    )
    state.messages.append(user_message)

    urgency, pathway, human_review, reply = triage(text or "")
    attachment_note = f" I received {len(stored_attachments)} attachment(s)." if stored_attachments else ""
    assistant = ChatMessage(
        id=f"msg-{len(state.messages) + 1}",
        role="assistant",
        text=reply + attachment_note,
        timestamp=datetime.now(),
        status={"urgency": urgency, "care_pathway": pathway, "human_review": human_review},
    )
    state.messages.append(assistant)
    state.add_event(
        "chat.triaged",
        f"Urgency={urgency}; pathway={pathway}; attachments={len(stored_attachments)}",
    )
    return assistant


@app.get("/api/chat/attachments/{attachment_id}")
async def get_attachment(attachment_id: str):
    attachment = state.attachments.get(attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    filename = attachment["filename"]
    disposition = "inline" if attachment["content_type"].startswith("image/") else "inline"
    return Response(
        content=attachment["bytes"],
        media_type=attachment["content_type"],
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@app.get("/api/appointments", response_model=list[Appointment])
def get_appointments():
    return state.appointments


@app.post("/api/appointments", response_model=Appointment)
def create_appointment(payload: AppointmentCreate):
    appointment = Appointment(id=f"apt-{len(state.appointments) + 1}", **payload.model_dump())
    state.appointments.append(appointment)
    state.add_event("appointment.booked", f"Booked {appointment.specialty} for {appointment.date} {appointment.time}")
    return appointment


@app.patch("/api/appointments/{appointment_id}", response_model=Appointment)
def patch_appointment(appointment_id: str, payload: AppointmentPatch):
    appointment = next((item for item in state.appointments if item.id == appointment_id), None)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    updates = payload.model_dump(exclude_none=True)
    updates.pop("natural_language", None)
    nl = (payload.natural_language or "").lower()
    if nl:
        week_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
        for day, offset in week_map.items():
            if day in nl:
                from datetime import date, timedelta
                today = date.today()
                target = today + timedelta(days=(offset - today.weekday()) % 7)
                updates["date"] = target.isoformat()
                break
        if "evening" in nl:
            updates["time"] = "18:00"
        elif "morning" in nl:
            updates["time"] = "09:30"
        elif "afternoon" in nl:
            updates["time"] = "14:00"
        updates["status"] = "rescheduled"

    for key, value in updates.items():
        setattr(appointment, key, value)
    state.add_event("appointment.rescheduled", f"Updated appointment {appointment_id}")
    return appointment


@app.delete("/api/appointments/{appointment_id}")
def delete_appointment(appointment_id: str):
    appointment = next((item for item in state.appointments if item.id == appointment_id), None)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    state.appointments.remove(appointment)
    state.add_event("appointment.cancelled", f"Cancelled appointment {appointment_id}")
    return {"deleted": appointment_id}


@app.get("/api/events")
def get_events():
    return state.events


@app.post("/api/reset")
def reset():
    state.reset()
    return {"status": "reset"}
