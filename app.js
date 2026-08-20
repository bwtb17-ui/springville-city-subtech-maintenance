const STORAGE_KEY = "maintenanceTrackerTasks_v1";

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

let tasks = loadTasks();

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function dateOnly(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value) {
  if (!value) return "—";
  return parseLocalDate(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function calculateNextDue(lastCompleted, intervalValue, intervalUnit) {
  if (!lastCompleted || !intervalValue || !intervalUnit) return null;

  const date = parseLocalDate(lastCompleted);
  const amount = Number(intervalValue);

  if (intervalUnit === "days") {
    date.setDate(date.getDate() + amount);
  } else if (intervalUnit === "weeks") {
    date.setDate(date.getDate() + amount * 7);
  } else if (intervalUnit === "months") {
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
    const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  } else if (intervalUnit === "years") {
    const month = date.getMonth();
    const day = date.getDate();
    date.setFullYear(date.getFullYear() + amount);
    if (date.getMonth() !== month) {
      date.setDate(0);
    } else {
      date.setDate(day);
    }
  }

  return date;
}

function getDaysUntilDue(task) {
  const due = calculateNextDue(task.lastCompleted, task.intervalValue, task.intervalUnit);
  const today = dateOnly();
  return Math.round((dateOnly(due) - today) / 86400000);
}

function getStatus(task) {
  const days = getDaysUntilDue(task);

  if (days < 0) {
    return {
      type: "overdue",
      label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
    };
  }

  if (days === 0) {
    return { type: "due-soon", label: "Due today" };
  }

  if (days <= 30) {
    return {
      type: "due-soon",
      label: `Due in ${days} day${days === 1 ? "" : "s"}`
    };
  }

  return {
    type: "current",
    label: `Due in ${days} days`
  };
}

function intervalText(task) {
  const value = Number(task.intervalValue);
  const unit = task.intervalUnit;
  const single = value === 1 ? unit.replace(/s$/, "") : unit;
  return `Every ${value} ${single}`;
}

function renderTasks() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;

  const sorted = [...tasks].sort((a, b) => {
    return getDaysUntilDue(a) - getDaysUntilDue(b);
  });

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
        <div class="task-top">
          <div>
            <div class="task-location">${escapeHtml(task.location)}</div>
            <h2 class="task-name">${escapeHtml(task.taskName)}</h2>
          </div>
          <div class="status-badge ${status.type}">${escapeHtml(status.label)}</div>
        </div>

        <div class="task-details">
          <div><strong>Next due:</strong> ${formatDisplayDate(formatInputDate(nextDue))}</div>
          <div><strong>Interval:</strong> ${escapeHtml(intervalText(task))}</div>
          <div><strong>Last completed:</strong> ${formatDisplayDate(task.lastCompleted)}</div>
          ${task.partNumber ? `<div><strong>Part #:</strong> ${escapeHtml(task.partNumber)}</div>` : ""}
        </div>

        ${task.notes ? `<div class="notes">${escapeHtml(task.notes)}</div>` : ""}
      </div>

      <div class="task-actions">
        <button class="complete-btn" data-action="complete" data-id="${task.id}">✓ Complete Today</button>
        <button class="edit-btn" data-action="edit" data-id="${task.id}">Edit</button>
        <button class="danger-btn" data-action="delete" data-id="${task.id}">Delete</button>
      </div>
    `;

    taskList.appendChild(card);
  });

  emptyState.classList.toggle("hidden", tasks.length > 0);
  taskList.classList.toggle("hidden", filtered.length === 0 && tasks.length === 0);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openAddDialog() {
  taskForm.reset();
  fields.id.value = "";
  fields.intervalValue.value = "30";
  fields.intervalUnit.value = "months";
  fields.lastCompleted.value = formatInputDate(new Date());
  formTitle.textContent = "Add Maintenance Task";
  updateDuePreview();
  taskDialog.showModal();
}

function openEditDialog(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  fields.id.value = task.id;
  fields.location.value = task.location;
  fields.taskName.value = task.taskName;
  fields.partNumber.value = task.partNumber || "";
  fields.intervalValue.value = task.intervalValue;
  fields.intervalUnit.value = task.intervalUnit;
  fields.lastCompleted.value = task.lastCompleted;
  fields.notes.value = task.notes || "";

  formTitle.textContent = "Edit Maintenance Task";
  updateDuePreview();
  taskDialog.showModal();
}

function updateDuePreview() {
  const due = calculateNextDue(
    fields.lastCompleted.value,
    fields.intervalValue.value,
    fields.intervalUnit.value
  );

  nextDuePreview.textContent = due
    ? due.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";
}

addTaskBtn.addEventListener("click", openAddDialog);
closeDialogBtn.addEventListener("click", () => taskDialog.close());
cancelBtn.addEventListener("click", () => taskDialog.close());

["input", "change"].forEach(eventName => {
  fields.lastCompleted.addEventListener(eventName, updateDuePreview);
  fields.intervalValue.addEventListener(eventName, updateDuePreview);
  fields.intervalUnit.addEventListener(eventName, updateDuePreview);
});

taskForm.addEventListener("submit", event => {
  event.preventDefault();

  const id = fields.id.value || crypto.randomUUID();

  const task = {
    id,
    location: fields.location.value.trim(),
    taskName: fields.taskName.value.trim(),
    partNumber: fields.partNumber.value.trim(),
    intervalValue: Number(fields.intervalValue.value),
    intervalUnit: fields.intervalUnit.value,
    lastCompleted: fields.lastCompleted.value,
    notes: fields.notes.value.trim(),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = tasks.findIndex(t => t.id === id);

  if (existingIndex >= 0) {
    tasks[existingIndex] = task;
  } else {
    tasks.push(task);
  }

  saveTasks();
  taskDialog.close();
  renderTasks();
});

taskList.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  if (action === "edit") {
    openEditDialog(id);
  }

  if (action === "delete") {
    const confirmed = confirm(`Delete "${task.taskName}"?`);
    if (!confirmed) return;

    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
  }

  if (action === "complete") {
    task.lastCompleted = formatInputDate(new Date());
    task.updatedAt = new Date().toISOString();
    saveTasks();
    renderTasks();
  }
});

searchInput.addEventListener("input", renderTasks);
filterSelect.addEventListener("change", renderTasks);

renderTasks();
