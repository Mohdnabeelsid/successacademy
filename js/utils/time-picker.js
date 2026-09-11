// ==========================================================================
// TIME PICKER UTILITY — Shared between student-dashboard.js and study-log-management.js
// Fix #7: wireTimePicker was duplicated in both pages. Single source of truth.
// ==========================================================================

/**
 * Wires start-time and end-time <input type="time"> elements so that duration
 * is automatically calculated in minutes and stored in a hidden field.
 *
 * @param {Object} opts
 * @param {string} opts.startId   - ID of the start time input
 * @param {string} opts.endId     - ID of the end time input
 * @param {string} opts.displayId - ID of the human-readable duration display element
 * @param {string} opts.hiddenId  - ID of the hidden input that stores computed minutes
 */
export function wireTimePicker({ startId, endId, displayId, hiddenId }) {
  const startEl  = document.getElementById(startId);
  const endEl    = document.getElementById(endId);
  const display  = document.getElementById(displayId);
  const hidden   = document.getElementById(hiddenId);

  if (!startEl || !endEl || !display || !hidden) return;

  function calcDuration() {
    const start = startEl.value; // "HH:MM"
    const end   = endEl.value;

    if (!start || !end) {
      hidden.value = "";
      display.textContent = "Duration will appear here after selecting times.";
      display.style.color = "var(--c-slate-500)";
      display.style.fontWeight = "400";
      return;
    }

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let totalMins = (eh * 60 + em) - (sh * 60 + sm);

    if (totalMins <= 0) {
      hidden.value = "";
      display.textContent = "⚠ End time must be after start time.";
      display.style.color = "var(--c-danger)";
      display.style.fontWeight = "600";
      return;
    }

    hidden.value = String(totalMins);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const label = hrs > 0
      ? `${hrs}h ${mins > 0 ? mins + "m" : ""}`.trim()
      : `${mins} minutes`;
    display.textContent = `✓ Study duration: ${label}`;
    display.style.color = "var(--c-primary)";
    display.style.fontWeight = "600";
  }

  startEl.addEventListener("change", calcDuration);
  endEl.addEventListener("change",   calcDuration);
}
