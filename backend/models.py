from datetime import datetime
from typing import List, Optional, Literal
from sqlmodel import Field, Relationship, SQLModel

class UserBase(SQLModel):
    username: str = Field(index=True, unique=True)
    role: str = "user" # user or admin

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str
    
    samples: List["Sample"] = Relationship(back_populates="user")

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int

# ---

class SampleBase(SQLModel):
    name: str

class Sample(SampleBase, table=True):
    id: Optional[str] = Field(default=None, primary_key=True) # Using UUID string as primary key for compatibility with existing frontend expectations
    upload_date: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    
    user: Optional[User] = Relationship(back_populates="samples")
    files: List["SpectrumFile"] = Relationship(back_populates="sample")

# ---

class SpectrumFileBase(SQLModel):
    filename: str
    type: str

class SpectrumFile(SpectrumFileBase, table=True):
    id: Optional[str] = Field(default=None, primary_key=True) # UUID
    file_path: str # Path on disk
    is_selected: bool = True
    
    sample_id: Optional[str] = Field(default=None, foreign_key="sample.id")
    sample: Optional[Sample] = Relationship(back_populates="files")
