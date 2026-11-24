
import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from secrets import compare_digest, token_urlsafe
from typing import Annotated
from urllib.parse import quote
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

from .models import (
    Appointment, AppointmentCreate, AppointmentPatch, Attachment, CarePathway, ChatMessage, ChatStatus,
    ClinicalReview, Credentials, Profile, Provider, ProviderType, Registration, Role, Session,
    SignedVisitPlan, Slot, Urgency, User, Verification, VerificationDecision, VerificationDetails, VisitMode,
)
from .state import AppState, DOCTOR_TIMES, LAB_TIMES, demo_now, timestamp

app = FastAPI(title="MedBridge AI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
state = AppState()
bearer = HTTPBearer(auto_error=False)
Token = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
DEMO_PASSWORD = b"12345"
MAX_FILE_SIZE = 10 * 1024 * 1024
FILE_SIGNATURES = {"application/pdf": b"%PDF-", "image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n"}


def require_user(credentials: HTTPAuthorizationCredentials | None) -> User:
    user_id = state.sessions.get(credentials.credentials) if credentials else None
    user = state.users.get(user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    return user


async def current_user(credentials: Token) -> User:
    return require_user(credentials)


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(user: User, *roles: Role) -> None:
    if user.role not in roles:
        raise HTTPException(403, "This action is unavailable for your role.")
    if user.status != "approved":
        raise HTTPException(403, "Admin approval is required for this action.")


def start_session(user: User) -> Session:
    token = token_urlsafe(32)
    state.sessions[token] = user.id
    return Session(token=token, user=user)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "MedBridge AI"}


@app.post("/api/auth/login", response_model=Session)
async def login(payload: Credentials):
    user_id = state.user_ids_by_email.get(payload.email.strip().casefold())
    if not user_id or not compare_digest(payload.password.encode(), DEMO_PASSWORD):
        raise HTTPException(401, "Email or password is incorrect.")
    user = state.users[user_id]
    state.add_event("auth.signed_in", "Signed in", user)
    return start_session(user)


@app.post("/api/auth/register", response_model=Session, status_code=201)
async def register(payload: Registration):
    email = payload.email.strip().casefold()
    name = payload.full_name.strip()
    if not name or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "Enter your name and a valid email address.")
    if not compare_digest(payload.password.encode(), DEMO_PASSWORD):
        raise HTTPException(422, "Use the demo password 12345.")
    if email in state.user_ids_by_email:
        raise HTTPException(409, "An account already exists for this email.")
    user = state.add_user(str(uuid4()), email, name, payload.role)
    state.add_event("auth.registered", f"Created a {user.role} account", user)
    return start_session(user)


@app.get("/api/auth/me", response_model=User)
async def me(user: CurrentUser):
    return user


@app.post("/api/auth/logout")
async def logout(credentials: Token, user: CurrentUser):
    if credentials:
        state.sessions.pop(credentials.credentials, None)
    state.add_event("auth.signed_out", "Signed out", user)
    return {"status": "signed_out"}


async def read_files(files: list[UploadFile]) -> list[tuple[str, str, bytes]]:
    if len(files) > 5:
        raise HTTPException(422, "Upload up to five files per submission.")
    result = []
    for upload in files:
        filename = (upload.filename or "attachment").replace("\\", "/").rsplit("/", 1)[-1][:180]
        kind = upload.content_type or ""
        signature = FILE_SIGNATURES.get(kind)
        if signature is None:
            raise HTTPException(415, f"{filename}: choose a PDF, JPG, or PNG.")
        content = await upload.read(MAX_FILE_SIZE + 1)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(413, f"{filename}: file exceeds 10 MB.")
        if not content.startswith(signature):
            raise HTTPException(415, f"{filename}: file content does not match its type.")
        result.append((filename, kind, content))
    return result


def file_response(meta: Attachment, content: bytes) -> Response:
    return Response(content=content, media_type=meta.content_type, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(meta.filename, safe='')}",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })


