/* ========= CONFIG: point this at your FastAPI server ========= */
const API = "";               // "" = same origin; or "http://127.0.0.1:8000"
const ENDPOINT = "/employees"; // GET list, POST create, PUT /{id}, DELETE /{id}
const PER_PAGE = 6;

/* ========= State ========= */
let all = [], page = 1, editId = null, delIds = [], demo = false, view = "list", sel = new Set(), pageIds = [];
const $ = s => document.querySelector(s);
const fmt = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ========= API layer (falls back to demo data if backend is offline) ========= */
const DEMO = [
  ["Aarav Sharma","aarav@acme.io","Engineering","Backend Engineer",1450000],
  ["Diya Menon","diya@acme.io","Design","Product Designer",1250000],
  ["Kabir Nair","kabir@acme.io","Sales","Account Executive",980000],
  ["Isha Rao","isha@acme.io","HR","People Partner",870000],
  ["Rohan Iyer","rohan@acme.io","Engineering","DevOps Engineer",1600000],
  ["Meera Joshi","meera@acme.io","Marketing","Content Lead",920000],
  ["Vikram Das","vikram@acme.io","Finance","Financial Analyst",1100000],
].map((e,i)=>({id:i+1,name:e[0],email:e[1],department:e[2],position:e[3],salary:e[4],status:i===3?"On leave":i===6?"Resigned":"Active"}));

async function api(method, path = "", body) {
  if (!demo) {
    try {
      const r = await fetch(API + ENDPOINT + path, {
        method, headers: {"Content-Type":"application/json"},
        body: body ? JSON.stringify(body) : undefined
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).detail || r.statusText);
      return r.status === 204 ? null : r.json();
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;   // real API error → surface it
      demo = true;                               // network error → demo mode
    }
  }
  const id = +path.slice(1);
  if (method === "GET") return DEMO;
  if (method === "POST") { const n = {...body, id: Date.now()}; DEMO.push(n); return n; }
  if (method === "PUT") { const i = DEMO.findIndex(x => x.id === id); DEMO[i] = {...DEMO[i], ...body}; return DEMO[i]; }
  if (method === "DELETE") { DEMO.splice(DEMO.findIndex(x => x.id === id), 1); return null; }
}

/* ========= Rendering ========= */
function filtered() {
  const q = $("#q").value.trim().toLowerCase(), d = $("#dept").value, s = $("#sort").value;
  let r = all.filter(e =>
    (d === "All" || e.department === d) && ($("#sfilter").value === "All" || (e.status||"Active") === $("#sfilter").value) &&
    (!q || [e.name, e.email, e.position, e.department].some(v => String(v).toLowerCase().includes(q))));
  const by = {
    "name": (a,b) => a.name.localeCompare(b.name),
    "salary-desc": (a,b) => b.salary - a.salary,
    "salary-asc": (a,b) => a.salary - b.salary,
    "newest": (a,b) => b.id - a.id
  }[s];
  return r.sort(by);
}

function renderStats() {
  const depts = new Set(all.map(e => e.department));
  const total = all.reduce((s,e) => s + Number(e.salary||0), 0);
  const items = [
    ["👥", all.length, "Employees"],
    ["🏢", depts.size, "Departments"],
    ["📈", fmt(all.length ? Math.round(total/all.length) : 0), "Average salary"],
    ["💰", fmt(total), "Total payroll"],
  ];
  $("#stats").innerHTML = items.map(i =>
    `<div class="raised stat"><div class="ico">${i[0]}</div><div><b>${i[1]}</b><span>${i[2]}</span></div></div>`).join("");
}

function renderDepts() {
  const cur = $("#dept").value || "All";
  const ds = ["All", ...[...new Set(all.map(e => e.department))].sort()];
  $("#dept").innerHTML = ds.map(d => `<option value="${esc(d)}">${d === "All" ? "All departments" : esc(d)}</option>`).join("");
  $("#dept").value = ds.includes(cur) ? cur : "All";
}

