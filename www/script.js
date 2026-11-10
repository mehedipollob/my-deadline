import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

// ==============================
// MY DEADLINE — JAVASCRIPT
// ==============================

const STORAGE_KEY = "myDeadlineAssignments";

let assignments = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
);

// Default reminders (1 day, 6 hours, 1 hour)
const DEFAULT_REMINDERS = [
    { label: "1 day", time: 24 * 60 * 60 * 1000 },
    { label: "6 hours", time: 6 * 60 * 60 * 1000 },
    { label: "1 hour", time: 60 * 60 * 1000 }
];

// HTML elements
const form = document.getElementById("assignmentForm");
const assignmentList = document.getElementById("assignmentList");

const activeCount = document.getElementById("activeCount");
const completedCount = document.getElementById("completedCount");
const totalCount = document.getElementById("totalCount");

const themeToggle = document.getElementById("themeToggle");
const menuToggle = document.getElementById("menuToggle");

const drawer = document.getElementById("drawer");
const drawerClose = document.getElementById("drawerClose");
const overlay = document.getElementById("overlay");
const toastHost = document.getElementById("toastHost");

const reminderChips = document.getElementById("reminderChips");

// ==============================
// TOASTS
// ==============================

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastHost.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 320);
    }, 2600);
}

// ==============================
// SAVE ASSIGNMENTS
// ==============================

function saveAssignments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
}

// ==============================
// GENERATE UNIQUE IDS
// ==============================

function generateId() {
    return Date.now().toString() + Math.floor(Math.random() * 1000);
}

// ==============================
// FORMAT DATE FOR UI
// ==============================

function formatDate(isoString) {
    const d = new Date(isoString);
    const datePart = d.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
    const timePart = d.toLocaleTimeString(undefined, { 
        hour: 'numeric', 
        minute: '2-digit' 
    });
    return `${datePart} • ${timePart}`;
}

// ==============================
// FORMAT DATE FOR EDITING
// ==============================

function formatForInput(date) {
    const d = new Date(date);
    const pad = n => String(n).padStart(2, "0");

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==============================
// READ SELECTED REMINDERS
// ==============================

function getSelectedReminders() {
    return [...reminderChips.querySelectorAll("input:checked")]
        .map(input => ({
            label: input.parentElement.querySelector("span")
                .textContent.trim(),
            time: Number(input.value) * 60 * 1000
        }))
        .sort((a, b) => b.time - a.time);
}

// ==============================
// ANDROID NOTIFICATIONS
// ==============================

async function requestNotificationPermission() {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        let permission = await LocalNotifications.checkPermissions();

        if (permission.display !== "granted") {
            permission = await LocalNotifications.requestPermissions();
        }

        return permission.display === "granted";
    } catch (error) {
        console.error("Notification permission:", error);
        return false;
    }
}

async function cancelReminders(task) {
    if (!Capacitor.isNativePlatform() || !task.notificationIds?.length) {
        return;
    }

    try {
        await LocalNotifications.cancel({
            notifications: task.notificationIds.map(id => ({ id }))
        });
    } catch (error) {
        console.error("Cancel reminders:", error);
    }

    task.notificationIds = [];
}

async function scheduleReminders(task) {
    if (!Capacitor.isNativePlatform()) return;

    const permission = await requestNotificationPermission();
    if (!permission) return;

    await cancelReminders(task);

    const reminders = Array.isArray(task.reminders)
        ? task.reminders
        : DEFAULT_REMINDERS;

    if (reminders.length === 0) {
        saveAssignments();
        return;
    }

    const deadline = new Date(task.deadline).getTime();
    const now = Date.now();

    const nextId =
        Number(localStorage.getItem("myDeadlineNextNotificationId")) || 1000;

    let counter = nextId;
    const notifications = [];

    reminders.forEach(reminder => {
        const reminderTime = deadline - reminder.time;

        if (reminderTime > now) {
            const id = counter++;

            notifications.push({
                id,
                title: "My Deadline ⏰",
                body: `${task.name} is due in ${reminder.label}!`,
                schedule: { at: new Date(reminderTime) }
            });

            task.notificationIds.push(id);
        }
    });

    localStorage.setItem("myDeadlineNextNotificationId", String(counter));

    if (notifications.length > 0) {
        try {
            await LocalNotifications.schedule({ notifications });
        } catch (error) {
            console.error("Schedule reminders:", error);
            task.notificationIds = [];
        }
    }

    saveAssignments();
}