@app.get("/api/verifications", response_model=list[Verification])
async def verifications(user: CurrentUser):
    if user.role == "admin":
        return sorted(
            (item for item in state.verifications.values() if item.submitted_at),
            key=lambda item: (item.status != "pending", item.submitted_at),
        )
    if user.role in ("doctor", "lab"):
        return [state.verifications[user.id]]
    raise HTTPException(403, "Verification is available to providers and admins.")


@app.post("/api/verifications/submit", response_model=Verification)
async def submit_verification(
    credentials: Token,
    registration_number: Annotated[str, Form(min_length=1, max_length=100)],
    authority: Annotated[str, Form(min_length=1, max_length=120)],
    jurisdiction: Annotated[str, Form(min_length=1, max_length=80)],
    files: Annotated[list[UploadFile], File()],
    specialty: Annotated[str, Form(max_length=100)] = "",
    global_consult: Annotated[bool, Form()] = False,
    test_panels: Annotated[str, Form(max_length=600)] = "",
    lab_visit: Annotated[bool, Form()] = False,
    home_collection: Annotated[bool, Form()] = False,
):
    user = require_user(credentials)
    if user.role not in ("doctor", "lab") or user.status == "approved":
        raise HTTPException(403, "Only unapproved providers can submit an application.")
    panels = list(dict.fromkeys(panel.strip() for panel in test_panels.split(",") if panel.strip()))
    details = VerificationDetails(
        registration_number=registration_number.strip(), authority=authority.strip(), jurisdiction=jurisdiction.strip(),
        specialty=specialty.strip() if user.role == "doctor" else "",
        global_consult=global_consult and user.role == "doctor",
        test_panels=panels if user.role == "lab" else [],
        lab_visit=lab_visit and user.role == "lab", home_collection=home_collection and user.role == "lab",
    )
    if not all((details.registration_number, details.authority, details.jurisdiction)):
        raise HTTPException(422, "Enter the registration number, issuing authority, and jurisdiction.")
    if user.role == "doctor" and not details.specialty:
        raise HTTPException(422, "Enter your specialty.")
    if user.role == "lab" and (not panels or not (lab_visit or home_collection)):
        raise HTTPException(422, "Enter test panels and choose at least one collection option.")
    if not files:
        raise HTTPException(422, "Attach at least one verification document.")
    uploads = await read_files(files)
    user = require_user(credentials)
    if user.status == "approved":
        raise HTTPException(409, "This provider has already been approved.")
    application = state.verifications[user.id]
    documents = []
    stored = {}
    for filename, kind, content in uploads:
        doc_id = str(uuid4())
        documents.append(Attachment(
            id=doc_id, filename=filename, content_type=kind, size=len(content),
            url=f"/api/verifications/{application.id}/documents/{doc_id}",
        ))
        stored[doc_id] = content
    updated = application.model_copy(update={
        "details": details, "documents": documents, "status": "pending",
        "submitted_at": timestamp(), "rejection_note": "",
    })
    state.verifications[user.id] = updated
    state.verification_files[user.id] = stored
    user.status = "pending"
    state.add_event("verification.submitted", "Verification application and documents submitted", user, status="review_required")
    return updated


@app.get("/api/verifications/{id}/documents/{doc_id}")
async def verification_document(id: str, doc_id: str, user: CurrentUser):
    if user.role != "admin" and user.id != id:
        raise HTTPException(404, "Document not found.")
    application = state.verifications.get(id)
    document = next((item for item in application.documents if item.id == doc_id), None) if application else None
    if document is None:
        raise HTTPException(404, "Document not found.")
    state.add_event("verification.document_viewed", "Verification document opened", user, id)
    return file_response(document, state.verification_files[id][doc_id])


