
/* =========================================
   EMPLOYEE MANAGEMENT SYSTEM
   FastAPI + SQLite + User Authentication
========================================= */

const API = "";
const ENDPOINT = "/employees";
const PER_PAGE = 6;

/* ========= State ========= */

let all = [];
let page = 1;
let editId = null;
let delIds = [];
let view = "list";
let sel = new Set();
let pageIds = [];

const $ = s => document.querySelector(s);

const fmt = n =>
  "₹" + Number(n || 0).toLocaleString("en-IN");

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

/* ========= API connection ========= */

async function request(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let message = data.detail || data.message || response.statusText;

    if (Array.isArray(message)) {
      message = message.map(x => x.msg || JSON.stringify(x)).join(", ");
    }

    if (typeof message === "object") {
      message = JSON.stringify(message);
    }

    throw new Error(message || "Something went wrong");
  }

  return data;
}

async function api(method, path = "", body) {
  return request(ENDPOINT + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

/* ========= Authentication ========= */

function showAuth() {
  $("#auth-view").hidden = false;
  $("#app-view").hidden = true;
}

function showApp(user) {
  $("#auth-view").hidden = true;
  $("#app-view").hidden = false;

  if ($("#current-user")) {
    $("#current-user").textContent =
      user.username || user.email || "User";
  }

  load();
}

function showLoginPanel() {
  $("#login-panel").hidden = false;
  $("#register-panel").hidden = true;
  $("#login-error").textContent = "";
  $("#register-error").textContent = "";
}

function showRegisterPanel() {
  $("#login-panel").hidden = true;
  $("#register-panel").hidden = false;
  $("#login-error").textContent = "";
  $("#register-error").textContent = "";
}

/* Check whether the user already has a valid login session */

async function checkSession() {
  try {
    const user = await request("/me");
    showApp(user);
  } catch (error) {
    showAuth();
    showLoginPanel();
  }
}

/* Login */

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  const errorBox = $("#login-error");
  const submitButton = event.submitter;

  errorBox.textContent = "";

  if (!email || !password) {
    errorBox.textContent = "Enter your email and password.";
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    const user = await request("/me");

    $("#login-form").reset();
    showApp(user);

    toast("Login successful");
  } catch (error) {
    errorBox.textContent = error.message || "Login failed";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

/* Registration */

$("#register-form").addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("#register-username").value.trim();
  const email = $("#register-email").value.trim();
  const password = $("#register-password").value;

  const errorBox = $("#register-error");
  const submitButton = event.submitter;

  errorBox.textContent = "";

  if (username.length < 3) {
    errorBox.textContent = "Username must contain at least 3 characters.";
    return;
  }

  if (password.length < 8) {
    errorBox.textContent = "Password must contain at least 8 characters.";
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await request("/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        email,
        password
      })
    });

    // Automatically log in after successful registration.
    await request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    const user = await request("/me");

    $("#register-form").reset();
    showApp(user);

    toast("Account created successfully");
  } catch (error) {
    errorBox.textContent = error.message || "Registration failed";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

/* Switch between login and registration */

$("#show-register").onclick = showRegisterPanel;
$("#show-login").onclick = showLoginPanel;

/* Password visibility buttons */

document.querySelectorAll("[data-target]").forEach(button => {
  button.addEventListener("click", () => {
    const input = $("#" + button.dataset.target);

    if (!input) return;

    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Show" : "Hide";
  });
});

/* Logout */

$("#logout").onclick = async () => {
  try {
    await request("/logout", {
      method: "POST"
    });

    all = [];
    sel.clear();

    $("#login-form").reset();
    showAuth();
    showLoginPanel();

    toast("Logged out successfully");
  } catch (error) {
    toast(error.message || "Logout failed", true);
  }
};

/* ========= Rendering ========= */

function filtered() {
  const q = $("#q").value.trim().toLowerCase();
  const d = $("#dept").value;
  const s = $("#sort").value;
  const status = $("#sfilter").value;

  let rows = all.filter(e =>
    (d === "All" || e.department === d) &&
    (status === "All" || (e.status || "Active") === status) &&
    (!q || [
      e.name,
      e.email,
      e.position || e.role,
      e.department
    ].some(v => String(v || "").toLowerCase().includes(q)))
  );

  const by = {
    "name": (a, b) => a.name.localeCompare(b.name),
    "salary-desc": (a, b) => b.salary - a.salary,
    "salary-asc": (a, b) => a.salary - b.salary,
    "newest": (a, b) => b.id - a.id
  }[s];

  return rows.sort(by || (() => 0));
}

function renderStats() {
  const depts = new Set(all.map(e => e.department));
  const total = all.reduce((sum, e) => sum + Number(e.salary || 0), 0);

  const items = [
    ["👥", all.length, "Employees"],
    ["🏢", depts.size, "Departments"],
    ["📈", fmt(all.length ? Math.round(total / all.length) : 0), "Average salary"],
    ["💰", fmt(total), "Total payroll"]
  ];

  $("#stats").innerHTML = items.map(i =>
    `<div class="raised stat">
      <div class="ico">${i[0]}</div>
      <div><b>${i[1]}</b><span>${i[2]}</span></div>
    </div>`
  ).join("");
}

function renderDepts() {
  const current = $("#dept").value || "All";

  const departments = [
    "All",
    ...[...new Set(all.map(e => e.department))].sort()
  ];

  $("#dept").innerHTML = departments.map(d =>
    `<option value="${esc(d)}">
      ${d === "All" ? "All departments" : esc(d)}
    </option>`
  ).join("");

  $("#dept").value = departments.includes(current) ? current : "All";
}

const stCls = x =>
  x === "On leave" ? "leave" :
  x === "Resigned" ? "out" : "";

const st = e =>
  `<span class="tag">
    <i class="dot ${stCls(e.status)}"></i>
    ${esc(e.status || "Active")}
  </span>`;

const ini = n =>
  esc(String(n || "").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase());

const chk = e =>
  `<input type="checkbox" class="chk"
    data-sel="${e.id}"
    aria-label="Select ${esc(e.name)}"
    ${sel.has(String(e.id)) ? "checked" : ""}>`;

const acts = e =>
  `<div class="ops">
    <button class="btn sm" data-edit="${e.id}">Edit</button>
    <button class="btn sm danger" data-del="${e.id}">Delete</button>
  </div>`;

function renderBars() {
  const counts = {};

  all.forEach(e => {
    counts[e.department] = (counts[e.department] || 0) + 1;
  });

  const max = Math.max(1, ...Object.values(counts));

  $("#bars").innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([department, count]) =>
      `<div class="bar">
        <span>${esc(department)}</span>
        <div class="track">
          <div class="fill" style="width:${count / max * 100}%"></div>
        </div>
        <b>${count}</b>
      </div>`
    ).join("");
}

