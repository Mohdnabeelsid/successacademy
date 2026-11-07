/**
 * SUCCESS ACADEMY — NEXTGEN Student Live Session Check-In Controller
 * Public page script for `/nextgen`
 */

import {
  getLiveSessionInfo,
  submitCheckIn,
  normalizeIndianPhone
} from "../services/nextgen-service.js";

// DOM Elements
const sessionLoading = document.getElementById("session-loading");
const noSessionCard = document.getElementById("no-session-card");
const checkinContainer = document.getElementById("checkin-container");
const retryCheckBtn = document.getElementById("retry-check-btn");

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
 * Initialize page and check for currently live session
 */
async function init() {
  clearError();
  if (sessionLoading) sessionLoading.style.display = "block";
  if (noSessionCard) noSessionCard.style.display = "none";
  if (checkinContainer) checkinContainer.style.display = "none";
  if (successScreen) successScreen.style.display = "none";

  try {
    const session = await getLiveSessionInfo();

    if (!session || session.status !== "live") {
      currentLiveSession = null;
      if (sessionLoading) sessionLoading.style.display = "none";
      if (noSessionCard) noSessionCard.style.display = "block";
      return;
    }

    currentLiveSession = session;

    // Populate live session details
    if (sessionTitle) sessionTitle.textContent = session.title || "NEXTGEN Interactive Session";
    if (sessionFacilitator) sessionFacilitator.textContent = session.facilitator_name || session.facilitatorName || "Success Academy Facilitator";
    if (sessionTime) sessionTime.textContent = formatSessionDateTime(session.scheduled_at || session.scheduledAt || session.live_at || session.liveAt);

    if (sessionLoading) sessionLoading.style.display = "none";
    if (checkinContainer) checkinContainer.style.display = "block";
  } catch (err) {
    console.error("Failed to load live NEXTGEN session:", err);
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

// Auto-run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

