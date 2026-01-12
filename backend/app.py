from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional, Union
from uuid import uuid4
from copy import deepcopy
import io
import zipfile
import json

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

SpectrumType = Literal["CW", "EDFS", "T1", "T2", "Rabi", "HYSCORE", "2D", "Unknown"]


class ParsedParams(BaseModel):
    sampleName: str
    temperatureK: Optional[float] = None
    fieldG: Optional[float] = None
    amplifierDb: Optional[float] = None
    pulseWidth: Optional[float] = None
    tokens: List[str] = []


class Spectrum1D(BaseModel):
    id: str
    filename: str
    type: SpectrumType
    parsedParams: Optional[ParsedParams] = None
    xLabel: str
    yLabel: str
    xData: List[float]
    realData: List[float]
    imagData: List[float]


class Spectrum2D(BaseModel):
    id: str
    filename: str
    type: SpectrumType
    parsedParams: Optional[ParsedParams] = None
    xLabel: str
    yLabel: str
    xData: List[float]
    yData: List[float]
    zData: List[List[float]]


Spectrum = Union[Spectrum1D, Spectrum2D]


class SpectrumData(BaseModel):
    xData: Optional[List[float]] = None
    realData: Optional[List[float]] = None
    imagData: Optional[List[float]] = None
    yData: Optional[List[float]] = None
    zData: Optional[List[List[float]]] = None


class SpectrumFile(BaseModel):
    id: str
    filename: str
    type: SpectrumType
    selected: bool = True


class Sample(BaseModel):
    id: str
    name: str
    uploadDate: Optional[datetime] = None
    fileCount: int
    spectraByType: Optional[dict[str, int]] = None


class ImportJob(BaseModel):
    id: str
    status: Literal["uploaded", "processing", "ready", "failed"]
    createdAt: datetime
    updatedAt: datetime
    error: Optional[str] = None
    logs: Optional[List[str]] = None


class AuthResponse(BaseModel):
    accessToken: str
    tokenType: str = "Bearer"


class ReportItem(BaseModel):
    id: str
    spectrumId: str
    view: str
    params: Optional[dict] = None


class Report(BaseModel):
    id: str
    name: str
    sampleId: str
    items: List[ReportItem] = []
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class ReportJob(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "failed"]
    error: Optional[str] = None
    artifactUrl: Optional[str] = None


class ProcessRequest(BaseModel):
    fileIds: List[str]


# In-memory seed data to let the frontend render without a real parser
seed_spectrum_1d = Spectrum1D(
    id="spec-1d-1",
    filename="Ag_sample_T1_test.DSC",
    type="T1",
    parsedParams=ParsedParams(sampleName="Ag_sample", tokens=["Ag", "sample", "T1", "test"]),
    xLabel="Time (ns)",
    yLabel="Intensity (a.u.)",
    xData=[0, 1, 2, 3, 4, 5],
    realData=[0.1, 0.4, 0.8, 1.0, 1.1, 1.2],
    imagData=[0, 0, 0, 0, 0, 0],
)

seed_spectrum_1d_rabi = Spectrum1D(
    id="spec-1d-2",
    filename="Ag_Rabi_example.DSC",
    type="Rabi",
    parsedParams=ParsedParams(sampleName="Ag_sample", tokens=["Ag", "Rabi", "example"]),
    xLabel="Time (ns)",
    yLabel="Intensity (a.u.)",
    xData=[0, 50, 100, 150, 200],
    realData=[0.0, 0.5, -0.2, 0.4, -0.1],
    imagData=[0, 0, 0, 0, 0],
)

seed_spectra: dict[str, Spectrum] = {
    seed_spectrum_1d.id: seed_spectrum_1d,
    seed_spectrum_1d_rabi.id: seed_spectrum_1d_rabi,
}

