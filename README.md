# MedBridge AI — Jurisdiction-Aware Multi-Agent Telemedicine Platform

**Innodata AI Catalyst ’26 — University Track (Healthcare Domain)**

MedBridge AI is an event-driven, human-centric multi-agent telemedicine platform designed to alleviate global specialist deficits and clinician documentation burnout while maintaining strict clinical safety boundaries.

---

## Key Capabilities & Safety Architecture

- **Event-Driven Blackboard Topology:** Agents never call each other directly. State transitions are persisted in PostgreSQL and published via a central Event Bus (`intake.completed`, `triage.completed`, `appointment.rescheduled`, `consultation.ended`, `prescription.approved`).
- **Scoped Model Context Protocol (MCP) Servers:** All data access flows through permission-enforced MCP servers (`Records`, `Scheduling`, `Lab`, `Knowledge`, `Notification`), preventing prompt injection and unauthorized cross-patient reads.
- **Deterministic Non-LLM Guardrails:**
  - Real-time red-flag emergency interruption outside LLM control.
  - **Jurisdiction-Aware Care Routing (`LOCAL_CLINICAL` vs. `GLOBAL_CONSULT`):** Routes acute infectious/regional illnesses (e.g., dengue) to locally licensed physicians while unlocking verified cross-border specialists for mental health and consultative care.
  - Rule-based drug-allergy and interaction checking.
- **Mandatory Human-in-the-Loop Governance:** Unverified differential diagnoses are hidden from patients, and every prescription/SOAP note requires explicit physician review and digital sign-off.

---

## Repository Structure

```text
university-project/
├── project/
│   ├── main.py              # Phase 1 MVP entry point & event-bus bootstrap
│   └── requirements.txt     # Python dependencies
├── README.md                # Project overview & quickstart
└── docs/
    ├── Proposal.docx        # Official competition proposal (Submitted Nov 20, 2026)
    ├── Workflow.md          # End-to-end event, agent & MCP workflow specification
    └── PROJECT_DETAILS.md   # Architecture, database schema, risk & benchmark plan
```

---

## Quickstart (Phase 1 Setup)

```bash
cd project
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

---

## Timeline

- **20 November 2026:** Proposal Submission (`docs/Proposal.docx`) & Repository Initialization
