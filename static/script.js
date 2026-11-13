const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat("en-IN", {style:"currency", currency:"INR", maximumFractionDigits:0}).format(Number(value || 0));
let employees = [];
let currentUser = null;
let reportsCache = null;

function toast(message, isError = false) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = message;
  $("#toast-region").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {"Content-Type":"application/json", ...(options.headers || {})}
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.detail || data.message || `Request failed (${response.status})`);
  return data;
}
function showAuth(which = "login") {
  $("#auth-view").hidden = false;
  $("#app-view").hidden = true;
  $("#login-form").hidden = which !== "login";
  $("#register-form").hidden = which !== "register";
  $("#show-login").classList.toggle("active", which === "login");
  $("#show-register").classList.toggle("active", which === "register");
}
function showApp() {
  $("#auth-view").hidden = true;
  $("#app-view").hidden = false;
}
function switchPage(page) {
  $$(".page-view").forEach(section => section.hidden = section.id !== `page-${page}`);
  $$(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  const titles = {dashboard:"Overview",employees:"Employees",departments:"Departments",attendance:"Attendance",payroll:"Payroll",reports:"Reports"};
  $("#page-heading").textContent = titles[page] || "Overview";
  if (page === "employees") loadEmployees();
  if (page === "departments") renderDepartments();
  if (page === "attendance") {
    loadEmployees().then(loadAttendance).catch(error => toast(error.message, true));
  }
  if (page === "payroll" || page === "reports") loadReports();
}
function initials(name) {
  return (name || "U").trim().split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
}
function setUser(user) {
  currentUser = user;
  const name = user.username || user.email || "User";
  $("#sidebar-username").textContent = name;
  $("#user-avatar").textContent = initials(name);
  $("#top-avatar").textContent = initials(name);
  $("#welcome-name").textContent = name;
}
async function checkSession() {
  try {
    const user = await api("/me");
    setUser(user);
    showApp();
    await loadDashboard();
  } catch {
    showAuth("login");
  }
}
async function loadDashboard() {
  const data = await api("/dashboard/stats");
  $("#stat-employees").textContent = data.total_employees;
  $("#stat-departments").textContent = data.departments;
  $("#stat-average").textContent = money(data.average_salary);
  $("#stat-payroll").textContent = money(data.total_payroll);
  const chart = $("#department-chart");
  chart.innerHTML = "";
  const max = Math.max(1, ...data.department_counts.map(d=>d.count));
  data.department_counts.forEach(d => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span>${escapeHTML(d.department)}</span><div class="bar-track"><div class="bar-fill" style="width:${d.count/max*100}%"></div></div><b>${d.count}</b>`;
    chart.appendChild(row);
  });
  if (!data.department_counts.length) chart.innerHTML = '<div class="empty-state">No department data yet.</div>';
  const recent = $("#recent-list");
  recent.innerHTML = "";
  data.recent_employees.forEach(e => {
    const item = document.createElement("div");
    item.className = "recent-item";
    item.innerHTML = `<div class="recent-avatar">${initials(e.name)}</div><div><strong>${escapeHTML(e.name)}</strong><small>${escapeHTML(e.role)} · ${escapeHTML(e.department)}</small></div>`;
    recent.appendChild(item);
  });
  if (!data.recent_employees.length) recent.innerHTML = '<div class="empty-state">Your recent employees will appear here.</div>';
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
async function loadEmployees() {
  const search = encodeURIComponent($("#employee-search").value.trim());
  const dept = encodeURIComponent($("#department-filter").value);
  const status = encodeURIComponent($("#status-filter").value);
  employees = await api(`/employees?search=${search}&department=${dept}&status=${status}`);
  renderEmployeeTable();
  populateEmployeeSelects();
  populateDepartmentFilter();
}
function renderEmployeeTable() {
  const body = $("#employee-table-body");
  body.innerHTML = "";
  employees.forEach(e => {
    const tr = document.createElement("tr");
    const statusClass = e.status.toLowerCase().replace(/\s+/g,"-");
    tr.innerHTML = `<td><div class="employee-cell"><div class="recent-avatar">${initials(e.name)}</div><div><strong>${escapeHTML(e.name)}</strong><small>${escapeHTML(e.email)}</small></div></div></td>
      <td>${escapeHTML(e.role)}</td><td>${escapeHTML(e.department)}</td><td>${money(e.salary)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHTML(e.status)}</span></td>
      <td><button class="row-action" data-edit="${e.id}">Edit</button><button class="row-action delete" data-delete="${e.id}">Delete</button></td>`;
    body.appendChild(tr);
  });
  $("#employee-empty").hidden = employees.length > 0;
  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openEmployeeDialog(Number(b.dataset.edit))));
  body.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteEmployee(Number(b.dataset.delete))));
}
function populateDepartmentFilter() {
  const select = $("#department-filter");
  const current = select.value;
  const departments = [...new Set(employees.map(e=>e.department))].sort();
  select.innerHTML = '<option value="">All departments</option>' + departments.map(d=>`<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join("");
  select.value = departments.includes(current) ? current : "";
}
function populateEmployeeSelects() {
  const select = $("#attendance-employee");
  const current = select.value;
  select.innerHTML = '<option value="">Select employee</option>' + employees.map(e=>`<option value="${e.id}">${escapeHTML(e.name)}</option>`).join("");
  select.value = current;
}
function openEmployeeDialog(id = null) {
  const employee = employees.find(e=>e.id===id);
  $("#employee-form").reset();
  $("#employee-id").value = employee?.id || "";
  $("#employee-dialog-title").textContent = employee ? "Edit employee" : "Add employee";
  $("#employee-name").value = employee?.name || "";
  $("#employee-email").value = employee?.email || "";
  $("#employee-role").value = employee?.role || "";
  $("#employee-department").value = employee?.department || "";
  $("#employee-salary").value = employee?.salary || 0;
  $("#employee-status").value = employee?.status || "Active";
  $("#employee-dialog").showModal();
}
async function saveEmployee(event) {
  event.preventDefault();
  const id = $("#employee-id").value;
  const payload = {
    name:$("#employee-name").value.trim(), email:$("#employee-email").value.trim(),
    role:$("#employee-role").value.trim(), department:$("#employee-department").value.trim(),
    salary:Number($("#employee-salary").value || 0), status:$("#employee-status").value
  };
  try {
    await api(id ? `/employees/${id}` : "/employees", {method:id?"PUT":"POST", body:JSON.stringify(payload)});
    $("#employee-dialog").close();
    toast(id ? "Employee updated." : "Employee added.");
    await loadEmployees(); await loadDashboard();
  } catch (error) { toast(error.message, true); }
}
async function deleteEmployee(id) {
  const employee = employees.find(e=>e.id===id);
  if (!employee || !confirm(`Delete ${employee.name}? This cannot be undone.`)) return;
  try {
    await api(`/employees/${id}`, {method:"DELETE"});
    toast("Employee deleted.");
    await loadEmployees(); await loadDashboard();
  } catch(error) { toast(error.message,true); }
}
async function renderDepartments() {
  const data = await api("/departments");
  $("#department-cards").innerHTML = data.length ? data.map(d=>`<article class="department-card"><div class="dept-symbol">▥</div><h3>${escapeHTML(d.name)}</h3><p>${d.count} employee${d.count===1?"":"s"}</p></article>`).join("") : '<div class="empty-state">Departments will appear when you add employees.</div>';
}
async function loadAttendance() {
  const rows = await api("/attendance");
  $("#attendance-body").innerHTML = rows.map(r=>`<tr><td>${escapeHTML(r.employee)}</td><td>${r.date}</td><td><span class="status-pill">${escapeHTML(r.status)}</span></td><td>${escapeHTML(r.note)}</td></tr>`).join("");
}
async function saveAttendance(event) {
  event.preventDefault();
  try {
    await api("/attendance",{method:"POST",body:JSON.stringify({
      employee_id:Number($("#attendance-employee").value), work_date:$("#attendance-date").value,
      status:$("#attendance-status").value,note:$("#attendance-note").value.trim()
    })});
    $("#attendance-note").value="";
    toast("Attendance saved.");
    await loadAttendance();
  } catch(error) { toast(error.message,true); }
}
async function loadReports() {
  reportsCache = await api("/reports");
  const r = reportsCache;
  $("#payroll-total").textContent = money(r.payroll);
  $("#payroll-average").textContent = money(r.average_salary);
  $("#payroll-count").textContent = r.employee_count;
  $("#payroll-body").innerHTML = r.employees.map(e=>`<tr><td>${escapeHTML(e.name)}</td><td>${escapeHTML(e.department)}</td><td>${money(e.salary)}</td></tr>`).join("");
  $("#report-active").textContent = r.active_count;
  $("#report-inactive").textContent = r.inactive_count;
  $("#report-annual").textContent = money(r.payroll*12);
  const max = Math.max(1,...r.department_payroll.map(d=>d.payroll));
  $("#report-departments").innerHTML = r.department_payroll.map(d=>`<div class="bar-row"><span>${escapeHTML(d.department)}</span><div class="bar-track"><div class="bar-fill" style="width:${d.payroll/max*100}%"></div></div><b>${money(d.payroll)}</b></div>`).join("") || '<div class="empty-state">No report data yet.</div>';
}
function downloadCSV(filename, rows) {
  const csv = rows.map(row=>row.map(value=>`"${String(value ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
function exportPayroll() {
  const rows = [["Employee","Email","Department","Role","Monthly salary","Status"],...employees.map(e=>[e.name,e.email,e.department,e.role,e.salary,e.status])];
  downloadCSV("employee-payroll.csv",rows);
}
function exportReport() {
  const r = reportsCache;
  if (!r) return;
  downloadCSV("employee-report.csv",[["Employee","Email","Department","Role","Salary","Status"],...r.employees.map(e=>[e.name,e.email,e.department,e.role,e.salary,e.status])]);
}
async function login(event) {
  event.preventDefault();
  const button = $("#login-form button[type=submit]");
  button.disabled = true; $("#login-error").textContent="";
  try {
    await api("/login",{method:"POST",body:JSON.stringify({email:$("#login-email").value.trim(),password:$("#login-password").value})});
    const user = await api("/me");
    setUser(user); showApp(); toast("Welcome back!");
    await loadDashboard();
  } catch(error) { $("#login-error").textContent=error.message; }
  finally { button.disabled=false; }
}
async function register(event) {
  event.preventDefault();
  const button = $("#register-form button[type=submit]");
  button.disabled = true; $("#register-error").textContent="";
  try {
    const payload = {username:$("#register-username").value.trim(),email:$("#register-email").value.trim(),password:$("#register-password").value};
    const result = await api("/register",{method:"POST",body:JSON.stringify(payload)});
    $("#register-form").reset();
    $("#login-email").value = payload.email;
    showAuth("login");
    $("#login-error").textContent = result.message || "Account created. Please log in.";
    toast("Account created. Please log in.");
  } catch(error) { $("#register-error").textContent=error.message; }
  finally { button.disabled=false; }
}
async function logout() {
  try { await api("/logout",{method:"POST"}); } catch {}
  currentUser=null; employees=[]; $("#login-form").reset(); showAuth("login"); toast("You have signed out.");
}
function init() {
  $("#today-label").textContent = new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
  $("#attendance-date").value = new Date().toISOString().slice(0,10);
  $("#login-form").addEventListener("submit",login);
  $("#register-form").addEventListener("submit",register);
  $("#show-login").addEventListener("click",()=>showAuth("login"));
  $("#show-register").addEventListener("click",()=>showAuth("register"));
  $("#login-to-register").addEventListener("click",()=>showAuth("register"));
  $("#register-to-login").addEventListener("click",()=>showAuth("login"));
  $$(".password-toggle").forEach(button=>button.addEventListener("click",()=>{
    const input=document.getElementById(button.dataset.target);
    input.type=input.type==="password"?"text":"password";
    button.textContent=input.type==="password"?"Show":"Hide";
  }));
  $$(".nav-link").forEach(button=>button.addEventListener("click",()=>switchPage(button.dataset.page)));
  $$("[data-goto]").forEach(button=>button.addEventListener("click",()=>switchPage(button.dataset.goto)));
  $$("[data-open-employee]").forEach(button=>button.addEventListener("click",()=>openEmployeeDialog()));
  $("#employee-form").addEventListener("submit",saveEmployee);
  $("#close-employee-dialog").addEventListener("click",()=>$("#employee-dialog").close());
  $("#cancel-employee").addEventListener("click",()=>$("#employee-dialog").close());
  $("#employee-search").addEventListener("input",()=>loadEmployees().catch(e=>toast(e.message,true)));
  $("#department-filter").addEventListener("change",()=>loadEmployees().catch(e=>toast(e.message,true)));
  $("#status-filter").addEventListener("change",()=>loadEmployees().catch(e=>toast(e.message,true)));
  $("#attendance-form").addEventListener("submit",saveAttendance);
  $("#logout-button").addEventListener("click",logout);
  $("#theme-toggle").addEventListener("click",()=>document.body.classList.toggle("dark"));
  $("#payroll-export").addEventListener("click",exportPayroll);
  $("#report-export").addEventListener("click",exportReport);
  showAuth("login");
  checkSession().catch(()=>showAuth("login"));
}
document.addEventListener("DOMContentLoaded",init);
