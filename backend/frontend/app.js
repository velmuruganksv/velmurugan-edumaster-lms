/* =========================================================
   EduMaster LMS — Shared App Utilities
   Loaded on every dashboard/admin page.
   ========================================================= */

const API = "";

/* ---------- AUTH HELPERS ---------- */

function getToken() {
    return localStorage.getItem("token");
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem("user"));
    } catch {
        return null;
    }
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
}

// Call at the top of every protected page.
// requiredRole: "admin", "student", or null (any logged-in user)
function requireAuth(requiredRole) {
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
        window.location.href = "login.html";
        return null;
    }

    if (requiredRole && user.role !== requiredRole) {
        // Logged in, but on the wrong panel — send them where they belong.
        window.location.href = user.role === "admin" ? "admin.html" : "dashboard.html";
        return null;
    }

    return user;
}

/* ---------- TOASTS ---------- */

function ensureToastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
        stack = document.createElement("div");
        stack.className = "toast-stack";
        document.body.appendChild(stack);
    }
    return stack;
}

function showToast(message, type = "default") {
    const stack = ensureToastStack();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    stack.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.25s ease";
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

/* ---------- FETCH WRAPPER ---------- */
// Wraps fetch with basic error handling so a dead/unreachable backend
// shows a clear message instead of a silent crash or blank page.
async function apiFetch(path, options = {}) {
    try {
        const token = getToken();

        const headers = { ...(options.headers || {}) };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`${API}${path}`, { ...options, headers });

        let data = null;
        try {
            data = await response.json();
        } catch {
            // Some endpoints (PDF download) intentionally aren't JSON.
        }

        if (!response.ok) {
            const message = data?.message || `Request failed (${response.status})`;
            throw new Error(message);
        }

        return data;

    } catch (err) {
        if (err instanceof TypeError) {
            // fetch() network failure — server unreachable
            showToast("Can't reach the server. Is the backend running?", "error");
        } else {
            showToast(err.message, "error");
        }
        throw err;
    }
}

/* ---------- MOBILE SIDEBAR TOGGLE ---------- */

function initMobileSidebar() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    // Inject overlay if not present
    let overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        document.body.appendChild(overlay);
    }

    // Inject close button inside sidebar if not present
    if (!sidebar.querySelector(".sidebar-close")) {
        const closeBtn = document.createElement("button");
        closeBtn.className = "sidebar-close";
        closeBtn.innerHTML = "✕";
        closeBtn.setAttribute("aria-label", "Close menu");
        sidebar.prepend(closeBtn);
        closeBtn.addEventListener("click", closeSidebar);
    }

    // Inject hamburger toggle into topbar if not present
    const topbarLeft = document.querySelector(".topbar-left");
    if (topbarLeft && !document.querySelector(".menu-toggle")) {
        const toggle = document.createElement("button");
        toggle.className = "menu-toggle";
        toggle.innerHTML = "☰";
        toggle.setAttribute("aria-label", "Open menu");
        topbarLeft.prepend(toggle);
        toggle.addEventListener("click", openSidebar);
    }

    overlay.addEventListener("click", closeSidebar);
}

function openSidebar() {
    document.querySelector(".sidebar")?.classList.add("open");
    document.querySelector(".sidebar-overlay")?.classList.add("open");
}

function closeSidebar() {
    document.querySelector(".sidebar")?.classList.remove("open");
    document.querySelector(".sidebar-overlay")?.classList.remove("open");
}

/* ---------- COURSE SEARCH (works on courses already rendered) ---------- */
// Filters elements with [data-search-target] by their data-search-text value.
// Re-attached safely even if cards are re-rendered after search runs.
function filterCardsBySearch(inputEl, cardSelector) {
    const query = inputEl.value.trim().toLowerCase();
    const cards = document.querySelectorAll(cardSelector);

    let visibleCount = 0;

    cards.forEach(card => {
        const haystack = (card.dataset.searchText || card.innerText).toLowerCase();
        const match = haystack.includes(query);
        card.style.display = match ? "" : "none";
        if (match) visibleCount++;
    });

    return visibleCount;
}

/* ---------- SMALL HELPERS ---------- */

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function initials(name) {
    if (!name) return "?";
    return name.trim().charAt(0).toUpperCase();
}

// Build an inline SVG progress ring. Used on course cards.
function progressRing(percent, size = 52) {
    const radius = (size - 5) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    const center = size / 2;

    return `
        <div class="progress-ring-wrap" style="width:${size}px;height:${size}px;">
            <svg width="${size}" height="${size}">
                <circle class="progress-ring-track" cx="${center}" cy="${center}" r="${radius}"></circle>
                <circle class="progress-ring-fill" cx="${center}" cy="${center}" r="${radius}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${offset}"></circle>
            </svg>
            <div class="progress-ring-label">${percent}%</div>
        </div>
    `;
}

// Initialize mobile sidebar on every page load automatically
document.addEventListener("DOMContentLoaded", initMobileSidebar);