function render() {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));

  page = Math.min(page, pages);

  const slice = rows.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE
  );

  pageIds = slice.map(e => String(e.id));

  let html;

  if (!slice.length) {
    html = `
      <div class="empty">
        <b>No employees found</b>
        Try a different search or add a new employee.
      </div>`;
  } else if (view === "grid") {
    html = `<div class="gridv">` +
      slice.map(e => `
        <div class="raised gcard">
          ${chk(e)}
          <div class="av">${ini(e.name)}</div>
          <div>
            <strong>${esc(e.name)}</strong><br>
            <small class="sub">${esc(e.position || e.role)}</small>
          </div>
          <div>
            <span class="tag">${esc(e.department)}</span>
            ${st(e)}
          </div>
          <strong>${fmt(e.salary)}</strong>
          ${acts(e)}
        </div>`
      ).join("") + `</div>`;
  } else {
    html = `
      <div class="row head">
        <input type="checkbox" class="chk" id="all"
          aria-label="Select all on this page"
          ${pageIds.length > 0 && pageIds.every(i => sel.has(i)) ? "checked" : ""}>
        <span>Employee</span>
        <span>Job title</span>
        <span>Department and status</span>
        <span>Salary</span>
        <span></span>
      </div>` +
      slice.map(e => `
        <div class="row">
          ${chk(e)}
          <div class="person">
            <div class="av">${ini(e.name)}</div>
            <div>
              <strong>${esc(e.name)}</strong>
              <small>${esc(e.email)}</small>
            </div>
          </div>
          <span>${esc(e.position || e.role)}</span>
          <span>
            <span class="tag">${esc(e.department)}</span>
            ${st(e)}
          </span>
          <strong>${fmt(e.salary)}</strong>
          ${acts(e)}
        </div>`
      ).join("");
  }

  $("#list").className = view === "grid" ? "" : "raised list";
  $("#list").innerHTML = html;

  $("#pager").innerHTML = rows.length ? `
    <span>
      Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, rows.length)}
      of ${rows.length}
    </span>
    <div class="grp">
      <button class="btn sm" id="prev" ${page <= 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${page} of ${pages}</span>
      <button class="btn sm" id="next" ${page >= pages ? "disabled" : ""}>Next</button>
    </div>` : "";

  $("#bulk").classList.toggle("on", sel.size > 0);
  $("#bn").textContent = sel.size + " selected";

  renderStats();
  renderBars();
}

