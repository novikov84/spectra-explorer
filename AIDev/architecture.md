# Architecture Overview

This project is a full-stack web application for importing, organizing, visualizing, processing, and reporting Bruker EPR spectra. The system is designed around ZIP archives that contain Bruker BES3T datasets (`.DSC/.DTA` pairs). It uses an API-driven architecture with a React frontend and a FastAPI backend, persistent storage, and reproducible report generation.

---

## High-Level Components

### Frontend (React + Vite)
**Responsibilities**
- User interface: authentication, navigation, dashboards, spectrum viewers, report builder.
- Data presentation: grouping spectra by type, selecting spectra, plotting 1D and 2D data, Rabi analysis UI, report selection UX.
- Centralized API communication: all backend calls go through a single typed API client module (generated from OpenAPI or implemented as a dedicated client layer).

**Key screens**
- Welcome: login, register, guest entry
- Dashboard: sample library (search/filter), import actions
- Import status: progress + logs
- Sample workspace: spectrum selection + viewers (1D, Rabi, 2D) + report selection
- Reports: assemble items, reorder, captions, export PDF

**Frontend state**
- Authentication/session state (user vs guest workspace)
- Cached sample/spectrum lists
- Viewer state (plot settings, selections)
- Report selection state (master + per-plot toggles)

---

### Backend (FastAPI)
**Responsibilities**
- Authentication and authorization (registered users + guest mode).
- Workspace scoping: private user workspace vs shared guest workspace.
- Import orchestration: accept ZIP uploads, run parsing pipeline, persist results.
- Data API: list samples, list spectra, fetch data arrays and metadata.
- Report API: create/edit reports, store report items, generate PDF exports.
- OpenAPI contract generation and enforcement.

**Service layout**
- `api/` routers: auth, imports, samples, spectra, reports
- `services/` domain logic: parsing, storage, report rendering
- `models/` database entities
- `schemas/` Pydantic request/response schemas
- optional `workers/` for background jobs

**Background jobs**
Parsing and report rendering can be performed asynchronously to keep API requests fast and reliable:
- `ImportJob`: upload → parse → persist → ready
- `ReportJob`: build report → render PDF → upload artifact → ready

This can be implemented with:
- a job table in Postgres + a worker process, or
- a queue system (e.g. Redis + RQ/Celery) if you want stronger job control.

---

## Database (Postgres)
The database stores metadata and application state, not necessarily raw numeric arrays (those can be stored in object storage).

**Main entities**
- **User**: registered identity
- **Workspace**: data scope
  - `type = user` (private) or `guest_shared` (shared)
- **Import**: import job record + logs
- **Sample**: logical grouping of spectra
- **Spectrum**: parsed spectrum metadata + references to stored arrays/files
- **ProcessingPreset** (optional but recommended): saved processing settings per experiment type
- **ProcessedView** (recommended for reproducibility): parameter snapshot + artifact refs
- **Report**: structured report (per sample or per user)
- **ReportItem**: ordered list of included plots, captions, parameter snapshots

**Why Postgres**
- Strong relational model for Samples/Spectra/Reports.
- JSONB support for flexible metadata from filenames and DSC headers.
- Easy integration with migrations (Alembic) and integration tests.

---

## Object Storage (S3-compatible)
Object storage is used for storing uploaded archives and generated artifacts, and optionally numeric arrays.

**Stored artifacts**
- Uploaded raw archive:
  - `raw/{workspaceId}/{importId}/archive.zip`
- Parsed outputs (recommended):
  - `data/{workspaceId}/{sampleId}/{spectrumId}/arrays.json` (or compressed binary)
  - `data/{workspaceId}/{sampleId}/{spectrumId}/meta.json`
- Report exports:
  - `artifacts/{workspaceId}/{reportId}/report.pdf`
- Rendered plot images for reports (optional, but recommended for PDF rendering):
  - `artifacts/{workspaceId}/{processedViewId}/plot.png`

**Local development**
- MinIO via docker-compose.

**Production**
- Any S3-compatible provider.

---

## Parsing Pipeline (ZIP → Samples → Spectra)
The parsing pipeline runs server-side and is responsible for converting uploaded ZIP archives into structured Samples and Spectra.

### Inputs
- ZIP archive containing Bruker BES3T datasets:
  - `.DSC` descriptor file
  - `.DTA` data file
  - typically multiple datasets organized in folders

