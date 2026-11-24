from datetime import datetime, timedelta
from copy import deepcopy

from .models import Appointment, Attachment, ChatMessage, Profile


def seed_profile() -> Profile:
    return Profile(
        full_name="Amaya Fernando",
        age=34,
        country="Sri Lanka",
        preferred_language="English",
        allergies=["Penicillin", "Dust mites"],
        chronic_conditions=["Hypertension"],
        medications=["Losartan 50 mg"],
        consent={"data_sharing": True, "human_review": True, "emergency_contact": False},
    )


def seed_messages() -> list[ChatMessage]:
    now = datetime.now()
    return [
        ChatMessage(
            id="msg-1",
            role="assistant",
            text="Hello Amaya. I’m your MedBridge care assistant. How are you feeling today?",
            timestamp=now - timedelta(minutes=18),
            status={"urgency": "ROUTINE", "care_pathway": "LOCAL_CLINICAL", "human_review": True},
        ),
        ChatMessage(
            id="msg-2",
            role="user",
            text="I have had a mild headache since yesterday. I also have my recent blood pressure report.",
            timestamp=now - timedelta(minutes=12),
            attachments=[],
        ),
        ChatMessage(
            id="msg-3",
            role="assistant",
            text="Thank you. A clinician will review the context. If you develop chest pain, severe shortness of breath, sudden weakness, or confusion, seek emergency care immediately.",
            timestamp=now - timedelta(minutes=10),
            status={"urgency": "ROUTINE", "care_pathway": "LOCAL_CLINICAL", "human_review": True},
        ),
    ]


def seed_appointments() -> list[Appointment]:
    today = datetime.now().date()
    return [
        Appointment(
            id="apt-1",
            date=(today + timedelta(days=1)).isoformat(),
            time="09:30",
            clinician="Dr. N. Perera",
            specialty="Internal Medicine",
            care_pathway="LOCAL_CLINICAL",
            reason="Hypertension follow-up",
            status="scheduled",
            notes="Bring your latest blood pressure log.",
        ),
        Appointment(
            id="apt-2",
            date=(today + timedelta(days=4)).isoformat(),
            time="18:00",
            clinician="Dr. Maya Chen",
            specialty="Mental Health",
            care_pathway="GLOBAL_CONSULT",
            reason="Wellbeing consultation",
            status="scheduled",
            notes="Virtual session.",
        ),
    ]


class AppState:
    def reset(self):
        self.profile = seed_profile()
        self.messages = seed_messages()
        self.appointments = seed_appointments()
        self.attachments: dict[str, dict] = {
            "att-demo": {
                "filename": "blood-pressure-report.pdf",
                "content_type": "application/pdf",
                "bytes": (
                    b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"
                    b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
                ),
            }
        }
        self.messages[1].attachments = [
            Attachment(
                id="att-demo",
                filename="blood-pressure-report.pdf",
                content_type="application/pdf",
                size=len(self.attachments["att-demo"]["bytes"]),
                url="/api/chat/attachments/att-demo",
            )
        ]
        self.events: list[dict] = [
            {
                "id": "evt-1",
                "type": "demo.initialized",
                "timestamp": datetime.now().isoformat(),
                "details": "Demo data restored",
            }
        ]

    def add_event(self, event_type: str, details: str):
        self.events.insert(
            0,
            {
                "id": f"evt-{len(self.events) + 1}",
                "type": event_type,
                "timestamp": datetime.now().isoformat(),
                "details": details,
            },
        )
