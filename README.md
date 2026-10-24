# Laterlight

Laterlight is a personal administration autopilot designed to turn invoices, notices, contracts, and follow-up requests into a structured action queue with evidence-backed review before approval.

## Product vision
- Upload documents and identify actionable items.
- Extract due dates, amounts, counterparties, and next steps.
- Prioritize work with due-date urgency and category-based filtering.
- Approve or revise generated follow-up drafts before completion.
- Keep the user experience polished and privacy-conscious.

## Tech stack
- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn-inspired UI, Lucide icons, Framer Motion
- Backend: FastAPI, Pydantic, SQLAlchemy 2, Alembic
- Database: PostgreSQL-ready with SQLite fallback for development
- AI: Tinker open-weight inference via the official Python SDK
- Tests: pytest, Vitest, React Testing Library

## Repository layout
- `frontend/` — React + Vite application
- `backend/` — FastAPI service and SQLAlchemy models
- `docs/` — architecture and deployment notes
- `BUILD_STATUS.md` — active build tracker

## Local setup

### 1. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 2. Backend
```bash
cd backend
python -m venv .venv
. .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Then create the local backend `.env` file and add the Tinker API key as described below.

## Tinker configuration

The backend reads `TINKER_API_KEY` and `TINKER_MODEL` from its environment or `backend/.env` using `python-dotenv`.

To add your key safely:

1. In the `backend/` directory, create or update `.env`.
2. Add a line like:

```env
TINKER_API_KEY=your_key_here
TINKER_MODEL=Qwen/Qwen3.5-4B
```

Important:
- Never paste the key into GitHub, chat, logs, or source files.
- Keep `.env` local and ignored by Git.
- The `.env.example` file contains placeholders only.

`Qwen/Qwen3.5-4B` is the configured development model. Before sampling, the backend checks Tinker's server capabilities and requires the selected model to be available for sampling; model availability can vary and is not assumed from this default.

## Demo mode
If `TINKER_API_KEY` is not configured, the backend uses deterministic demo extraction so the UI remains usable without a live model call. When credentials are present, Tinker errors are returned as sanitized provider errors; the backend does not silently switch providers.

Tinker output is parsed as JSON, validated against the backend extraction schema, and checked so any evidence excerpt occurs in the submitted text before the result is persisted or returned. Malformed or schema-invalid output receives one bounded repair request; provider/API errors do not trigger a retry. Automated tests mock the SDK and make no live or paid model calls.

## Architecture
See `docs/architecture.md` and `docs/deployment.md`.

## Security notes
- Raw files are not retained by default beyond minimal processing.
- All user-scoped queries are guarded by ownership checks.
- Prompt injection is mitigated by sanitizing document text before sending it to the model.
- Secret values remain in `.env` and are never exposed to the frontend.

## Contributing
- Run backend tests with `pytest`.
- Run frontend linting with `npm run lint`.
- Run frontend build with `npm run build`.
- Keep build status current in `BUILD_STATUS.md`.
