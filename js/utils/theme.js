// ==========================================================================
// THEME MANAGER — Light / Deep Forest Dark Theme Support
// ==========================================================================

const THEME_KEY = "sa-theme";

/**
 * Gets the active theme ("light" | "dark")
 * @returns {"light"|"dark"}
 */
export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") {
    return saved;
  }
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Sets the theme and persists it.
 * @param {"light"|"dark"} theme 
 */
export function setTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  try {
    localStorage.setItem(THEME_KEY, safeTheme);
  } catch (e) {}

  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: safeTheme } }));
  return safeTheme;
}

/**
 * Toggles between light and dark themes.
 * @returns {"light"|"dark"} the newly active theme
 */
export function toggleTheme() {
  const current = getTheme();
  const next = current === "dark" ? "light" : "dark";
  return setTheme(next);
}

/**
 * Initializes theme on page load.
 */
export function initTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute("data-theme", theme);
}

// Auto-run on import to prevent flash of wrong theme
initTheme();