seed_files = [
    SpectrumFile(id="file-1", filename=seed_spectrum_1d.filename, type=seed_spectrum_1d.type),
    SpectrumFile(id="file-2", filename=seed_spectrum_1d_rabi.filename, type=seed_spectrum_1d_rabi.type),
]

seed_sample = Sample(
    id="sample-1",
    name="Demo Sample",
    uploadDate=datetime.utcnow(),
    fileCount=len(seed_files),
    spectraByType={"T1": 1, "Rabi": 1},
)

# In-memory stores
samples_store: Dict[str, Sample] = {seed_sample.id: seed_sample}
files_store: Dict[str, List[SpectrumFile]] = {seed_sample.id: seed_files}
spectra_store: Dict[str, Dict[str, Spectrum]] = {seed_sample.id: seed_spectra}
import_jobs: Dict[str, ImportJob] = {}


app = FastAPI(title="Spectra Explorer Backend (stub)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Spectra Explorer Backend API"}


@app.post("/auth/guest", response_model=AuthResponse)
def guest():
    return AuthResponse(accessToken="guest-token")


@app.post("/auth/login", response_model=AuthResponse)
def login(email: str, password: str):
    if not email or len(password or "") < 4:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthResponse(accessToken="demo-token")


import parsers

# ... existing code ...

def parse_archive(content: bytes) -> tuple[str, Dict[str, Spectrum], List[SpectrumFile], Dict[str, int]]:
    try:
        sample_name, raw_spectra, count = parsers.parse_zip_archive(content)
        
        spectra: Dict[str, Spectrum] = {}
        files: List[SpectrumFile] = []
        counts: Dict[str, int] = {}
        
        for raw in raw_spectra:
            spec_id = f"spec-{uuid4()}"
            
            # Convert parsed_params keys if needed or wrap
            pp = None
            if raw.parsed_params:
                pp = ParsedParams(**raw.parsed_params)
            
            if isinstance(raw, parsers.Spectrum1D):
                spec = Spectrum1D(
                    id=spec_id,
                    filename=raw.filename,
                    type=raw.type,
                    parsedParams=pp,
                    xLabel=raw.x_label,
                    yLabel=raw.y_label,
                    xData=raw.x_data,
                    realData=raw.real_data,
                    imagData=raw.imag_data
                )
            elif isinstance(raw, parsers.Spectrum2D):
                spec = Spectrum2D(
                    id=spec_id,
                    filename=raw.filename,
                    type=raw.type,
                    parsedParams=pp,
                    xLabel=raw.x_label,
                    yLabel=raw.y_label,
                    xData=raw.x_data,
                    yData=raw.y_data,
                    zData=raw.z_data
                )
            else:
                continue

            spectra[spec_id] = spec
            counts[spec.type] = counts.get(spec.type, 0) + 1
            files.append(SpectrumFile(id=f"file-{uuid4()}", filename=spec.filename, type=spec.type, selected=True))
            
        return sample_name, spectra, files, counts
        
    except Exception as e:
        print(f"Error parsing archive: {e}")
        return "Failed Sample", {}, [], {}

def infer_type_from_name(name: str) -> SpectrumType:
    # Deprecated, logic moved to parsers.py but keeping for safety if needed by other parts
    return parsers.infer_spectrum_type(name, {}, False)


