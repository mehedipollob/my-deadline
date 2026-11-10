import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const STORAGE_KEY = "myDeadlineAssignments";

let assignments = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

const DEFAULT_REMINDERS = [
    { label: "1 day", time: 24 * 60 * 60 * 1000 },
    { label: "6 hours", time: 6 * 60 * 60 * 1000 },
    { label: "1 hour", time: 60 * 60 * 1000 }
];

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
const syncClassroomBtn = document.getElementById("syncClassroomBtn");

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

function saveAssignments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
}

function generateId() {
    return Date.now().toString() + Math.floor(Math.random() * 1000);
}

function formatDate(isoString) {
    if (!isoString) return "No due date";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "No valid date";
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} • ${timePart}`;
}

function formatForInput(date) {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getSelectedReminders() {
    return [...reminderChips.querySelectorAll("input:checked")]
        .map(input => ({
            label: input.parentElement.querySelector("span").textContent.trim(),
            time: Number(input.value) * 60 * 1000
        }))
        .sort((a, b) => b.time - a.time);
}

async function requestNotificationPermission() {
    if (!Capacitor.isNativePlatform()) return false;
    try {
        let permission = await LocalNotifications.checkPermissions();
        if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
        return permission.display === "granted";
    } catch (error) { return false; }
}

async function cancelReminders(task) {
    if (!Capacitor.isNativePlatform() || !task.notificationIds?.length) return;
    try {
        await LocalNotifications.cancel({ notifications: task.notificationIds.map(id => ({ id })) });
    } catch (error) { console.error("Cancel reminders:", error); }
    task.notificationIds = [];
}

async function scheduleReminders(task) {
    if (!Capacitor.isNativePlatform() || !task.deadline) return;
    const permission = await requestNotificationPermission();
    if (!permission) return;
    await cancelReminders(task);
    const reminders = Array.isArray(task.reminders) ? task.reminders : DEFAULT_REMINDERS;
    if (reminders.length === 0) { saveAssignments(); return; }
    const deadline = new Date(task.deadline).getTime();
    const now = Date.now();
    let counter = Number(localStorage.getItem("myDeadlineNextNotificationId")) || 1000;
    const notifications = [];

    reminders.forEach(reminder => {
        const reminderTime = deadline - reminder.time;
        if (reminderTime > now) {
            const id = counter++;
            notifications.push({
                id, title: "My Deadline ⏰",
                body: `${task.name} is due in ${reminder.label}!`,
                schedule: { at: new Date(reminderTime) }
            });
            task.notificationIds.push(id);
        }
    });
    localStorage.setItem("myDeadlineNextNotificationId", String(counter));
    if (notifications.length > 0) {
        try { await LocalNotifications.schedule({ notifications }); } 
        catch (error) { task.notificationIds = []; }
    }
    saveAssignments();
}

// GOOGLE CLASSROOM SYNC
syncClassroomBtn.addEventListener('click', async () => {
    try {
        showToast("Connecting to Google...", "success");
        const user = await GoogleAuth.signIn();
        const accessToken = user.authentication.accessToken;
        showToast("Fetching your courses...", "success");

        const coursesRes = await fetch('https://classroom.googleapis.com/v1/courses', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const coursesData = await coursesRes.json();
        if (!coursesData.courses) { showToast("No courses found.", "error"); return; }

        let newAssignmentsCount = 0;

        for (const course of coursesData.courses) {
            const workRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?courseWorkState=PUBLISHED`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const workData = await workRes.json();

            if (workData.courseWork) {
                for (const work of workData.courseWork) {
                    const exists = assignments.find(a => a.name === work.title && a.subject === course.name);
                    if (exists) continue;

                    let deadlineISO = null;
                    if (work.dueDate) {
                        const d = work.dueDate;
                        const t = work.dueTime || {};
                        const year = d.year || new Date().getFullYear();
                        const month = d.month ? d.month - 1 : new Date().getMonth();
                        const day = d.day || new Date().getDate();
                        const hours = t.hours !== undefined ? t.hours : 23;
                        const minutes = t.minutes !== undefined ? t.minutes : 59;
                        const deadlineDate = new Date(year, month, day, hours, minutes);

                        if (!isNaN(deadlineDate.getTime()) && deadlineDate.getTime() > Date.now()) {
                            deadlineISO = deadlineDate.toISOString();
                        } else if (deadlineDate.getTime() <= Date.now()) {
                            continue;
                        }
                    }

                    const newTask = {
                        id: generateId(), name: work.title, subject: course.name,
                        deadline: deadlineISO, priority: "Medium", completed: false,
                        reminders: deadlineISO ? DEFAULT_REMINDERS : [], notificationIds: []
                    };
                    assignments.push(newTask);
                    if (deadlineISO) await scheduleReminders(newTask);
                    newAssignmentsCount++;
                }
            }
        }
        saveAssignments(); renderAssignments();
        showToast(newAssignmentsCount > 0 ? `Imported ${newAssignmentsCount} new assignments! 🎉` : "You're all caught up!", "success");
    } catch (error) {
        showToast(error.message || "Failed to sync Classroom.", "error");
    }
});

