from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Literal, Optional, Union
from uuid import uuid4
from copy import deepcopy
import io
import os
import shutil
import zipfile
import json

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session, select

from database import create_db_and_tables, get_session
from models import User, UserCreate, UserRead, Sample, SpectrumFile
import parsers

# --- Configuration ---
SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60 # 30 days
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "data")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Security ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user_optional(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> Optional[User]:
    try:
        # Check for guest token
        if token == "guest-token":
            return None
            
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
        
    user = session.exec(select(User).where(User.username == username)).first()
    return user

async def get_current_user(user: Optional[User] = Depends(get_current_user_optional)) -> User:
    if not user:
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# --- Models (Pydantic for API) ---

SpectrumType = Literal["CW", "EDFS", "T1", "T2", "Rabi", "HYSCORE", "2D", "2D T1", "2D T2", "Unknown"]

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

class SpectrumFileModel(BaseModel):
    id: str
    filename: str
    type: SpectrumType
    selected: bool = True

class SampleModel(BaseModel):
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
    username: Optional[str] = None
    role: str = "guest"

# --- In-Memory Store (Guest) ---
# We keep this for guest users so they don't fill up the DB
guest_store: Dict[str, Dict] = {} # token -> { samples: {}, files: {}, spectra: {} }

def get_guest_store(token: str = "guest-token"):
    if token not in guest_store:
        guest_store[token] = {
            "samples": {},
            "files": {},
            "spectra": {}
        }
    return guest_store[token]

# --- App ---

app = FastAPI(title="Spectra Explorer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "Spectra Explorer Backend API (DB Integrated)"}

# --- Auth Endpoints ---

@app.post("/auth/guest", response_model=AuthResponse)
def guest():
    return AuthResponse(accessToken="guest-token", role="guest")

@app.post("/auth/register", response_model=UserRead)
def register(user: UserCreate, session: Session = Depends(get_session)):
    existing_user = session.exec(select(User).where(User.username == user.username)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, password_hash=hashed_password, role="user")
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

@app.post("/auth/login", response_model=AuthResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return AuthResponse(accessToken=access_token, tokenType="Bearer", username=user.username, role=user.role)


# --- Core Logic Functions ---

def parse_and_process(content: bytes, sample_id: str, save_to_disk: bool = False) -> tuple[str, Dict[str, Spectrum], List[SpectrumFileModel], Dict[str, int]]:
    # ... Same parsing logic as before ...
    try:
        sample_name, raw_spectra, count = parsers.parse_zip_archive(content)
        
        spectra: Dict[str, Spectrum] = {}
        files: List[SpectrumFileModel] = []
        counts: Dict[str, int] = {}
        
        for raw in raw_spectra:
            spec_id = f"spec-{uuid4()}"
            
             # Disk Persistence
            if save_to_disk:
                 # TODO: We'd need to serialize the single spectrum or save reference to original zip
                 # For simplicity, we might assume the zip is saved as a whole, 
                 # OR we save each parsed spectrum as a JSON/Pickle file for fast access.
                 # Let's save JSON for now if we want individual loading.
                 pass

            pp = None
            if raw.parsed_params:
                pp = ParsedParams(**raw.parsed_params)
            
            if isinstance(raw, parsers.Spectrum1D):
                spec = Spectrum1D(
                    id=spec_id, filename=raw.filename, type=raw.type, parsedParams=pp,
                    xLabel=raw.x_label, yLabel=raw.y_label, xData=raw.x_data,
                    realData=raw.real_data, imagData=raw.imag_data
                )
            elif isinstance(raw, parsers.Spectrum2D):
                 spec = Spectrum2D(
                    id=spec_id, filename=raw.filename, type=raw.type, parsedParams=pp,
                    xLabel=raw.x_label, yLabel=raw.y_label, xData=raw.x_data,
                    yData=raw.y_data, zData=raw.z_data
                )
            else:
                continue

            spectra[spec_id] = spec
            counts[spec.type] = counts.get(spec.type, 0) + 1
            files.append(SpectrumFileModel(id=f"file-{uuid4()}", filename=spec.filename, type=spec.type, selected=True))
            
        return sample_name, spectra, files, counts
    except Exception as e:
        print(f"Error parsing: {e}")
        return "Failed Sample", {}, [], {}

# --- Upload & Listing ---

@app.post("/imports", response_model=ImportJob, status_code=202)
async def upload_import(
    file: UploadFile = File(...), 
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session)
):
    now = datetime.utcnow()
    job_id = f"import-{uuid4()}"
    sample_id = f"sample-{uuid4()}"
    
    content = await file.read()
    
    # 1. Parse content
    sample_name, parsed_spectra, parsed_files, counts = parse_and_process(content, sample_id)
    if not parsed_spectra:
         raise HTTPException(status_code=400, detail="Failed to parse archive")

    display_name = file.filename or sample_name

    # 2. Storage Strategy
    if user:
        # --- LOGGED IN USER: DB & Disk Persistence ---
        
        # Save ZIP to Disk
        zip_path = os.path.join(UPLOAD_DIR, f"{sample_id}.zip")
        with open(zip_path, "wb") as f:
            f.write(content)
            
        # Create Sample Record
        sample_db = Sample(
            id=sample_id,
            name=display_name,
            upload_date=now,
            user_id=user.id
        )
        session.add(sample_db)
        
        # Create File Records (Metadata)
        # Note: We aren't saving individual JSONs yet to disk, we re-parse zip on load (inefficient but simple)
        # OR we assume we just store metadata for listing, and "load" operation reads the zip.
        for pf in parsed_files:
            file_db = SpectrumFile(
                id=pf.id,
                filename=pf.filename,
                type=pf.type,
                file_path=zip_path, # Point to the main zip
                sample=sample_db,
                is_selected=True
            )
            session.add(file_db)
        
        session.commit()
    
    else:
        # --- GUEST: In-Memory Store ---
        store = get_guest_store("guest-token") # Simplification: all guests share same store for now (or use random token)
        # Warning: Shared guest store is bad. In real app, issue random Guest UUID token.
        # Stick to shared for "demo" simplicity or user session? 
        # Making the 'guest-token' constant simplifies frontend, but means guests see each other's data.
        # User requested "test access" without username.
        
        sample_model = SampleModel(
            id=sample_id, name=display_name, uploadDate=now,
            fileCount=len(parsed_files), spectraByType=counts
        )
        store['samples'][sample_id] = sample_model
        store['files'][sample_id] = parsed_files
        store['spectra'][sample_id] = parsed_spectra

    return ImportJob(id=job_id, status="ready", createdAt=now, updatedAt=now, logs=["Import successful"])

@app.get("/samples", response_model=List[SampleModel])
def list_samples(
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session)
):
    if user:
        # DB Samples
        samples = session.exec(select(Sample).where(Sample.user_id == user.id)).all()
        # Convert DB models to Pydantic
        results = []
        for s in samples:
            # Reconstruct counts from files relationship or just store it? 
            # Recomputing from files list:
            counts = {}
            for f in s.files:
                counts[f.type] = counts.get(f.type, 0) + 1
                
            results.append(SampleModel(
                id=s.id,
                name=s.name,
                uploadDate=s.upload_date,
                fileCount=len(s.files),
                spectraByType=counts
            ))
        return results
    else:
        # Guest Samples
        store = get_guest_store()
        return list(store['samples'].values())

@app.get("/samples/{sample_id}/files", response_model=List[SpectrumFileModel])
def list_files(
    sample_id: str,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session)
):
    if user:
        s_db = session.get(Sample, sample_id)
        if not s_db or s_db.user_id != user.id:
            raise HTTPException(404, "Sample not found")
        
        return [
            SpectrumFileModel(id=f.id, filename=f.filename, type=f.type, selected=f.is_selected)
            for f in s_db.files
        ]
    else:
        store = get_guest_store()
        return store['files'].get(sample_id, [])

