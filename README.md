
# MedBridge AI

MedBridge AI is a synthetic telemedicine demo with a React and TypeScript frontend and a FastAPI backend. It includes patient chat and attachments, provider verification, an admin review queue, and a shared appointment calendar.

All accounts, sessions, applications, documents, bookings, reviews, and events are stored in one backend process. A restart restores the seed data. Use only synthetic records and documents. Every account uses the public demo password `12345`.

## Run locally

Use Python 3.10+ and a Node version supported by the lockfile. Node 22.12+ is recommended.

In one terminal, start FastAPI from the repository root. Windows PowerShell commands:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On macOS or Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open [MedBridge AI](http://localhost:5173). Vite forwards requests under `/api` to FastAPI on port 8000. [OpenAPI documentation](http://127.0.0.1:8000/docs) is available while FastAPI is running.

If you updated from the earlier demo, restart both servers so Vite loads the proxy configuration and FastAPI loads the authentication routes. To keep an earlier in-memory backend running, start the updated FastAPI on a different port and set `MEDBRIDGE_API_TARGET` before starting Vite. In PowerShell, for a backend started on port 8001:

```powershell
$env:MEDBRIDGE_API_TARGET = "http://127.0.0.1:8001"
npm run dev
```

For a single-server run, execute `npm run build` from `frontend` and then start or restart FastAPI. Open [the built app](http://127.0.0.1:8000). Keep one backend worker so all sessions share the same state.

## Demo accounts

Use the quick-fill buttons on the sign-in page or sign in with one of these emails. The password for every account is `12345`.

| Account | Email |
| --- | --- |
| Patient | `patient@medbridge.demo` |
| Pending doctor | `pending-doctor@medbridge.demo` |
| Approved doctor | `doctor@medbridge.demo` |
| Pending laboratory | `pending-lab@medbridge.demo` |
| Approved laboratory | `lab@medbridge.demo` |
| Admin | `admin@medbridge.demo` |

Register a patient for immediate access or register a doctor or laboratory to start verification. Provider applications accept up to five PDF, JPG, or PNG files, 10 MB each. The admin can open sample documents for both pending providers and approve or reject a submission. Rejected providers can see the note and submit replacement documents. An open provider session picks up status changes within five seconds or when its tab receives focus.

Patients can select an approved, eligible provider from Chat or Schedule Calendar, book an available slot, and change or cancel that booking. Scheduling uses Sri Lanka time and generated demo slots. Doctors see assigned appointments and can save or sign SOAP reviews. Signing closes the visit and publishes the Plan to the booking patient under Schedule Calendar → History. The rest of the review stays in the clinician workspace. Laboratories see their orders and remaining slots. Home collection requires a pickup address, which appears on the assigned laboratory order. Use separate tabs to follow the workflow across roles. **Reset Demo Data** is available to the admin and ends all other sessions.

## REST API

Login and registration return a `token` and `user`. Send `Authorization: Bearer <token>` for protected requests.

| Operations | Endpoints |
| --- | --- |
| Health and sessions | `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Provider applications | `GET /api/verifications`, `POST /api/verifications/submit` (multipart), `GET /api/verifications/{id}/documents/{doc_id}`, `POST /api/verifications/{id}/decision` |
| Approved directory and availability | `GET /api/providers` (filters `type`, `specialty`, `pathway`), `GET /api/providers/{provider_id}/slots` (filters `start`, `days`) |
| Patient workspace | `GET /api/profile`, `PUT /api/profile`, `GET /api/chat/messages`, `POST /api/chat/messages` (multipart), `GET /api/chat/attachments/{id}` |
| Bookings and clinician reviews | `GET /api/appointments`, `POST /api/appointments`, `PATCH /api/appointments/{id}`, `DELETE /api/appointments/{id}`, `GET /api/appointments/{id}/review`, `PUT /api/appointments/{id}/review`, `GET /api/appointments/{id}/visit-plan` |
| Activity and reset | `GET /api/events`, `POST /api/reset` (admin) |


## Workflow checks

From `backend`, run `python -m unittest discover -s tests` with the virtual environment active. The tests run in an isolated process and cover approval gating, care plan visibility, home collection, and slot conflicts.