@app.post("/api/verifications/{id}/decision", response_model=Verification)
async def decide_verification(id: str, payload: VerificationDecision, user: CurrentUser):
    require_role(user, "admin")
    application = state.verifications.get(id)
    if application is None or not application.submitted_at:
        raise HTTPException(404, "No submitted application for this provider.")
    if application.status != "pending":
        raise HTTPException(409, "This application has already been decided.")
    if payload.submitted_at is not None and payload.submitted_at != application.submitted_at:
        raise HTTPException(409, "The provider submitted new documents. Review the latest submission first.")
    updated = application.model_copy(update={
        "status": payload.decision,
        "rejection_note": payload.note.strip() if payload.decision == "rejected" else "",
    })
    state.verifications[id] = updated
    state.users[application.provider_id].status = payload.decision
    state.add_event(f"verification.{payload.decision}", f"{application.provider_type.title()} application {payload.decision}", user, id,
                    status="blocked" if payload.decision == "rejected" else "allowed")
    return updated


def as_provider(application: Verification) -> Provider | None:
    details = application.details
    if application.status != "approved" or details is None:
        return None
    doctor = application.provider_type == "doctor"
    pathways: list[CarePathway] = ["LOCAL_CLINICAL"]
    if doctor and details.global_consult:
        pathways.append("GLOBAL_CONSULT")
    modes: list[VisitMode] = ["consultation"] if doctor else []
    if details.lab_visit:
        modes.append("lab_visit")
    if details.home_collection:
        modes.append("home_collection")
    return Provider(
        id=application.provider_id, name=application.provider_name, type=application.provider_type,
        specialty=details.specialty, jurisdiction=details.jurisdiction, authority=details.authority,
        slmc_verified=doctor and details.jurisdiction.casefold() == "sri lanka"
        and details.authority.casefold() in {"slmc", "sri lanka medical council"},
        pathways=pathways, test_panels=details.test_panels, visit_modes=modes,
    )


def get_provider(provider_id: str) -> Provider:
    application = state.verifications.get(provider_id)
    provider = as_provider(application) if application else None
    if provider is None:
        raise HTTPException(404, "Approved provider not found.")
    return provider


@app.get("/api/providers", response_model=list[Provider])
async def providers(user: CurrentUser, type: ProviderType | None = None, specialty: str | None = None, pathway: CarePathway | None = None):
    require_role(user, "patient", "doctor", "lab", "admin")
    result = []
    for application in state.verifications.values():
        provider = as_provider(application)
        if provider is None or (type and provider.type != type) or (pathway and pathway not in provider.pathways):
            continue
        if specialty and not any(specialty.casefold() in item.casefold() for item in [provider.specialty, *provider.test_panels]):
            continue
        result.append(provider)
    return sorted(result, key=lambda item: item.name)


def available_times(provider: Provider, day: date, patient_id: str | None = None, excluded_id: str | None = None) -> list[time]:
    now = demo_now()
    busy = {
        item.time for item in state.appointments.values()
        if item.id != excluded_id and item.status != "cancelled" and item.date == day
        and (item.provider_id == provider.id or item.patient_id == patient_id)
    }
    times = DOCTOR_TIMES if provider.type == "doctor" else LAB_TIMES
    return [slot for slot in times if slot not in busy and datetime.combine(day, slot, now.tzinfo) > now]


@app.get("/api/providers/{provider_id}/slots", response_model=list[Slot])
async def provider_slots(
    provider_id: str, user: CurrentUser, start: date | None = None, days: Annotated[int, Query(ge=1, le=31)] = 7,
):
    require_role(user, "patient", "doctor", "lab", "admin")
    provider = get_provider(provider_id)
    first_day = start or demo_now().date()
    if first_day > demo_now().date() + timedelta(days=365):
        raise HTTPException(422, "Choose a date within the next year.")
    return [
        Slot(date=day, time=slot)
        for offset in range(days)
        for day in [first_day + timedelta(days=offset)]
        for slot in available_times(provider, day, user.id if user.role == "patient" else None)
    ]


@app.get("/api/profile", response_model=Profile)
async def get_profile(user: CurrentUser):
    require_role(user, "patient")
    state.add_event("profile.viewed", "Patient profile opened", user)
    return state.profiles[user.id]


@app.put("/api/profile", response_model=Profile)
async def update_profile(profile: Profile, user: CurrentUser):
    require_role(user, "patient")
    if not profile.full_name.strip() or not profile.country.strip():
        raise HTTPException(422, "Enter a name and country.")
    user.full_name = profile.full_name.strip()
    state.profiles[user.id] = profile
    state.add_event("profile.updated", "Patient profile and consent preferences updated", user)
    return profile


