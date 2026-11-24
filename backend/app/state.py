
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

from .models import (
    Appointment, Attachment, ChatMessage, ClinicalReview, Profile, ProviderType, Role, User,
    Verification, VerificationDetails,
)

DEMO_ZONE = timezone(timedelta(hours=5, minutes=30))
DOCTOR_TIMES = (time(9, 30), time(11), time(14), time(16), time(18), time(19))
LAB_TIMES = (time(8), time(9, 30), time(11), time(14), time(18))


def demo_now() -> datetime:
    return datetime.now(DEMO_ZONE)


def timestamp() -> datetime:
    return datetime.now(timezone.utc)


def sample_pdf(label: str) -> bytes:
    stream = f"BT /F1 18 Tf 55 750 Td ({label}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    positions = [0]
    for index, item in enumerate(objects, 1):
        positions.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode() + item + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(positions)}\n0000000000 65535 f \n".encode())
    for position in positions[1:]:
        pdf.extend(f"{position:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(positions)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(pdf)


class AppState:
    def __init__(self):
        self.reset()

    def add_user(self, user_id: str, email: str, name: str, role: Role) -> User:
        provider = role in ("doctor", "lab")
        user = User(id=user_id, email=email, full_name=name, role=role, status="pending" if provider else "approved")
        self.users[user.id] = user
        self.user_ids_by_email[email] = user.id
        if role == "patient":
            self.profiles[user.id] = Profile(full_name=name, age=0, country="Sri Lanka")
            self.messages[user.id] = []
        if role == "doctor" or role == "lab":
            self.verifications[user.id] = Verification(
                id=user.id, provider_id=user.id, provider_name=name, provider_type=role, status="pending",
            )
        return user

    def reset(self):
        self.users: dict[str, User] = {}
        self.user_ids_by_email: dict[str, str] = {}
        self.sessions: dict[str, str] = {}
        self.profiles: dict[str, Profile] = {}
        self.messages: dict[str, list[ChatMessage]] = {}
        self.attachments: dict[str, tuple[str, Attachment, bytes]] = {}
        self.verifications: dict[str, Verification] = {}
        self.verification_files: dict[str, dict[str, bytes]] = {}
        self.appointments: dict[str, Appointment] = {}
        self.reviews: dict[str, ClinicalReview] = {}
        self.events: list[dict] = []

        patient = self.add_user("patient-amaya", "patient@medbridge.demo", "Amaya Fernando", "patient")
        self.add_user("patient-kavi", "patient2@medbridge.demo", "Kavi Senanayake", "patient")
        self.add_user("admin", "admin@medbridge.demo", "Demo Administrator", "admin")
        self.profiles[patient.id] = Profile(
            full_name=patient.full_name, age=34, country="Sri Lanka", allergies=["Penicillin", "Dust mites"],
            chronic_conditions=["Hypertension"], medications=["Losartan 50 mg"],
            consent={"data_sharing": True, "human_review": True, "emergency_contact": False},
        )
        now = timestamp()
        report = sample_pdf("MedBridge synthetic blood pressure report")
        attachment = Attachment(
            id="att-demo", filename="blood-pressure-report.pdf", content_type="application/pdf", size=len(report),
            url="/api/chat/attachments/att-demo",
        )
        self.attachments[attachment.id] = (patient.id, attachment, report)
        self.messages[patient.id] = [
            ChatMessage(id="msg-1", role="assistant", text="Hello Amaya. I’m your MedBridge care assistant. How are you feeling today?", timestamp=now - timedelta(minutes=18)),
            ChatMessage(id="msg-2", role="user", text="I have had a mild headache since yesterday. Here is my blood pressure report.", timestamp=now - timedelta(minutes=12), attachments=[attachment]),
            ChatMessage(id="msg-3", role="assistant", text="Thank you for sharing that. You can use the directory to arrange a clinician review.", timestamp=now - timedelta(minutes=10),
                        status={"urgency": "ROUTINE", "care_pathway": "LOCAL_CLINICAL", "human_review": True}),
        ]
        self.seed_provider("doctor-perera", "doctor@medbridge.demo", "Dr. N. Perera", "doctor", True,
                           VerificationDetails(registration_number="DEMO-SLMC-4108", authority="SLMC", jurisdiction="Sri Lanka", specialty="Internal Medicine"))
        self.seed_provider("doctor-chen", "doctor2@medbridge.demo", "Dr. Maya Chen", "doctor", True,
                           VerificationDetails(registration_number="DEMO-SMC-1129", authority="Singapore Medical Council", jurisdiction="Singapore", specialty="Mental Health", global_consult=True))
        self.seed_provider("doctor-silva", "pending-doctor@medbridge.demo", "Dr. L. Silva", "doctor", False,
                           VerificationDetails(registration_number="DEMO-SLMC-5113", authority="SLMC", jurisdiction="Sri Lanka", specialty="Dermatology"))
        self.seed_provider("lab-colombo", "lab@medbridge.demo", "Colombo Diagnostics", "lab", True,
                           VerificationDetails(registration_number="DEMO-PHSRC-320", authority="PHSRC", jurisdiction="Sri Lanka", test_panels=["Full Blood Count", "Lipid Profile", "Fasting Glucose"], lab_visit=True, home_collection=True))
        self.seed_provider("lab-lakeside", "lab2@medbridge.demo", "Lakeside Pathology", "lab", True,
                           VerificationDetails(registration_number="DEMO-PHSRC-351", authority="PHSRC", jurisdiction="Sri Lanka", test_panels=["Full Blood Count", "Urinalysis"], lab_visit=True))
        self.seed_provider("lab-crescent", "pending-lab@medbridge.demo", "Crescent Medical Laboratory", "lab", False,
                           VerificationDetails(registration_number="DEMO-PHSRC-487", authority="PHSRC", jurisdiction="Sri Lanka", test_panels=["Full Blood Count", "Liver Function"], lab_visit=True, home_collection=True))
        for appointment in (
            Appointment(id="apt-1", patient_id=patient.id, patient_name=patient.full_name, provider_id="doctor-perera",
                        provider_type="doctor", clinician="Dr. N. Perera", specialty="Internal Medicine",
                        date=demo_now().date() + timedelta(days=1), time=time(9, 30), care_pathway="LOCAL_CLINICAL",
                        reason="Blood pressure follow-up", notes="Bring your latest blood pressure log."),
            Appointment(id="apt-2", patient_id=patient.id, patient_name=patient.full_name, provider_id="doctor-chen",
                        provider_type="doctor", clinician="Dr. Maya Chen", specialty="Mental Health",
                        date=demo_now().date() + timedelta(days=4), time=time(18), care_pathway="GLOBAL_CONSULT",
                        reason="Wellbeing consultation", notes="Virtual session."),
        ):
            self.appointments[appointment.id] = appointment

    def seed_provider(self, user_id: str, email: str, name: str, role: ProviderType, approved: bool, details: VerificationDetails):
        user = self.add_user(user_id, email, name, role)
        user.status = "approved" if approved else "pending"
        application = self.verifications[user_id]
        document_id = f"doc-{user_id}"
        data = sample_pdf(f"Synthetic verification document: {name}")
        application.status = user.status
        application.details = details
        application.submitted_at = timestamp()
        application.documents = [Attachment(
            id=document_id, filename="sample-registration.pdf", content_type="application/pdf", size=len(data),
            url=f"/api/verifications/{user_id}/documents/{document_id}",
        )]
        self.verification_files[user_id] = {document_id: data}

    def add_event(self, event_type: str, details: str, actor: User, *audience: str, status: str = "allowed"):
        event_id = str(uuid4())
        self.events.insert(0, {
            "id": event_id, "type": event_type, "timestamp": timestamp().isoformat(), "details": details,
            "trace_id": f"MB-{event_id[:8].upper()}", "actor": actor.full_name, "status": status,
            "audience": {actor.id, *audience},
        })
