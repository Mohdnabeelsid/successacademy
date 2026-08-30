// ==========================================================================
// TOAST — lightweight notification component
// Usage: import { toast } from '../components/toast.js'; toast.success('Saved!');
// ==========================================================================

function ensureRegion() {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    document.body.appendChild(region);
  }
  return region;
}

function show(message, type = "success", duration = 3200) {
  const region = ensureRegion();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 240ms ease, transform 240ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateX(24px)";
    setTimeout(() => el.remove(), 240);
  }, duration);
}

export const toast = {
  success: (msg) => show(msg, "success"),
  error: (msg) => show(msg, "error"),
  info: (msg) => show(msg, "info"),
  warning: (msg) => show(msg, "info")
};