@app.get("/api/chat/messages", response_model=list[ChatMessage])
async def get_messages(user: CurrentUser):
    require_role(user, "patient")
    return state.messages[user.id]


def triage(text: str) -> tuple[ChatStatus, str]:
    lower = text.casefold().replace("’", "'")
    emergency_terms = (
        "chest pain", "cannot breathe", "can't breathe", "severe breathing", "severe shortness of breath",
        "stroke", "face drooping", "dengue bleeding", "black stool", "fainting", "suicidal",
    )
    urgency: Urgency = "ROUTINE"
    pathway: CarePathway = "LOCAL_CLINICAL"
    if any(
        re.search(rf"\b{re.escape(term)}\b", re.sub(rf"\b(?:no|without|denies)\s+{re.escape(term)}\b", "", lower))
        for term in emergency_terms
    ):
        urgency = "EMERGENCY"
        reply = "Emergency signs detected. Call your local emergency number now. Do not delay professional care."
    elif any(term in lower for term in ("fever", "dengue", "vomiting", "dehydrated")):
        urgency = "URGENT"
        reply = "This may need local clinical assessment. Arrange prompt evaluation."
    elif any(term in lower for term in ("anxiety", "anxious", "stress", "depressed", "therapy", "mental")):
        pathway = "GLOBAL_CONSULT"
        reply = "You can look for a verified clinician for a mental health consultation."
    else:
        reply = "You can book a verified clinician to review your intake. For sudden or severe symptoms, seek urgent care."
    return ChatStatus(urgency=urgency, care_pathway=pathway, human_review=True), reply


@app.post("/api/chat/messages", response_model=ChatMessage)
async def post_message(credentials: Token, text: Annotated[str, Form(max_length=10000)] = "", files: list[UploadFile] = File(default=[])):
    require_role(require_user(credentials), "patient")
    text = text.strip()
    if not text and not files:
        raise HTTPException(400, "Enter a message or attach a file.")
    uploads = await read_files(files)
    user = require_user(credentials)
    attachments = []
    for filename, kind, content in uploads:
        doc_id = str(uuid4())
        item = Attachment(id=doc_id, filename=filename, content_type=kind, size=len(content), url=f"/api/chat/attachments/{doc_id}")
        state.attachments[item.id] = (user.id, item, content)
        attachments.append(item)
    messages = state.messages[user.id]
    messages.append(ChatMessage(
        id=str(uuid4()), role="user", text=text or "Attached file", timestamp=timestamp(), attachments=attachments,
    ))
    result, reply = triage(text)
    reply += f" Received {len(attachments)} attachment(s)." if attachments else ""
    assistant = ChatMessage(id=str(uuid4()), role="assistant", text=reply, timestamp=timestamp(), status=result)
    messages.append(assistant)
    emergency = result.urgency == "EMERGENCY"
    state.add_event(
        "red_flag_guard" if emergency else "chat.triaged",
        f"Urgency={result.urgency}, pathway={result.care_pathway}, attachments={len(attachments)}",
        user, status="review_required" if emergency else "allowed",
    )
    return assistant


@app.get("/api/chat/attachments/{attachment_id}")
async def get_attachment(attachment_id: str, user: CurrentUser):
    require_role(user, "patient")
    stored = state.attachments.get(attachment_id)
    if stored is None or stored[0] != user.id:
        raise HTTPException(404, "Attachment not found.")
    state.add_event("chat.attachment_viewed", "Chat attachment opened", user)
    return file_response(stored[1], stored[2])


@app.get("/api/appointments", response_model=list[Appointment])
async def get_appointments(user: CurrentUser):
    require_role(user, "patient", "doctor", "lab")
    appointments = (
        item for item in state.appointments.values()
        if (item.patient_id == user.id if user.role == "patient" else item.provider_id == user.id)
    )
    return sorted(appointments, key=lambda item: (item.date, item.time))


