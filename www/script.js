import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

/* =====================================
   MY DEADLINE — MAIN JAVASCRIPT
   ===================================== */

const STORAGE_KEY = "myDeadlineAssignments";

let assignments = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
);

const DEFAULT_REMINDERS = [
    { label: "1 day", time: 1440 },
    { label: "6 hours", time: 360 },
    { label: "1 hour", time: 60 }
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

const searchInput = document.getElementById("assignmentSearch");
const filterSelect = document.getElementById("assignmentFilter");
const sortSelect = document.getElementById("assignmentSort");

/* =====================================
   TOAST MESSAGES
   ===================================== */

function showToast(message, type = "success") {
    const toast = document.createElement("div");

    toast.textContent = message;

    Object.assign(toast.style, {
        background: type === "error" ? "#dc4c5b" : "#20a879",
        color: "#ffffff",
        padding: "14px 20px",
        marginTop: "10px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: "600",
        textAlign: "center",
        boxShadow: "0 5px 20px rgba(0,0,0,0.2)",
        opacity: "0",
        transition: "opacity 0.25s ease"
    });

    toastHost.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = "1";
    });

    setTimeout(() => {
        toast.style.opacity = "0";

        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/* =====================================
   SAVE DATA
   ===================================== */

function saveAssignments() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(assignments)
    );
}

/* =====================================
   GENERATE UNIQUE ID
   ===================================== */

function generateId() {
    return Date.now().toString() +
        Math.floor(Math.random() * 1000);
}

/* =====================================
   FORMAT DATE
   ===================================== */

function formatDate(dateString) {
    const date = new Date(dateString);

    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
    }) + " • " + date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatForInput(dateString) {
    const date = new Date(dateString);

    const pad = number =>
        String(number).padStart(2, "0");

    return (
        date.getFullYear() + "-" +
        pad(date.getMonth() + 1) + "-" +
        pad(date.getDate()) + "T" +
        pad(date.getHours()) + ":" +
        pad(date.getMinutes())
    );
}

/* =====================================
   SELECTED REMINDERS
   ===================================== */

function getSelectedReminders() {
    return [
        ...reminderChips.querySelectorAll("input:checked")
    ].map(input => ({
        label: input.nextElementSibling.textContent.trim(),
        time: Number(input.value)
    })).sort((a, b) => b.time - a.time);
}

/* =====================================
   ANDROID NOTIFICATIONS
   ===================================== */

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
        console.error("Notification permission error:", error);
        return false;
    }
}

async function cancelReminders(task) {
    if (
        !Capacitor.isNativePlatform() ||
        !task.notificationIds ||
        task.notificationIds.length === 0
    ) {
        return;
    }

    try {
        await LocalNotifications.cancel({
            notifications: task.notificationIds.map(id => ({
                id: Number(id)
            }))
        });

    } catch (error) {
        console.error("Cancel notification error:", error);
    }

    task.notificationIds = [];
}

async function scheduleReminders(task) {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    const permission = await requestNotificationPermission();

    if (!permission) {
        showToast("Notification permission not granted.", "error");
        return;
    }

    await cancelReminders(task);

    const reminders = Array.isArray(task.reminders)
        ? task.reminders
        : [];

    const deadline = new Date(task.deadline).getTime();
    const now = Date.now();

    let nextId = Number(
        localStorage.getItem("myDeadlineNextNotificationId")
    ) || 1000;

    const notifications = [];

    reminders.forEach(reminder => {
        const reminderTime =
            deadline - Number(reminder.time) * 60 * 1000;

        if (reminderTime > now) {
            const id = nextId++;

            notifications.push({
                id: id,
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
        String(nextId)
    );

    if (notifications.length > 0) {
        try {
            await LocalNotifications.schedule({
                notifications
            });

        } catch (error) {
            console.error("Schedule notification error:", error);
            task.notificationIds = [];

            showToast("Could not schedule reminders.", "error");
        }
    }

    saveAssignments();
}

/* =====================================
   DRAWER OPEN AND CLOSE
   ===================================== */

function openDrawer() {
    document.body.classList.add("drawer-open");

    drawer.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");

    setTimeout(() => {
        document.getElementById("assignmentName").focus();
    }, 300);
}

function closeDrawer() {
    document.body.classList.remove("drawer-open");

    drawer.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
}

menuToggle.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeDrawer();
    }
});

/* =====================================
   ADD NEW ASSIGNMENT
   ===================================== */

form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = document
        .getElementById("assignmentName")
        .value.trim();

    const subject = document
        .getElementById("subject")
        .value.trim();

    const deadline = document
        .getElementById("deadline")
        .value;

    const priority = document
        .getElementById("priority")
        .value;

    const reminders = getSelectedReminders();

    const deadlineTime = new Date(deadline).getTime();

    if (!name || !subject || !deadline) {
        showToast("Please complete all fields.", "error");
        return;
    }

    if (
        !Number.isFinite(deadlineTime) ||
        deadlineTime <= Date.now()
    ) {
        showToast("Please choose a future deadline.", "error");
        return;
    }

    const task = {
        id: generateId(),
        name: name,
        subject: subject,
        deadline: new Date(deadlineTime).toISOString(),
        priority: priority,
        completed: false,
        reminders: reminders,
        notificationIds: []
    };

    assignments.push(task);

    saveAssignments();

    await scheduleReminders(task);

    form.reset();

    // Restore default reminder selections
    reminderChips.querySelectorAll("input").forEach(input => {
        input.checked = ["1440", "360", "60"].includes(input.value);
    });

    closeDrawer();

    renderAssignments();

    showToast("Assignment added successfully ✓");
});

