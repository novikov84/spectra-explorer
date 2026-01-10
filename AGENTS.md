# AGENTS.md — AI-Assisted Development Workflow

This project was built with AI-assisted development. The goal of this document is to explain:
- which AI tools were used,
- how they were used in the workflow,
- what prompts/patterns were effective,
- what guardrails were applied to keep the system correct and reproducible.

> Important: AI tools helped accelerate implementation, but all changes were reviewed, tested, and integrated through normal version control practices.

---

## Tools Used

### Coding assistants
- **ChatGPT**: architecture planning, OpenAPI-first API design, test strategy, code review checklists, documentation drafts.
- **Codex (in VS Code)**: small code completions, repetitive boilerplate (DTOs/schemas, CRUD patterns), refactors.

### API and contract workflow
- **FastAPI OpenAPI generator** (built-in): generated `openapi.json` from backend to validate contract alignment.
- **OpenAPI client generator** (e.g. `openapi-typescript` or similar): generated a typed frontend API client to centralize backend calls.

### Testing and CI
- **pytest**: unit and integration tests.
- **GitHub Actions**: automated test runs and deployment on passing builds.

> Replace or extend the list above with your real stack (Cursor, Claude, etc.) if you used them.

---

## Development Principles

AI assistance was used under the following rules:

1. **Contract-first development**
   - We treat OpenAPI as the source of truth for frontend-backend communication.
   - Frontend code uses a centralized typed API client generated from OpenAPI.

2. **Small, reviewable changes**
   - AI outputs were requested in small increments (single endpoint, single feature, single refactor).
   - Each change was integrated through a PR/commit that includes tests or updated docs.

3. **Test-driven validation**
   - Critical logic (parsing, inference, report selection, permissions) is backed by unit tests.
   - Key workflows (upload → parse → list → report export) are covered by integration tests.
   - AI-generated code was not accepted without tests or manual verification.

4. **Security and safety**
   - Authentication uses Argon2id for password hashing via passlib. Bcrypt is supported as a fallback for compatibility.
   - Authorization is workspace-scoped.
   - ZIP import is validated (size limits, zip-slip prevention).
   - Uploaded files are treated as untrusted input.

5. **Reproducibility**
   - Report items include processing parameter snapshots and engine version.
   - Export artifacts are stored and linked in the database.

---

## Workflow (How AI Was Used)

### Step 1 — Design and scope
AI was used to:
- clarify the core use cases and non-goals,
- propose a minimal MVP that fits the rubric,
- propose a database model that supports guest vs user workspaces,
- outline a parser pipeline and report pipeline.

Outputs:
- `README.md` problem description
- architecture overview section
- initial entity list for DB schema

### Step 2 — Define the API contract (OpenAPI)
AI was used to:
- propose endpoint structure and request/response schemas,
- check that endpoints support frontend screens and workflows,
- identify missing fields (pagination, filters, job status, artifact URLs).

Outputs:
- `openapi.yaml` (or stable generated schema in repo)
- client generation plan for frontend

### Step 3 — Backend implementation (FastAPI)
AI was used to:
- scaffold FastAPI routers and Pydantic schemas,
- implement the import job lifecycle,
- implement workspace-scoped queries and permission checks,
- add report export endpoints.

Guardrail:
- every endpoint was validated against OpenAPI and covered by at least one test.

### Step 4 — Parsing + processing engine
AI was used to:
- port the original draft parsing logic into server-side code,
- propose test cases for DSC/DTA reading and type inference,
- propose robust error logging and structured import logs.

Guardrail:
- parsing behavior was compared with the original frontend-only prototype on the same sample archive.

### Step 5 — Frontend integration
AI was used to:
- refactor the UI to use a centralized API client,
- keep plotting components mostly intact while changing data sources,
- design screen-level state boundaries and caching strategy.

Guardrail:
- no direct `fetch()` scattered across components; all calls go through `apiClient`.