@app.post("/imports", response_model=ImportJob, status_code=202)
async def upload_import(file: UploadFile = File(...)):
    now = datetime.utcnow()
    job_id = f"import-{uuid4()}"
    # Attempt to parse uploaded zip; if parsing fails, fall back to cloning seed data
    sample_id = f"sample-{uuid4()}"
    cloned_spectra: Dict[str, Spectrum] = {}
    cloned_files: List[SpectrumFile] = []
    counts: Dict[str, int] = {}
    sample_display_name = file.filename or "Uploaded Sample"

    parsed_any = False
    try:
        content = await file.read()
        sample_name, parsed_spectra, parsed_files, parsed_counts = parse_archive(content)
        if parsed_spectra:
            cloned_spectra = parsed_spectra
            cloned_files = parsed_files
            counts = parsed_counts
            parsed_any = True
            sample_display_name = sample_name
        else:
            parsed_any = False
    except Exception:
        parsed_any = False

    if not parsed_any:
        # Fallback: clone seed spectra
        for spec in seed_spectra.values():
            new_id = f"{spec.id}-{sample_id}"
            spec_copy = deepcopy(spec)
            spec_copy.id = new_id
            cloned_spectra[new_id] = spec_copy
            counts[spec_copy.type] = counts.get(spec_copy.type, 0) + 1
            cloned_files.append(
                SpectrumFile(
                    id=f"file-{uuid4()}",
                    filename=spec_copy.filename,
                    type=spec_copy.type,  # type: ignore[arg-type]
                    selected=True,
                )
            )

    sample = Sample(
        id=sample_id,
        name=sample_display_name,
        uploadDate=now,
        fileCount=len(cloned_files),
        spectraByType=counts,
    )
    samples_store[sample_id] = sample
    files_store[sample_id] = cloned_files
    spectra_store[sample_id] = cloned_spectra
    job = ImportJob(id=job_id, status="ready", createdAt=now, updatedAt=now, logs=["Import accepted (stub)"])
    import_jobs[job_id] = job
    return job


@app.get("/samples", response_model=List[Sample])
def list_samples():
    return list(samples_store.values())


@app.get("/samples/{sample_id}/files", response_model=List[SpectrumFile])
def list_files(sample_id: str):
    if sample_id not in samples_store:
        raise HTTPException(status_code=404, detail="Sample not found")
    return files_store.get(sample_id, [])


@app.post("/samples/{sample_id}/process", response_model=ImportJob, status_code=202)
def process_files(sample_id: str, req: ProcessRequest):
    if sample_id not in samples_store:
        raise HTTPException(status_code=404, detail="Sample not found")
    now = datetime.utcnow()
    job_id = f"import-{uuid4()}"
    job = ImportJob(id=job_id, status="ready", createdAt=now, updatedAt=now, logs=["Processing complete"])
    import_jobs[job_id] = job
    # For stub: mark selected files as "processed" by mirroring existing spectra (no-op)
    return job


@app.get("/samples/{sample_id}/spectra")
def list_spectra(sample_id: str):
    if sample_id not in samples_store:
        raise HTTPException(status_code=404, detail="Sample not found")
    spectra_map = spectra_store.get(sample_id, {})
    spectra = [s for s in spectra_map.values()]
    return {"spectra": spectra}


@app.get("/spectra/{spectrum_id}", response_model=Spectrum)
def get_spectrum(spectrum_id: str):
    # search across all samples
    for spectra_map in spectra_store.values():
        if spectrum_id in spectra_map:
            return spectra_map[spectrum_id]
    raise HTTPException(status_code=404, detail="Spectrum not found")


@app.get("/spectra/{spectrum_id}/data", response_model=SpectrumData)
def get_spectrum_data(spectrum_id: str):
    for spectra_map in spectra_store.values():
        spec = spectra_map.get(spectrum_id)
        if spec:
            if isinstance(spec, Spectrum1D):
                return SpectrumData(xData=spec.xData, realData=spec.realData, imagData=spec.imagData)
            return SpectrumData(xData=spec.xData, yData=spec.yData, zData=spec.zData)
    raise HTTPException(status_code=404, detail="Spectrum not found")


@app.get("/reports", response_model=List[Report])
def list_reports():
    return []


@app.post("/reports", response_model=Report, status_code=201)
def create_report(name: str, sampleId: str):
    return Report(id=f"report-{uuid4()}", name=name, sampleId=sampleId, items=[], createdAt=datetime.utcnow())


@app.get("/reports/{report_id}/export/status", response_model=ReportJob)
def report_status(report_id: str):
    return ReportJob(id=report_id, status="done", artifactUrl="https://example.com/report.pdf")
