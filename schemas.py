from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)

class UserLogin(BaseModel):
    email: str
    password: str

class EmployeeCreate(BaseModel):
    id: Optional[int] = None
    name: str = Field(min_length=1, max_length=120)
    role: Optional[str] = ""
    position: Optional[str] = None
    department: str = Field(min_length=1, max_length=100)
    email: str = ""
    salary: float = Field(default=0, ge=0)
    status: str = "Active"

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    salary: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = None

class AttendanceCreate(BaseModel):
    employee_id: int
    work_date: str
    status: str = "Present"
    note: Optional[str] = ""