def check_slot(provider: Provider, day: date, slot: time, patient_id: str, excluded_id: str | None = None) -> None:
    if slot.tzinfo is not None or day > demo_now().date() + timedelta(days=365):
        raise HTTPException(422, "Choose a Sri Lanka time within the next year.")
    if slot not in available_times(provider, day, patient_id, excluded_id):
        raise HTTPException(409, "This slot is no longer available. Choose another time.")


@app.post("/api/appointments", response_model=Appointment, status_code=201)
async def create_appointment(payload: AppointmentCreate, user: CurrentUser):
    require_role(user, "patient")
    provider = get_provider(payload.provider_id)
    if payload.care_pathway not in provider.pathways or payload.visit_mode not in provider.visit_modes:
        raise HTTPException(422, "This provider does not offer the selected care pathway or visit type.")
    if payload.care_pathway == "LOCAL_CLINICAL" and state.profiles[user.id].country.strip().casefold() != provider.jurisdiction.casefold():
        raise HTTPException(422, "Choose a local provider in your profile jurisdiction.")
    if (provider.type == "lab" and payload.test_panel not in provider.test_panels) or (provider.type == "doctor" and payload.test_panel is not None):
        raise HTTPException(422, "Select a test panel offered by the laboratory.")
    if not payload.reason.strip():
        raise HTTPException(422, "Enter a reason for the visit.")
    address = (payload.pickup_address or "").strip() or None
    if payload.visit_mode == "home_collection" and not address:
        raise HTTPException(422, "Enter a pickup address for home sample collection.")
    if payload.visit_mode != "home_collection" and address:
        raise HTTPException(422, "A pickup address is only needed for home sample collection.")
    check_slot(provider, payload.date, payload.time, user.id)
    appointment = Appointment(
        id=str(uuid4()), patient_id=user.id, patient_name=user.full_name, provider_type=provider.type,
        clinician=provider.name, specialty=provider.specialty or payload.test_panel or "Laboratory",
        **payload.model_dump(exclude={"pickup_address"}), pickup_address=address,
    )
    state.appointments[appointment.id] = appointment
    state.add_event("appointment.booked", f"Booked {provider.name} for {appointment.date} at {appointment.time:%H:%M}", user, provider.id)
    return appointment


def patient_appointment(appointment_id: str, user: User) -> Appointment:
    require_role(user, "patient")
    appointment = state.appointments.get(appointment_id)
    if appointment is None or appointment.patient_id != user.id:
        raise HTTPException(404, "Appointment not found.")
    return appointment


def reschedule_preference(text: str, appointment: Appointment, provider: Provider) -> tuple[date, time]:
    weekdays = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    preference = re.fullmatch(
        r"(?:(?:please )?(?:move|reschedule)(?: (?:my|the|this|next|appointment|visit|it))* to )?"
        r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?: (morning|afternoon|evening))?[.!]?",
        " ".join(text.casefold().split()),
    )
    if preference is None:
        raise HTTPException(422, "Enter a weekday and optional time of day, such as “move to Friday evening”.")
    weekday, period = preference.groups()
    hour_ranges = {"morning": (0, 12), "afternoon": (12, 17), "evening": (17, 24), None: (0, 24)}
    start_hour, end_hour = hour_ranges[period]
    today = demo_now().date()
    first = today + timedelta(days=(weekdays.index(weekday) - today.weekday()) % 7)
    for week in range(5):
        day = first + timedelta(weeks=week)
        for slot in available_times(provider, day, appointment.patient_id, appointment.id):
            if start_hour <= slot.hour < end_hour and (day, slot) != (appointment.date, appointment.time):
                return day, slot
    raise HTTPException(409, "No matching slot is available. Choose a date and time directly.")


