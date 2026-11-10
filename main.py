
import os
import hashlib
import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Response, Cookie
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from database import Base, engine, get_db
from models import Employee as EmployeeModel, User as UserModel
from schemas import EmployeeCreate, UserCreate, UserLogin


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    SECRET_KEY = "development-only-" + secrets.token_hex(16)
    print("WARNING: Set SECRET_KEY as an environment variable in production.")

serializer = URLSafeTimedSerializer(SECRET_KEY)

app = FastAPI(title="Employee Management System")


# --------------------------------------------------
# DATABASE INITIALIZATION
# --------------------------------------------------

Base.metadata.create_all(bind=engine)

# Add user ownership to existing employee databases.
with engine.begin() as connection:
    columns = {
        column["name"]
        for column in inspect(connection).get_columns("employees")
    }

    if "user_id" not in columns:
        connection.execute(
            text("ALTER TABLE employees ADD COLUMN user_id INTEGER")
        )


# --------------------------------------------------
# PASSWORD SECURITY
# --------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        600000
    )
    return salt.hex() + ":" + hashed.hex()


def verify_password(password: str, stored_password: str) -> bool:
    try:
        salt_hex, hash_hex = stored_password.split(":")
        salt = bytes.fromhex(salt_hex)

        new_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            salt,
            600000
        )

        return secrets.compare_digest(new_hash.hex(), hash_hex)

    except (ValueError, TypeError):
        return False


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

def get_current_user(
    session_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db)
):
    if not session_token:
        raise HTTPException(status_code=401, detail="Please login first")

    try:
        user_id = serializer.loads(session_token, max_age=86400)

    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")

    user = db.query(UserModel).filter(
        UserModel.id == user_id
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# --------------------------------------------------
# SAMPLE EMPLOYEES
# --------------------------------------------------

def add_sample_employees(db: Session, user_id: int):
    samples = [
        {
            "name": "Aisha Khan",
            "email": "aisha@example.com",
            "role": "Python Developer",
            "department": "IT",
            "salary": 45000,
            "status": "Active"
        },
        {
            "name": "Rahul Sharma",
            "email": "rahul@example.com",
            "role": "HR Manager",
            "department": "HR",
            "salary": 55000,
            "status": "Active"
        },
        {
            "name": "Sara Ahmed",
            "email": "sara@example.com",
            "role": "Data Analyst",
            "department": "Analytics",
            "salary": 40000,
            "status": "Active"
        },
        {
            "name": "Arjun Patel",
            "email": "arjun@example.com",
            "role": "UI Designer",
            "department": "Design",
            "salary": 38000,
            "status": "Inactive"
        }
    ]

    for item in samples:
        db.add(EmployeeModel(**item, user_id=user_id))

    db.commit()


# --------------------------------------------------
# FRONTEND
# --------------------------------------------------

app.mount(
    "/static",
    StaticFiles(directory=Path(__file__).parent / "static"),
    name="static"
)


@app.get("/", include_in_schema=False)
def serve_frontend():
    return FileResponse(
        Path(__file__).parent / "static" / "index.html"
    )


# --------------------------------------------------
# REGISTER
# --------------------------------------------------

@app.post("/register")
def register(data: UserCreate, db: Session = Depends(get_db)):

    existing = db.query(UserModel).filter(
        (UserModel.email == data.email) |
        (UserModel.username == data.username)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email or username already registered"
        )

    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters"
        )

    user = UserModel(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password)
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    add_sample_employees(db, user.id)

    return {
        "message": "Registration successful. Please login.",
        "username": user.username
    }


# --------------------------------------------------
# LOGIN
# --------------------------------------------------

@app.post("/login")
def login(
    data: UserLogin,
    response: Response,
    db: Session = Depends(get_db)
):

    user = db.query(UserModel).filter(
        UserModel.email == data.email
    ).first()

    if not user or not verify_password(
        data.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    token = serializer.dumps(user.id)

    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=86400
    )

    return {
        "message": "Login successful",
        "username": user.username
    }


# --------------------------------------------------
# LOGOUT
# --------------------------------------------------

@app.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        key="session_token",
        httponly=True,
        secure=True,
        samesite="lax"
    )

    return {"message": "Logged out successfully"}


