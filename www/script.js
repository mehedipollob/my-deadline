
import { LocalNotifications } from
    "@capacitor/local-notifications";

import { Capacitor } from "@capacitor/core";

// ==============================
// MY DEADLINE - JAVASCRIPT
// ==============================

const STORAGE_KEY = "myDeadlineAssignments";

let assignments = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
);

// Reminder intervals
const REMINDERS = [
    { label: "1 day", time: 24 * 60 * 60 * 1000 },
    { label: "6 hours", time: 6 * 60 * 60 * 1000 },
    { label: "1 hour", time: 60 * 60 * 1000 }
];

// HTML elements
const form = document.getElementById("assignmentForm");
const assignmentList =
    document.getElementById("assignmentList");

const activeCount =
    document.getElementById("activeCount");

const completedCount =
    document.getElementById("completedCount");

const totalCount =
    document.getElementById("totalCount");

const themeToggle =
    document.getElementById("themeToggle");

// ==============================
// SAVE ASSIGNMENTS
// ==============================

function saveAssignments() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(assignments)
    );
}

// ==============================
// GENERATE UNIQUE IDS
// ==============================

function generateId() {
    return Date.now().toString() +
        Math.floor(Math.random() * 1000);
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
// ANDROID NOTIFICATIONS
// ==============================

async function requestNotificationPermission() {
    if (!Capacitor.isNativePlatform()) {
        return false;
    }

    try {
        let permission =
            await LocalNotifications.checkPermissions();

        if (permission.display !== "granted") {
            permission =
                await LocalNotifications.requestPermissions();
        }

        return permission.display === "granted";

    } catch (error) {
        console.error("Notification permission:", error);
        return false;
    }
}

async function cancelReminders(task) {
    if (
        !Capacitor.isNativePlatform() ||
        !task.notificationIds?.length
    ) {
        return;
    }

    try {
        await LocalNotifications.cancel({
            notifications: task.notificationIds.map(id => ({
                id
            }))
        });
    } catch (error) {
        console.error("Cancel reminders:", error);
    }

    task.notificationIds = [];
}

async function scheduleReminders(task) {
    if (!Capacitor.isNativePlatform()) return;

    const permission =
        await requestNotificationPermission();

    if (!permission) return;

    await cancelReminders(task);

    const deadline = new Date(task.deadline).getTime();
    const now = Date.now();

    const nextId = Number(
        localStorage.getItem("myDeadlineNextNotificationId")
    ) || 1000;

    let counter = nextId;
    const notifications = [];

    REMINDERS.forEach(reminder => {
        const reminderTime = deadline - reminder.time;

        if (reminderTime > now) {
            const id = counter++;

            notifications.push({
                id,
                title: "My Deadline ⏰",
                body: `${task.name} is due in ${reminder.label}!`,
                schedule: {
                    at: new Date(reminderTime)
                }
            });

            task.notificationIds.push(id);
        }
    });

    localStorage.setItem(
        "myDeadlineNextNotificationId",
        String(counter)
    );

    if (notifications.length > 0) {
        try {
            await LocalNotifications.schedule({
                notifications
            });
        } catch (error) {
            console.error("Schedule reminders:", error);
            task.notificationIds = [];
        }
    }

    saveAssignments();
}

// ==============================
// ADD ASSIGNMENT
// ==============================

form.addEventListener("submit", async function(event) {
    event.preventDefault();

    const name =
        document.getElementById("assignmentName").value.trim();

    const subject =
        document.getElementById("subject").value.trim();

    const deadline =
        document.getElementById("deadline").value;

    const priority =
        document.getElementById("priority").value;

    const deadlineTime = new Date(deadline).getTime();

    if (!name || !subject || !deadline) {
        alert("Please complete all fields.");
        return;
    }

    if (!Number.isFinite(deadlineTime) ||
        deadlineTime <= Date.now()) {
        alert("Please choose a future deadline.");
        return;
    }

    const task = {
        id: generateId(),
        name,
        subject,
        deadline: new Date(deadlineTime).toISOString(),
        priority,
        completed: false,
        notificationIds: []
    };

    assignments.push(task);

    saveAssignments();

    await scheduleReminders(task);

    form.reset();

    renderAssignments();

    alert("Assignment added successfully!");
});

// ==============================
// COUNTDOWN TIMER
// ==============================

function getCountdown(deadline) {
    const difference =
        new Date(deadline).getTime() - Date.now();

    if (difference <= 0) {
        return null;
    }

    const days = Math.floor(
        difference / (1000 * 60 * 60 * 24)
    );

    const hours = Math.floor(
        (difference / (1000 * 60 * 60)) % 24
    );

    const minutes = Math.floor(
        (difference / (1000 * 60)) % 60
    );

    const seconds = Math.floor(
        (difference / 1000) % 60
    );

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
        `${assignments.length} tasks`;

    if (assignments.length === 0) {
        assignmentList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>
                <h3>No assignments yet</h3>
                <p>Add your first assignment!</p>
            </div>
        `;
        return;
    }

    const sorted = [...assignments].sort(
        (a, b) =>
            new Date(a.deadline) - new Date(b.deadline)
    );

    sorted.forEach(task => {
        const countdown =
            getCountdown(task.deadline);

        const card = document.createElement("div");
        card.className = "assignment-card";

        const heading = document.createElement("h3");
        heading.textContent = task.name;

        const subject = document.createElement("p");
        subject.textContent = `Subject: ${task.subject}`;

        const date = document.createElement("p");
        date.textContent =
            "Deadline: " +
            new Date(task.deadline).toLocaleString();

        const priority = document.createElement("span");
        priority.className = `priority ${task.priority}`;
        priority.textContent = task.priority + " Priority";

        card.append(heading, subject, date, priority);

        if (task.completed) {
            const status = document.createElement("p");
            status.textContent = "✓ Completed";
            card.append(status);
        } else if (countdown) {
            const timer = document.createElement("div");
            timer.className = "countdown";

            const units = [
                ["Days", countdown.days],
                ["Hours", countdown.hours],
                ["Minutes", countdown.minutes],
                ["Seconds", countdown.seconds]
            ];

            units.forEach(([label, value]) => {
                const box = document.createElement("div");
                box.className = "time-box";

                const strong = document.createElement("strong");
                strong.textContent = String(value).padStart(2, "0");

                const small = document.createElement("small");
                small.textContent = label;

                box.append(strong, small);
                timer.append(box);
            });

            card.append(timer);
        } else {
            const expired = document.createElement("p");
            expired.textContent = "⚠️ Deadline passed";
            card.append(expired);
        }

        const actions = document.createElement("div");
        actions.className = "actions";

        if (!task.completed) {
            const complete = document.createElement("button");
            complete.className = "complete-btn";
            complete.textContent = "✓ Complete";

            complete.addEventListener("click", () => {
                completeAssignment(task.id);
            });

            actions.append(complete);

            const edit = document.createElement("button");
            edit.className = "complete-btn";
            edit.textContent = "✎ Edit";

            edit.addEventListener("click", () => {
                editAssignment(task.id);
            });

            actions.append(edit);
        }

        const remove = document.createElement("button");
        remove.className = "delete-btn";
        remove.textContent = "Delete";

        remove.addEventListener("click", () => {
            deleteAssignment(task.id);
        });

        actions.append(remove);
        card.append(actions);

        assignmentList.append(card);
    });
}

// ==============================
// COMPLETE ASSIGNMENT
// ==============================

async function completeAssignment(id) {
    const task = assignments.find(
        item => item.id === id
    );

    if (!task) return;

    task.completed = true;

    await cancelReminders(task);

    saveAssignments();
    renderAssignments();
}

// ==============================
// DELETE ASSIGNMENT
// ==============================

async function deleteAssignment(id) {
    const task = assignments.find(
        item => item.id === id
    );

    if (!task) return;

    if (!confirm("Delete this assignment?")) return;

    await cancelReminders(task);

    assignments = assignments.filter(
        item => item.id !== id
    );

    saveAssignments();
    renderAssignments();
}

// ==============================
// EDIT ASSIGNMENT
// ==============================

async function editAssignment(id) {
    const task = assignments.find(
        item => item.id === id
    );

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

    const priority = prompt(
        "Priority: Low, Medium or High",
        task.priority
    );

    if (priority === null) return;

    const newDeadline = new Date(deadline).getTime();

    if (
        !name.trim() ||
        !subject.trim() ||
        !Number.isFinite(newDeadline) ||
        newDeadline <= Date.now() ||
        !["Low", "Medium", "High"].includes(priority)
    ) {
        alert("Invalid assignment information.");
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
}

// ==============================
// DARK / LIGHT THEME
// ==============================

function applyTheme(theme) {
    document.body.classList.toggle(
        "dark",
        theme === "dark"
    );

    themeToggle.textContent =
        theme === "dark" ? "☀️" : "🌙";

    localStorage.setItem("myDeadlineTheme", theme);
}

themeToggle.addEventListener("click", () => {
    const isDark =
        document.body.classList.contains("dark");

    applyTheme(isDark ? "light" : "dark");
});

// ==============================
// START APP
// ==============================

const savedTheme =
    localStorage.getItem("myDeadlineTheme") || "light";

applyTheme(savedTheme);

renderAssignments();

// Update countdown every second
setInterval(() => {
    renderAssignments();
}, 1000);