// ==============================
// DRAWER (HAMBURGER MENU)
// ==============================

function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");

    setTimeout(() => {
        document.getElementById("assignmentName").focus();
    }, 320);
}

function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
}

menuToggle.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDrawer();
});

// ==============================
// ADD ASSIGNMENT
// ==============================

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = document.getElementById("assignmentName").value.trim();
    const subject = document.getElementById("subject").value.trim();
    const deadline = document.getElementById("deadline").value;
    const priority = document.getElementById("priority").value;

    const reminders = getSelectedReminders();
    const deadlineTime = new Date(deadline).getTime();

    if (!name || !subject || !deadline) {
        showToast("Please complete all fields.", "error");
        return;
    }

    if (!Number.isFinite(deadlineTime) || deadlineTime <= Date.now()) {
        showToast("Please choose a future deadline.", "error");
        return;
    }

    const task = {
        id: generateId(),
        name,
        subject,
        deadline: new Date(deadlineTime).toISOString(),
        priority,
        completed: false,
        reminders,
        notificationIds: []
    };

    assignments.push(task);

    saveAssignments();
    await scheduleReminders(task);

    form.reset();
    closeDrawer();
    renderAssignments();

    showToast(
        reminders.length
            ? "Assignment added ✓"
            : "Added ✓ (no reminders set)"
    );
});

// ==============================
// COUNTDOWN TIMER
// ==============================

