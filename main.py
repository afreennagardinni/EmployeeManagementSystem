import os
import hashlib
import hmac
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Request, Response, Cookie
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func, inspect, text
from sqlalchemy.exc import IntegrityError
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from database import Base, engine, get_db
from models import User, Employee, Attendance
from schemas import UserCreate, UserLogin, EmployeeCreate, EmployeeUpdate, AttendanceCreate

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_SECRET_KEY_BEFORE_DEPLOYING")
serializer = URLSafeTimedSerializer(SECRET_KEY, salt="employee-management-session")

app = FastAPI(title="Employee Management System", version="2.0.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

Base.metadata.create_all(bind=engine)

# Safe additive migration for an older SQLite employees table.
def migrate_old_employees_table():
    inspector = inspect(engine)
    if "employees" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("employees")}
    additions = {
        "email": "VARCHAR(255) NOT NULL DEFAULT ''",
        "salary": "FLOAT NOT NULL DEFAULT 0",
        "status": "VARCHAR(30) NOT NULL DEFAULT 'Active'",
        "user_id": "INTEGER",
        "created_at": "DATETIME",
    }
    with engine.begin() as conn:
        for name, definition in additions.items():
            if name not in cols:
                conn.execute(text(f"ALTER TABLE employees ADD COLUMN {name} {definition}"))

migrate_old_employees_table()

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return salt.hex() + "$" + digest.hex()

def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 310000)
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except Exception:
        return False

def current_user(
    request: Request,
    session_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if not session_token:
        raise HTTPException(status_code=401, detail="Please log in.")
    try:
        user_id = serializer.loads(session_token, max_age=86400)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Your session expired. Please log in again.")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Account not found. Please log in again.")
    return user

def employee_dict(e: Employee):
    return {
        "id": e.id, "name": e.name, "role": e.role, "position": e.role,
        "department": e.department, "email": e.email,
        "salary": e.salary, "status": e.status,
    }

def add_sample_employees(db: Session, user_id: int):
    samples = [
        ("Aarav Sharma", "Software Engineer", "Engineering", "aarav@example.com", 65000),
        ("Priya Patel", "HR Executive", "Human Resources", "priya@example.com", 52000),
        ("Rohan Mehta", "Sales Manager", "Sales", "rohan@example.com", 72000),
        ("Sara Khan", "UI Designer", "Design", "sara@example.com", 60000),
    ]
    for name, role, dept, email, salary in samples:
        db.add(Employee(name=name, role=role, department=dept, email=email, salary=salary, status="Active", user_id=user_id))
    db.commit()

@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/register")
def register(payload: UserCreate, response: Response, db: Session = Depends(get_db)):
    username = payload.username.strip()
    email = payload.email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="This email is already registered. Please log in.")
    if db.query(User).filter(func.lower(User.username) == username.lower()).first():
        raise HTTPException(status_code=409, detail="This username is already taken.")
    user = User(username=username, email=email, password_hash=hash_password(payload.password))
    try:
        db.add(user)
        db.flush()
        samples = [
            ("Aarav Sharma", "Software Engineer", "Engineering", "aarav@example.com", 65000),
            ("Priya Patel", "HR Executive", "Human Resources", "priya@example.com", 52000),
            ("Rohan Mehta", "Sales Manager", "Sales", "rohan@example.com", 72000),
            ("Sara Khan", "UI Designer", "Design", "sara@example.com", 60000),
        ]
        for name, role, dept, sample_email, salary in samples:
            db.add(Employee(name=name, role=role, department=dept, email=sample_email, salary=salary, status="Active", user_id=user.id))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not create this account. Try another email or username.")
    # Registration deliberately does NOT log the user in.
    return {"message": "Account created successfully. Please log in."}

@app.post("/login")
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = serializer.dumps(user.id)
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=request.url.scheme == "https",
        samesite="lax", max_age=86400, path="/"
    )
    return {"message": "Login successful", "username": user.username, "email": user.email}

@app.post("/logout")
def logout(response: Response):
    response.delete_cookie("session_token", path="/", httponly=True, samesite="lax")
    return {"message": "Logged out"}

@app.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "username": user.username, "email": user.email}

