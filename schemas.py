from pydantic import BaseModel


class EmployeeCreate(BaseModel):
    id: int | None = None
    name: str
    role: str | None = None
    department: str
    position: str | None = None
    email: str = ""
    salary: float = 0
    status: str = "Active"