/* ========= Notifications ========= */

function toast(message, bad = false) {
  const t = document.createElement("div");

  t.className = "toast" + (bad ? " bad" : "");
  t.textContent = message;

  $("#toasts").append(t);

  setTimeout(() => t.remove(), 3200);
}

/* ========= Load employee data ========= */

async function load() {
  $("#list").innerHTML = '<div class="skel"></div>'.repeat(4);

  try {
    all = await api("GET");

    // Remove selections for records no longer available.
    const validIds = new Set(all.map(e => String(e.id)));
    sel = new Set([...sel].filter(id => validIds.has(id)));

    $("#mode").textContent = `${all.length} employees in total`;

    renderDepts();
    render();
  } catch (error) {
    $("#list").innerHTML = `
      <div class="empty">
        <b>Couldn't load employees</b>
        ${esc(error.message)}
      </div>`;
  }
}

/* ========= Add / Edit employee ========= */

function openForm(employee) {
  editId = employee ? employee.id : null;

  $("#ft").textContent = employee ? "Edit employee" : "Add employee";

  for (const key of [
    "name", "email", "department",
    "salary", "position", "status"
  ]) {
    const value = employee
      ? (employee[key] ?? (key === "status" ? "Active" : ""))
      : (
          key === "department" ? "Engineering" :
          key === "status" ? "Active" : ""
        );

    $("#" + key).value = value;
  }

  document.querySelectorAll(".err").forEach(x => {
    x.textContent = "";
  });

  $("#form").showModal();
  $("#name").focus();
}

function validate() {
  let valid = true;

  const rules = {
    name: v => v.length >= 2 || "Enter the employee's full name.",
    email: v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || "Enter a valid email address.",
    salary: v => (v !== "" && Number.isFinite(+v) && +v >= 0) || "Enter a salary of 0 or more.",
    position: v => v.length >= 2 || "Enter a job title."
  };

  for (const [key, fn] of Object.entries(rules)) {
    const result = fn($("#" + key).value.trim());
    const error = $("#" + key).parentElement.querySelector(".err");

    if (error) {
      error.textContent = result === true ? "" : result;
    }

    if (result !== true) valid = false;
  }

  return valid;
}

/* Save employee */

