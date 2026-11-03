from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_home():
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Employee Management Dashboard" in response.text

def test_get_employees():
    response = client.get("/employees")

    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_employee():
    employee_data = [
        {
            "id": 999999,
            "name": "Test Employee",
            "role": "Python Developer",
            "department": "IT"
        }
    ]

    response = client.post("/employees", json=employee_data)

    assert response.status_code == 200
    assert response.json()["message"] == "Employees added successfully"

    # Clean up the test record
    delete_response = client.delete("/employees/999999")
    assert delete_response.status_code == 200


def test_create_dashboard_employee():
    employee_data = {
        "name": "Dashboard Test Employee",
        "email": "dashboard-test@example.com",
        "department": "Engineering",
        "position": "Python Developer",
        "salary": 80000,
        "status": "Active",
    }

    response = client.post("/employees", json=employee_data)

    assert response.status_code == 200
    created = client.get("/employees").json()
    employee = next(item for item in created if item["name"] == employee_data["name"])
    assert employee["email"] == employee_data["email"]
    assert employee["position"] == employee_data["position"]
    assert employee["salary"] == employee_data["salary"]
    assert employee["status"] == employee_data["status"]

    delete_response = client.delete(f"/employees/{employee['id']}")
    assert delete_response.status_code == 200