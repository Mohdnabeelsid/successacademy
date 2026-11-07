/**
 * SUCCESS ACADEMY — NEXTGEN Online Sessions Admin Management Controller
 * Handles session creation, editing, single-live activation, finishing,
 * attendee inspection, search/filters, and secure CSV export.
 */

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { setButtonLoading } from "../utils/ui-helpers.js";
import {
  listNextgenSessions,
  createNextgenSession,
  updateNextgenSession,
  activateNextgenSession,
  finishNextgenSession,
  deleteNextgenSession,
  getNextgenSession,
  listSessionAttendees,
  exportSessionAttendeesToCSV,
  getNextgenDashboardStats,
  isValidGoogleMeetUrl
} from "../services/nextgen-service.js";

// Page State
let currentAdmin = null;
let allSessions = [];
let activeAttendeeSession = null;
let currentSessionAttendees = [];

// DOM References
const statTotalSessions = document.getElementById("stat-total-sessions");
const statTotalAttendees = document.getElementById("stat-total-attendees");
const statLiveSession = document.getElementById("stat-live-session");
const statLiveFacilitator = document.getElementById("stat-live-facilitator");
const statFinishedSessions = document.getElementById("stat-finished-sessions");

const publicNextgenUrl = document.getElementById("public-nextgen-url");
const copyPublicUrlBtn = document.getElementById("copy-public-url-btn");

const sessionSearchInput = document.getElementById("session-search-input");
const sessionStatusFilter = document.getElementById("session-status-filter");
const refreshSessionsBtn = document.getElementById("refresh-sessions-btn");
const openCreateSessionBtn = document.getElementById("open-create-session-btn");

const sessionsTableBody = document.getElementById("sessions-table-body");

// Session Create/Edit Modal References
const sessionModal = document.getElementById("session-modal");
const sessionModalTitle = document.getElementById("session-modal-title");
const sessionForm = document.getElementById("session-form");
const modalSessionId = document.getElementById("modal-session-id");
const modalSessionTitle = document.getElementById("modal-session-title");
const modalSessionFacilitator = document.getElementById("modal-session-facilitator");
const modalSessionScheduledAt = document.getElementById("modal-session-scheduled-at");
const modalSessionMeetUrl = document.getElementById("modal-session-meet-url");
const closeSessionModalBtn = document.getElementById("close-session-modal-btn");
const cancelSessionBtn = document.getElementById("cancel-session-btn");
const saveSessionBtn = document.getElementById("save-session-btn");

// Attendees Modal References
const attendeesModal = document.getElementById("attendees-modal");
const attendeesModalTitle = document.getElementById("attendees-modal-title");
const attendeesModalSub = document.getElementById("attendees-modal-sub");
const attendeeSearchInput = document.getElementById("attendee-search-input");
const attendeeClassFilter = document.getElementById("attendee-class-filter");
const attendeesCountBadge = document.getElementById("attendees-count-badge");
const exportAttendeesCsvBtn = document.getElementById("export-attendees-csv-btn");
const attendeesTableBody = document.getElementById("attendees-table-body");
const closeAttendeesModalBtn = document.getElementById("close-attendees-modal-btn");
const doneAttendeesBtn = document.getElementById("done-attendees-btn");

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatISTDateTime(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  } catch (_e) {
    return isoStr;
  }
}