@app.patch("/api/appointments/{appointment_id}", response_model=Appointment)
async def patch_appointment(appointment_id: str, payload: AppointmentPatch, user: CurrentUser):
    appointment = patient_appointment(appointment_id, user)
    if appointment.status == "cancelled":
        raise HTTPException(409, "This appointment was cancelled.")
    if appointment.has_signed_plan:
        raise HTTPException(409, "This visit has a signed care plan. Book a new appointment for follow-up.")
    provider = get_provider(appointment.provider_id)
    if payload.natural_language and payload.date is None and payload.time is None:
        day, slot = reschedule_preference(payload.natural_language, appointment, provider)
    elif payload.natural_language is None and payload.date is not None and payload.time is not None:
        day, slot = payload.date, payload.time
    else:
        raise HTTPException(422, "Provide a date and time or a scheduling preference.")
    check_slot(provider, day, slot, user.id, appointment.id)
    if (day, slot) == (appointment.date, appointment.time):
        return appointment
    updated = appointment.model_copy(update={"date": day, "time": slot, "status": "rescheduled"})
    state.appointments[appointment_id] = updated
    state.add_event("appointment.rescheduled", f"Moved {provider.name} booking to {day} at {slot:%H:%M}", user, provider.id)
    return updated


@app.delete("/api/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, user: CurrentUser):
    appointment = patient_appointment(appointment_id, user)
    if appointment.has_signed_plan:
        raise HTTPException(409, "This visit has a signed care plan and cannot be cancelled.")
    if appointment.status != "cancelled":
        state.appointments[appointment_id] = appointment.model_copy(update={"status": "cancelled"})
        state.add_event("appointment.cancelled", f"Cancelled booking with {appointment.clinician}", user, appointment.provider_id)
    return {"deleted": appointment_id}


def doctor_appointment(appointment_id: str, user: User) -> Appointment:
    require_role(user, "doctor")
    appointment = state.appointments.get(appointment_id)
    if appointment is None or appointment.provider_id != user.id:
        raise HTTPException(404, "Appointment not found.")
    return appointment


@app.get("/api/appointments/{appointment_id}/review", response_model=ClinicalReview)
async def get_review(appointment_id: str, user: CurrentUser):
    doctor_appointment(appointment_id, user)
    state.add_event("review.viewed", "Clinician opened an assigned visit review", user)
    return state.reviews.get(appointment_id, ClinicalReview())


@app.put("/api/appointments/{appointment_id}/review", response_model=ClinicalReview)
async def save_review(appointment_id: str, payload: ClinicalReview, user: CurrentUser, sign: bool = False):
    appointment = doctor_appointment(appointment_id, user)
    previous = state.reviews.get(appointment_id)
    if appointment.status == "cancelled" or (previous and previous.signed_at):
        raise HTTPException(409, "This review is closed.")
    if sign and not payload.plan.strip():
        raise HTTPException(422, "Enter a care plan before signing.")
    review = payload.model_copy(update={"signed_at": timestamp() if sign else None})
    state.reviews[appointment_id] = review
    if sign:
        state.appointments[appointment_id] = appointment.model_copy(update={"has_signed_plan": True})
        state.add_event("review.signed", "Clinician signed and shared the care plan", user, appointment.patient_id)
    else:
        state.add_event("review.saved", "Clinician saved a review draft", user)
    return review


@app.get("/api/appointments/{appointment_id}/visit-plan", response_model=SignedVisitPlan)
async def get_visit_plan(appointment_id: str, user: CurrentUser):
    appointment = patient_appointment(appointment_id, user)
    review = state.reviews.get(appointment.id)
    if review is None or review.signed_at is None:
        raise HTTPException(404, "A signed care plan is not available for this visit.")
    state.add_event("review.plan_viewed", "Patient opened the signed care plan", user)
    return SignedVisitPlan(plan=review.plan, clinician=appointment.clinician, signed_at=review.signed_at)


@app.get("/api/events")
async def get_events(user: CurrentUser):
    return [
        {key: value for key, value in event.items() if key != "audience"}
        for event in state.events if user.role == "admin" or user.id in event["audience"]
    ]


@app.post("/api/reset")
async def reset(credentials: Token, user: CurrentUser):
    require_role(user, "admin")
    state.reset()
    if credentials:
        state.sessions[credentials.credentials] = user.id
    state.add_event("demo.initialized", "Demo data restored", state.users[user.id])
    return {"status": "reset"}


frontend_build = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_build.is_dir():
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="frontend")