$("#f").addEventListener("submit", async event => {
  event.preventDefault();

  if (!validate()) return;

  const body = {
    name: $("#name").value.trim(),
    email: $("#email").value.trim(),
    department: $("#department").value,
    position: $("#position").value.trim(),
    role: $("#position").value.trim(),
    status: $("#status").value,
    salary: Number($("#salary").value)
  };

  $("#save").disabled = true;

  try {
    if (editId !== null) {
      await api("PUT", "/" + editId, body);
      toast("Employee updated successfully");
    } else {
      await api("POST", "", body);
      toast("Employee added successfully");
    }

    $("#form").close();
    await load();
  } catch (error) {
    toast(error.message || "Couldn't save employee", true);
  } finally {
    $("#save").disabled = false;
  }
});

/* ========= Edit and delete actions ========= */

$("#list").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-del]");

  if (editButton) {
    const employee = all.find(x => x.id == editButton.dataset.edit);
    if (employee) openForm(employee);
  }

  if (deleteButton) {
    askDel([deleteButton.dataset.del]);
  }
});

function askDel(ids) {
  delIds = ids.map(String);

  const employee = all.find(x => x.id == ids[0]);

  $("#cname").textContent =
    ids.length > 1
      ? ids.length + " employees"
      : employee?.name || "this employee";

  $("#confirm").showModal();
}

$("#list").addEventListener("change", event => {
  if (event.target.id === "all") {
    pageIds.forEach(id =>
      event.target.checked ? sel.add(id) : sel.delete(id)
    );
  } else if (event.target.dataset.sel) {
    event.target.checked
      ? sel.add(event.target.dataset.sel)
      : sel.delete(event.target.dataset.sel);
  }

  render();
});

/* Bulk actions */

$("#bdel").onclick = () => askDel([...sel]);

$("#bclr").onclick = () => {
  sel.clear();
  render();
};

$("#yes").onclick = async () => {
  try {
    for (const id of delIds) {
      await api("DELETE", "/" + id);
    }

    sel.clear();

    toast(delIds.length > 1
      ? "Employees deleted successfully"
      : "Employee deleted successfully"
    );

    await load();
  } catch (error) {
    toast(error.message || "Couldn't delete employee", true);
  }

  $("#confirm").close();
};

$("#no").onclick = () => $("#confirm").close();
$("#cancel").onclick = () => $("#form").close();
$("#add").onclick = () => openForm();

/* ========= View switching ========= */

const setView = v => {
  view = v;

  $("#vl").setAttribute("aria-pressed", v === "list");
  $("#vg").setAttribute("aria-pressed", v === "grid");

  render();
};

$("#vl").onclick = () => setView("list");
$("#vg").onclick = () => setView("grid");

/* ========= Pagination ========= */

$("#pager").addEventListener("click", event => {
  if (event.target.id === "prev") page--;
  if (event.target.id === "next") page++;

  render();
});

/* ========= Search and filters ========= */

let tm;

$("#q").addEventListener("input", () => {
  clearTimeout(tm);

  tm = setTimeout(() => {
    page = 1;
    render();
  }, 180);
});

$("#dept").onchange =
$("#sort").onchange =
$("#sfilter").onchange = () => {
  page = 1;
  render();
};

/* ========= Export CSV ========= */

$("#export").onclick = () => {
  const rows = filtered();

  const headers = [
    "id", "name", "email",
    "department", "position",
    "salary", "status"
  ];

  const csv = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(key =>
        `"${String(row[key] ?? "").replace(/"/g, '""')}"`
      ).join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "employees.csv";
  link.click();

  URL.revokeObjectURL(url);
};

/* ========= Theme ========= */

const root = document.documentElement;

const setTheme = theme => {
  root.dataset.theme = theme;
  $("#theme").textContent = theme === "dark" ? "☀️" : "🌙";
};

setTheme(
  matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
);

$("#theme").onclick = () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
};

/* ========= Keyboard shortcuts ========= */

addEventListener("keydown", event => {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) ||
    document.querySelector("dialog[open]") ||
    $("#app-view").hidden
  ) return;

  if (event.key === "/") {
    event.preventDefault();
    $("#q").focus();
  }

  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    openForm();
  }
});

/* ========= Start application ========= */

checkSession();