// DRAWER
function openDrawer() {
    drawer.classList.add("open"); overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false"); menuToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
    setTimeout(() => document.getElementById("assignmentName").focus(), 320);
}
function closeDrawer() {
    drawer.classList.remove("open"); overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true"); menuToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
}
menuToggle.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);
document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });

// ADD ASSIGNMENT (MANUAL)
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    
    const name = document.getElementById("assignmentName").value.trim();
    const subject = document.getElementById("subject").value.trim();
    const deadline = document.getElementById("deadline").value;
    const priority = document.getElementById("priority").value;
    const reminders = getSelectedReminders();
    const deadlineTime = deadline ? new Date(deadline).getTime() : null;

    // Check if required fields are filled
    if (!name || !subject) { 
        showToast("Please complete name and subject.", "error"); 
        return; 
    }
    
    // If deadline is provided, make sure it's in the future
    if (deadline && (!Number.isFinite(deadlineTime) || deadlineTime <= Date.now())) { 
        showToast("Choose a future deadline.", "error"); 
        return; 
    }

    const task = {
        id: generateId(), name, subject,
        deadline: deadline ? new Date(deadlineTime).toISOString() : null,
        priority, completed: false,
        reminders: deadline ? reminders : [], notificationIds: []
    };
    
    assignments.push(task);
    saveAssignments();
    
    if (task.deadline) {
        await scheduleReminders(task);
    }
    
    form.reset(); 
    closeDrawer(); 
    renderAssignments();
    showToast("Assignment added ✓");
});

// COUNTDOWN
function getCountdown(deadline) {
    if (!deadline) return null;
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return null;
    return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60)
    };
}

