# MedBridge AI

MedBridge AI is a human-centric telemedicine dashboard demo built with React, TypeScript, Vite, and FastAPI. It includes chat-based intake, PDF/JPG/PNG attachments, patient profile management, appointment scheduling, deterministic red-flag triage, and in-memory workflow events.

All application data is stored in memory and reset on backend restart.

## Project structure

```text
backend/
  app/main.py
  app/models.py
  app/state.py
  requirements.txt
frontend/
  src/App.tsx
  src/styles.css
  src/types.ts
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm

## Run the backend

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the environment:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

```bash
# macOS/Linux
source .venv/bin/activate
```

Install and start FastAPI:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API documentation is available at `http://localhost:8000/docs`.

## Run the frontend

Open a second terminal from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## REST API

- `GET /api/health`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/chat/messages`
- `POST /api/chat/messages`
- `GET /api/chat/attachments/{attachment_id}`
- `GET /api/appointments`
- `POST /api/appointments`
- `PATCH /api/appointments/{appointment_id}`
- `DELETE /api/appointments/{appointment_id}`
- `GET /api/events`
- `POST /api/reset`

## Demo notes

- PDF, JPG, and PNG uploads are accepted up to 10 MB.
- Red flags are triggered deterministically for configured emergency keywords such as chest pain, severe breathing difficulty, stroke signs, and dengue warning signs.
- Appointment natural-language rescheduling understands day names and morning, afternoon, or evening preferences.
