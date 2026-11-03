
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Employee as EmployeeModel
from schemas import EmployeeCreate


# Create database tables
Base.metadata.create_all(bind=engine)

# Add dashboard fields to databases created by the original API.
with engine.begin() as connection:
    columns = {column["name"] for column in inspect(connection).get_columns("employees")}
    for name, definition in (
        ("email", "VARCHAR NOT NULL DEFAULT ''"),
        ("salary", "FLOAT NOT NULL DEFAULT 0"),
        ("status", "VARCHAR NOT NULL DEFAULT 'Active'"),
    ):
        if name not in columns:
            connection.execute(text(f"ALTER TABLE employees ADD COLUMN {name} {definition}"))

app = FastAPI(title="Employee Management API")


# Serve CSS and JavaScript files
app.mount(
    "/static",
    StaticFiles(directory=Path(__file__).parent / "static"),
    name="static"
)


# Serve frontend dashboard
@app.get("/", include_in_schema=False)
def serve_frontend():
    return FileResponse(
        Path(__file__).parent / "static" / "index.html"
    )


# READ - Get all employees
@app.get("/employees")
def get_employees(db: Session = Depends(get_db)):
    employees = db.query(EmployeeModel).all()

    return [
        {
            "id": emp.id,
            "name": emp.name,
            "email": emp.email,
            "role": emp.role,
            "position": emp.role,
            "department": emp.department,
            "salary": emp.salary,
            "status": emp.status,
        }
        for emp in employees
    ]


# CREATE - Add employees
@app.post("/employees")
def add_employees(
    new_employees: list[EmployeeCreate] | EmployeeCreate,
    db: Session = Depends(get_db)
):
    if isinstance(new_employees, EmployeeCreate):
        new_employees = [new_employees]

    added = []

    for item in new_employees:
        if item.id is not None and db.query(EmployeeModel).filter(
            EmployeeModel.id == item.id
        ).first():
            raise HTTPException(
                status_code=400,
                detail=f"Employee ID {item.id} already exists"
            )

        role = item.role or item.position
        if not role:
            raise HTTPException(status_code=422, detail="A role or position is required")

        employee = EmployeeModel(
            id=item.id,
            name=item.name,
            role=role,
            department=item.department,
            email=item.email,
            salary=item.salary,
            status=item.status,
        )
        db.add(employee)
        added.append(employee)

    db.commit()

    return {
        "message": "Employees added successfully",
        "total_employees": len(added)
    }


# UPDATE - Update employee details and ID
@app.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    updated_employee: EmployeeCreate,
    db: Session = Depends(get_db)
):
    employee = db.query(EmployeeModel).filter(
        EmployeeModel.id == employee_id
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    existing = db.query(EmployeeModel).filter(
        EmployeeModel.id == updated_employee.id
    ).first()

    if updated_employee.id is not None and existing and updated_employee.id != employee_id:
        raise HTTPException(
            status_code=400,
            detail="This employee ID already exists"
        )

    role = updated_employee.role or updated_employee.position
    if not role:
        raise HTTPException(status_code=422, detail="A role or position is required")

    if updated_employee.id is not None:
        employee.id = updated_employee.id
    employee.name = updated_employee.name
    employee.role = role
    employee.department = updated_employee.department
    employee.email = updated_employee.email
    employee.salary = updated_employee.salary
    employee.status = updated_employee.status

    db.commit()
    db.refresh(employee)

    return {
        "message": "Employee updated successfully",
        "employee": {
            "id": employee.id,
            "name": employee.name,
            "email": employee.email,
            "role": employee.role,
            "position": employee.role,
            "department": employee.department,
            "salary": employee.salary,
            "status": employee.status,
        }
    }


# DELETE - Delete employee
@app.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db)
):
    employee = db.query(EmployeeModel).filter(
        EmployeeModel.id == employee_id
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    db.delete(employee)
    db.commit()

    return {
        "message": "Employee deleted successfully"
    }


# ABOUT
@app.get("/about")
def about():
    return {
        "project": "Employee Management API",
        "built_with": "Python, FastAPI and SQLite"
    }