// RENDER
function renderAssignments() {
    assignmentList.innerHTML = "";
    activeCount.textContent = assignments.filter(t => !t.completed).length;
    completedCount.textContent = assignments.filter(t => t.completed).length;
    totalCount.textContent = `${assignments.length} task${assignments.length === 1 ? "" : "s"}`;

    if (assignments.length === 0) {
        assignmentList.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><h3>No assignments yet</h3><p>Tap <strong>☰</strong> to add your first assignment.</p></div>`;
        return;
    }

    const sorted = [...assignments].sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });

    sorted.forEach(task => {
        const card = document.createElement("div");
        card.className = "assignment-card";
        card.dataset.id = task.id;
        if (task.completed) card.classList.add("is-completed");

        const head = document.createElement("div");
        head.className = "card-head";
        const heading = document.createElement("h3"); heading.textContent = task.name;
        const badge = document.createElement("span"); badge.className = `priority ${task.priority}`; badge.textContent = task.priority;
        head.append(heading, badge);

        const meta = document.createElement("div");
        meta.className = "card-meta";
        
        const subject = document.createElement("span"); subject.textContent = task.subject;
        const date = document.createElement("span"); date.textContent = formatDate(task.deadline);
        meta.append(subject, date);

        const reminders = Array.isArray(task.reminders) ? task.reminders : [];
        if (reminders.length > 0) {
            const reminderInfo = document.createElement("span");
            reminderInfo.className = "reminders";
            reminderInfo.textContent = `🔔 ${reminders.map(r => r.label).join(", ")}`;
            meta.append(reminderInfo);
        }
        card.append(head, meta);

        if (task.completed) {
            const status = document.createElement("div"); status.className = "status completed"; status.textContent = "Completed ✓"; card.append(status);
        } else if (!task.deadline) {
            const noDate = document.createElement("div"); noDate.className = "status no-date"; noDate.textContent = "No due date"; card.append(noDate);
        } else {
            const countdown = getCountdown(task.deadline);
            if (countdown) {
                const timer = document.createElement("div"); timer.className = "countdown";
                [["days","Days"], ["hours","Hours"], ["minutes","Mins"], ["seconds","Secs"]].forEach(([unit, label]) => {
                    const box = document.createElement("div"); box.className = "time-box";
                    const strong = document.createElement("strong"); strong.textContent = String(countdown[unit]).padStart(2, "0"); strong.dataset.unit = unit;
                    const small = document.createElement("small"); small.textContent = label;
                    box.append(strong, small); timer.append(box);
                });
                card.append(timer);
            } else {
                const expired = document.createElement("div"); expired.className = "status expired"; expired.textContent = "⚠️ Deadline passed"; card.append(expired);
            }
        }

        const actions = document.createElement("div");
        actions.className = "actions";
        if (!task.completed) {
            const complete = document.createElement("button"); complete.className = "btn btn-complete"; complete.textContent = "Complete";
            complete.addEventListener("click", () => completeAssignment(task.id));
            const edit = document.createElement("button"); edit.className = "btn btn-edit"; edit.textContent = "Edit";
            edit.addEventListener("click", () => editAssignment(task.id));
            actions.append(complete, edit);
        }
        const remove = document.createElement("button"); remove.className = "btn btn-delete"; remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteAssignment(task.id));
        actions.append(remove); card.append(actions);

        assignmentList.append(card);
    });
}

function updateCountdowns() {
    const cards = assignmentList.querySelectorAll(".assignment-card[data-id]");
    let needsRerender = false;
    cards.forEach(card => {
        const task = assignments.find(item => item.id === card.dataset.id);
        if (!task || task.completed || !task.deadline) return;
        const countdown = getCountdown(task.deadline);
        if (!countdown) { needsRerender = true; return; }
        card.querySelectorAll("[data-unit]").forEach(el => {
            el.textContent = String(countdown[el.dataset.unit]).padStart(2, "0");
        });
    });
    if (needsRerender) renderAssignments();
}

async function completeAssignment(id) {
    const task = assignments.find(item => item.id === id); if (!task) return;
    task.completed = true; await cancelReminders(task);
    saveAssignments(); renderAssignments(); showToast("Marked as complete ✓");
}

async function deleteAssignment(id) {
    const task = assignments.find(item => item.id === id); if (!task) return;
    if (!confirm("Delete this assignment?")) return;
    await cancelReminders(task); assignments = assignments.filter(item => item.id !== id);
    saveAssignments(); renderAssignments(); showToast("Assignment deleted");
}

async function editAssignment(id) {
    const task = assignments.find(item => item.id === id); if (!task) return;
    const name = prompt("Assignment name:", task.name); if (name === null) return;
    const subject = prompt("Subject:", task.subject); if (subject === null) return;
    const deadline = prompt("Deadline (YYYY-MM-DDTHH:mm) or leave blank:", formatForInput(task.deadline)); if (deadline === null) return;
    const priority = prompt("Priority: Low, Medium or High", task.priority); if (priority === null) return;

    let newDeadline = null;
    if (deadline.trim() !== "") {
        const parsedTime = new Date(deadline).getTime();
        if (!Number.isFinite(parsedTime) || parsedTime <= Date.now()) { showToast("Invalid or past deadline.", "error"); return; }
        newDeadline = new Date(parsedTime).toISOString();
    }
    if (!name.trim() || !subject.trim() || !["Low", "Medium", "High"].includes(priority)) { showToast("Invalid info.", "error"); return; }

    task.name = name.trim(); task.subject = subject.trim(); task.deadline = newDeadline; task.priority = priority;
    await cancelReminders(task); saveAssignments();
    if (task.deadline) await scheduleReminders(task);
    renderAssignments(); showToast("Assignment updated ✓");
}

function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem("myDeadlineTheme", theme);
}

themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark");
    applyTheme(isDark ? "light" : "dark");
});

assignments.forEach(task => {
    if (!Array.isArray(task.reminders)) task.reminders = task.deadline ? DEFAULT_REMINDERS.map(r => ({ ...r })) : [];
    if (!Array.isArray(task.notificationIds)) task.notificationIds = [];
});
saveAssignments();
applyTheme(localStorage.getItem("myDeadlineTheme") || "light");
renderAssignments();
setInterval(updateCountdowns, 1000);