@app.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Employee).filter(Employee.user_id == user.id)
    employees = q.all()
    total = len(employees)
    active = sum(1 for e in employees if e.status.lower() == "active")
    payroll = sum(float(e.salary or 0) for e in employees)
    departments = len(set(e.department for e in employees))
    return {
        "total_employees": total, "active_employees": active,
        "departments": departments, "average_salary": round(payroll / total, 2) if total else 0,
        "total_payroll": payroll,
        "department_counts": [
            {"department": d, "count": sum(1 for e in employees if e.department == d)}
            for d in sorted(set(e.department for e in employees))
        ],
        "recent_employees": [employee_dict(e) for e in sorted(employees, key=lambda x: x.id, reverse=True)[:5]],
    }

@app.get("/employees")
def list_employees(search: str = "", department: str = "", status: str = "",
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Employee).filter(Employee.user_id == user.id)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter((Employee.name.ilike(term)) | (Employee.email.ilike(term)) | (Employee.role.ilike(term)))
    if department:
        q = q.filter(Employee.department == department)
    if status:
        q = q.filter(Employee.status == status)
    return [employee_dict(e) for e in q.order_by(Employee.id.desc()).all()]

@app.post("/employees")
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data.pop("position", None)
    requested_id = data.pop("id", None)
    if requested_id is not None and db.query(Employee).filter(Employee.id == requested_id).first():
        raise HTTPException(status_code=409, detail="This employee ID is already in use. Leave ID blank to generate one.")
    employee = Employee(**data, user_id=user.id)
    if requested_id is not None:
        employee.id = requested_id
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee_dict(employee)

@app.put("/employees/{employee_id}")
def update_employee(employee_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    employee = db.query(Employee).filter(Employee.id == employee_id, Employee.user_id == user.id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    if "position" in data and "role" not in data:
        data["role"] = data.pop("position")
    else:
        data.pop("position", None)
    for key, value in data.items():
        if value is not None:
            setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    return employee_dict(employee)

@app.delete("/employees/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    employee = db.query(Employee).filter(Employee.id == employee_id, Employee.user_id == user.id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    db.delete(employee)
    db.commit()
    return {"message": "Employee deleted"}

@app.get("/departments")
def departments(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.query(Employee.department, func.count(Employee.id)).filter(Employee.user_id == user.id).group_by(Employee.department).all()
    return [{"name": name, "count": count} for name, count in rows]

@app.get("/attendance")
def list_attendance(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.query(Attendance, Employee.name).join(Employee, Attendance.employee_id == Employee.id).filter(Attendance.user_id == user.id).order_by(Attendance.work_date.desc()).limit(100).all()
    return [{"id": a.id, "employee_id": a.employee_id, "employee": name, "date": a.work_date.isoformat(), "status": a.status, "note": a.note or ""} for a, name in rows]

@app.post("/attendance")
def create_attendance(payload: AttendanceCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    employee = db.query(Employee).filter(Employee.id == payload.employee_id, Employee.user_id == user.id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    try:
        work_date = date.fromisoformat(payload.work_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD.")
    record = Attendance(employee_id=employee.id, user_id=user.id, work_date=work_date, status=payload.status, note=payload.note)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "message": "Attendance saved"}

@app.get("/reports")
def reports(db: Session = Depends(get_db), user: User = Depends(current_user)):
    employees = db.query(Employee).filter(Employee.user_id == user.id).all()
    payroll = sum(float(e.salary or 0) for e in employees)
    by_department = {}
    for e in employees:
        by_department[e.department] = by_department.get(e.department, 0) + float(e.salary or 0)
    return {
        "employee_count": len(employees),
        "active_count": sum(e.status.lower() == "active" for e in employees),
        "inactive_count": sum(e.status.lower() != "active" for e in employees),
        "payroll": payroll,
        "average_salary": round(payroll / len(employees), 2) if employees else 0,
        "department_payroll": [{"department": k, "payroll": v} for k, v in sorted(by_department.items())],
        "employees": [employee_dict(e) for e in employees],
    }

@app.get("/about")
def about():
    return {"name": "Employee Management System", "version": "2.0.0"}
