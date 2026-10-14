// ==========================================================================
// ATTENDANCE MANAGEMENT CONTROLLER (ADMIN)
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { escapeHtml } from "../utils/exam-ui.js";
import {
  getISTTodayIso,
  formatISTFullDate,
  format12Hour,
  formatLogDate
} from "../utils/date-time.js";
import {
  createAttendanceSession,
  updateAttendanceSession,
  deleteAttendanceSession,
  getAttendanceSession,
  listAttendanceSessions,
  getSessionAttendance,
  markAttendance,
  ATTENDANCE_STATUS,
  calcAttendancePercentage
} from "../services/attendance-service.js";

let currentAdmin = null;
let currentBranch = "MAN";
let currentClass = "10";
let currentDate = getISTTodayIso();
let activeSessionId = null;
let activeSession = null;
let rosterSessionId = null;
let currentRoster = []; // Array of student objects with status, remarks, dirty
let isDirty = false;
let selectSessionRequestId = 0;

(async function init() {
  try {
    currentAdmin = await requireAuth("admin", "admin-login.html");
    renderSidebar("admin", "attendance", {
      name: currentAdmin.name || currentAdmin.email,
      sub: "Branch Admin"
    });

    // Enforce branch isolation from admin profile
    if (currentAdmin.branch && currentAdmin.branch !== "ALL") {
      currentBranch = currentAdmin.branch.trim().toUpperCase();
      const branchSelect = document.getElementById("filter-branch");
      const modalBranchSelect = document.getElementById("modal-branch");
      if (branchSelect) {
        branchSelect.value = currentBranch;
        branchSelect.disabled = true; // Locked to admin branch
      }
      if (modalBranchSelect) {
        modalBranchSelect.value = currentBranch;
        modalBranchSelect.disabled = true;
      }
    } else {
      currentBranch = document.getElementById("filter-branch").value || "MAN";
    }

    const branchName = currentBranch === "ALP" ? "Alappuzha Campus" : "Mannancherry Campus";
    document.getElementById("admin-branch-badge").textContent = `Branch: ${branchName}`;

    // Set initial date in filter input
    const dateInput = document.getElementById("filter-date");
    dateInput.value = currentDate;

    wireEventListeners();
    await loadSessionsForFilters();
  } catch (err) {
    console.error("Attendance management initialization error:", err);
    toast.error("Failed to initialize attendance management.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

async function confirmDiscardIfDirty() {
  if (!isDirty) return true;
  const discard = await showConfirmModal({
    title: "Unsaved Attendance Changes",
    message: "You have unsaved attendance marks. Proceeding will discard your unsaved marks. Continue?",
    confirmText: "Discard & Continue",
    confirmVariant: "warning"
  });
  if (discard) {
    isDirty = false;
    return true;
  }
  return false;
}

function wireEventListeners() {
  const branchSelect = document.getElementById("filter-branch");
  const classSelect = document.getElementById("filter-class");
  const dateInput = document.getElementById("filter-date");
  const todayBtn = document.getElementById("btn-today-date");
  const loadSessionsBtn = document.getElementById("btn-load-sessions");

  if (!branchSelect.disabled) {
    branchSelect.addEventListener("change", async () => {
      if (await confirmDiscardIfDirty()) {
        currentBranch = branchSelect.value;
        await loadSessionsForFilters();
      } else {
        branchSelect.value = currentBranch;
      }
    });
  }

  classSelect.addEventListener("change", async () => {
    if (await confirmDiscardIfDirty()) {
      currentClass = classSelect.value;
      await loadSessionsForFilters();
    } else {
      classSelect.value = currentClass;
    }
  });

  dateInput.addEventListener("change", async () => {
    if (await confirmDiscardIfDirty()) {
      currentDate = dateInput.value;
      await loadSessionsForFilters();
    } else {
      dateInput.value = currentDate;
    }
  });

  todayBtn.addEventListener("click", async () => {
    if (await confirmDiscardIfDirty()) {
      currentDate = getISTTodayIso();
      dateInput.value = currentDate;
      await loadSessionsForFilters();
    }
  });

  loadSessionsBtn.addEventListener("click", async () => {
    if (await confirmDiscardIfDirty()) {
      currentClass = classSelect.value;
      currentDate = dateInput.value;
      await loadSessionsForFilters();
    } else {
      classSelect.value = currentClass;
      dateInput.value = currentDate;
    }
  });

  // Modal triggers
  document.getElementById("btn-create-session-modal").addEventListener("click", async () => {
    if (await confirmDiscardIfDirty()) {
      openSessionModal("create");
    }
  });

  document.getElementById("btn-add-session-inline").addEventListener("click", async () => {
    if (await confirmDiscardIfDirty()) {
      openSessionModal("create");
    }
  });

  document.getElementById("close-session-modal").addEventListener("click", closeSessionModal);
  document.getElementById("btn-cancel-session-modal").addEventListener("click", closeSessionModal);

  document.getElementById("session-form").addEventListener("submit", handleSessionFormSubmit);

  // Edit / Delete active session
  document.getElementById("btn-edit-session-details").addEventListener("click", async () => {
    if (activeSession) {
      if (await confirmDiscardIfDirty()) {
        openSessionModal("edit", activeSession);
      }
    }
  });

  document.getElementById("btn-delete-session").addEventListener("click", handleDeleteActiveSession);

  // Roster batch actions
  document.getElementById("btn-mark-all-present").addEventListener("click", handleMarkAllPresent);
  document.getElementById("btn-mark-all-absent").addEventListener("click", handleMarkAllAbsent);
  document.getElementById("btn-save-attendance").addEventListener("click", handleSaveAttendance);

  // Search filter in roster
  document.getElementById("roster-search").addEventListener("input", (e) => {
    filterRosterTable(e.target.value);
  });

  // Prompt before navigating away if changes are unsaved
  window.addEventListener("beforeunload", (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/**
 * Loads sessions matching current branch, class, and date.
 */
async function loadSessionsForFilters() {
  const container = document.getElementById("session-chips-container");
  const countLabel = document.getElementById("session-count-label");
  container.innerHTML = `<span style="font-size:var(--fs-xs); color:var(--c-text-muted);">Loading sessions…</span>`;

  try {
    const sessions = await listAttendanceSessions({
      branch: currentBranch,
      class: currentClass,
      date: currentDate
    });

    countLabel.textContent = sessions.length;

    if (!sessions || sessions.length === 0) {
      container.innerHTML = `
        <span style="font-size:var(--fs-xs); color:var(--c-text-muted); font-style:italic;">
          No sessions recorded for ${escapeHtml(currentClass)} on ${escapeHtml(formatLogDate(currentDate))}.
        </span>
        <button class="btn btn-ghost btn-sm" id="btn-quick-create-session" style="font-size:var(--fs-xs); padding:4px 10px;">
          ➕ Create Session Now
        </button>
      `;

      document.getElementById("btn-quick-create-session")?.addEventListener("click", () => {
        openSessionModal("create");
      });

      // Clear active session
      activeSessionId = null;
      activeSession = null;
      document.getElementById("active-session-card").style.display = "none";
      renderEmptyRosterState("No session selected. Create or select a session above to mark attendance.");
      updateSummaryCards(0, 0, 0, 0, 0);
      setSaveButtonState(false, false);
      return;
    }

    // Render session chips
    container.innerHTML = sessions
      .map((s) => {
        const timeStr = s.startTime ? format12Hour(s.startTime) : "Time TBD";
        const titleStr = s.title || "Class Session";
        return `
          <button type="button" class="session-chip ${s.id === activeSessionId ? "active" : ""}" data-session-id="${s.id}">
            <span>⏰ ${escapeHtml(timeStr)}</span>
            <span>•</span>
            <span>${escapeHtml(titleStr)}</span>
          </button>
        `;
      })
      .join("");

    // Add click listener to each chip
    container.querySelectorAll(".session-chip").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const sid = chip.getAttribute("data-session-id");
        if (sid === activeSessionId) return;

        if (isDirty) {
          const proceed = await showConfirmModal({
            title: "Unsaved Changes",
            message: "You have unsaved changes in the current session. Switch anyway?",
            confirmText: "Discard & Switch",
            confirmVariant: "warning"
          });
          if (!proceed) return;
        }

        isDirty = false;
        await selectSession(sid);
      });
    });

    // If previously active session still exists, keep it; else select first session
    const targetSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
    await selectSession(targetSession.id);
  } catch (err) {
    console.error("Error loading sessions for filter:", err);
    container.innerHTML = `<span style="color:var(--c-danger); font-size:var(--fs-xs);">Failed to load sessions.</span>`;
  }
}

/**
 * Activates a session and loads its student attendance roster.
 * @param {string} sessionId
 */
async function selectSession(sessionId) {
  const currentReqId = ++selectSessionRequestId;
  activeSessionId = sessionId;

  // Highlight active chip
  document.querySelectorAll(".session-chip").forEach((chip) => {
    if (chip.getAttribute("data-session-id") === sessionId) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });

  const rosterBody = document.getElementById("attendance-roster-body");
  rosterBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Loading student roster…</div></td></tr>`;

  try {
    const data = await getSessionAttendance(sessionId);

    // Discard stale response if another session was selected while loading
    if (currentReqId !== selectSessionRequestId || sessionId !== activeSessionId) {
      return;
    }

    activeSession = data.session;
    rosterSessionId = sessionId;
    currentRoster = (data.roster || []).map((r) => ({
      ...r,
      dirty: false
    }));

    // Update Active Session Banner
    const card = document.getElementById("active-session-card");
    card.style.display = "block";
    document.getElementById("active-session-title").textContent = activeSession.title || "Class Session";
    
    const startTimeFormatted = activeSession.startTime ? format12Hour(activeSession.startTime) : "Time TBD";
    const endTimeFormatted = activeSession.endTime ? ` - ${format12Hour(activeSession.endTime)}` : "";
    document.getElementById("active-session-time").textContent = `${startTimeFormatted}${endTimeFormatted}`;

    const branchName = activeSession.branch === "ALP" ? "Alappuzha Campus" : "Mannancherry Campus";
    document.getElementById("active-session-meta").textContent = `Class ${activeSession.class} • ${branchName} • ${formatISTFullDate(activeSession.date)}`;

    // Render roster table and calculate single shared summary
    renderRosterTable(currentRoster);
    recalculateLiveSummary();
    isDirty = false;
    setSaveButtonState(true, false);
  } catch (err) {
    console.error("Error selecting session:", err);
    const detail = err?.message || String(err);
    toast.error(`Failed to load session attendance: ${detail}`);
    renderEmptyRosterState(`Failed to load student roster: ${detail}`);
  }
}

/**
 * Updates the summary statistics displayed on the top cards.
 */
function updateSummaryCards(total, present, late, absent, unmarked, rate) {
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-present").textContent = present;
  document.getElementById("stat-late").textContent = late;
  document.getElementById("stat-absent").textContent = absent;
  const unmarkedEl = document.getElementById("stat-unmarked");
  if (unmarkedEl) unmarkedEl.textContent = unmarked;
  document.getElementById("stat-rate").textContent = `${rate}%`;
}

/**
 * Recalculates summary stats from current in-memory roster.
 */
function recalculateLiveSummary() {
  let present = 0;
  let late = 0;
  let absent = 0;
  let unmarked = 0;

  currentRoster.forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
    else if (r.status === ATTENDANCE_STATUS.LATE) late++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
    else unmarked++;
  });

  const total = currentRoster.length;
  const rate = total > 0 ? calcAttendancePercentage(present, late, total) : 0;
  updateSummaryCards(total, present, late, absent, unmarked, rate);
}

/**
 * Renders the student roster table.
 */
function renderRosterTable(roster) {
  const tbody = document.getElementById("attendance-roster-body");
  if (!roster || roster.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state" style="padding:var(--sp-6);">
            <h4>No students enrolled</h4>
            <p style="color:var(--c-text-muted); font-size:var(--fs-xs);">
              No active students found in Class ${escapeHtml(currentClass)} for ${currentBranch === "ALP" ? "Alappuzha" : "Mannancherry"}.
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = roster
    .map((st, index) => {
      const isPresent = st.status === ATTENDANCE_STATUS.PRESENT;
      const isLate = st.status === ATTENDANCE_STATUS.LATE;
      const isAbsent = st.status === ATTENDANCE_STATUS.ABSENT;

      const rowClass = isPresent ? "row-present" : isLate ? "row-late" : isAbsent ? "row-absent" : "";

      return `
        <tr id="roster-row-${st.studentId}" class="${rowClass}">
          <td style="color:var(--c-text-muted); font-size:var(--fs-xs);">${index + 1}</td>
          <td>
            <span style="font-family:monospace; font-size:var(--fs-xs); font-weight:600; color:var(--c-text-secondary);">
              ${escapeHtml(st.admissionNumber || "—")}
            </span>
          </td>
          <td>
            <div style="font-weight:600; font-size:var(--fs-sm); color:var(--c-text);">
              ${escapeHtml(st.name)}
            </div>
            ${st.phone ? `<div style="font-size:var(--fs-2xs); color:var(--c-text-muted);">${escapeHtml(st.phone)}</div>` : ""}
          </td>
          <td>
            <div class="status-toggle-group" data-student-id="${st.studentId}">
              <button type="button" class="status-btn ${isPresent ? "selected-present" : ""}" data-status="Present" title="Mark Present">
                ✓ Present
              </button>
              <button type="button" class="status-btn ${isLate ? "selected-late" : ""}" data-status="Late" title="Mark Late">
                ⏰ Late
              </button>
              <button type="button" class="status-btn ${isAbsent ? "selected-absent" : ""}" data-status="Absent" title="Mark Absent">
                ✕ Absent
              </button>
            </div>
          </td>
          <td>
            <input type="text"
              class="roster-remarks-input"
              data-student-id="${st.studentId}"
              value="${escapeHtml(st.remarks || "")}"
              placeholder="e.g. sick, arrived 15m late..."
              style="min-height:34px; font-size:var(--fs-xs);" />
          </td>
        </tr>
      `;
    })
    .join("");

  // Attach status toggle listeners
  tbody.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const studentId = btn.closest(".status-toggle-group").getAttribute("data-student-id");
      const chosenStatus = btn.getAttribute("data-status");
      setStudentStatus(studentId, chosenStatus);
    });
  });

  // Attach remarks inputs
  tbody.querySelectorAll(".roster-remarks-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const studentId = e.target.getAttribute("data-student-id");
      const val = e.target.value;
      const target = currentRoster.find((r) => r.studentId === studentId);
      if (target && target.remarks !== val) {
        target.remarks = val;
        target.dirty = true;
        markDirtyState();
      }
    });
  });
}

/**
 * Sets a student's status, updates styling and triggers summary recalculation.
 */
function setStudentStatus(studentId, status) {
  const student = currentRoster.find((r) => r.studentId === studentId);
  if (!student) return;

  student.status = status;
  student.dirty = true;

  // Update button visual states
  const row = document.getElementById(`roster-row-${studentId}`);
  if (row) {
    const group = row.querySelector(".status-toggle-group");
    group.querySelectorAll(".status-btn").forEach((btn) => {
      const btnStatus = btn.getAttribute("data-status");
      btn.classList.remove("selected-present", "selected-late", "selected-absent");
      if (btnStatus === status) {
        if (status === "Present") btn.classList.add("selected-present");
        else if (status === "Late") btn.classList.add("selected-late");
        else if (status === "Absent") btn.classList.add("selected-absent");
      }
    });

    row.classList.remove("row-present", "row-late", "row-absent");
    if (status === "Present") row.classList.add("row-present");
    else if (status === "Late") row.classList.add("row-late");
    else if (status === "Absent") row.classList.add("row-absent");
  }

  markDirtyState();
  recalculateLiveSummary();
}

/**
 * Quick action: Mark all students in roster as Present.
 */
function handleMarkAllPresent() {
  if (!currentRoster.length) return;
  currentRoster.forEach((r) => {
    r.status = ATTENDANCE_STATUS.PRESENT;
    r.dirty = true;
  });
  renderRosterTable(currentRoster);
  markDirtyState();
  recalculateLiveSummary();
  toast.info("Marked all students as Present.");
}

/**
 * Quick action: Mark all students in roster as Absent.
 */
function handleMarkAllAbsent() {
  if (!currentRoster.length) return;
  currentRoster.forEach((r) => {
    r.status = ATTENDANCE_STATUS.ABSENT;
    r.dirty = true;
  });
  renderRosterTable(currentRoster);
  markDirtyState();
  recalculateLiveSummary();
  toast.info("Marked all students as Absent.");
}

/**
 * Marks dirty state for unsaved changes indicator and enables save button.
 */
function markDirtyState() {
  isDirty = true;
  setSaveButtonState(true, true);
}

function setSaveButtonState(enabled, dirty) {
  const saveBtn = document.getElementById("btn-save-attendance");
  const indicator = document.getElementById("save-status-indicator");

  if (!saveBtn) return;
  saveBtn.disabled = !enabled;

  if (indicator) {
    if (dirty) {
      indicator.innerHTML = `<span class="unsaved-dot"></span><span style="color:#B7791F;">Unsaved changes</span>`;
    } else {
      indicator.innerHTML = `<span style="color:var(--c-success);">✓ All saved</span>`;
    }
  }
}

/**
 * Saves attendance records for active session to Supabase.
 */
async function handleSaveAttendance() {
  if (!activeSessionId) {
    toast.error("No active session to save.");
    return;
  }

  // Safety guard: ensure the in-memory roster belongs to the currently active session
  if (rosterSessionId !== activeSessionId) {
    toast.error("The roster on screen does not match the active session. Please re-select the session.");
    return;
  }

  // Send ONLY rows whose status or remarks changed
  const dirtyRecords = currentRoster.filter((r) => r.dirty && r.status !== null);

  if (dirtyRecords.length === 0) {
    toast.info("No unsaved attendance changes to save.");
    return;
  }

  const recordsToSave = dirtyRecords.map((r) => ({
    studentId: r.studentId,
    status: r.status,
    remarks: r.remarks || ""
  }));

  const saveBtn = document.getElementById("btn-save-attendance");
  saveBtn.disabled = true;
  saveBtn.innerHTML = `Saving…`;

  try {
    await markAttendance(activeSessionId, recordsToSave, currentAdmin.id);
    isDirty = false;
    dirtyRecords.forEach((r) => (r.dirty = false));
    setSaveButtonState(true, false);
    toast.success("Attendance saved successfully!");
  } catch (err) {
    console.error("Error saving attendance:", err);
    toast.error(`Failed to save attendance: ${err.message}`);
    setSaveButtonState(true, true);
  } finally {
    saveBtn.innerHTML = `💾 Save Attendance`;
  }
}

/**
 * Filters the displayed roster rows by search query.
 */
function filterRosterTable(query) {
  const q = String(query || "").trim().toLowerCase();
  const rows = document.querySelectorAll("#attendance-roster-body tr[id^='roster-row-']");

  rows.forEach((row) => {
    const studentId = row.id.replace("roster-row-", "");
    const student = currentRoster.find((r) => r.studentId === studentId);
    if (!student) return;

    const matches =
      !q ||
      student.name.toLowerCase().includes(q) ||
      (student.admissionNumber && student.admissionNumber.toLowerCase().includes(q)) ||
      (student.phone && student.phone.includes(q));

    row.style.display = matches ? "" : "none";
  });
}

function renderEmptyRosterState(msg) {
  const tbody = document.getElementById("attendance-roster-body");
  tbody.innerHTML = `
    <tr>
      <td colspan="5">
        <div class="empty-state" style="padding:var(--sp-6);">
          <h4>${escapeHtml(msg)}</h4>
        </div>
      </td>
    </tr>
  `;
}

// --------------------------------------------------------------------------
// SESSION MODAL (CREATE / EDIT)
// --------------------------------------------------------------------------

function openSessionModal(mode = "create", session = null) {
  const modal = document.getElementById("session-modal");
  const modalTitle = document.getElementById("session-modal-title");
  const sessionIdInput = document.getElementById("modal-session-id");
  const branchSelect = document.getElementById("modal-branch");
  const classSelect = document.getElementById("modal-class");
  const dateInput = document.getElementById("modal-date");
  const titleInput = document.getElementById("modal-title");
  const startTimeInput = document.getElementById("modal-start-time");
  const endTimeInput = document.getElementById("modal-end-time");

  branchSelect.value = currentBranch;
  classSelect.value = currentClass;
  dateInput.value = currentDate;

  if (mode === "edit" && session) {
    modalTitle.textContent = "Edit Attendance Session";
    sessionIdInput.value = session.id;
    branchSelect.value = session.branch;
    classSelect.value = session.class;
    dateInput.value = session.date;
    titleInput.value = session.title || "";
    startTimeInput.value = session.startTime || "";
    endTimeInput.value = session.endTime || "";
  } else {
    modalTitle.textContent = "Create Attendance Session";
    sessionIdInput.value = "";
    titleInput.value = "";
    startTimeInput.value = "09:00";
    endTimeInput.value = "";
  }

  modal.classList.add("active");
  titleInput.focus();
}

function closeSessionModal() {
  const modal = document.getElementById("session-modal");
  modal.classList.remove("active");
}

async function handleSessionFormSubmit(e) {
  e.preventDefault();

  const sessionId = document.getElementById("modal-session-id").value;
  const branch = document.getElementById("modal-branch").value;
  const cls = document.getElementById("modal-class").value;
  const date = document.getElementById("modal-date").value;
  const title = document.getElementById("modal-title").value.trim();
  const startTime = document.getElementById("modal-start-time").value;
  const endTime = document.getElementById("modal-end-time").value;

  if (!branch || !cls || !date || !startTime) {
    toast.error("Please fill in all required fields (Branch, Class, Date, Start Time).");
    return;
  }

  if (endTime && endTime <= startTime) {
    toast.error("End time must be after start time.");
    return;
  }

  // Confirm discarding unsaved attendance marks before reloading
  if (isDirty) {
    const proceed = await showConfirmModal({
      title: "Unsaved Attendance Changes",
      message: "Saving session details will reload the session roster and discard your unsaved attendance marks. Continue?",
      confirmText: "Discard & Save Session",
      confirmVariant: "warning"
    });
    if (!proceed) return;
    isDirty = false;
  }

  const submitBtn = document.getElementById("btn-submit-session-modal");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    if (sessionId) {
      // Update existing session
      await updateAttendanceSession(sessionId, {
        branch,
        class: cls,
        date,
        title: title || `Class ${cls}`,
        startTime,
        endTime
      });
      toast.success("Session updated successfully.");
      activeSessionId = sessionId;
    } else {
      // Create new session
      const newId = await createAttendanceSession({
        branch,
        class: cls,
        date,
        title: title || `Class ${cls}`,
        startTime,
        endTime,
        createdBy: currentAdmin.id
      });
      toast.success("Session created successfully.");
      activeSessionId = newId;
    }

    closeSessionModal();

    // Sync active filters with newly created/edited session
    currentBranch = branch;
    currentClass = cls;
    currentDate = date;

    document.getElementById("filter-class").value = cls;
    document.getElementById("filter-date").value = date;

    await loadSessionsForFilters();
  } catch (err) {
    console.error("Error saving session:", err);
    if (
      err.message &&
      (err.message.includes("uq_attendance_sessions") ||
        err.message.includes("unique") ||
        err.message.includes("already exists"))
    ) {
      toast.error("A session for this branch, class, date, and start time already exists.");
    } else {
      toast.error(`Failed to save session: ${err.message}`);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save & Load Roster";
  }
}

async function handleDeleteActiveSession() {
  if (!activeSession) return;

  const confirmed = await showConfirmModal({
    title: "Delete Attendance Session?",
    message: `Are you sure you want to delete "${activeSession.title || "this session"}"? All recorded attendance for this session will be permanently deleted.`,
    confirmText: "Delete Session",
    confirmVariant: "danger"
  });

  if (!confirmed) return;

  try {
    await deleteAttendanceSession(activeSession.id);
    toast.info("Session deleted successfully.");
    activeSessionId = null;
    activeSession = null;
    isDirty = false;
    await loadSessionsForFilters();
  } catch (err) {
    console.error("Error deleting session:", err);
    toast.error(`Failed to delete session: ${err.message}`);
  }
}
