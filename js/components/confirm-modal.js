// ==========================================================================
// CONFIRM MODAL — Accessible custom confirmation dialog
// Replaces native browser confirm() with an elegant, styled modal dialog.
// ==========================================================================

let confirmContainer = null;

function ensureConfirmContainer() {
  if (!confirmContainer || !document.body.contains(confirmContainer)) {
    confirmContainer = document.createElement("div");
    confirmContainer.id = "confirm-dialog-region";
    document.body.appendChild(confirmContainer);
  }
  return confirmContainer;
}

/**
 * Shows an accessible confirmation modal.
 * @param {Object} options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Detailed explanation
 * @param {string} [options.confirmText="Confirm"] - Text for confirmation button
 * @param {string} [options.cancelText="Cancel"] - Text for cancel button
 * @param {"danger"|"warning"|"primary"} [options.confirmVariant="danger"] - Color style for confirm button
 * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise
 */
export function showConfirmModal({
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger"
}) {
  return new Promise((resolve) => {
    const region = ensureConfirmContainer();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay confirm-modal-overlay active";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "confirm-dialog-title");

    const iconColor = confirmVariant === "danger" ? "var(--c-danger)" : "var(--c-warning)";
    const iconBg = confirmVariant === "danger" ? "rgba(193, 63, 63, 0.1)" : "rgba(200, 138, 46, 0.1)";

    overlay.innerHTML = `
      <div class="modal confirm-modal-card">
        <div class="confirm-modal-header">
          <div class="confirm-modal-icon" style="background:${iconBg}; color:${iconColor};">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <h3 id="confirm-dialog-title" class="confirm-modal-title">${title}</h3>
            <p class="confirm-modal-message">${message}</p>
          </div>
        </div>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="confirm-cancel-btn">${cancelText}</button>
          <button type="button" class="btn btn-${confirmVariant === 'danger' ? 'danger' : 'primary'} btn-sm" id="confirm-ok-btn">${confirmText}</button>
        </div>
      </div>
    `;

    region.appendChild(overlay);

    const okBtn = overlay.querySelector("#confirm-ok-btn");
    const cancelBtn = overlay.querySelector("#confirm-cancel-btn");

    function cleanup(result) {
      document.removeEventListener("keydown", onKeyDown);
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 180);
      resolve(result);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      }
    }

    okBtn.addEventListener("click", () => cleanup(true));
    cancelBtn.addEventListener("click", () => cleanup(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });

    document.addEventListener("keydown", onKeyDown);

    // Auto-focus cancel button for safety
    cancelBtn.focus();
  });
}