function toLocalDatetimeInput(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${mins}`;
  } catch (_e) {
    return "";
  }
}

// Initialize Controller
(async function init() {
  setTimeout(() => {
    const loader = document.getElementById("page-loader");
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
    }
  }, 2000);

  wireEvents();

  try {
    const user = await requireAuth("admin", "admin-login.html");
    currentAdmin = user;

    renderSidebar("admin", "nextgen", {
      name: user.name || "Administrator",
      sub: "Central Admin Portal"
    });

    // Populate public URL box
    if (publicNextgenUrl) {
      const fullUrl = `${window.location.origin}/nextgen`;
      publicNextgenUrl.textContent = fullUrl;
    }

    await refreshData();
  } catch (err) {
    console.error("NEXTGEN Management Init Error:", err);
    toast.error("Error loading NEXTGEN administration.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

function wireEvents() {
  // Copy public link
  if (copyPublicUrlBtn) {
    copyPublicUrlBtn.addEventListener("click", async () => {
      const fullUrl = `${window.location.origin}/nextgen`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        toast.success("Public check-in link copied to clipboard!");
      } catch (_e) {
        toast.info(`Public URL: ${fullUrl}`);
      }
    });
  }

  // Refresh
  if (refreshSessionsBtn) {
    refreshSessionsBtn.addEventListener("click", () => {
      refreshData();
    });
  }

  // Search & Filter
  if (sessionSearchInput) {
    sessionSearchInput.addEventListener("input", renderSessionsTable);
  }
  if (sessionStatusFilter) {
    sessionStatusFilter.addEventListener("change", renderSessionsTable);
  }

  // Open Create Modal
  if (openCreateSessionBtn) {
    openCreateSessionBtn.addEventListener("click", () => {
      openSessionModal();
    });
  }

  // Close Session Modal
  if (closeSessionModalBtn) closeSessionModalBtn.addEventListener("click", closeSessionModal);
  if (cancelSessionBtn) cancelSessionBtn.addEventListener("click", closeSessionModal);
  if (sessionModal) {
    sessionModal.addEventListener("click", (e) => {
      if (e.target === sessionModal) closeSessionModal();
    });
  }

  // Save Session Form
  if (sessionForm) {
    sessionForm.addEventListener("submit", handleSaveSession);
  }

  // Close Attendees Modal
  if (closeAttendeesModalBtn) closeAttendeesModalBtn.addEventListener("click", closeAttendeesModal);
  if (doneAttendeesBtn) doneAttendeesBtn.addEventListener("click", closeAttendeesModal);
  if (attendeesModal) {
    attendeesModal.addEventListener("click", (e) => {
      if (e.target === attendeesModal) closeAttendeesModal();
    });
  }

  // Close modals on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSessionModal();
      closeAttendeesModal();
    }
  });

  // Attendees Search & Class Filter
  if (attendeeSearchInput) {
    attendeeSearchInput.addEventListener("input", renderAttendeesList);
  }
  if (attendeeClassFilter) {
    attendeeClassFilter.addEventListener("change", renderAttendeesList);
  }

  // Export Attendees CSV
  if (exportAttendeesCsvBtn) {
    exportAttendeesCsvBtn.addEventListener("click", handleExportAttendeesCsv);
  }
}

async function refreshData() {
  try {
    // 1. Load Stats
    const stats = await getNextgenDashboardStats();
    if (statTotalSessions) statTotalSessions.textContent = stats.totalSessions;
    if (statTotalAttendees) statTotalAttendees.textContent = stats.totalAttendees;
    if (statFinishedSessions) statFinishedSessions.textContent = stats.finishedSessions;

    if (statLiveSession && statLiveFacilitator) {
      if (stats.liveSession) {
        statLiveSession.textContent = stats.liveSession.title;
        statLiveFacilitator.textContent = `Facilitator: ${stats.liveSession.facilitator_name}`;
      } else {
        statLiveSession.textContent = "None";
        statLiveFacilitator.textContent = "Currently accepting check-ins";
      }
    }

    // 2. Load Sessions List
    allSessions = await listNextgenSessions();
    renderSessionsTable();
  } catch (err) {
    console.error("Failed to refresh NEXTGEN data:", err);
    toast.error("Failed to load NEXTGEN sessions.");
  }
}

function renderSessionsTable() {
  if (!sessionsTableBody) return;

  const query = (sessionSearchInput?.value || "").toLowerCase().trim();
  const statusFilter = (sessionStatusFilter?.value || "").toLowerCase().trim();

  const filtered = allSessions.filter(s => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (query) {
      const matchTitle = (s.title || "").toLowerCase().includes(query);
      const matchFacilitator = (s.facilitator_name || "").toLowerCase().includes(query);
      if (!matchTitle && !matchFacilitator) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    sessionsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:36px; color:var(--c-text-muted);">
          No NEXTGEN sessions found. Click <strong>+ Create NEXTGEN Session</strong> to schedule one.
        </td>
      </tr>
    `;
    return;
  }

  sessionsTableBody.innerHTML = filtered.map(session => {
    // Status Badge
    let statusBadge = "";
    if (session.status === "live") {
      statusBadge = `
        <span class="session-status-badge status-live">
          <span class="pulse-dot" style="width:6px; height:6px;"></span> LIVE NOW
        </span>
      `;
    } else if (session.status === "finished") {
      statusBadge = `<span class="session-status-badge status-finished">Finished</span>`;
    } else {
      statusBadge = `<span class="session-status-badge status-scheduled">Scheduled</span>`;
    }

    // Action Buttons
    const actions = [];

    // Attendees action (for all)
    actions.push(`
      <button type="button" class="btn btn-ghost btn-xs view-attendees-btn" data-id="${session.id}" title="View Attendees">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Attendees (${session.attendee_count || 0})
      </button>
    `);

    if (session.status === "scheduled") {
      actions.push(`
        <button type="button" class="btn btn-primary btn-xs activate-session-btn" data-id="${session.id}" style="background:#0FA15D; border-color:#0FA15D;" title="Set Live">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          Set Live
        </button>
      `);
      actions.push(`
        <button type="button" class="btn btn-ghost btn-xs edit-session-btn" data-id="${session.id}" title="Edit">
          Edit
        </button>
      `);
    } else if (session.status === "live") {
      actions.push(`
        <button type="button" class="btn btn-danger btn-xs finish-session-btn" data-id="${session.id}" title="Finish Session">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><rect x="6" y="6" width="12" height="12"/></svg>
          Finish Session
        </button>
      `);
    }

    // Delete (only if 0 attendees)
    if (session.attendee_count === 0) {
      actions.push(`
        <button type="button" class="btn btn-ghost btn-xs delete-session-btn text-danger" data-id="${session.id}" title="Delete">
          ✕
        </button>
      `);
    }

    return `
      <tr data-session-id="${session.id}">
        <td>
          <div style="font-weight:700; color:var(--c-text); font-size:13px;">${escapeHtml(session.title)}</div>
          <div style="font-size:11px; color:var(--c-text-muted); margin-top:2px;">
            Facilitator: <strong>${escapeHtml(session.facilitator_name)}</strong>
          </div>
        </td>
        <td>
          <div style="font-size:12px; font-weight:600;">${formatISTDateTime(session.scheduled_at)}</div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="meet-link-cell">
            <a href="${escapeHtml(session.meet_url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(session.meet_url)}">
              ${escapeHtml(session.meet_url)}
            </a>
            <button type="button" class="btn-icon copy-meet-link-btn" data-url="${escapeHtml(session.meet_url)}" title="Copy Google Meet Link" style="width:22px; height:22px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </td>
        <td style="text-align:center;">
          <span class="attendee-count-pill">${session.attendee_count || 0}</span>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:4px; align-items:center; justify-content:flex-end; flex-wrap:wrap;">
            ${actions.join("")}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Attach dynamic table event listeners
  sessionsTableBody.querySelectorAll(".activate-session-btn").forEach(btn => {
    btn.addEventListener("click", () => handleActivateSession(btn.dataset.id));
  });

  sessionsTableBody.querySelectorAll(".finish-session-btn").forEach(btn => {
    btn.addEventListener("click", () => handleFinishSession(btn.dataset.id));
  });

  sessionsTableBody.querySelectorAll(".view-attendees-btn").forEach(btn => {
    btn.addEventListener("click", () => handleOpenAttendeesModal(btn.dataset.id));
  });

  sessionsTableBody.querySelectorAll(".edit-session-btn").forEach(btn => {
    btn.addEventListener("click", () => handleEditSession(btn.dataset.id));
  });

  sessionsTableBody.querySelectorAll(".delete-session-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteSession(btn.dataset.id));
  });

  sessionsTableBody.querySelectorAll(".copy-meet-link-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Google Meet link copied!");
      } catch (_e) {
        toast.info(`Meet URL: ${url}`);
      }
    });
  });
}

// Session Creation / Editing
function openSessionModal(session = null) {
  if (!sessionModal) return;
  sessionForm.reset();

  if (session) {
    if (sessionModalTitle) sessionModalTitle.textContent = "Edit NEXTGEN Session";
    if (modalSessionId) modalSessionId.value = session.id;
    if (modalSessionTitle) modalSessionTitle.value = session.title || "";
    if (modalSessionFacilitator) modalSessionFacilitator.value = session.facilitator_name || "";
    if (modalSessionScheduledAt) modalSessionScheduledAt.value = toLocalDatetimeInput(session.scheduled_at);
    if (modalSessionMeetUrl) modalSessionMeetUrl.value = session.meet_url || "";
  } else {
    if (sessionModalTitle) sessionModalTitle.textContent = "Create NEXTGEN Session";
    if (modalSessionId) modalSessionId.value = "";
    // Set default scheduled_at to today 7:00 PM
    const defaultDate = new Date();
    defaultDate.setHours(19, 0, 0, 0);
    if (modalSessionScheduledAt) modalSessionScheduledAt.value = toLocalDatetimeInput(defaultDate.toISOString());
  }

  sessionModal.classList.add("active");
  modalSessionTitle?.focus();
}

function closeSessionModal() {
  if (sessionModal) sessionModal.classList.remove("active");
}

async function handleSaveSession(e) {
  e.preventDefault();
  const id = (modalSessionId?.value || "").trim();
  const title = (modalSessionTitle?.value || "").trim();
  const facilitator_name = (modalSessionFacilitator?.value || "").trim();
  const scheduled_at_raw = (modalSessionScheduledAt?.value || "").trim();
  const meet_url = (modalSessionMeetUrl?.value || "").trim();

  if (!title) {
    toast.error("Please enter a session title.");
    modalSessionTitle?.focus();
    return;
  }
  if (!facilitator_name) {
    toast.error("Please enter the facilitator's name.");
    modalSessionFacilitator?.focus();
    return;
  }
  if (!scheduled_at_raw) {
    toast.error("Please choose the scheduled date and time.");
    modalSessionScheduledAt?.focus();
    return;
  }
  if (!isValidGoogleMeetUrl(meet_url)) {
    toast.error("Please enter a valid Google Meet link (starting with https://meet.google.com/).");
    modalSessionMeetUrl?.focus();
    return;
  }

  let cleanMeetUrl = meet_url;
  if (!/^https?:\/\//i.test(cleanMeetUrl)) {
    cleanMeetUrl = `https://${cleanMeetUrl}`;
  } else if (/^http:\/\//i.test(cleanMeetUrl)) {
    cleanMeetUrl = cleanMeetUrl.replace(/^http:\/\//i, "https://");
  }

  let scheduled_at = "";
  try {
    scheduled_at = new Date(scheduled_at_raw).toISOString();
  } catch (_e) {
    toast.error("Please enter a valid date and time.");
    modalSessionScheduledAt?.focus();
    return;
  }

  setButtonLoading(saveSessionBtn, true, "Saving...");

  try {
    if (id) {
      await updateNextgenSession(id, {
        title,
        facilitator_name,
        scheduled_at,
        meet_url: cleanMeetUrl
      });
      toast.success("NEXTGEN session updated successfully.");
    } else {
      await createNextgenSession({
        title,
        facilitator_name,
        scheduled_at,
        meet_url: cleanMeetUrl,
        created_by: currentAdmin?.id || currentAdmin?.uid || null
      });
      toast.success("NEXTGEN session scheduled successfully.");
    }

    closeSessionModal();
    await refreshData();
  } catch (err) {
    console.error("Save session failed:", err);
    toast.error(err.message || "Failed to save session.");
  } finally {
    setButtonLoading(saveSessionBtn, false);
  }
}

async function handleEditSession(id) {
  const session = allSessions.find(s => s.id === id);
  if (!session) return;
  openSessionModal(session);
}

// Single Live Session Activation
async function handleActivateSession(id) {
  const session = allSessions.find(s => s.id === id);
  if (!session) return;

  const currentLive = allSessions.find(s => s.status === "live");
  if (currentLive && currentLive.id !== id) {
    toast.error(`Cannot activate! Session "${currentLive.title}" is currently LIVE. Please finish the active session first.`);
    return;
  }

  showConfirmModal({
    title: "Activate NEXTGEN Session?",
    message: `You are about to make "${session.title}" LIVE. Students accessing /nextgen will be able to check in and receive the Google Meet link. Only ONE session can be live at a time.`,
    confirmText: "Set Live Now",
    confirmVariant: "primary",
    onConfirm: async () => {
      try {
        await activateNextgenSession(id);
        toast.success(`Session "${session.title}" is now LIVE!`);
        await refreshData();
      } catch (err) {
        console.error("Activate session failed:", err);
        toast.error(err.message || "Failed to activate session.");
      }
    }
  });
}

// Finish Session
async function handleFinishSession(id) {
  const session = allSessions.find(s => s.id === id);
  if (!session) return;

  showConfirmModal({
    title: "Finish NEXTGEN Session?",
    message: `Are you sure you want to finish "${session.title}"? This will close student check-in. Students will no longer be able to check in through /nextgen.`,
    confirmText: "Finish Session",
    confirmVariant: "danger",
    onConfirm: async () => {
      try {
        await finishNextgenSession(id);
        toast.success(`Session "${session.title}" marked as finished.`);
        await refreshData();
      } catch (err) {
        console.error("Finish session failed:", err);
        toast.error(err.message || "Failed to finish session.");
      }
    }
  });
}

// Delete Session
async function handleDeleteSession(id) {
  const session = allSessions.find(s => s.id === id);
  if (!session) return;

  if (session.attendee_count > 0) {
    toast.error("Cannot delete a session that has recorded attendees.");
    return;
  }

  showConfirmModal({
    title: "Delete Scheduled Session?",
    message: `Are you sure you want to permanently delete "${session.title}"?`,
    confirmText: "Delete",
    confirmVariant: "danger",
    onConfirm: async () => {
      try {
        await deleteNextgenSession(id);
        toast.success("Session deleted.");
        await refreshData();
      } catch (err) {
        console.error("Delete session failed:", err);
        toast.error(err.message || "Failed to delete session.");
      }
    }
  });
}

// Attendees Modal & Management
async function handleOpenAttendeesModal(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  activeAttendeeSession = session;

  if (attendeesModalTitle) attendeesModalTitle.textContent = session.title;
  if (attendeesModalSub) {
    attendeesModalSub.textContent = `Facilitator: ${session.facilitator_name} · Scheduled: ${formatISTDateTime(session.scheduled_at)} · Status: ${session.status.toUpperCase()}`;
  }

  if (attendeeSearchInput) attendeeSearchInput.value = "";
  if (attendeeClassFilter) attendeeClassFilter.value = "";

  if (attendeesTableBody) {
    attendeesTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:32px; color:var(--c-text-muted);">
          Loading attendee records...
        </td>
      </tr>
    `;
  }

  if (attendeesModal) attendeesModal.classList.add("active");

  try {
    currentSessionAttendees = await listSessionAttendees(sessionId);
    renderAttendeesList();
  } catch (err) {
    console.error("Failed to load session attendees:", err);
    toast.error("Could not load attendees for this session.");
    if (attendeesTableBody) {
      attendeesTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:24px; color:var(--c-danger);">
            Failed to load attendees.
          </td>
        </tr>
      `;
    }
  }
}