/* =====================================
   COUNTDOWN
   ===================================== */

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

/* =====================================
   RENDER ASSIGNMENTS
   ===================================== */

function renderAssignments() {
    assignmentList.innerHTML = "";

    // Dashboard statistics
    const active = assignments.filter(
        task => !task.completed
    ).length;

    const completed = assignments.filter(
        task => task.completed
    ).length;

    activeCount.textContent = active;
    completedCount.textContent = completed;

    totalCount.textContent =
        `${assignments.length} task${assignments.length === 1 ? "" : "s"}`;

    if (assignments.length === 0) {
        assignmentList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>
                <h3>No assignments yet</h3>
                <p>
                    Tap the Add Assignment button to create
                    your first assignment.
                </p>
            </div>
        `;

        return;
    }

    let visible = [...assignments];

    // Search
    const searchTerm =
        searchInput.value.trim().toLowerCase();

    if (searchTerm) {
        visible = visible.filter(task =>
            task.name.toLowerCase().includes(searchTerm) ||
            task.subject.toLowerCase().includes(searchTerm)
        );
    }

    // Filter
    const filter = filterSelect.value;

    if (filter === "active") {
        visible = visible.filter(task => !task.completed);
    }

    if (filter === "completed") {
        visible = visible.filter(task => task.completed);
    }

    if (filter === "overdue") {
        visible = visible.filter(task =>
            !task.completed &&
            new Date(task.deadline).getTime() <= Date.now()
        );
    }

    // Sort
    const sort = sortSelect.value;

    visible.sort((a, b) => {
        if (sort === "priority") {
            const rank = {
                High: 3,
                Medium: 2,
                Low: 1
            };

            return rank[b.priority] - rank[a.priority] ||
                new Date(a.deadline) - new Date(b.deadline);
        }

        if (sort === "newest") {
            return String(b.id).localeCompare(String(a.id));
        }

        return new Date(a.deadline) - new Date(b.deadline);
    });

    if (visible.length === 0) {
        assignmentList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No matching assignments</h3>
                <p>Try another search or change your filter.</p>
            </div>
        `;

        return;
    }

    // Create assignment cards
    visible.forEach(task => {
        const card = document.createElement("div");

        card.className = "assignment-card";

        if (task.completed) {
            card.classList.add("completed");
        }

        // Assignment name
        const heading = document.createElement("h3");
        heading.textContent = task.name;

        // Subject
        const subject = document.createElement("p");
        subject.className = "assignment-subject";
        subject.textContent = "📚 " + task.subject;

        // Priority
        const priority = document.createElement("p");

        priority.className =
            "priority-" + task.priority.toLowerCase();

        priority.style.marginTop = "9px";
        priority.style.fontWeight = "700";

        priority.textContent =
            "Priority: " + task.priority;

        // Deadline
        const date = document.createElement("p");
        date.style.marginTop = "9px";
        date.textContent =
            "📅 " + formatDate(task.deadline);

        card.append(
            heading,
            subject,
            priority,
            date
        );

        // Reminder information
        if (
            Array.isArray(task.reminders) &&
            task.reminders.length > 0
        ) {
            const reminder = document.createElement("p");

            reminder.style.marginTop = "8px";

            reminder.textContent =
                "🔔 Reminders: " +
                task.reminders.map(item => item.label).join(", ");

            card.appendChild(reminder);
        }

        // Countdown or status
        if (task.completed) {
            const status = document.createElement("p");

            status.style.marginTop = "13px";
            status.style.color = "var(--green)";
            status.style.fontWeight = "700";

            status.textContent = "✓ Completed";

            card.appendChild(status);

        } else {
            const countdown = getCountdown(task.deadline);

            const timer = document.createElement("p");

            timer.className = "countdown";
            timer.style.marginTop = "13px";

            if (countdown) {
                timer.textContent =
                    `${countdown.days}d ${countdown.hours}h ` +
                    `${countdown.minutes}m ${countdown.seconds}s remaining`;

            } else {
                timer.textContent = "⚠️ Deadline passed";
                timer.style.color = "var(--red)";
            }

            card.appendChild(timer);
        }

        // Action buttons
        if (!task.completed) {
            const completeButton =
                document.createElement("button");

            completeButton.textContent = "✓ Complete";

            completeButton.addEventListener("click", () => {
                completeAssignment(task.id);
            });

            const editButton =
                document.createElement("button");

            editButton.textContent = "✎ Edit";

            editButton.addEventListener("click", () => {
                editAssignment(task.id);
            });

            card.append(
                completeButton,
                editButton
            );
        }

        const deleteButton =
            document.createElement("button");

        deleteButton.className = "delete-button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            deleteAssignment(task.id);
        });

        card.appendChild(deleteButton);

        assignmentList.appendChild(card);
    });
}

