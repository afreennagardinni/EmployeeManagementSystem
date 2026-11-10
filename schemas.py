
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# USER REGISTRATION
class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


# USER LOGIN
class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


# EMPLOYEE CREATE / UPDATE
class EmployeeCreate(BaseModel):
    id: int | None = None
    name: str = Field(min_length=1, max_length=100)
    role: str | None = None
    department: str = Field(min_length=1, max_length=100)
    position: str | None = None
    email: str = ""
    salary: float = Field(default=0, ge=0)
    status: str = "Active"
