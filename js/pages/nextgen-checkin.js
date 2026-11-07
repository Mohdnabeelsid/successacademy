/**
 * SUCCESS ACADEMY — NEXTGEN Student Live Session Check-In Controller
 * Public page script for `/nextgen`
 */

import {
  getLiveSessionInfo,
  getUpcomingSessionInfo,
  calculateCountdown,
  submitCheckIn,
  normalizeIndianPhone
} from "../services/nextgen-service.js";

// DOM Elements
const sessionLoading = document.getElementById("session-loading");
const noSessionCard = document.getElementById("no-session-card");
const upcomingSessionCard = document.getElementById("upcoming-session-card");
const checkinContainer = document.getElementById("checkin-container");
const retryCheckBtn = document.getElementById("retry-check-btn");
const refreshUpcomingBtn = document.getElementById("refresh-upcoming-btn");

const upcomingSessionTitle = document.getElementById("upcoming-session-title");
const upcomingSessionFacilitator = document.getElementById("upcoming-session-facilitator");
const upcomingSessionTime = document.getElementById("upcoming-session-time");
const countdownDays = document.getElementById("countdown-days");
const countdownHours = document.getElementById("countdown-hours");
const countdownMinutes = document.getElementById("countdown-minutes");
const countdownSeconds = document.getElementById("countdown-seconds");
const countdownNote = document.getElementById("countdown-note");

const sessionTitle = document.getElementById("session-title");
const sessionFacilitator = document.getElementById("session-facilitator");
const sessionTime = document.getElementById("session-time");

const checkinForm = document.getElementById("checkin-form");
const studentNameInput = document.getElementById("student-name");
const classLevelSelect = document.getElementById("class-level");
const schoolNameInput = document.getElementById("school-name");
const phoneNumberInput = document.getElementById("phone-number");
const formError = document.getElementById("form-error");

const submitCheckinBtn = document.getElementById("submit-checkin-btn");
const btnText = document.getElementById("btn-text");
const btnSpinner = document.getElementById("btn-spinner");

const successScreen = document.getElementById("success-screen");
const successStudentName = document.getElementById("success-student-name");
const countdownEl = document.getElementById("countdown");
const manualJoinMeetBtn = document.getElementById("manual-join-meet-btn");

let currentLiveSession = null;
let currentUpcomingSession = null;
let countdownInterval = null;
let isSubmitting = false;

/**
 * Format ISO date string into readable IST time
 */
function formatSessionDateTime(isoStr) {
  if (!isoStr) return "Today";
  try {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    const timePart = d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    return `${datePart} · ${timePart}`;
  } catch (_e) {
    return isoStr;
  }
}

/**
 * Show error banner
 */