class ProcessRequest(BaseModel):
    fileIds: List[str]

@app.post("/samples/{sample_id}/process", status_code=202)
def process_files(
    sample_id: str,
    body: ProcessRequest,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session)
):
    if user:
        s_db = session.get(Sample, sample_id)
        if not s_db or s_db.user_id != user.id:
            raise HTTPException(404, "Sample not found")
        
        # Update selection
        for f in s_db.files:
            f.is_selected = f.id in body.fileIds
            session.add(f)
        session.commit()
    else:
        store = get_guest_store()
        if sample_id not in store['files']:
             raise HTTPException(404, "Sample not found")
        
        files = store['files'][sample_id]
        for f in files:
            f.selected = f.id in body.fileIds

    return {"status": "processing_complete"}

@app.get("/samples/{sample_id}/spectra")
def list_spectra(
    sample_id: str,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session)
):
    if user:
        s_db = session.get(Sample, sample_id)
        if not s_db or s_db.user_id != user.id:
            raise HTTPException(404, "Sample not found")
            
        # Get selected filenames
        selected_filenames = {f.filename for f in s_db.files if f.is_selected}
        
        zip_path = os.path.join(UPLOAD_DIR, f"{sample_id}.zip")
        if not os.path.exists(zip_path):
             raise HTTPException(404, "Data file missing")
             
        with open(zip_path, "rb") as f:
            content = f.read()
            _, spectra, _, _ = parse_and_process(content, sample_id)
            # Filter by selected filenames
            return {"spectra": [s for s in spectra.values() if s.filename in selected_filenames]}
            
    else:
        store = get_guest_store()
        spectra_map = store['spectra'].get(sample_id, {})
        files = store['files'].get(sample_id, [])
        selected_filenames = {f.filename for f in files if f.selected}
        
        return {"spectra": [s for s in spectra_map.values() if s.filename in selected_filenames]}

@app.delete("/samples/{sample_id}", status_code=204)
def delete_sample(
    sample_id: str,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session)
):
    if user:
        s_db = session.get(Sample, sample_id)
        if not s_db or s_db.user_id != user.id:
            raise HTTPException(404, "Sample not found")
            
        # Delete file from disk
        zip_path = os.path.join(UPLOAD_DIR, f"{sample_id}.zip")
        if os.path.exists(zip_path):
            os.remove(zip_path)
            
        session.delete(s_db)
        session.commit()
    else:
        # Guest delete
        store = get_guest_store()
        if sample_id in store['samples']:
            del store['samples'][sample_id]
        if sample_id in store['files']:
            del store['files'][sample_id]
        if sample_id in store['spectra']:
            del store['spectra'][sample_id]

# ... (Reports, etc. stubbed)