### Step 6 — Testing, containerization, deployment
AI was used to:
- propose docker-compose architecture and environment variables,
- propose CI pipelines with separate unit/integration jobs,
- propose smoke checks and deployment steps.

Guardrail:
- project must run end-to-end with `docker-compose up` using the documented instructions.

---

## Prompt Patterns That Worked

### 1) Contract-first endpoint generation
**Prompt**
- “Given this user story, propose OpenAPI endpoints and schemas. Include status codes, error models, pagination, and example payloads.”

Used for:
- imports job API
- sample/spectra listing API
- report export API

### 2) One feature at a time (backend)
**Prompt**
- “Implement `POST /imports` in FastAPI following this OpenAPI schema. Add request validation, workspace auth, DB record creation, and a unit test.”

Used for:
- auth flows
- imports flows
- report flows

### 3) Tests before refactor acceptance
**Prompt**
- “Write unit tests for these parsing helpers (DSC header parse, DTA decode, type inference). Then implement the helpers to satisfy tests.”

Used for:
- parser and inference logic
- regression tests against the prototype behavior

### 4) Security review checklist
**Prompt**
- “Review this endpoint for security issues: auth, permissions, zip-slip, input validation, file size, error handling. Provide fixes.”

Used for:
- zip upload
- artifact access
- guest workspace separation

---

## How AI Output Was Verified

For each AI-assisted change we used the following verification steps:

- **Static checks**: formatting/linting, type checking
- **Unit tests**: parser helpers, report selection logic, utility functions
- **Integration tests**: full workflows with database + storage
- **Manual smoke tests**:
  - login/register/guest
  - import example archive
  - plot spectra
  - add to report
  - export PDF

---

## MCP Usage

This project uses the Model Context Protocol (MCP) to provide AI tools with structured access to project context and development utilities.

MCP was used as a controlled interface between the AI assistant and the system, rather than relying on unstructured prompt-only interaction.

### MCP-exposed resources

The following resources were exposed to the AI via MCP:

- **OpenAPI specification**
  - The current OpenAPI schema (`openapi.json`) was exposed as a readable MCP resource.
  - This allowed the AI to inspect available endpoints, request/response models, and error handling.
  - MCP-assisted checks were used to ensure frontend requirements were fully reflected in the API contract.

- **Repository structure**
  - MCP provided read-only access to the repository tree and selected source files.
  - This was used for AI-assisted code review, refactoring suggestions, and consistency checks across frontend, backend, and parsing logic.

- **Test execution**
  - MCP exposed commands to run unit tests and integration tests.
  - AI-assisted workflows included analyzing failing tests and suggesting targeted fixes.

### Example MCP-assisted workflow

1. The OpenAPI schema was queried via MCP to confirm that all frontend use cases (imports, samples, spectra, reports) were supported.
2. Backend endpoints were implemented in FastAPI to match the schema.
3. MCP was used to run integration tests covering the workflow:
   - guest login
   - archive upload
   - spectrum parsing
   - report creation and export
4. Test output was analyzed via MCP to identify missing edge cases.

### Rationale

Using MCP ensured that AI assistance was:
- grounded in the actual project state,
- constrained to real files and schemas,
- reproducible and auditable.

This approach reduced hallucinations, improved contract consistency, and supported a test-driven development workflow.

## What Was Not Delegated to AI

- Final decisions about scope and tradeoffs
- Selection of deployment target and environment secrets handling
- Reviewing security boundaries and permission rules
- Deciding which scientific assumptions are acceptable for the MVP

---

## Reproducibility Notes

- The system runs locally via `docker-compose`.
- Tests run in CI for every PR and on main.
- The deployed environment mirrors the container configuration with production settings.

See:
- `README.md` for run/test/deploy instructions
- `openapi.yaml` (or exported `openapi.json`) for the API contract
- `/apps/api/tests` for unit/integration tests