function showError(message) {
  if (!formError) return;
  formError.textContent = message;
  formError.style.display = "block";
  formError.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Hide error banner
 */
function clearError() {
  if (!formError) return;
  formError.textContent = "";
  formError.style.display = "none";
}

/**
 * Set submit button loading state
 */
function setLoading(loading) {
  isSubmitting = loading;
  if (!submitCheckinBtn) return;
  submitCheckinBtn.disabled = loading;
  if (btnText) btnText.style.display = loading ? "none" : "inline";
  if (btnSpinner) btnSpinner.style.display = loading ? "inline-block" : "none";
}

/**
 * Start real-time countdown timer for upcoming scheduled session
 */
function startCountdown(targetDate) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  function update() {
    const cd = calculateCountdown(targetDate);
    const pad = n => String(n).padStart(2, "0");

    if (countdownDays) countdownDays.textContent = pad(cd.days);
    if (countdownHours) countdownHours.textContent = pad(cd.hours);
    if (countdownMinutes) countdownMinutes.textContent = pad(cd.minutes);
    if (countdownSeconds) countdownSeconds.textContent = pad(cd.seconds);

    if (cd.isPassed) {
      if (countdownNote) {
        countdownNote.textContent = "Session is due to start! Waiting for session to be activated...";
        countdownNote.style.color = "#0FA15D";
        countdownNote.style.fontWeight = "700";
      }
      // Periodically probe if session transitioned to live
      getLiveSessionInfo().then(live => {
        if (live && live.status === "live") {
          if (countdownInterval) clearInterval(countdownInterval);
          init();
        }
      });
    }
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

/**
 * Initialize page and check for currently live or upcoming session
 */
async function init() {
  clearError();
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (sessionLoading) sessionLoading.style.display = "block";
  if (noSessionCard) noSessionCard.style.display = "none";
  if (upcomingSessionCard) upcomingSessionCard.style.display = "none";
  if (checkinContainer) checkinContainer.style.display = "none";
  if (successScreen) successScreen.style.display = "none";

  try {
    // 1. Check for live session first
    const liveSession = await getLiveSessionInfo();

    if (liveSession && liveSession.status === "live") {
      currentLiveSession = liveSession;

      // Populate live session details
      if (sessionTitle) sessionTitle.textContent = liveSession.title || "NEXTGEN Interactive Session";
      if (sessionFacilitator) sessionFacilitator.textContent = liveSession.facilitator_name || liveSession.facilitatorName || "Success Academy Facilitator";
      if (sessionTime) sessionTime.textContent = formatSessionDateTime(liveSession.scheduled_at || liveSession.scheduledAt || liveSession.live_at || liveSession.liveAt);

      if (sessionLoading) sessionLoading.style.display = "none";
      if (checkinContainer) checkinContainer.style.display = "block";
      return;
    }

    currentLiveSession = null;

    // 2. Check for upcoming scheduled session
    const upcoming = await getUpcomingSessionInfo();
    if (upcoming && (upcoming.scheduled_at || upcoming.scheduledAt)) {
      currentUpcomingSession = upcoming;

      if (upcomingSessionTitle) upcomingSessionTitle.textContent = upcoming.title || "NEXTGEN Session";
      if (upcomingSessionFacilitator) upcomingSessionFacilitator.textContent = upcoming.facilitator_name || upcoming.facilitatorName || "Success Academy Facilitator";
      if (upcomingSessionTime) upcomingSessionTime.textContent = formatSessionDateTime(upcoming.scheduled_at || upcoming.scheduledAt);

      startCountdown(upcoming.scheduled_at || upcoming.scheduledAt);

      if (sessionLoading) sessionLoading.style.display = "none";
      if (upcomingSessionCard) upcomingSessionCard.style.display = "block";
      return;
    }

    // 3. No live or scheduled session found
    if (sessionLoading) sessionLoading.style.display = "none";
    if (noSessionCard) noSessionCard.style.display = "block";
  } catch (err) {
    console.error("Failed to load NEXTGEN session:", err);
    currentLiveSession = null;
    if (sessionLoading) sessionLoading.style.display = "none";
    if (noSessionCard) noSessionCard.style.display = "block";
  }
}

/**
 * Handle form submission
 */
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

  clearError();

  const nameVal = (studentNameInput?.value || "").trim();
  const classVal = parseInt(classLevelSelect?.value, 10);
  const schoolVal = (schoolNameInput?.value || "").trim();
  const phoneVal = (phoneNumberInput?.value || "").trim();

  // Validate Student Name
  if (!nameVal || nameVal.length < 2) {
    showError("Please enter your complete full name (at least 2 characters).");
    studentNameInput?.focus();
    return;
  }

  // Validate Class
  if (!classVal || ![8, 9, 10, 11, 12].includes(classVal)) {
    showError("Please select your valid class (8, 9, 10, 11, or 12).");
    classLevelSelect?.focus();
    return;
  }

  // Validate School Name
  if (!schoolVal || schoolVal.length < 2) {
    showError("Please enter your school or institution name.");
    schoolNameInput?.focus();
    return;
  }

  // Validate & Normalize Phone Number
  let normalizedPhone = "";
  try {
    normalizedPhone = normalizeIndianPhone(phoneVal);
  } catch (phoneErr) {
    showError(phoneErr.message || "Please enter a valid 10-digit Indian mobile number.");
    phoneNumberInput?.focus();
    return;
  }

  setLoading(true);

  try {
    const checkinPayload = {
      student_name: nameVal,
      class_level: classVal,
      school_name: schoolVal,
      phone: normalizedPhone
    };

    const res = await submitCheckIn(checkinPayload);

    if (!res || !res.meetUrl) {
      throw new Error("Unable to retrieve session link. The session may have ended.");
    }

    // Success transition
    if (checkinContainer) checkinContainer.style.display = "none";
    if (successScreen) successScreen.style.display = "block";
    if (successStudentName) successStudentName.textContent = nameVal;

    // Set fallback button href
    if (manualJoinMeetBtn) {
      manualJoinMeetBtn.href = res.meetUrl;
    }

    // Countdown and automatic redirection
    let countdown = 2;
    if (countdownEl) countdownEl.textContent = String(countdown);

    const timer = setInterval(() => {
      countdown -= 1;
      if (countdownEl) countdownEl.textContent = String(countdown);

      if (countdown <= 0) {
        clearInterval(timer);
        window.location.href = res.meetUrl;
      }
    }, 1000);

  } catch (err) {
    console.error("Check-in submission failed:", err);
    setLoading(false);
    showError(err.message || "Submission failed. Please check your information and try again.");
  }
}

// Attach Event Listeners
if (checkinForm) {
  checkinForm.addEventListener("submit", handleSubmit);
}

if (retryCheckBtn) {
  retryCheckBtn.addEventListener("click", () => {
    init();
  });
}

if (refreshUpcomingBtn) {
  refreshUpcomingBtn.addEventListener("click", () => {
    init();
  });
}

// Auto-run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

