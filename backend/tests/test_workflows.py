import json
import unittest
from datetime import timedelta
from urllib.parse import urlsplit

from app.main import app, state
from app.state import demo_now


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        state.reset()

    async def request(self, method, url, token=None, payload=None, *, status=200):
        target = urlsplit(url)
        headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
        body = b""
        if payload is not None:
            headers.append((b"content-type", b"application/json"))
            body = json.dumps(payload).encode()
        messages = []

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message):
            messages.append(message)

        await app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "scheme": "http",
            "method": method, "path": target.path, "raw_path": target.path.encode(),
            "query_string": target.query.encode(), "root_path": "", "headers": headers,
            "client": ("127.0.0.1", 50000), "server": ("127.0.0.1", 8000),
        }, receive, send)
        result = json.loads(b"".join(message.get("body", b"") for message in messages))
        self.assertEqual(messages[0]["status"], status, result)
        return result

    async def sign_in(self, account):
        response = await self.request("POST", "/api/auth/login", payload={
            "email": f"{account}@medbridge.demo", "password": "12345",
        })
        return response["token"]

    async def test_only_signed_plan_reaches_the_assigned_patient(self):
        patient = await self.sign_in("patient")
        other_patient = await self.sign_in("patient2")
        doctor = await self.sign_in("doctor")
        path = "/api/appointments/apt-1"
        draft = {"subjective": "Private clinician notes", "plan": "Follow-up visit"}
        await self.request("PUT", path + "/review", doctor, draft)
        await self.request("GET", path + "/visit-plan", patient, status=404)
        self.assertFalse((await self.request("GET", "/api/appointments", patient))[0]["has_signed_plan"])
        original_events = await self.request("GET", "/api/events", patient)
        self.assertNotIn("review.saved", {event["type"] for event in original_events})

        await self.request("PUT", path + "/review?sign=true", doctor, draft)
        summary = await self.request("GET", path + "/visit-plan", patient)
        self.assertEqual(summary["plan"], draft["plan"])
        self.assertEqual(summary["clinician"], "Dr. N. Perera")
        self.assertEqual(set(summary), {"plan", "clinician", "signed_at"})
        self.assertTrue((await self.request("GET", "/api/appointments", patient))[0]["has_signed_plan"])
        self.assertIn("review.signed", {event["type"] for event in await self.request("GET", "/api/events", patient)})
        await self.request("GET", path + "/review", patient, status=403)
        await self.request("GET", path + "/visit-plan", other_patient, status=404)
        await self.request("PATCH", path, patient, {"natural_language": "Friday evening"}, status=409)
        await self.request("DELETE", path, patient, status=409)

    async def test_home_collection_requires_address_and_scopes_order(self):
        patient = await self.sign_in("patient")
        other_patient = await self.sign_in("patient2")
        lab = await self.sign_in("lab")
        other_lab = await self.sign_in("lab2")
        day = (demo_now().date() + timedelta(days=2)).isoformat()
        payload = {
            "provider_id": "lab-colombo", "date": day, "time": "08:00", "care_pathway": "LOCAL_CLINICAL",
            "visit_mode": "home_collection", "test_panel": "Lipid Profile", "reason": "Synthetic order",
        }
        await self.request("POST", "/api/appointments", patient, payload, status=422)
        await self.request("POST", "/api/appointments", patient, {**payload, "pickup_address": "   "}, status=422)
        payload["pickup_address"] = "  12 Demo Lane, Colombo  "
        appointment = await self.request("POST", "/api/appointments", patient, payload, status=201)
        self.assertEqual(appointment["pickup_address"], "12 Demo Lane, Colombo")
        assigned = await self.request("GET", "/api/appointments", lab)
        self.assertEqual(assigned[0]["pickup_address"], appointment["pickup_address"])
        self.assertEqual(await self.request("GET", "/api/appointments", other_patient), [])
        self.assertEqual(await self.request("GET", "/api/appointments", other_lab), [])
        events = await self.request("GET", "/api/events", lab)
        self.assertTrue(all("Demo Lane" not in event["details"] for event in events))
        await self.request("POST", "/api/appointments", other_patient, payload, status=409)
        await self.request("DELETE", f"/api/appointments/{appointment['id']}", patient)
        own_history = await self.request("GET", "/api/appointments", patient)
        cancelled = next(item for item in own_history if item["id"] == appointment["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        await self.request("POST", "/api/appointments", other_patient, payload, status=201)

    async def test_verification_gates_the_shared_directory(self):
        patient = await self.sign_in("patient")
        provider = await self.sign_in("pending-doctor")
        admin = await self.sign_in("admin")
        await self.request("GET", "/api/appointments", provider, status=403)
        path = "/api/providers?type=doctor"
        self.assertNotIn("doctor-silva", {item["id"] for item in await self.request("GET", path, patient)})
        await self.request("POST", "/api/verifications/doctor-silva/decision", admin, {"decision": "approved"})
        self.assertEqual((await self.request("GET", "/api/auth/me", provider))["status"], "approved")
        self.assertIn("doctor-silva", {item["id"] for item in await self.request("GET", path, patient)})
