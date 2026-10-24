# Security Policy

## Overview
Laterlight handles personal administrative documents, financial records, and user account data. This project treats user-controlled document content as untrusted input and applies strict validation at every stage.

## Core safeguards
- File uploads are checked for MIME type, size limits, and file signatures.
- Untrusted document text is sanitized before being sent to the AI provider.
- User-scoped database queries enforce ownership checks before returning data.
- Secrets remain in `.env` and are never exposed through the browser or application logs.
- The project supports explicit allowlists for CORS origins and rejects untrusted origins.

## AI model safety
- The AI provider is isolated behind an abstraction to allow changes without affecting core business logic.
- Document prompts are bounded by `MAX_INPUT_CHARS` and output tokens are capped.
- Model responses are validated aggressively with Pydantic schemas before being stored.
- The app clearly marks model outputs as advisory and requires user review for legal, financial, or contractual decisions.

## Data handling
- Sensitive fields are not logged in plaintext.
- Documents and extracted text are treated as user data and are not retained longer than necessary for active workflows.
- User accounts and data are partitioned by `user_id` in the database.

## Reporting concerns
Please report vulnerabilities responsibly through the repository security channel. Do not expose private details in public issues.
