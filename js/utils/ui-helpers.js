// ==========================================================================
// UI HELPERS — Reusable UI interaction utilities
// ==========================================================================

const EYE_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const EYE_CLOSED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/**
 * Initializes all password toggle buttons on the current page.
 * Buttons should have class `password-toggle-btn` and be inside `.password-input-wrapper`.
 */
export function initPasswordToggles() {
  document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
    // Avoid double initialization
    if (btn.dataset.pwdInit === "true") return;
    btn.dataset.pwdInit = "true";

    // Set initial icon if empty
    if (!btn.innerHTML.trim()) {
      btn.innerHTML = EYE_OPEN_SVG;
    }

    btn.addEventListener("click", () => {
      const wrapper = btn.closest(".password-input-wrapper");
      const targetId = btn.dataset.target;
      const input = targetId ? document.getElementById(targetId) : wrapper?.querySelector("input");
      if (!input) return;

      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";

      const label = isPassword ? "Hide password" : "Show password";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
      btn.innerHTML = isPassword ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
    });
  });
}

/**
 * Sets button loading state with spinner and preserves original markup.
 * @param {HTMLButtonElement|HTMLElement} btn 
 * @param {boolean} isLoading 
 * @param {string} [loadingText] 
 */
export function setButtonLoading(btn, isLoading, loadingText = "Loading...") {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.origHtml) {
      btn.dataset.origHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.innerHTML = `<span class="spinner spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:8px;" aria-hidden="true"></span><span>${loadingText}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
    }
  }
}

/**
 * Generates skeleton placeholder rows for tables.
 * @param {number} [cols=7] 
 * @param {number} [rows=5] 
 * @returns {string} HTML string of <tr> elements
 */
export function getSkeletonTableRows(cols = 7, rows = 5) {
  return Array.from({ length: rows })
    .map(
      () => `
      <tr class="skeleton-row" aria-hidden="true">
        ${Array.from({ length: cols })
          .map(
            (_, i) => `
          <td><div class="skeleton skeleton-text" style="width:${i === 0 ? "75%" : i === cols - 1 ? "45%" : "85%"};"></div></td>`
          )
          .join("")}
      </tr>`
    )
    .join("");
}