### Steps
1. **Upload**
   - API receives the ZIP file and stores it in object storage.
   - A DB `Import` record is created with status `uploaded`.

2. **Enumerate + validate**
   - Worker opens ZIP safely (zip-slip prevention, size limits).
   - Builds a list of candidate datasets by finding `.DSC/.DTA` pairs.

3. **Parse BES3T**
   - Read `.DSC` header fields (dataset type, axis definitions, params).
   - Read `.DTA` binary data based on `.DSC` descriptor.
   - Infer spectrum experiment type (CW, EDFS, T1, T2, Rabi, HYSCORE, 2D) using the same inference rules as the original draft.

4. **Extract metadata**
   - Parse filename tokens and/or folder naming conventions:
     - sample identification
     - temperature, field, microwave frequency, attenuation (dB), pulse info (if present)
   - Store as JSONB on the `Spectrum` record.

5. **Create domain objects**
   - Samples are created per archive folder or derived naming convention.
   - Spectra are linked to their samples and stored by type.

6. **Persist**
   - Metadata goes to Postgres.
   - Raw arrays and large blobs go to object storage (recommended).
   - Import status transitions to `ready` (or `failed` with logs).

### Outputs
- Sample list visible in the Dashboard.
- Spectrum lists grouped by experiment type inside each Sample workspace.
- Raw arrays accessible for visualization.

---

## Viewer Data Flow (Frontend ↔ Backend)

1. Frontend requests:
   - `GET /samples` to list samples (with counts by type)
   - `GET /samples/{id}/spectra` to list spectra grouped by type
2. When plotting:
   - `GET /spectra/{id}` fetches metadata and data references
   - `GET /spectra/{id}/data` (or signed URL) streams arrays for plotting
3. Frontend renders:
   - 1D plots per type (normalize/offset/baseline toggles where applicable)
   - Rabi analysis panel (traces, FFT, masks, fitting UI)
   - 2D heatmaps and slices

All backend communication is centralized in a dedicated API client module in the frontend.

---

## Report Pipeline (Selections → Stored Report → PDF Export)

The reporting pipeline converts selected plots into a reproducible exported report.

### Core idea: reproducibility
A report item is not just an image. It must also capture:
- which spectrum it comes from
- which processing parameters were used
- the processing engine version

### Steps
1. **Report creation**
   - User clicks “Make report” from a Sample workspace.
   - Backend creates a `Report` record linked to the sample.

2. **Add items**
   - When a user toggles “include in report” for a plot:
     - Frontend sends a structured plot spec (spectrum id + processing params + view type).
     - Backend stores it as a `ReportItem` and optionally creates a `ProcessedView`.

3. **Render assets (optional but recommended)**
   - Backend generates plot images (PNG) for consistent PDF output.
   - Images are stored in object storage and referenced from DB.

4. **Export PDF**
   - Backend assembles the report:
     - title, sample metadata, sections per experiment type
     - plot images + captions + key metadata
   - Produces `report.pdf`, uploads to object storage, and returns a URL.

5. **Download**
   - Frontend provides the exported PDF link.

---

## System Architecture Diagram (Conceptual)

- **Web (React/Vite)**
  - UI + plotting + report selection
  - API client (contract-driven)

⬇ HTTP (OpenAPI-defined)

- **API (FastAPI)**
  - Auth + workspace scoping
  - Imports + samples + spectra + reports
  - Triggers jobs (parse/report)

⬇

- **DB (Postgres)**
  - Users, workspaces, samples, spectra metadata, reports

- **Object Storage (S3/MinIO)**
  - Uploaded ZIPs, arrays, artifacts (PDF/PNG)

- **Worker (optional process)**
  - Parses ZIP archives into spectra
  - Renders report assets and PDFs

---

## Design Choices and Rationale

- **Contract-first API (OpenAPI)** keeps frontend and backend aligned and supports code generation for a typed API client.
- **Workspace separation** enables both guest mode and private user accounts without mixing data.
- **Object storage** prevents the database from being overloaded with large numeric arrays and makes artifact handling simpler.
- **Server-side parsing** ensures consistent results, logging, and persistence for scientific workflows.
- **Reproducible reporting** makes the system useful for real research outputs (papers, internal reports, lab notebooks).