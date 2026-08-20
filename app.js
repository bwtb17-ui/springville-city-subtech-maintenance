const LEGACY_STORAGE_KEY = "maintenanceTrackerTasks_v1";
const SESSION_KEY = "subtech_supabase_session_v1";
const config = window.SUBTECH_CONFIG || {};
const SUPABASE_URL = (config.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || "";

const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");
const signOutBtn = document.getElementById("signOutBtn");
const signedInAs = document.getElementById("signedInAs");
const syncStatus = document.getElementById("syncStatus");

const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const taskDialog = document.getElementById("taskDialog");
const taskForm = document.getElementById("taskForm");
const addTaskBtn = document.getElementById("addTaskBtn");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const cancelBtn = document.getElementById("cancelBtn");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const formTitle = document.getElementById("formTitle");

const fields = {
  id: document.getElementById("taskId"),
  location: document.getElementById("location"),
  taskName: document.getElementById("taskName"),
  partNumber: document.getElementById("partNumber"),
  intervalValue: document.getElementById("intervalValue"),
  intervalUnit: document.getElementById("intervalUnit"),
  lastCompleted: document.getElementById("lastCompleted"),
  notes: document.getElementById("notes")
};

const nextDuePreview = document.getElementById("nextDuePreview");
let tasks = [];
let session = null;
let refreshTimer = null;

function configured() {
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("PASTE_") &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("PASTE_");
}

function saveSession(value) {
  session = value;
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

async function authRequest(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || "Sign-in failed");
  return data;
}

async function refreshSessionIfNeeded() {
  if (!session?.refresh_token) return false;
  const expiresAt = Number(session.expires_at || 0) * 1000;
  if (expiresAt && Date.now() < expiresAt - 60000) return true;
  try {
    const fresh = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    saveSession(fresh);
    return true;
  } catch {
    signOut();
    return false;
  }
}

function currentEmail() {
  return session?.user?.email || "Signed-in user";
}

async function dbRequest(path = "", options = {}) {
  await refreshSessionIfNeeded();
  if (!session?.access_token) throw new Error("You are not signed in.");

  const response = await fetch(`${SUPABASE_URL}/rest/v1/maintenance_tasks${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    signOut();
    throw new Error("Your sign-in expired. Please sign in again.");
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `Database error (${response.status})`);
  return data;
}

function fromDb(row) {
  return {
    id: row.id,
    location: row.location,
    taskName: row.task_name,
    partNumber: row.part_number || "",
    intervalValue: row.interval_value,
    intervalUnit: row.interval_unit,
    lastCompleted: row.last_completed,
    lastCompletedBy: row.last_completed_by || "",
    notes: row.notes || "",
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || ""
  };
}

function toDb(task) {
  return {
    id: task.id,
    location: task.location,
    task_name: task.taskName,
    part_number: task.partNumber || null,
    interval_value: Number(task.intervalValue),
    interval_unit: task.intervalUnit,
    last_completed: task.lastCompleted,
    last_completed_by: task.lastCompletedBy || null,
    notes: task.notes || null,
    updated_at: new Date().toISOString(),
    updated_by: currentEmail()
  };
}

function setSync(message, ok = true) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("sync-ok", ok);
  syncStatus.classList.toggle("sync-error", !ok);
}

async function loadTasks(showStatus = true) {
  try {
    if (showStatus) setSync("Syncing…", true);
    const rows = await dbRequest("?select=*&order=updated_at.desc", { method: "GET", prefer: "" });
    tasks = (rows || []).map(fromDb);
    renderTasks();
    setSync(`Shared list updated ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`, true);
    await offerLegacyImport();
  } catch (error) {
    setSync(error.message, false);
  }
}

async function offerLegacyImport() {
  if (tasks.length !== 0) return;
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)) || []; } catch {}
  if (!legacy.length) return;
  if (!confirm(`This phone has ${legacy.length} task${legacy.length === 1 ? "" : "s"} from the old device-only version. Import them into the shared list?`)) return;

  try {
    const rows = legacy.map(t => toDb({
      ...t,
      id: t.id || crypto.randomUUID(),
      lastCompletedBy: t.lastCompletedBy || ""
    }));
    await dbRequest("", { method: "POST", body: JSON.stringify(rows) });
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    await loadTasks(false);
    alert("Existing tasks were imported into the shared database.");
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

function dateOnly(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function parseLocalDate(value) { const [y,m,d] = value.split("-").map(Number); return new Date(y, m - 1, d); }
function formatInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDisplayDate(value) {
  if (!value) return "—";
  return parseLocalDate(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function calculateNextDue(lastCompleted, intervalValue, intervalUnit) {
  if (!lastCompleted || !intervalValue || !intervalUnit) return null;
  const date = parseLocalDate(lastCompleted);
  const amount = Number(intervalValue);
  if (intervalUnit === "days") date.setDate(date.getDate() + amount);
  else if (intervalUnit === "weeks") date.setDate(date.getDate() + amount * 7);
  else if (intervalUnit === "months") {
    const originalDay = date.getDate();
    date.setDate(1); date.setMonth(date.getMonth() + amount);
    const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, maxDay));
  } else if (intervalUnit === "years") {
    const month = date.getMonth();
    date.setFullYear(date.getFullYear() + amount);
    if (date.getMonth() !== month) date.setDate(0);
  }
  return date;
}

function getDaysUntilDue(task) {
  const due = calculateNextDue(task.lastCompleted, task.intervalValue, task.intervalUnit);
  return Math.round((dateOnly(due) - dateOnly()) / 86400000);
}

function getStatus(task) {
  const days = getDaysUntilDue(task);
  if (days < 0) return { type: "overdue", label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` };
  if (days === 0) return { type: "due-soon", label: "Due today" };
  if (days <= 30) return { type: "due-soon", label: `Due in ${days} day${days === 1 ? "" : "s"}` };
  return { type: "current", label: `Due in ${days} days` };
}

function intervalText(task) {
  const value = Number(task.intervalValue);
  const unit = value === 1 ? task.intervalUnit.replace(/s$/, "") : task.intervalUnit;
  return `Every ${value} ${unit}`;
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderTasks() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;
  const sorted = [...tasks].sort((a,b) => getDaysUntilDue(a) - getDaysUntilDue(b));
  const filtered = sorted.filter(task => {
    const haystack = `${task.location} ${task.taskName} ${task.partNumber || ""} ${task.notes || ""}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    const status = getStatus(task);
    if (filter === "overdue" && status.type !== "overdue") return false;
    if (filter === "dueSoon" && status.type !== "due-soon") return false;
    if (filter === "current" && status.type !== "current") return false;
    return true;
  });

  taskList.innerHTML = "";
  filtered.forEach(task => {
    const status = getStatus(task);
    const nextDue = calculateNextDue(task.lastCompleted, task.intervalValue, task.intervalUnit);
    const card = document.createElement("article");
    card.className = `task-card ${status.type}`;
    card.innerHTML = `
      <div class="task-content">
        <div class="task-top"><div><div class="task-location">${escapeHtml(task.location)}</div><h2 class="task-name">${escapeHtml(task.taskName)}</h2></div><div class="status-badge ${status.type}">${escapeHtml(status.label)}</div></div>
        <div class="task-details">
          <div><strong>Next due:</strong> ${formatDisplayDate(formatInputDate(nextDue))}</div>
          <div><strong>Interval:</strong> ${escapeHtml(intervalText(task))}</div>
          <div><strong>Last completed:</strong> ${formatDisplayDate(task.lastCompleted)}${task.lastCompletedBy ? ` by ${escapeHtml(task.lastCompletedBy)}` : ""}</div>
          ${task.partNumber ? `<div><strong>Part #:</strong> ${escapeHtml(task.partNumber)}</div>` : ""}
        </div>
        ${task.notes ? `<div class="notes">${escapeHtml(task.notes)}</div>` : ""}
      </div>
      <div class="task-actions">
        <button class="complete-btn" data-action="complete" data-id="${task.id}">✓ Complete Today</button>
        <button class="edit-btn" data-action="edit" data-id="${task.id}">Edit</button>
        <button class="danger-btn" data-action="delete" data-id="${task.id}">Delete</button>
      </div>`;
    taskList.appendChild(card);
  });
  emptyState.classList.toggle("hidden", tasks.length > 0);
}

function openAddDialog() {
  taskForm.reset(); fields.id.value = ""; fields.intervalValue.value = "30"; fields.intervalUnit.value = "months";
  fields.lastCompleted.value = formatInputDate(new Date()); formTitle.textContent = "Add Maintenance Task"; updateDuePreview(); taskDialog.showModal();
}

function openEditDialog(id) {
  const task = tasks.find(t => t.id === id); if (!task) return;
  fields.id.value = task.id; fields.location.value = task.location; fields.taskName.value = task.taskName;
  fields.partNumber.value = task.partNumber || ""; fields.intervalValue.value = task.intervalValue;
  fields.intervalUnit.value = task.intervalUnit; fields.lastCompleted.value = task.lastCompleted; fields.notes.value = task.notes || "";
  formTitle.textContent = "Edit Maintenance Task"; updateDuePreview(); taskDialog.showModal();
}

function updateDuePreview() {
  const due = calculateNextDue(fields.lastCompleted.value, fields.intervalValue.value, fields.intervalUnit.value);
  nextDuePreview.textContent = due ? due.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";
}

async function signIn(email, password) {
  if (!configured()) throw new Error("Supabase is not configured yet. Add the Project URL and anon key to config.js.");
  const data = await authRequest("token?grant_type=password", { email, password });
  saveSession(data);
  showApp();
  await loadTasks();
}

function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  signedInAs.textContent = currentEmail();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!taskDialog.open && document.visibilityState === "visible") loadTasks(false);
  }, 20000);
}

function showLogin(message = "") {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginMessage.textContent = message;
}

function signOut() {
  saveSession(null); tasks = [];
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  showLogin();
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault(); loginMessage.textContent = "Signing in…";
  try { await signIn(loginEmail.value.trim(), loginPassword.value); loginPassword.value = ""; }
  catch (error) { loginMessage.textContent = error.message; }
});

signOutBtn.addEventListener("click", signOut);
addTaskBtn.addEventListener("click", openAddDialog);
closeDialogBtn.addEventListener("click", () => taskDialog.close());
cancelBtn.addEventListener("click", () => taskDialog.close());
[fields.lastCompleted, fields.intervalValue, fields.intervalUnit].forEach(el => {
  el.addEventListener("input", updateDuePreview); el.addEventListener("change", updateDuePreview);
});

taskForm.addEventListener("submit", async event => {
  event.preventDefault();
  const editing = Boolean(fields.id.value);
  const existing = editing ? tasks.find(t => t.id === fields.id.value) : null;
  const task = {
    id: fields.id.value || crypto.randomUUID(), location: fields.location.value.trim(), taskName: fields.taskName.value.trim(),
    partNumber: fields.partNumber.value.trim(), intervalValue: Number(fields.intervalValue.value), intervalUnit: fields.intervalUnit.value,
    lastCompleted: fields.lastCompleted.value, lastCompletedBy: existing?.lastCompletedBy || "", notes: fields.notes.value.trim()
  };
  try {
    setSync("Saving…", true);
    if (editing) await dbRequest(`?id=eq.${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify(toDb(task)) });
    else await dbRequest("", { method: "POST", body: JSON.stringify(toDb(task)) });
    taskDialog.close(); await loadTasks(false);
  } catch (error) { alert(`Could not save task: ${error.message}`); setSync(error.message, false); }
});

taskList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]"); if (!button) return;
  const id = button.dataset.id, action = button.dataset.action;
  const task = tasks.find(t => t.id === id); if (!task) return;
  if (action === "edit") return openEditDialog(id);
  if (action === "delete") {
    if (!confirm(`Delete "${task.taskName}"?`)) return;
    try { await dbRequest(`?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); await loadTasks(false); }
    catch (error) { alert(`Could not delete task: ${error.message}`); }
  }
  if (action === "complete") {
    if (!confirm(`Mark "${task.taskName}" complete today?`)) return;
    const updated = { ...task, lastCompleted: formatInputDate(new Date()), lastCompletedBy: currentEmail() };
    try { await dbRequest(`?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(toDb(updated)) }); await loadTasks(false); }
    catch (error) { alert(`Could not complete task: ${error.message}`); }
  }
});

searchInput.addEventListener("input", renderTasks);
filterSelect.addEventListener("change", renderTasks);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) loadTasks(false); });

(async function start() {
  if (!configured()) {
    showLogin("Setup needed: add your Supabase Project URL and anon key to config.js.");
    return;
  }
  session = loadSession();
  if (session && await refreshSessionIfNeeded()) { showApp(); await loadTasks(); }
  else showLogin();
})();
