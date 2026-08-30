// ==========================================================================
// CALENDAR — monthly study log grid
// ==========================================================================

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Renders a month calendar into the given container.
 * @param {HTMLElement} container
 * @param {Set<string>} loggedDates - ISO date strings (YYYY-MM-DD) with an approved log
 * @param {Date} monthDate - any date within the month to render (defaults to today)
 */
export function renderCalendar(container, loggedDates, monthDate = new Date()) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  let html = DOW.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < firstDay; i++) html += `<div class="day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isLogged = loggedDates.has(iso);
    const isToday = iso === todayIso;
    html += `<div class="day ${isLogged ? "logged" : ""} ${isToday ? "today" : ""}" title="${iso}">${d}</div>`;
  }

  container.innerHTML = html;
}