const stCls = x => x === "On leave" ? "leave" : x === "Resigned" ? "out" : "";
const st = e => `<span class="tag"><i class="dot ${stCls(e.status)}"></i>${esc(e.status||"Active")}</span>`;
const ini = n => esc(n.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase());
const chk = e => `<input type="checkbox" class="chk" data-sel="${e.id}" aria-label="Select ${esc(e.name)}" ${sel.has(String(e.id))?"checked":""}>`;
const acts = e => `<div class="ops"><button class="btn sm" data-edit="${e.id}" aria-label="Edit ${esc(e.name)}">Edit</button><button class="btn sm danger" data-del="${e.id}" aria-label="Delete ${esc(e.name)}">Delete</button></div>`;

function renderBars() {
  const c = {}; all.forEach(e => c[e.department] = (c[e.department]||0) + 1);
  const m = Math.max(1, ...Object.values(c));
  $("#bars").innerHTML = Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([d,n]) =>
    `<div class="bar"><span>${esc(d)}</span><div class="track"><div class="fill" style="width:${n/m*100}%"></div></div><b>${n}</b></div>`).join("");
}

function render() {
  const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  page = Math.min(page, pages);
  const slice = rows.slice((page-1)*PER_PAGE, page*PER_PAGE);
  pageIds = slice.map(e => String(e.id));
  let h;
  if (!slice.length) h = `<div class="empty"><b>No employees found</b>Try a different search or filter, or add a new employee.</div>`;
  else if (view === "grid") h = `<div class="gridv">` + slice.map(e => `<div class="raised gcard">${chk(e)}<div class="av">${ini(e.name)}</div>
      <div><strong>${esc(e.name)}</strong><br><small class="sub">${esc(e.position)}</small></div>
      <div><span class="tag">${esc(e.department)}</span>${st(e)}</div><strong>${fmt(e.salary)}</strong>${acts(e)}</div>`).join("") + `</div>`;
  else h = `<div class="row head"><input type="checkbox" class="chk" id="all" aria-label="Select all on this page" ${pageIds.every(i=>sel.has(i))?"checked":""}><span>Employee</span><span>Job title</span><span>Department and status</span><span>Salary</span><span></span></div>` +
    slice.map(e => `<div class="row">${chk(e)}
      <div class="person"><div class="av">${ini(e.name)}</div><div><strong>${esc(e.name)}</strong><small>${esc(e.email)}</small></div></div>
      <span>${esc(e.position)}</span><span><span class="tag">${esc(e.department)}</span>${st(e)}</span>
      <strong>${fmt(e.salary)}</strong>${acts(e)}</div>`).join("");
  $("#list").className = view === "grid" ? "" : "raised list";
  $("#list").innerHTML = h;
  $("#pager").innerHTML = rows.length ? `
    <span>Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE, rows.length)} of ${rows.length}</span>
    <div class="grp"><button class="btn sm" id="prev" ${page<=1?"disabled":""}>Previous</button>
      <span>Page ${page} of ${pages}</span>
      <button class="btn sm" id="next" ${page>=pages?"disabled":""}>Next</button></div>` : "";
  $("#bulk").classList.toggle("on", sel.size > 0);
  $("#bn").textContent = sel.size + " selected";
  renderStats(); renderBars();
}

/* ========= Actions ========= */
function toast(msg, bad) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg;
  $("#toasts").append(t); setTimeout(() => t.remove(), 3200);
}

async function load() {
  $("#list").innerHTML = '<div class="skel"></div>'.repeat(4);
  try {
    all = await api("GET");
    $("#mode").textContent = demo ? "Showing sample employees" : `${all.length} employees in total`;
    renderDepts(); render();
  } catch (e) { $("#list").innerHTML = `<div class="empty"><b>Couldn't load employees</b>${esc(e.message)}</div>`; }
}

function openForm(e) {
  editId = e ? e.id : null;
  $("#ft").textContent = e ? "Edit employee" : "Add employee";
  for (const k of ["name","email","department","salary","position","status"]) $("#"+k).value = e ? (e[k] ?? "Active") : (k === "department" ? "Engineering" : k === "status" ? "Active" : "");
  document.querySelectorAll(".err").forEach(x => x.textContent = "");
  $("#form").showModal(); $("#name").focus();
}

