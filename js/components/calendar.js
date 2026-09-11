import { getISTDateParts, getISTTodayIso } from "../utils/date-time.js";

// Days of week starting on Monday and ending on Sunday
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Renders an interactive month calendar into the given container in IST.
 * Week starts on Monday and ends on Sunday.
 * Features previous/next month navigation and a Today shortcut button.
 * @param {HTMLElement} container
 * @param {Set<string>} loggedDates - ISO date strings (YYYY-MM-DD) with an approved log
 * @param {Date} monthDate - any date within the month to render (defaults to today in IST)
 */
export function renderCalendar(container, loggedDates, monthDate = new Date()) {
  if (!container) return;

  const parts = getISTDateParts(monthDate);
  const year = parts.year;
  const month = parts.month - 1; // 0-indexed
  const firstDayRaw = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon, ...
  const firstDay = (firstDayRaw + 6) % 7; // 0 = Mon, ..., 6 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = getISTTodayIso();
  const monthTitle = `${MONTH_NAMES[month]} ${year}`;

  let html = `
    <div class="calendar-header" aria-label="Calendar navigation">
      <span class="calendar-title">${monthTitle}</span>
      <div class="calendar-nav">
        <button type="button" class="cal-nav-btn" data-cal-action="prev" title="Previous month" aria-label="Previous month">‹</button>
        <button type="button" class="cal-today-btn" data-cal-action="today" title="Jump to current month" aria-label="Jump to current month">Today</button>
        <button type="button" class="cal-nav-btn" data-cal-action="next" title="Next month" aria-label="Next month">›</button>
      </div>
    </div>
  `;

  html += DOW.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < firstDay; i++) html += `<div class="day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isLogged = loggedDates ? loggedDates.has(iso) : false;
    const isToday = iso === todayIso;
    html += `<div class="day ${isLogged ? "logged" : ""} ${isToday ? "today" : ""}" title="${iso}">${d}</div>`;
  }

  container.innerHTML = html;

  // Wire month navigation events
  const prevBtn = container.querySelector('[data-cal-action="prev"]');
  const nextBtn = container.querySelector('[data-cal-action="next"]');
  const todayBtn = container.querySelector('[data-cal-action="today"]');

  prevBtn?.addEventListener("click", () => {
    renderCalendar(container, loggedDates, new Date(year, month - 1, 1));
  });

  nextBtn?.addEventListener("click", () => {
    renderCalendar(container, loggedDates, new Date(year, month + 1, 1));
  });

  todayBtn?.addEventListener("click", () => {
    renderCalendar(container, loggedDates, new Date());
  });
}
