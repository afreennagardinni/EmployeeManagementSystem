EMPLOYEE MANAGEMENT SYSTEM — NEUMORPHISM + GLASSMORPHISM

CONTENTS
- main.py: FastAPI app, registration/login, per-account employee CRUD, dashboard, departments, attendance, payroll and reports APIs.
- models.py / schemas.py / database.py: database and validation.
- static/index.html, style.css, script.js: complete responsive frontend.
- render.yaml: optional Render blueprint with a persistent disk configuration.

RUN LOCALLY (Windows / VS Code)
1. Extract this ZIP.
2. Open the extracted folder in VS Code.
3. In Terminal run:
   py -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --reload
4. Open http://127.0.0.1:8000

IMPORTANT DATA NOTES
- The app creates a local employees.db file automatically.
- A new account receives four sample employees.
- Registration intentionally returns the user to Login; it does not sign them in automatically.
- Existing legacy employee rows whose user_id is NULL are NOT automatically assigned to an account. This avoids exposing old data to the wrong user.
- Existing SQLite tables get additive columns for email, salary, status, user_id and created_at. Back up your current employees.db before replacing application files.
- Employee IDs are database-generated. Do not manually reuse IDs across accounts.
- For Render, use a persistent disk mounted at /var/data (the included render.yaml does this) or a managed PostgreSQL database. A normal temporary filesystem can lose SQLite data on redeploy/restart.
- Set a strong, stable SECRET_KEY in Render environment variables. The included render.yaml generates one for the service.
- Do not overwrite your production database until you have a backup and have tested the new code locally.