function validate() {
  let ok = true;
  const rules = {
    name: v => v.length >= 2 || "Enter the employee's full name.",
    email: v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || "Enter a valid email address.",
    salary: v => (v !== "" && +v >= 0) || "Enter a salary of 0 or more.",
    position: v => v.length >= 2 || "Enter a job title.",
  };
  for (const [k, fn] of Object.entries(rules)) {
    const r = fn($("#"+k).value.trim());
    $("#"+k).parentElement.querySelector(".err").textContent = r === true ? "" : r;
    if (r !== true) ok = false;
  }
  return ok;
}

$("#f").addEventListener("submit", async ev => {
  ev.preventDefault();
  if (!validate()) return;
  const body = {
    name: $("#name").value.trim(), email: $("#email").value.trim(),
    department: $("#department").value, position: $("#position").value.trim(), status: $("#status").value,
    salary: +$("#salary").value
  };
  $("#save").disabled = true;
  try {
    if (editId) { await api("PUT", "/" + editId, body); toast("Employee updated"); }
    else { await api("POST", "", body); toast("Employee added"); }
    $("#form").close(); await load();
  } catch (e) { toast(e.message || "Couldn't save employee", true); }
  $("#save").disabled = false;
});

$("#list").addEventListener("click", e => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) openForm(all.find(x => x.id == ed.dataset.edit));
  if (del) askDel([del.dataset.del]);
});
function askDel(ids) {
  delIds = ids.map(String);
  $("#cname").textContent = ids.length > 1 ? ids.length + " employees" : all.find(x => x.id == ids[0]).name;
  $("#confirm").showModal();
}
$("#list").addEventListener("change", e => {
  if (e.target.id === "all") pageIds.forEach(i => e.target.checked ? sel.add(i) : sel.delete(i));
  else if (e.target.dataset.sel) e.target.checked ? sel.add(e.target.dataset.sel) : sel.delete(e.target.dataset.sel);
  render();
});
$("#bdel").onclick = () => askDel([...sel]);
$("#bclr").onclick = () => { sel.clear(); render(); };
const setView = v => { view = v; $("#vl").setAttribute("aria-pressed", v==="list"); $("#vg").setAttribute("aria-pressed", v==="grid"); render(); };
$("#vl").onclick = () => setView("list"); $("#vg").onclick = () => setView("grid");
addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector("dialog[open]")) return;
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
  if (e.key.toLowerCase() === "n") { e.preventDefault(); openForm(); }
});
$("#yes").onclick = async () => {
  try { for (const id of delIds) await api("DELETE", "/" + id); sel.clear(); toast(delIds.length > 1 ? "Employees deleted" : "Employee deleted"); await load(); }
  catch (e) { toast(e.message || "Couldn't delete employee", true); }
  $("#confirm").close();
};
$("#no").onclick = () => $("#confirm").close();
$("#cancel").onclick = () => $("#form").close();
$("#add").onclick = () => openForm();

$("#pager").addEventListener("click", e => {
  if (e.target.id === "prev") page--; if (e.target.id === "next") page++; render();
});
let tm; $("#q").addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { page = 1; render(); }, 180); });
$("#dept").onchange = $("#sort").onchange = $("#sfilter").onchange = () => { page = 1; render(); };

$("#export").onclick = () => {
  const rows = filtered(), h = ["id","name","email","department","position","salary","status"];
  const csv = [h.join(","), ...rows.map(r => h.map(k => `"${String(r[k]).replace(/"/g,'""')}"`).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "employees.csv"; a.click();
};

/* theme (follows system, toggle overrides) */
const root = document.documentElement;
const setTheme = t => { root.dataset.theme = t; $("#theme").textContent = t === "dark" ? "☀️" : "🌙"; };
setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
$("#theme").onclick = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark");

load();
