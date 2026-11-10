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

// Delay execution slightly to ensure HTML is fully loaded
setTimeout(() => {
    initApp();
}, 10);

function initApp() {
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
    
    // DRAWER LOGIC
    if(menuToggle) {
        menuToggle.addEventListener("click", () => {
            drawer.classList.add("open"); 
            overlay.classList.add("open");
            document.body.classList.add("no-scroll");
        });
    }
    if(drawerClose) {
        drawerClose.addEventListener("click", () => {
            drawer.classList.remove("open"); 
            overlay.classList.remove("open");
            document.body.classList.remove("no-scroll");
        });
    }
    if(overlay) {
        overlay.addEventListener("click", () => {
            drawer.classList.remove("open"); 
            overlay.classList.remove("open");
            document.body.classList.remove("no-scroll");
        });
    }

    // THEME LOGIC
    function applyTheme(theme) {
        document.body.classList.toggle("dark", theme === "dark");
        if(themeToggle) themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
        localStorage.setItem("myDeadlineTheme", theme);
    }
    if(themeToggle) {
        themeToggle.addEventListener("click", () => {
            const isDark = document.body.classList.contains("dark");
            applyTheme(isDark ? "light" : "dark");
        });
    }
    applyTheme(localStorage.getItem("myDeadlineTheme") || "light");

    // MANUAL ADD LOGIC
    if(form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            
            const name = document.getElementById("assignmentName").value.trim();
            const subject = document.getElementById("subject").value.trim();
            const deadline = document.getElementById("deadline").value;
            const priority = document.getElementById("priority").value;

            if (!name || !subject) { 
                showToast("Please complete name and subject.", "error"); 
                return; 
            }

            let deadlineISO = null;
            if (deadline) {
                const t = new Date(deadline).getTime();
                if (t > Date.now()) deadlineISO = new Date(t).toISOString();
            }

            const reminders = [...reminderChips.querySelectorAll("input:checked")]
                .map(input => ({
                    label: input.parentElement.querySelector("span").textContent.trim(),
                    time: Number(input.value) * 60 * 1000
                }));

            const task = {
                id: Date.now().toString(),
                name, 
                subject,
                deadline: deadlineISO, 
                priority, 
                completed: false,
                reminders: deadlineISO ? reminders : [], 
                notificationIds: []
            };
            
            assignments.push(task);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
            
            form.reset(); 
            drawer.classList.remove("open"); 
            overlay.classList.remove("open");
            document.body.classList.remove("no-scroll");
            
            renderAssignments();
            showToast("Assignment added ✓");
        });
    }

    // GOOGLE CLASSROOM SYNC
    if(syncClassroomBtn) {
        syncClassroomBtn.addEventListener('click', async () => {
            try {
                showToast("Connecting to Google...", "success");
                
                // 1. Sign In
                const user = await GoogleAuth.signIn();
                if (!user || !user.authentication || !user.authentication.accessToken) {
                    throw new Error("Could not get access token.");
                }
                const accessToken = user.authentication.accessToken;
                
                showToast("Fetching courses...", "success");

                // 2. Fetch Courses
                const coursesRes = await fetch('https://classroom.googleapis.com/v1/courses', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                const coursesData = await coursesRes.json();
                
                if (coursesData.error) throw new Error(coursesData.error.message);
                if (!coursesData.courses) {
                    showToast("No courses found.", "error");
                    return;
                }

                let newAssignmentsCount = 0;

                // 3. Fetch Assignments
                for (const course of coursesData.courses) {
                    const workRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?courseWorkState=PUBLISHED`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const workData = await workRes.json();

                    if (workData.courseWork) {
                        for (const work of workData.courseWork) {
                            // Skip if already added
                            const exists = assignments.find(a => a.name === work.title && a.subject === course.name);
                            if (exists) continue;

                            // Parse date safely
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
                                    continue; // Skip past assignments
                                }
                            }

                            const newTask = {
                                id: Date.now().toString() + Math.floor(Math.random() * 1000), 
                                name: work.title, 
                                subject: course.name,
                                deadline: deadlineISO, 
                                priority: "Medium", 
                                completed: false,
                                reminders: deadlineISO ? DEFAULT_REMINDERS : [], 
                                notificationIds: []
                            };
                            
                            assignments.push(newTask);
                            newAssignmentsCount++;
                        }
                    }
                }

                localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
                renderAssignments();
                
                if (newAssignmentsCount > 0) {
                    showToast(`Imported ${newAssignmentsCount} new assignments! 🎉`, "success");
                } else {
                    showToast("You're all caught up!", "success");
                }

            } catch (error) {
                console.error("Sync Error:", error);
                showToast(error.message || "Failed to sync. See console.", "error");
            }
        });
    }

    // TOASTS
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

    // RENDER UI
    function renderAssignments() {
        assignmentList.innerHTML = "";
        activeCount.textContent = assignments.filter(t => !t.completed).length;
        completedCount.textContent = assignments.filter(t => t.completed).length;
        totalCount.textContent = `${assignments.length} task${assignments.length === 1 ? "" : "s"}`;

        if (assignments.length === 0) {
            assignmentList.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><h3>No assignments yet</h3></div>`;
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
            if (task.completed) card.classList.add("is-completed");

            const head = document.createElement("div");
            head.className = "card-head";
            head.innerHTML = `<h3>${task.name}</h3><span class="priority ${task.priority}">${task.priority}</span>`;

            const meta = document.createElement("div");
            meta.className = "card-meta";
            
            let dateStr = "No due date";
            if (task.deadline) {
                const d = new Date(task.deadline);
                if(!isNaN(d)) dateStr = d.toLocaleDateString() + " • " + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            
            meta.innerHTML = `<span>${task.subject}</span><span>${dateStr}</span>`;
            card.append(head, meta);

            if (task.completed) {
                card.innerHTML += `<div class="status completed">Completed ✓</div>`;
            } else if (!task.deadline) {
                card.innerHTML += `<div class="status no-date">No due date</div>`;
            } else {
                const diff = new Date(task.deadline).getTime() - Date.now();
                if (diff <= 0) {
                    card.innerHTML += `<div class="status expired">Deadline passed</div>`;
                } else {
                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const m = Math.floor((diff / (1000 * 60)) % 60);
                    card.innerHTML += `
                        <div class="countdown">
                            <div class="time-box"><strong>${d}</strong><small>Days</small></div>
                            <div class="time-box"><strong>${h}</strong><small>Hours</small></div>
                            <div class="time-box"><strong>${m}</strong><small>Mins</small></div>
                        </div>`;
                }
            }

            const actions = document.createElement("div");
            actions.className = "actions";
            if (!task.completed) {
                actions.innerHTML = `<button class="btn btn-complete" onclick="completeTask('${task.id}')">Complete</button><button class="btn btn-delete" onclick="deleteTask('${task.id}')">Delete</button>`;
            } else {
                actions.innerHTML = `<button class="btn btn-delete" onclick="deleteTask('${task.id}')">Delete</button>`;
            }
            card.append(actions);
            assignmentList.append(card);
        });
    }

    // GLOBAL FUNCTIONS FOR BUTTONS
    window.completeTask = (id) => {
        const task = assignments.find(t => t.id === id);
        if(task) {
            task.completed = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
            renderAssignments();
        }
    };
    window.deleteTask = (id) => {
        if(confirm("Delete this assignment?")) {
            assignments = assignments.filter(t => t.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
            renderAssignments();
        }
    };

    renderAssignments();
}