/* =====================================
   COMPLETE ASSIGNMENT
   ===================================== */

async function completeAssignment(id) {
    const task = assignments.find(
        item => item.id === id
    );

    if (!task) return;

    task.completed = true;

    await cancelReminders(task);

    saveAssignments();
    renderAssignments();

    showToast("Assignment completed ✓");
}

/* =====================================
   DELETE ASSIGNMENT
   ===================================== */

async function deleteAssignment(id) {
    const task = assignments.find(
        item => item.id === id
    );

    if (!task) return;

    const confirmed = confirm(
        "Are you sure you want to delete this assignment?"
    );

    if (!confirmed) return;

    await cancelReminders(task);

    assignments = assignments.filter(
        item => item.id !== id
    );

    saveAssignments();
    renderAssignments();

    showToast("Assignment deleted.");
}

/* =====================================
   EDIT ASSIGNMENT
   ===================================== */

async function editAssignment(id) {
    const task = assignments.find(
        item => item.id === id
    );

    if (!task) return;

    const name = prompt(
        "Assignment name:",
        task.name
    );

    if (name === null) return;

    const subject = prompt(
        "Subject:",
        task.subject
    );

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

/* =====================================
   DARK AND LIGHT THEME
   ===================================== */

function applyTheme(theme) {
    document.body.classList.toggle(
        "dark-theme",
        theme === "dark"
    );

    themeToggle.textContent =
        theme === "dark" ? "☀️" : "🌙";

    localStorage.setItem(
        "myDeadlineTheme",
        theme
    );
}

themeToggle.addEventListener("click", () => {
    const isDark =
        document.body.classList.contains("dark-theme");

    applyTheme(isDark ? "light" : "dark");
});

/* =====================================
   SEARCH, FILTER AND SORT
   ===================================== */

searchInput.addEventListener("input", renderAssignments);

filterSelect.addEventListener("change", renderAssignments);

sortSelect.addEventListener("change", renderAssignments);

/* =====================================
   START APPLICATION
   ===================================== */

// Support older saved assignments
assignments.forEach(task => {
    if (!Array.isArray(task.reminders)) {
        task.reminders = DEFAULT_REMINDERS.map(item => ({
            ...item
        }));
    }

    if (!Array.isArray(task.notificationIds)) {
        task.notificationIds = [];
    }
});

saveAssignments();

// Load saved theme
const savedTheme =
    localStorage.getItem("myDeadlineTheme") || "light";

applyTheme(savedTheme);

// Display assignments
renderAssignments();

// Update countdown every second
setInterval(() => {
    if (
        assignments.some(task =>
            !task.completed &&
            new Date(task.deadline).getTime() <= Date.now()
        )
    ) {
        renderAssignments();
    } else {
        updateCountdownDisplay();
    }
}, 1000);

/* =====================================
   UPDATE COUNTDOWN DISPLAY
   ===================================== */

function updateCountdownDisplay() {
    const cards = assignmentList.querySelectorAll(
        ".assignment-card"
    );

    cards.forEach(card => {
        const heading = card.querySelector("h3");

        if (!heading) return;

        const task = assignments.find(
            item => item.name === heading.textContent
        );

        if (!task || task.completed) return;

        const countdown = getCountdown(task.deadline);

        const timer = card.querySelector(".countdown");

        if (!timer || !countdown) return;

        timer.textContent =
            `${countdown.days}d ${countdown.hours}h ` +
            `${countdown.minutes}m ${countdown.seconds}s remaining`;
    });
}

console.log("My Deadline app started successfully!");
