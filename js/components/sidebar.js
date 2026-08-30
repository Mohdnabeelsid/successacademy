// ==========================================================================
// SIDEBAR — role-aware navigation
// ==========================================================================

import { logout } from "../services/auth-service.js";
import { toast } from "./toast.js";

const ADMIN_LINKS = [
  { href: "admin-dashboard.html", label: "Dashboard", icon: "grid", key: "dashboard" },
  { href: "student-management.html", label: "Students", icon: "users", key: "students" },
  { href: "study-log-management.html", label: "Study Logs", icon: "check-square", key: "logs" },
  { href: "reports.html", label: "Reports", icon: "bar-chart", key: "reports" },
  { href: "settings.html", label: "Settings", icon: "settings", key: "settings" }
];

const STUDENT_LINKS = [
  { href: "student-dashboard.html", label: "Dashboard", icon: "grid", key: "dashboard" },
  { href: "student-profile.html", label: "My Profile", icon: "user", key: "profile" },
  { href: "settings.html", label: "Settings", icon: "settings", key: "settings" }
];

const ICONS = {
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  "check-square": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  "bar-chart": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  "log-out": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

/**
 * Renders the sidebar into #sidebar-root.
 * @param {'admin'|'student'} role
 * @param {string} activeKey - matches a link's `key`
 * @param {{name:string, sub:string}} user
 */
export function renderSidebar(role, activeKey, user) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;
  const links = role === "admin" ? ADMIN_LINKS : STUDENT_LINKS;
  const initials = (user?.name || "S A")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  root.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="mark">SA</div>
        <div>
          <div class="name">Success Academy</div>
          <div class="tag">Learning Log</div>
        </div>
      </div>
      <div class="nav-group-label">${role === "admin" ? "Administration" : "My Space"}</div>
      ${links
        .map(
          (l) => `
        <a class="sidebar-link ${l.key === activeKey ? "active" : ""}" href="${l.href}">
          ${ICONS[l.icon] || ""}<span>${l.label}</span>
        </a>`
        )
        .join("")}
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="avatar">${initials}</div>
          <div class="who">
            <div class="n">${user?.name || "—"}</div>
            <div class="r">${user?.sub || (role === "admin" ? "Branch Admin" : "Student")}</div>
          </div>
        </div>
        <button class="logout-btn" id="logout-btn">${ICONS["log-out"]}<span>Sign out</span></button>
      </div>
    </aside>
  `;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await logout();
      const loginPath = role === "admin" ? "admin-login.html" : "student-login.html";
      window.location.href = loginPath;
    } catch (e) {
      toast.error("Could not sign out. Try again.");
    }
  });

  // Mobile menu toggle wiring (topbar renders the button; sidebar just reacts)
  document.addEventListener("click", (e) => {
    if (e.target.closest("#menu-toggle")) {
      document.getElementById("sidebar")?.classList.toggle("open");
    }
  });
}