function getCountdown(deadline) {
    const difference = new Date(deadline).getTime() - Date.now();

    if (difference <= 0) return null;

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((difference / (1000 * 60)) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    return { days, hours, minutes, seconds };
}

// ==============================
// DISPLAY ASSIGNMENTS
// ==============================

function renderAssignments() {
    assignmentList.innerHTML = "";

    activeCount.textContent =
        assignments.filter(task => !task.completed).length;

    completedCount.textContent =
        assignments.filter(task => task.completed).length;

    totalCount.textContent =
        `${assignments.length} task${assignments.length === 1 ? "" : "s"}`;

    if (assignments.length === 0) {
        assignmentList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>
                <h3>No assignments yet</h3>
                <p>
                    Tap <strong>☰</strong> in the top-left corner
                    to add your first assignment.
                </p>
            </div>
        `;
        return;
    }

    const sorted = [...assignments].sort(
        (a, b) => new Date(a.deadline) - new Date(b.deadline)
    );

    sorted.forEach(task => {
        const card = document.createElement("div");
        card.className = "assignment-card";
        card.dataset.id = task.id;
        card.dataset.priority = task.priority;

        if (task.completed) card.classList.add("is-completed");

        // --- Head ---
        const head = document.createElement("div");
        head.className = "card-head";

        const heading = document.createElement("h3");
        heading.textContent = task.name;

        const badge = document.createElement("span");
        badge.className = `priority ${task.priority}`;
        badge.textContent = task.priority;

        head.append(heading, badge);

        // --- Meta ---
        const meta = document.createElement("div");
        meta.className = "card-meta";

        const subject = document.createElement("span");
        subject.textContent = `📚 ${task.subject}`;

        const date = document.createElement("span");
        date.textContent = `⏰ ${formatDate(task.deadline)}`;

        meta.append(subject, date);

        const reminders = Array.isArray(task.reminders)
            ? task.reminders
            : DEFAULT_REMINDERS;

        if (reminders.length > 0) {
            const reminderInfo = document.createElement("span");
            reminderInfo.className = "reminders";
            reminderInfo.textContent =
                `🔔 ${reminders.map(r => r.label).join(", ")}`;
            meta.append(reminderInfo);
        }

        card.append(head, meta);

        // --- Status / Countdown ---
        if (task.completed) {
            const status = document.createElement("div");
            status.className = "status completed";
            status.textContent = "✓ Completed";
            card.append(status);
        } else {
            const countdown = getCountdown(task.deadline);

            if (countdown) {
                const timer = document.createElement("div");
                timer.className = "countdown";

                const units = [
                    ["days", "Days"],
                    ["hours", "Hours"],
                    ["minutes", "Mins"],
                    ["seconds", "Secs"]
                ];

                units.forEach(([unit, label]) => {
                    const box = document.createElement("div");
                    box.className = "time-box";

                    const strong = document.createElement("strong");
                    strong.textContent = String(countdown[unit]).padStart(2, "0");
                    strong.dataset.unit = unit;

                    const small = document.createElement("small");
                    small.textContent = label;

                    box.append(strong, small);
                    timer.append(box);
                });

                card.append(timer);
            } else {
                const expired = document.createElement("div");
                expired.className = "status expired";
                expired.textContent = "⚠️ Deadline passed";
                card.append(expired);
            }
        }

        // --- Actions ---
        const actions = document.createElement("div");
        actions.className = "actions";

        if (!task.completed) {
            const complete = document.createElement("button");
            complete.className = "btn btn-complete";
            complete.textContent = "✓ Complete";
            complete.addEventListener("click", () => completeAssignment(task.id));

            const edit = document.createElement("button");
            edit.className = "btn btn-edit";
            edit.textContent = "✎ Edit";
            edit.addEventListener("click", () => editAssignment(task.id));

            actions.append(complete, edit);
        }

        const remove = document.createElement("button");
        remove.className = "btn btn-delete";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteAssignment(task.id));

        actions.append(remove);
        card.append(actions);

        assignmentList.append(card);
    });
}

// ==============================
// LIVE COUNTDOWN UPDATER
// ==============================

function updateCountdowns() {
    const cards = assignmentList.querySelectorAll(
        ".assignment-card[data-id]"
    );

    let needsRerender = false;

    cards.forEach(card => {
        const task = assignments.find(item => item.id === card.dataset.id);
        if (!task || task.completed) return;

        const countdown = getCountdown(task.deadline);

        if (!countdown) {
            needsRerender = true;
            return;
        }

        card.querySelectorAll("[data-unit]").forEach(el => {
            const unit = el.dataset.unit;
            el.textContent = String(countdown[unit]).padStart(2, "0");
        });
    });

    if (needsRerender) renderAssignments();
}

// ==============================
// COMPLETE ASSIGNMENT
// ==============================

async function completeAssignment(id) {
    const task = assignments.find(item => item.id === id);
    if (!task) return;

    task.completed = true;

    await cancelReminders(task);

    saveAssignments();
    renderAssignments();

    showToast("Marked as complete ✓");
}

// ==============================
// DELETE ASSIGNMENT
// ==============================

async function deleteAssignment(id) {
    const task = assignments.find(item => item.id === id);
    if (!task) return;

    if (!confirm("Delete this assignment?")) return;

    await cancelReminders(task);

    assignments = assignments.filter(item => item.id !== id);

    saveAssignments();
    renderAssignments();

    showToast("Assignment deleted");
}

// ==============================
// EDIT ASSIGNMENT
// ==============================

async function editAssignment(id) {
    const task = assignments.find(item => item.id === id);
    if (!task) return;

    const name = prompt("Assignment name:", task.name);
    if (name === null) return;

    const subject = prompt("Subject:", task.subject);
    if (subject === null) return;

    const deadline = prompt(
        "Deadline (YYYY-MM-DDTHH:mm):",
        formatForInput(task.deadline)
    );
    if (deadline === null) return;

    const priority = prompt("Priority: Low, Medium or High", task.priority);
    if (priority === null) return;

    const newDeadline = new Date(deadline).getTime();

    if (
        !name.trim() ||
        !subject.trim() ||
        !Number.isFinite(newDeadline) ||
        newDeadline <= Date.now() ||
        !["Low", "Medium", "High"].includes(priority)
    ) {
        showToast("Invalid assignment information.", "error");
        return;
    }

    task.name = name.trim();
    task.subject = subject.trim();
    task.deadline = new Date(newDeadline).toISOString();
    task.priority = priority;

    await cancelReminders(task);
    saveAssignments();
    await scheduleReminders(task);

    renderAssignments();
    showToast("Assignment updated ✓");
}

// ==============================
// DARK / LIGHT THEME
// ==============================

function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem("myDeadlineTheme", theme);
}

themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark");
    applyTheme(isDark ? "light" : "dark");
});

// ==============================
// START APP
// ==============================

// Migrate older saved tasks that have no reminders field
assignments.forEach(task => {
    if (!Array.isArray(task.reminders)) {
        task.reminders = DEFAULT_REMINDERS.map(reminder => ({ ...reminder }));
    }

    if (!Array.isArray(task.notificationIds)) {
        task.notificationIds = [];
    }
});

saveAssignments();

const savedTheme = localStorage.getItem("myDeadlineTheme") || "light";
applyTheme(savedTheme);

renderAssignments();

// Update countdown every second (in place — no full re-render)
setInterval(updateCountdowns, 1000);