function closeAttendeesModal() {
  if (attendeesModal) attendeesModal.classList.remove("active");
  activeAttendeeSession = null;
  currentSessionAttendees = [];
}

function renderAttendeesList() {
  if (!attendeesTableBody) return;

  const query = (attendeeSearchInput?.value || "").toLowerCase().trim();
  const classFilter = (attendeeClassFilter?.value || "").trim();

  const filtered = currentSessionAttendees.filter(att => {
    if (classFilter && String(att.class_level) !== classFilter) return false;
    if (query) {
      const matchName = (att.student_name || "").toLowerCase().includes(query);
      const matchPhone = (att.phone || "").toLowerCase().includes(query) || (att.phone_normalized || "").toLowerCase().includes(query);
      const matchSchool = (att.school_name || "").toLowerCase().includes(query);
      if (!matchName && !matchPhone && !matchSchool) return false;
    }
    return true;
  });

  if (attendeesCountBadge) {
    attendeesCountBadge.textContent = `${filtered.length} of ${currentSessionAttendees.length} Attendees`;
  }

  if (filtered.length === 0) {
    attendeesTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:32px; color:var(--c-text-muted);">
          ${currentSessionAttendees.length === 0 ? "No students have checked into this session yet." : "No attendees match your search filters."}
        </td>
      </tr>
    `;
    return;
  }

  attendeesTableBody.innerHTML = filtered.map((att, idx) => `
    <tr>
      <td style="color:var(--c-text-muted); font-size:11px;">${idx + 1}</td>
      <td>
        <div style="font-weight:700; color:var(--c-text); font-size:13px;">${escapeHtml(att.student_name)}</div>
      </td>
      <td style="text-align:center;">
        <span class="badge" style="background:#EEF2FA; color:#2E4C8C; font-weight:700;">Class ${escapeHtml(att.class_level)}</span>
      </td>
      <td>
        <div style="font-size:12px; color:var(--c-text);">${escapeHtml(att.school_name)}</div>
      </td>
      <td>
        <div style="font-family:monospace; font-size:12px; color:var(--c-text);">${escapeHtml(att.phone_normalized || att.phone)}</div>
      </td>
      <td>
        <div style="font-size:11px; color:var(--c-text-muted);">${formatISTDateTime(att.submitted_at)}</div>
      </td>
    </tr>
  `).join("");
}

function handleExportAttendeesCsv() {
  if (!activeAttendeeSession) return;
  if (currentSessionAttendees.length === 0) {
    toast.info("No attendees to export for this session.");
    return;
  }

  try {
    const query = (attendeeSearchInput?.value || "").toLowerCase().trim();
    const classFilter = (attendeeClassFilter?.value || "").trim();

    const filtered = currentSessionAttendees.filter(att => {
      if (classFilter && String(att.class_level) !== classFilter) return false;
      if (query) {
        const matchName = (att.student_name || "").toLowerCase().includes(query);
        const matchPhone = (att.phone || "").toLowerCase().includes(query) || (att.phone_normalized || "").toLowerCase().includes(query);
        const matchSchool = (att.school_name || "").toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchSchool) return false;
      }
      return true;
    });

    const count = exportSessionAttendeesToCSV(activeAttendeeSession, filtered);
    toast.success(`Exported ${count} attendees to CSV.`);
  } catch (err) {
    console.error("Export CSV failed:", err);
    toast.error("Failed to export attendees to CSV.");
  }
}