# --------------------------------------------------
# CURRENT USER
# --------------------------------------------------

@app.get("/me")
def get_profile(user=Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email
    }


# --------------------------------------------------
# DASHBOARD STATISTICS
# --------------------------------------------------

@app.get("/dashboard/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    employees = db.query(EmployeeModel).filter(
        EmployeeModel.user_id == user.id
    ).all()

    return {
        "total_employees": len(employees),
        "active_employees": sum(
            e.status == "Active" for e in employees
        ),
        "inactive_employees": sum(
            e.status == "Inactive" for e in employees
        ),
        "total_departments": len(set(
            e.department for e in employees if e.department
        ))
    }


# --------------------------------------------------
# READ EMPLOYEES
# --------------------------------------------------

@app.get("/employees")
def get_employees(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    search: str = ""
):
    query = db.query(EmployeeModel).filter(
        EmployeeModel.user_id == user.id
    )

    if search:
        query = query.filter(
            EmployeeModel.name.ilike(f"%{search}%")
        )

    employees = query.all()

    return [
        {
            "id": emp.id,
            "name": emp.name,
            "email": emp.email,
            "role": emp.role,
            "position": emp.role,
            "department": emp.department,
            "salary": emp.salary,
            "status": emp.status
        }
        for emp in employees
    ]


# --------------------------------------------------
# CREATE EMPLOYEES
# --------------------------------------------------

@app.post("/employees")
def add_employees(
    new_employees: list[EmployeeCreate] | EmployeeCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    if isinstance(new_employees, EmployeeCreate):
        new_employees = [new_employees]

    added = []

    for item in new_employees:

        if item.id is not None:
            existing = db.query(EmployeeModel).filter(
                EmployeeModel.id == item.id,
                EmployeeModel.user_id == user.id
            ).first()

            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Employee ID {item.id} already exists"
                )

        role = item.role or item.position

        if not role:
            raise HTTPException(
                status_code=422,
                detail="A role or position is required"
            )

        employee = EmployeeModel(
            id=item.id,
            name=item.name,
            role=role,
            department=item.department,
            email=item.email,
            salary=item.salary,
            status=item.status,
            user_id=user.id
        )

        db.add(employee)
        added.append(employee)

    db.commit()

    return {
        "message": "Employees added successfully",
        "total_employees": len(added)
    }


# --------------------------------------------------
# UPDATE EMPLOYEE
# --------------------------------------------------

@app.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    updated_employee: EmployeeCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    employee = db.query(EmployeeModel).filter(
        EmployeeModel.id == employee_id,
        EmployeeModel.user_id == user.id
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    if updated_employee.id is not None:
        existing = db.query(EmployeeModel).filter(
            EmployeeModel.id == updated_employee.id,
            EmployeeModel.user_id == user.id
        ).first()

        if existing and updated_employee.id != employee_id:
            raise HTTPException(
                status_code=400,
                detail="This employee ID already exists"
            )

        employee.id = updated_employee.id

    role = updated_employee.role or updated_employee.position

    if not role:
        raise HTTPException(
            status_code=422,
            detail="A role or position is required"
        )

    employee.name = updated_employee.name
    employee.role = role
    employee.department = updated_employee.department
    employee.email = updated_employee.email
    employee.salary = updated_employee.salary
    employee.status = updated_employee.status

    db.commit()
    db.refresh(employee)

    return {"message": "Employee updated successfully"}


# --------------------------------------------------
# DELETE EMPLOYEE
# --------------------------------------------------

@app.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    employee = db.query(EmployeeModel).filter(
        EmployeeModel.id == employee_id,
        EmployeeModel.user_id == user.id
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    db.delete(employee)
    db.commit()

    return {"message": "Employee deleted successfully"}


# --------------------------------------------------
# ABOUT
# --------------------------------------------------

@app.get("/about")
def about():
    return {
        "project": "Employee Management System",
        "built_with": "Python, FastAPI, SQLAlchemy and SQLite",
        "features": [
            "User authentication",
            "Employee management",
            "Dashboard statistics",
            "Search and filtering",
            "User-specific employee records"
        ]
    }
