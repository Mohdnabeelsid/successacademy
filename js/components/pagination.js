// ==========================================================================
// PAGINATION COMPONENT — Accessible client-side table pagination
// ==========================================================================

/**
 * Renders pagination controls into the given container.
 * @param {Object} options
 * @param {HTMLElement|string} options.container - Container element or ID selector
 * @param {number} options.totalItems - Total count of items
 * @param {number} options.pageSize - Items per page
 * @param {number} options.currentPage - Currently active page (1-indexed)
 * @param {Function} options.onPageChange - Callback when user navigates to a new page (page: number) => void
 */
export function renderPagination({
  container,
  totalItems,
  pageSize = 15,
  currentPage = 1,
  onPageChange
}) {
  const el = typeof container === "string" ? document.getElementById(container) : container;
  if (!el) return;

  if (totalItems <= 0) {
    el.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.max(1, Math.min(currentPage, totalPages));

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  // If only 1 page, show minimal status info without complex buttons
  if (totalPages === 1) {
    el.innerHTML = `
      <div class="pagination-wrap">
        <div class="pagination-info">Showing all ${totalItems} ${totalItems === 1 ? "entry" : "entries"}</div>
      </div>
    `;
    return;
  }

  // Generate page numbers with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const buttonsHtml = pages
    .map((p) => {
      if (p === "...") {
        return `<span class="page-ellipsis" aria-hidden="true">…</span>`;
      }
      const isActive = p === page;
      return `
        <button type="button" class="page-btn ${isActive ? "active" : ""}" data-page="${p}" ${isActive ? 'aria-current="page"' : ""} aria-label="Go to page ${p}">
          ${p}
        </button>
      `;
    })
    .join("");

  el.innerHTML = `
    <div class="pagination-wrap">
      <div class="pagination-info">
        Showing <strong>${startItem}</strong>–<strong>${endItem}</strong> of <strong>${totalItems}</strong> entries
      </div>
      <div class="pagination-controls" role="navigation" aria-label="Pagination Navigation">
        <button type="button" class="page-btn page-nav-btn" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Previous page">
          ‹ Prev
        </button>
        ${buttonsHtml}
        <button type="button" class="page-btn page-nav-btn" data-page="${page + 1}" ${page === totalPages ? "disabled" : ""} aria-label="Next page">
          Next ›
        </button>
      </div>
    </div>
  `;

  // Attach click listener
  el.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetPage = Number(btn.dataset.page);
      if (targetPage && targetPage !== page && targetPage >= 1 && targetPage <= totalPages) {
        if (typeof onPageChange === "function") {
          onPageChange(targetPage);
        }
      }
    });
  });
}
