// ==========================================================================
// ADMIN EXAMS & ASSESSMENTS MANAGEMENT
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { listStudents } from "../services/student-service.js";
import { getSubjectsForClass } from "../services/subject-service.js";
import {
  listExams,
  getExam,
  createExam,
  createMultipleExams,
  updateExam,
  deleteExam,
  getExamMarksForExam,
  getAllExamMarks,
  bulkSaveExamMarks,
  calcGrade,
  calcClassExamStats,
  EXAM_TYPES
} from "../services/exam-service.js";
import {
  generateGradeScale,
  calculateGrade,
  validateMarks,
  renderGradeBadge,
  DEFAULT_GRADE_CONFIG
} from "../services/grading-service.js";
import { formatLogDate, getISTTodayIso, format12Hour } from "../utils/date-time.js";
// Fix #10/#11: import shared helpers instead of duplicating them
import { escapeHtml, getExamTypeBadge } from "../utils/exam-ui.js";
import { showConfirmModal } from "../components/confirm-modal.js";

const CLASSES_LIST = ["10", "9", "8", "7", "6", "5", "11 Science", "11 Commerce", "12 Science", "12 Commerce"];

let admin;
let allExams = [];
let allStudents = [];
let studentMap = {};
let currentExamForMarks = null;
let currentExamMarks = [];
let analyticsChartInstance = null;

(async function init() {
  try {
    admin = await requireAuth("admin", "admin-login.html");
    renderSidebar("admin", "exams", { name: admin.name || admin.email, sub: "Branch Admin" });

    const [exams, students] = await Promise.all([listExams(), listStudents()]);
    allExams = exams;
    allStudents = students;
    studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

    await updateDashboardStats();
    renderExamsTable();
    wireEvents();
  } catch (err) {
    console.error("Admin exams init error:", err);
    toast.error("Failed to load exams data.");
  } finally {
    document.getElementById("page-loader")?.classList.add("done");
  }
})();

async function updateDashboardStats() {
  const totalPerfEl = document.getElementById("stat-total-perf");
  const totalPerfSubEl = document.getElementById("stat-total-perf-sub");
  const passRateEl = document.getElementById("stat-pass-rate");
  const passRateSubEl = document.getElementById("stat-pass-rate-sub");
  const topSubjectEl = document.getElementById("stat-top-subject");
  const topSubjectSubEl = document.getElementById("stat-top-subject-sub");

  try {
    const allMarks = await getAllExamMarks();
    const validMarks = allMarks.filter(
      (m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined
    );

    if (validMarks.length === 0) {
      if (totalPerfEl) totalPerfEl.textContent = "—";
      if (totalPerfSubEl) totalPerfSubEl.textContent = "—";
      if (passRateEl) passRateEl.textContent = "—";
      if (passRateSubEl) passRateSubEl.textContent = "0 passed of 0 graded";
      if (topSubjectEl) {
        topSubjectEl.textContent = "—";
        topSubjectEl.title = "—";
      }
      if (topSubjectSubEl) topSubjectSubEl.textContent = "No marks graded";
      return;
    }

    const examMap = Object.fromEntries(allExams.map((e) => [e.id, e]));

    let totalPct = 0;
    let passedCount = 0;
    const subjectMap = {};

    validMarks.forEach((m) => {
      const exam = examMap[m.examId];
      const max = Number(m.maxMarks) || (exam ? Number(exam.maxMarks) : 100);
      const pass = exam ? Number(exam.passingMarks) : 35;
      const score = Number(m.marksObtained);
      const subject = (m.subject || (exam ? exam.subject : "General") || "General").trim();

      const pct = (score / max) * 100;
      totalPct += pct;

      if (score >= pass) passedCount++;

      if (!subjectMap[subject]) {
        subjectMap[subject] = { totalPct: 0, count: 0 };
      }
      subjectMap[subject].totalPct += pct;
      subjectMap[subject].count += 1;
    });

    // 1. Total Performance
    const avgPct = (totalPct / validMarks.length).toFixed(1);
    const overallGrade = calcGrade(avgPct);

    if (totalPerfEl) totalPerfEl.textContent = `${avgPct}%`;
    if (totalPerfSubEl) totalPerfSubEl.textContent = `${overallGrade.grade} · ${overallGrade.label}`;

    // 2. Overall Pass Rate
    const passPct = ((passedCount / validMarks.length) * 100).toFixed(1);
    if (passRateEl) passRateEl.textContent = `${passPct}%`;
    if (passRateSubEl) passRateSubEl.textContent = `${passedCount} passed of ${validMarks.length} graded`;

    // 3. Top Subject
    let bestSubjName = "—";
    let bestSubjAvg = -1;
    let bestSubjCount = 0;

    for (const [subj, data] of Object.entries(subjectMap)) {
      const avg = data.totalPct / data.count;
      if (avg > bestSubjAvg) {
        bestSubjAvg = avg;
        bestSubjName = subj;
        bestSubjCount = data.count;
      }
    }

    if (topSubjectEl) {
      topSubjectEl.textContent = bestSubjName;
      topSubjectEl.title = bestSubjName;
    }
    if (topSubjectSubEl) {
      topSubjectSubEl.textContent = `${bestSubjAvg.toFixed(1)}% avg (${bestSubjCount} mark${bestSubjCount === 1 ? "" : "s"})`;
    }
  } catch (err) {
    console.error("Error updating admin exam stats:", err);
    if (totalPerfEl) totalPerfEl.textContent = "—";
    if (passRateEl) passRateEl.textContent = "—";
    if (topSubjectEl) topSubjectEl.textContent = "—";
  }
}

// Removed: escapeHtml is now imported from ../utils/exam-ui.js
// Removed: getExamTypeBadge is now imported from ../utils/exam-ui.js


function renderExamsTable() {
  const search = document.getElementById("search-input")?.value.trim().toLowerCase() || "";
  const filterCls = document.getElementById("filter-class")?.value || "";
  const filterType = document.getElementById("filter-type")?.value || "";

  let filtered = allExams.filter((e) => {
    if (filterCls && String(e.class) !== String(filterCls)) return false;
    if (filterType && e.examType !== filterType) return false;
    if (search) {
      const matchTitle = (e.title || "").toLowerCase().includes(search);
      const matchSubj = (e.subject || "").toLowerCase().includes(search);
      const matchType = (e.examType || "").toLowerCase().includes(search);
      if (!matchTitle && !matchSubj && !matchType) return false;
    }
    return true;
  });

  const tbody = document.getElementById("exams-body");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>No exams found</h4>Schedule an exam or adjust your search filters.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((e) => {
      const classStudentsCount = allStudents.filter(
        (s) => String(s.class) === String(e.class) && !s.loginDisabled
      ).length;

      const formattedDate = formatLogDate(e.examDate);
      const timeDisplay = e.startTime ? ` · ${format12Hour(e.startTime)}` : "";

      return `
      <tr>
        <td>
          <div style="font-weight:700; font-size:var(--fs-sm); color:var(--c-dark);">${escapeHtml(e.title)}</div>
          <div style="margin-top:4px;">${getExamTypeBadge(e.examType)}</div>
        </td>
        <td>
          <div style="font-weight:600;">Class ${escapeHtml(e.class)}</div>
          <div style="font-size:var(--fs-xs); color:var(--c-slate-500);">${escapeHtml(e.branch || "MAN")} Branch · ${classStudentsCount} students</div>
        </td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; font-size:var(--fs-xs); color:var(--c-slate-700); background:var(--surface-1); padding:3px 8px; border-radius:var(--r-sm); border:1px solid var(--c-border);">
            ${escapeHtml(e.subject)}
          </span>
        </td>
        <td>
          <div style="font-size:var(--fs-sm); font-weight:500;">${formattedDate}</div>
          <div style="font-size:var(--fs-xs); color:var(--c-slate-500);">${timeDisplay || "Standard"}</div>
        </td>
        <td>
          <div style="font-size:var(--fs-sm);"><strong>${e.maxMarks}</strong> Max</div>
          <div style="font-size:var(--fs-xs); color:var(--c-slate-500);">Pass: ${e.passingMarks}</div>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <button class="btn btn-ghost btn-sm" data-marks="${e.id}" style="color:var(--c-primary); border-color:rgba(15,161,93,0.3); font-weight:600; text-align:left; padding:4px 8px;">
              📊 Enter / Sync Marks
            </button>
            <button class="btn btn-ghost btn-xs" data-scale="${e.id}" style="color:var(--c-slate-600); font-size:11px; padding:2px 8px; text-align:left; border:1px solid var(--c-border); border-radius:var(--r-sm);">
              📐 Dynamic Scale (${e.maxMarks}m)
            </button>
          </div>
        </td>
        <td style="text-align:right;">
          <div class="flex items-center justify-end gap-1">
            <button class="btn btn-ghost btn-sm" data-analytics="${e.id}" title="Class Analytics" style="padding:0; width:32px; height:32px; min-width:32px; display:inline-flex; align-items:center; justify-content:center;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" data-edit="${e.id}" title="Edit Exam" style="padding:6px 10px;">Edit</button>
            <button class="btn btn-ghost btn-sm" data-delete="${e.id}" title="Delete Exam" style="color:var(--c-danger); padding:6px 10px;">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function initClassCheckboxes() {
  const container = document.getElementById("class-checkbox-grid");
  if (!container) return;

  container.innerHTML = CLASSES_LIST.map((cls) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:var(--fs-xs); font-weight:600; cursor:pointer; background:var(--surface-0); padding:8px 10px; border-radius:var(--r-sm); border:1px solid var(--c-border);">
      <input type="checkbox" class="class-check" value="${escapeHtml(cls)}">
      <span>Class ${escapeHtml(cls)}</span>
    </label>
  `).join("");

  container.querySelectorAll(".class-check").forEach((chk) => {
    chk.addEventListener("change", renderSubjectConfigs);
  });
}

function renderSubjectConfigs() {
  const container = document.getElementById("subject-config-container");
  if (!container) return;

  // Snapshot existing user edits across all currently rendered class sections
  const savedState = {};
  container.querySelectorAll("[data-class-section]").forEach((card) => {
    const cls = card.dataset.classSection;
    savedState[cls] = {
      quickMax: card.querySelector(".quick-max")?.value || "100",
      quickPass: card.querySelector(".quick-pass")?.value || "35",
      subjects: {}
    };

    card.querySelectorAll(".subj-config-row").forEach((row) => {
      const subj = row.dataset.subject;
      savedState[cls].subjects[subj] = {
        included: row.querySelector(".subj-include")?.checked ?? true,
        maxMarks: row.querySelector(".subj-max-marks")?.value || "100",
        passMarks: row.querySelector(".subj-pass-marks")?.value || "35"
      };
    });
  });

  const checkedClasses = Array.from(document.querySelectorAll("#class-checkbox-grid .class-check:checked")).map((c) => c.value);

  if (!checkedClasses.length) {
    container.innerHTML = `<div style="padding:18px; text-align:center; background:var(--surface-1); border-radius:var(--r-md); border:1px dashed var(--c-border); color:var(--c-slate-500); font-size:var(--fs-xs);">Please select at least one class above to configure subjects and marks.</div>`;
    return;
  }

  container.innerHTML = checkedClasses.map((cls) => {
    const subjects = getSubjectsForClass(cls);
    const clsSaved = savedState[cls] || {};
    const defaultMax = clsSaved.quickMax || "100";
    const defaultPass = clsSaved.quickPass || "35";

    return `
      <div class="card" style="padding:var(--sp-4); border:1.5px solid var(--c-border); background:var(--surface-0);" data-class-section="${escapeHtml(cls)}">
        <div class="flex items-center justify-between" style="margin-bottom:var(--sp-3); padding-bottom:8px; border-bottom:1px solid var(--c-border); flex-wrap:wrap; gap:8px;">
          <div style="font-weight:700; font-size:var(--fs-sm); color:var(--c-dark);">
            📘 Class ${escapeHtml(cls)} <span style="font-size:var(--fs-xs); color:var(--c-slate-500); font-weight:500;">(${subjects.length} Subjects)</span>
          </div>
          <div class="flex items-center gap-2" style="font-size:var(--fs-xs);">
            <span style="color:var(--c-slate-500); font-weight:600;">Quick Fill:</span>
            <input type="number" class="quick-max" placeholder="Max" value="${escapeHtml(defaultMax)}" style="width:65px; padding:4px 6px; font-size:11px; border:1px solid var(--c-border); border-radius:var(--r-sm);">
            <input type="number" class="quick-pass" placeholder="Pass" value="${escapeHtml(defaultPass)}" style="width:65px; padding:4px 6px; font-size:11px; border:1px solid var(--c-border); border-radius:var(--r-sm);">
            <button type="button" class="btn btn-ghost btn-sm btn-quick-apply" style="padding:3px 8px; font-size:11px;">Apply</button>
          </div>
        </div>

        <div class="table-wrap marks-table" style="max-height:220px; overflow-y:auto; border:1px solid var(--c-border);">
          <table style="width:100%;">
            <thead style="position:sticky; top:0; background:var(--surface-1); z-index:1;">
              <tr>
                <th style="width:12%; text-align:center;">Include</th>
                <th style="width:48%;">Subject</th>
                <th style="width:20%;">Max Marks</th>
                <th style="width:20%;">Passing Marks</th>
              </tr>
            </thead>
            <tbody>
              ${subjects.map((subj) => {
                const subjSaved = clsSaved.subjects ? clsSaved.subjects[subj] : null;
                const isIncluded = subjSaved ? subjSaved.included : true;
                const maxVal = subjSaved ? subjSaved.maxMarks : defaultMax;
                const passVal = subjSaved ? subjSaved.passMarks : defaultPass;

                return `
                <tr class="subj-config-row" data-subject="${escapeHtml(subj)}">
                  <td style="text-align:center;">
                    <input type="checkbox" class="subj-include" ${isIncluded ? "checked" : ""}>
                  </td>
                  <td>
                    <strong style="font-size:var(--fs-xs);">${escapeHtml(subj)}</strong>
                  </td>
                  <td>
                    <input type="number" class="subj-max-marks" min="1" max="1000" value="${escapeHtml(String(maxVal))}" style="padding:4px 8px; font-size:var(--fs-xs);">
                  </td>
                  <td>
                    <input type="number" class="subj-pass-marks" min="1" max="1000" value="${escapeHtml(String(passVal))}" style="padding:4px 8px; font-size:var(--fs-xs);">
                  </td>
                </tr>
              `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");

  // Wire Quick Fill Apply buttons
  container.querySelectorAll("[data-class-section]").forEach((card) => {
    const applyBtn = card.querySelector(".btn-quick-apply");
    const quickMax = card.querySelector(".quick-max");
    const quickPass = card.querySelector(".quick-pass");

    applyBtn?.addEventListener("click", () => {
      const maxVal = quickMax.value || "100";
      const passVal = quickPass.value || "35";
      card.querySelectorAll(".subj-max-marks").forEach((inp) => inp.value = maxVal);
      card.querySelectorAll(".subj-pass-marks").forEach((inp) => inp.value = passVal);
      toast.info(`Updated subjects for Class ${card.dataset.classSection}`);
    });
  });
}

function populateSingleEditSubjects(selectedClass, preselectSubject = "") {
  const select = document.getElementById("single-exam-subject");
  if (!select) return;

  const subjects = selectedClass ? getSubjectsForClass(selectedClass) : [];
  let opts = '<option value="All Subjects">All Subjects</option>';
  subjects.forEach((subj) => {
    opts += `<option value="${escapeHtml(subj)}" ${subj === preselectSubject ? "selected" : ""}>${escapeHtml(subj)}</option>`;
  });
  select.innerHTML = opts;
}

function wireEvents() {
  initClassCheckboxes();

  document.getElementById("search-input")?.addEventListener("input", renderExamsTable);
  document.getElementById("filter-class")?.addEventListener("change", renderExamsTable);
  document.getElementById("filter-type")?.addEventListener("change", renderExamsTable);
  document.getElementById("reset-filters-btn")?.addEventListener("click", () => {
    document.getElementById("search-input").value = "";
    document.getElementById("filter-class").value = "";
    document.getElementById("filter-type").value = "";
    renderExamsTable();
  });

  // Quick Class Selection Shortcuts
  document.getElementById("btn-select-all-classes")?.addEventListener("click", () => {
    document.querySelectorAll("#class-checkbox-grid .class-check").forEach((c) => c.checked = true);
    renderSubjectConfigs();
  });

  document.getElementById("btn-select-high-classes")?.addEventListener("click", () => {
    document.querySelectorAll("#class-checkbox-grid .class-check").forEach((c) => {
      c.checked = ["8", "9", "10"].includes(c.value);
    });
    renderSubjectConfigs();
  });

  document.getElementById("btn-select-up-classes")?.addEventListener("click", () => {
    document.querySelectorAll("#class-checkbox-grid .class-check").forEach((c) => {
      c.checked = ["5", "6", "7"].includes(c.value);
    });
    renderSubjectConfigs();
  });

  document.getElementById("btn-select-plus-classes")?.addEventListener("click", () => {
    document.querySelectorAll("#class-checkbox-grid .class-check").forEach((c) => {
      c.checked = ["11 Science", "11 Commerce", "12 Science", "12 Commerce"].includes(c.value);
    });
    renderSubjectConfigs();
  });

  document.getElementById("btn-clear-classes")?.addEventListener("click", () => {
    document.querySelectorAll("#class-checkbox-grid .class-check").forEach((c) => c.checked = false);
    renderSubjectConfigs();
  });

  // Single edit class change
  document.getElementById("single-exam-class")?.addEventListener("change", (e) => {
    populateSingleEditSubjects(e.target.value);
  });

  // Schedule Exam Modal Open
  const examModal = document.getElementById("exam-modal");
  const examForm = document.getElementById("exam-form");

  document.getElementById("schedule-exam-btn")?.addEventListener("click", () => {
    examForm.reset();
    document.getElementById("exam-id").value = "";
    document.getElementById("exam-modal-title").textContent = "Schedule New Exam(s)";
    document.getElementById("exam-date").value = getISTTodayIso();

    document.getElementById("class-selection-section").style.display = "block";
    document.getElementById("subject-config-section").style.display = "block";
    document.getElementById("single-edit-section").style.display = "none";

    // Default select Class 10
    document.querySelectorAll("#class-checkbox-grid .class-check").forEach((c) => {
      c.checked = c.value === "10";
    });
    renderSubjectConfigs();

    examModal.classList.add("active");
  });

  const closeExamModal = () => examModal?.classList.remove("active");
  document.getElementById("close-exam-modal")?.addEventListener("click", closeExamModal);
  document.getElementById("cancel-exam-modal")?.addEventListener("click", closeExamModal);
  examModal?.addEventListener("click", (e) => { if (e.target === examModal) closeExamModal(); });

  // Save Exam Form (Supports Multi-Class & Subject-Wise Configuration)
  examForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("save-exam-btn");
    saveBtn.disabled = true;

    const id = document.getElementById("exam-id").value;
    const title = document.getElementById("exam-title").value.trim();
    const examType = document.getElementById("exam-type").value;
    const examDate = document.getElementById("exam-date").value;
    const startTime = document.getElementById("exam-start-time").value;

    try {
      if (id) {
        // Single edit mode
        const singleClass = document.getElementById("single-exam-class").value;
        const singleSubject = document.getElementById("single-exam-subject").value;
        const maxMarks = Number(document.getElementById("single-exam-max-marks").value) || 100;
        const passingMarks = Number(document.getElementById("single-exam-passing-marks").value) || 35;

        await updateExam(id, {
          title,
          examType,
          class: singleClass,
          subject: singleSubject,
          examDate,
          startTime,
          maxMarks,
          passingMarks,
          branch: "MAN"
        });
        toast.success("Exam details updated successfully.");
      } else {
        // Multi-class & subject-wise batch creation
        const classCards = document.querySelectorAll("#subject-config-container [data-class-section]");
        if (!classCards.length) {
          toast.error("Please select at least one class.");
          saveBtn.disabled = false;
          return;
        }

        const examsToCreate = [];

        classCards.forEach((card) => {
          const cls = card.dataset.classSection;
          const rows = card.querySelectorAll(".subj-config-row");

          rows.forEach((r) => {
            const includeCheck = r.querySelector(".subj-include");
            if (includeCheck && includeCheck.checked) {
              const subject = r.dataset.subject;
              const maxMarks = Number(r.querySelector(".subj-max-marks")?.value) || 100;
              const passingMarks = Number(r.querySelector(".subj-pass-marks")?.value) || 35;

              examsToCreate.push({
                title: title,
                examType: examType,
                class: cls,
                subject: subject,
                examDate: examDate,
                startTime: startTime,
                maxMarks: maxMarks,
                passingMarks: passingMarks,
                branch: "MAN"
              });
            }
          });
        });

        if (!examsToCreate.length) {
          toast.error("Please include at least one subject to schedule.");
          saveBtn.disabled = false;
          return;
        }

        await createMultipleExams(examsToCreate);
        toast.success(`Successfully scheduled ${examsToCreate.length} exam subject(s) across selected classes!`);
      }

      closeExamModal();
      allExams = await listExams();
      await updateDashboardStats();
      renderExamsTable();
    } catch (err) {
      console.error("Save exam error:", err);
      toast.error(err.message || "Failed to save exam.");
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Table click delegation for Marks, Analytics, Edit, Delete
  document.getElementById("exams-body")?.addEventListener("click", async (e) => {
    const marksBtn = e.target.closest("[data-marks]");
    if (marksBtn) {
      openMarksEntryModal(marksBtn.dataset.marks);
      return;
    }

    const scaleBtn = e.target.closest("[data-scale]");
    if (scaleBtn) {
      const exam = allExams.find((x) => x.id === scaleBtn.dataset.scale);
      if (exam) {
        openGradeScaleModal(exam.maxMarks || 80, `${exam.subject} (${exam.title})`);
      }
      return;
    }

    const analyticsBtn = e.target.closest("[data-analytics]");
    if (analyticsBtn) {
      openAnalyticsModal(analyticsBtn.dataset.analytics);
      return;
    }

    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const exam = allExams.find((x) => x.id === editBtn.dataset.edit);
      if (exam) {
        document.getElementById("exam-id").value = exam.id;
        document.getElementById("exam-title").value = exam.title || "";
        document.getElementById("exam-type").value = exam.examType || "Onam Exam";
        document.getElementById("exam-date").value = exam.examDate || getISTTodayIso();
        document.getElementById("exam-start-time").value = exam.startTime || "";

        // Show single edit section and hide multi-class grid for editing
        document.getElementById("class-selection-section").style.display = "none";
        document.getElementById("subject-config-section").style.display = "none";
        document.getElementById("single-edit-section").style.display = "block";

        document.getElementById("single-exam-class").value = exam.class || "10";
        populateSingleEditSubjects(exam.class, exam.subject);
        document.getElementById("single-exam-max-marks").value = exam.maxMarks || 100;
        document.getElementById("single-exam-passing-marks").value = exam.passingMarks || 35;

        document.getElementById("exam-modal-title").textContent = "Edit Exam";
        examModal.classList.add("active");
      }
      return;
    }

    const deleteBtn = e.target.closest("[data-delete]");
    if (deleteBtn) {
      const examId = deleteBtn.dataset.delete;
      const confirmed = await showConfirmModal({
        title: "Delete Exam Record",
        message: "Are you sure you want to delete this exam and all student marks recorded for it? This cannot be undone.",
        confirmText: "Delete Exam",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
      try {
        await deleteExam(examId);
        allExams = allExams.filter((x) => x.id !== examId);
        toast.success("Exam deleted.");
        await updateDashboardStats();
        renderExamsTable();
      } catch (err) {
        toast.error(err.message || "Failed to delete exam.");
      }
    }
  });

  // Close Marks & Analytics Modals
  const marksModal = document.getElementById("marks-modal");
  const closeMarksModal = () => marksModal?.classList.remove("active");
  document.getElementById("close-marks-modal")?.addEventListener("click", closeMarksModal);
  document.getElementById("cancel-marks-modal")?.addEventListener("click", closeMarksModal);
  marksModal?.addEventListener("click", (e) => { if (e.target === marksModal) closeMarksModal(); });

  const analyticsModal = document.getElementById("analytics-modal");
  const closeAnalyticsModal = () => {
    if (analyticsChartInstance) {
      analyticsChartInstance.destroy();
      analyticsChartInstance = null;
    }
    analyticsModal?.classList.remove("active");
  };
  document.getElementById("close-analytics-modal")?.addEventListener("click", closeAnalyticsModal);
  document.getElementById("close-analytics-btn")?.addEventListener("click", closeAnalyticsModal);
  analyticsModal?.addEventListener("click", (e) => { if (e.target === analyticsModal) closeAnalyticsModal(); });

  // Dynamic Grade Scale Modal Wiring
  const gradeScaleModal = document.getElementById("grade-scale-modal");
  const closeGradeScaleModal = () => gradeScaleModal?.classList.remove("active");
  document.getElementById("close-grade-scale-modal")?.addEventListener("click", closeGradeScaleModal);
  document.getElementById("close-grade-scale-btn")?.addEventListener("click", closeGradeScaleModal);
  gradeScaleModal?.addEventListener("click", (e) => { if (e.target === gradeScaleModal) closeGradeScaleModal(); });

  document.getElementById("view-grade-engine-btn")?.addEventListener("click", () => {
    openGradeScaleModal(80, "Standard Scale (80 Marks Example)");
  });

  document.getElementById("preview-exam-grade-scale-btn")?.addEventListener("click", () => {
    const isSingle = document.getElementById("single-edit-section")?.style.display !== "none";
    let marks = 80;
    let subj = "Selected Subject";
    if (isSingle) {
      marks = Number(document.getElementById("single-exam-max-marks")?.value) || 80;
      subj = document.getElementById("single-exam-subject")?.value || "Selected Subject";
    } else {
      const firstMaxInput = document.querySelector("#subject-config-container .subj-max-marks");
      marks = Number(firstMaxInput?.value) || 80;
      const firstRow = document.querySelector("#subject-config-container .subj-config-row");
      subj = firstRow?.dataset.subject || "Selected Subject";
    }
    openGradeScaleModal(marks, subj);
  });

  const totalInput = document.getElementById("grade-scale-total-input");
  totalInput?.addEventListener("input", () => {
    const val = Number(totalInput.value) || 80;
    renderGradeScaleTable(val);
    updateTestMarkResult();
  });

  document.querySelectorAll("#grade-scale-modal .preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const marks = Number(btn.dataset.marks) || 80;
      if (totalInput) totalInput.value = marks;
      renderGradeScaleTable(marks);
      updateTestMarkResult();
    });
  });

  document.getElementById("test-obtained-mark-input")?.addEventListener("input", updateTestMarkResult);

  // Save All Marks Handler
  document.getElementById("save-all-marks-btn")?.addEventListener("click", async () => {
    if (!currentExamForMarks) return;
    const saveBtn = document.getElementById("save-all-marks-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving & Synchronizing...";

    try {
      const rows = document.querySelectorAll("#marks-table-body tr.mark-row");
      const marksList = [];

      rows.forEach((r) => {
        const studentId = r.dataset.studentId;
        const marksInput = r.querySelector(".input-marks");
        const maxInput = r.querySelector(".input-max");
        const absentCheck = r.querySelector(".check-absent");
        const subject = currentExamForMarks.subject || "General";

        const val = marksInput.value.trim();
        const isAbsent = absentCheck ? absentCheck.checked : false;

        if (isAbsent || val !== "") {
          marksList.push({
            studentId,
            subject,
            marksObtained: isAbsent ? null : val,
            maxMarks: maxInput.value || currentExamForMarks.maxMarks || 100,
            isAbsent,
            remarks: "",
            enteredBy: "admin"
          });
        }
      });

      await bulkSaveExamMarks(currentExamForMarks.id, marksList);
      toast.success(`Successfully synchronized marks for ${marksList.length} student(s)!`);
      closeMarksModal();
      await updateDashboardStats();
    } catch (err) {
      console.error("Save marks error:", err);
      toast.error("Failed to save marks: " + (err.message || "Unknown error"));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Synchronize All Marks";
    }
  });

  // Excel Export Handler
  document.getElementById("export-exams-btn")?.addEventListener("click", exportAllExamsExcel);
}

// ─────────────────────────────────────────
// MARKS ENTRY & SYNCHRONIZATION MODAL
// ─────────────────────────────────────────
async function openMarksEntryModal(examId) {
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) return;
  currentExamForMarks = exam;

  const modal = document.getElementById("marks-modal");
  document.getElementById("marks-modal-title").textContent = `Marks Entry: ${exam.title}`;
  document.getElementById("marks-modal-sub").textContent =
    `Class ${exam.class} · ${exam.subject} · ${exam.examType} · Max Marks: ${exam.maxMarks} (Pass: ${exam.passingMarks})`;

  const tbody = document.getElementById("marks-table-body");
  tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Loading students & synced marks...</div></td></tr>`;
  modal.classList.add("active");

  try {
    const marksData = await getExamMarksForExam(examId);
    currentExamMarks = marksData;

    // Filter active students for this class
    const classStudents = allStudents
      .filter((s) => String(s.class) === String(exam.class) && !s.loginDisabled)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    if (!classStudents.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No active students registered in Class ${exam.class}.</div></td></tr>`;
      return;
    }

    // Fix #6: key by studentId+subject to handle multi-subject exams correctly
    // Previously keyed only by studentId, which overwrote marks when a student
    // had multiple subject records on the same exam.
    const marksByStudentSubject = {};
    marksData.forEach((m) => {
      const key = `${m.studentId}::${m.subject || ""}`;
      marksByStudentSubject[key] = m;
    });
    // Also keep a per-student lookup for the first match (used when exam.subject is specific)
    const marksByStudent = {};
    marksData.forEach((m) => {
      if (!marksByStudent[m.studentId]) marksByStudent[m.studentId] = m;
    });

    let gradedCount = 0;

    tbody.innerHTML = classStudents
      .map((s) => {
        // Fix #6: look up mark using exam-specific subject key first; fall back to any mark for this student
        const subjectKey = `${s.id}::${exam.subject || ""}`;
        const mark = marksByStudentSubject[subjectKey] || marksByStudent[s.id];
        const isAbsent = mark?.isAbsent || false;
        const marksVal = isAbsent ? "" : (mark?.marksObtained !== null && mark?.marksObtained !== undefined ? mark.marksObtained : "");
        const maxVal = mark?.maxMarks || exam.maxMarks || 100;

        if (isAbsent || marksVal !== "") gradedCount++;

        let gradeBadge = '<span class="badge badge-ghost">—</span>';
        if (isAbsent) {
          gradeBadge = '<span class="badge badge-warning" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; font-weight:700;">Absent</span>';
        } else if (marksVal !== "") {
          const res = calculateGrade(marksVal, maxVal, { passingMarks: exam.passingMarks });
          if (res.status === "Error") {
            gradeBadge = `<span class="badge badge-danger" title="${escapeHtml(res.error || '')}">Invalid</span>`;
          } else {
            const passLabel = res.passed
              ? '<span style="color:var(--c-success); font-size:11px; font-weight:700;">PASS</span>'
              : '<span style="color:var(--c-danger); font-size:11px; font-weight:700;">FAIL</span>';
            gradeBadge = `<span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; margin-right:4px;">${res.grade}</span> ${passLabel}`;
          }
        }

        const sourceTag = mark?.enteredBy === "student"
          ? '<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:#EFF6FF; color:#1D4ED8; font-weight:600; margin-top:2px; display:inline-block;">👤 Entered by Student</span>'
          : mark?.enteredBy === "admin"
          ? '<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:#F3F4F6; color:#4B5563; font-weight:600; margin-top:2px; display:inline-block;">🛡️ Admin Verified</span>'
          : '<span style="font-size:10px; color:var(--c-slate-400);">Not entered yet</span>';

        return `
        <tr class="mark-row" data-student-id="${s.id}">
          <td>
            <div style="font-weight:700; font-size:var(--fs-sm);">${escapeHtml(s.name)}</div>
            <div style="font-size:var(--fs-xs); color:var(--c-slate-500);">${escapeHtml(s.admissionNumber)}</div>
            ${sourceTag}
          </td>
          <td>
            <span style="font-size:var(--fs-xs); font-weight:600; color:var(--c-slate-700);">${escapeHtml(exam.subject)}</span>
          </td>
          <td>
            <input type="number" step="0.5" min="0" max="${maxVal}" class="input-marks" value="${marksVal}" placeholder="Marks" style="width:90px; padding:6px 8px;" ${isAbsent ? "disabled" : ""}>
          </td>
          <td>
            <input type="number" class="input-max" value="${maxVal}" style="width:65px; padding:6px 8px;" readonly>
          </td>
          <td style="text-align:center;">
            <input type="checkbox" class="check-absent" ${isAbsent ? "checked" : ""}>
          </td>
          <td class="grade-cell">
            ${gradeBadge}
          </td>
        </tr>`;
      })
      .join("");

    document.getElementById("marks-quick-stats").textContent = `Graded: ${gradedCount} / ${classStudents.length}`;

    // Real-time recalculation of grade on typing or toggling absent
    tbody.querySelectorAll(".mark-row").forEach((row) => {
      const mInput = row.querySelector(".input-marks");
      const maxInput = row.querySelector(".input-max");
      const aCheck = row.querySelector(".check-absent");
      const gCell = row.querySelector(".grade-cell");

      const updateRowGrade = () => {
        if (aCheck.checked) {
          mInput.disabled = true;
          mInput.value = "";
          mInput.style.borderColor = "";
          gCell.innerHTML = '<span class="badge badge-warning" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5; font-weight:700;">Absent</span>';
        } else {
          mInput.disabled = false;
          const val = mInput.value.trim();
          if (val === "") {
            mInput.style.borderColor = "";
            gCell.innerHTML = '<span class="badge badge-ghost">—</span>';
          } else {
            const max = Number(maxInput.value) || 100;
            const res = calculateGrade(val, max, { passingMarks: exam.passingMarks });
            if (res.status === "Error") {
              mInput.style.borderColor = "var(--c-danger)";
              gCell.innerHTML = `<span class="badge badge-danger" title="${escapeHtml(res.error || '')}">⚠️ ${res.error?.includes("exceed") ? "Exceeds Max" : "Invalid"}</span>`;
            } else {
              mInput.style.borderColor = "";
              const passLabel = res.passed
                ? '<span style="color:var(--c-success); font-size:11px; font-weight:700;">PASS</span>'
                : '<span style="color:var(--c-danger); font-size:11px; font-weight:700;">FAIL</span>';
              gCell.innerHTML = `<span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; margin-right:4px;">${res.grade}</span> ${passLabel}`;
            }
          }
        }
      };

      mInput.addEventListener("input", updateRowGrade);
      aCheck.addEventListener("change", updateRowGrade);
    });

  } catch (err) {
    console.error("Error opening marks modal:", err);
    toast.error("Failed to load student marks.");
  }
}

// ─────────────────────────────────────────
// CLASS EXAM ANALYTICS & CHART MODAL
// ─────────────────────────────────────────
async function openAnalyticsModal(examId) {
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) return;

  const modal = document.getElementById("analytics-modal");
  document.getElementById("analytics-title").textContent = `Analytics: ${exam.title}`;
  document.getElementById("analytics-sub").textContent =
    `Class ${exam.class} · ${exam.subject} · Date: ${formatLogDate(exam.examDate)}`;

  modal.classList.add("active");

  try {
    const marksData = await getExamMarksForExam(examId);
    const stats = calcClassExamStats(exam, marksData);

    document.getElementById("ana-avg").textContent = stats.average !== "—" ? `${stats.average} (${stats.averagePct}%)` : "—";
    document.getElementById("ana-highest").textContent = stats.highest !== "—" ? `${stats.highest} / ${exam.maxMarks}` : "—";
    document.getElementById("ana-lowest").textContent = stats.lowest !== "—" ? `${stats.lowest} / ${exam.maxMarks}` : "—";
    document.getElementById("ana-pass-rate").textContent = stats.passPct !== "0" ? `${stats.passPct}% (${stats.passedCount} Pass)` : "0%";

    // Render Grade Distribution Chart with Chart.js
    const gradesCount = { "A+": 0, "A": 0, "B+": 0, "B": 0, "C+": 0, "C": 0, "D+": 0, "D": 0, "E": 0, "F": 0 };
    marksData.forEach((m) => {
      if (!m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined) {
        const res = calculateGrade(m.marksObtained, m.maxMarks || exam.maxMarks || 100);
        if (gradesCount[res.grade] !== undefined) {
          gradesCount[res.grade]++;
        }
      }
    });

    const ctx = document.getElementById("grade-distribution-chart")?.getContext("2d");
    if (ctx) {
      if (analyticsChartInstance) analyticsChartInstance.destroy();

      analyticsChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels: Object.keys(gradesCount),
          datasets: [
            {
              label: "Number of Students",
              data: Object.values(gradesCount),
              backgroundColor: [
                "#0FA15D", // A+
                "#10B981", // A
                "#0D9488", // B+
                "#1F7A78", // B
                "#2E4C8C", // C+
                "#D97706", // C
                "#F59E0B", // D+
                "#CA8A04", // D
                "#EA580C", // E
                "#EF4444"  // F
              ],
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 }
            }
          }
        }
      });
    }

    // Rank table
    const rankedList = marksData
      .filter((m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined)
      .sort((a, b) => Number(b.marksObtained) - Number(a.marksObtained));

    const rankTbody = document.getElementById("analytics-rank-body");
    if (!rankedList.length) {
      rankTbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No student scores submitted yet.</div></td></tr>`;
      return;
    }

    rankTbody.innerHTML = rankedList
      .map((m, idx) => {
        const s = studentMap[m.studentId];
        const res = calculateGrade(m.marksObtained, m.maxMarks || exam.maxMarks || 100, { passingMarks: exam.passingMarks });
        return `
        <tr>
          <td><strong>#${idx + 1}</strong></td>
          <td><strong>${s ? escapeHtml(s.name) : "Unknown Student"}</strong></td>
          <td>${s?.admissionNumber || "—"}</td>
          <td>${escapeHtml(m.subject || exam.subject)}</td>
          <td><strong>${m.marksObtained}</strong> / ${m.maxMarks || exam.maxMarks || 100}</td>
          <td>${res.percentageFormatted}</td>
          <td><span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800;">${res.grade}</span></td>
        </tr>`;
      })
      .join("");

  } catch (err) {
    console.error("Error opening analytics:", err);
    toast.error("Could not generate analytics.");
  }
}

// Fix #2: exportAllExamsExcel now fetches all marks in parallel (Promise.all)
// instead of sequential await inside for-of, preventing UI freeze with large datasets.
async function exportAllExamsExcel() {
  if (typeof XLSX === "undefined") {
    toast.error("Excel export library not loaded.");
    return;
  }

  try {
    toast.info("Generating Excel Report...");
    const rows = [];

    // Fetch all exam marks in parallel
    const allMarksResults = await Promise.all(
      allExams.map((exam) => getExamMarksForExam(exam.id).then((marks) => ({ exam, marks })))
    );

    for (const { exam, marks } of allMarksResults) {
      marks.forEach((m) => {
        const s = studentMap[m.studentId];
        const res = m.marksObtained !== null && m.marksObtained !== undefined && !m.isAbsent
          ? calculateGrade(m.marksObtained, m.maxMarks || exam.maxMarks || 100, { passingMarks: exam.passingMarks })
          : null;

        rows.push({
          "Exam Title": exam.title,
          "Exam Type": exam.examType,
          "Class": exam.class,
          "Subject": m.subject || exam.subject,
          "Exam Date": exam.examDate,
          "Student Name": s ? s.name : "Unknown",
          "Admission Number": s ? s.admissionNumber : "—",
          "Marks Obtained": m.isAbsent ? "Absent" : (m.marksObtained ?? "Not Entered"),
          "Max Marks": m.maxMarks || exam.maxMarks,
          "Percentage (%)": res ? res.percentageFormatted : "—",
          "Grade": res ? res.grade : (m.isAbsent ? "Absent" : "—"),
          "Grade Point": res ? res.gradePoint : "—",
          "Result": m.isAbsent ? "Absent" : (res ? (res.passed ? "Pass" : "Fail") : "—"),
          "Entered By": m.enteredBy || "—"
        });
      });
    }

    if (!rows.length) {
      toast.error("No exam results available to export.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Exam Results");
    XLSX.writeFile(wb, `success-academy-exam-results-${getISTTodayIso()}.xlsx`);
    toast.success("Excel report exported successfully!");
  } catch (err) {
    console.error("Export error:", err);
    toast.error("Failed to export Excel file.");
  }
}

// ─────────────────────────────────────────
// DYNAMIC GRADING ENGINE SCALE MODAL LOGIC
// ─────────────────────────────────────────
function openGradeScaleModal(totalMarks = 80, subjectName = "General") {
  const modal = document.getElementById("grade-scale-modal");
  if (!modal) return;

  const totalInput = document.getElementById("grade-scale-total-input");
  const subjectBadge = document.getElementById("grade-scale-subject-badge");
  const modalSub = document.getElementById("grade-scale-modal-sub");

  const total = Math.max(1, Number(totalMarks) || 80);
  if (totalInput) totalInput.value = total;
  if (subjectBadge) subjectBadge.textContent = subjectName || "General Subject";
  if (modalSub) modalSub.textContent = `Subject: ${subjectName || "All"} · Dynamic scale computed for ${total} total marks.`;

  renderGradeScaleTable(total);
  updateTestMarkResult();

  modal.classList.add("active");
}

function renderGradeScaleTable(totalMarks) {
  const tbody = document.getElementById("grade-scale-table-body");
  if (!tbody) return;

  const total = Math.max(1, Number(totalMarks) || 80);
  const scale = generateGradeScale(total);

  tbody.innerHTML = scale.map((band) => {
    const isPassBadge = band.isPass
      ? `<span class="badge badge-success" style="font-size:11px; padding:2px 8px; font-weight:700;">PASS</span>`
      : `<span class="badge badge-danger" style="font-size:11px; padding:2px 8px; font-weight:700;">FAIL</span>`;

    return `
      <tr style="border-bottom:1px solid var(--c-border); transition:background 0.15s ease;">
        <td>
          <span class="badge" style="background:${band.colorHex}18; color:${band.colorHex}; border:1px solid ${band.colorHex}44; font-weight:800; font-size:13px; padding:3px 10px;">
            ${band.grade}
          </span>
        </td>
        <td style="text-align:right; font-weight:700; font-size:var(--fs-sm); color:var(--c-dark);">
          ${band.markRangeFormatted}
        </td>
        <td style="text-align:right; font-size:var(--fs-xs); color:var(--c-slate-600); font-family:monospace; font-weight:600;">
          ${band.pctRangeFormatted}
        </td>
        <td style="text-align:center; font-weight:700; color:var(--c-slate-700);">
          ${band.gradePoint}
        </td>
        <td>
          <span style="font-size:var(--fs-xs); font-weight:600; color:var(--c-slate-700);">${band.label}</span>
        </td>
        <td style="text-align:center;">
          ${isPassBadge}
        </td>
      </tr>
    `;
  }).join("");
}

function updateTestMarkResult() {
  const totalInput = document.getElementById("grade-scale-total-input");
  const markInput = document.getElementById("test-obtained-mark-input");
  const resultPill = document.getElementById("test-mark-result-pill");
  if (!totalInput || !markInput || !resultPill) return;

  const total = Math.max(1, Number(totalInput.value) || 80);
  const val = markInput.value.trim();

  if (val === "") {
    resultPill.innerHTML = `<span style="color:var(--c-slate-400);">Enter a mark to calculate</span>`;
    return;
  }

  const res = calculateGrade(val, total);
  if (res.status === "Error") {
    resultPill.innerHTML = `<span class="badge badge-danger" style="font-size:11px; font-weight:600;">⚠️ ${res.error}</span>`;
    return;
  }

  resultPill.innerHTML = `
    <span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; font-size:12px;">Grade ${res.grade}</span>
    <span style="font-weight:700; color:var(--c-dark); font-size:13px;">${res.percentageFormatted}</span>
    <span style="color:var(--c-slate-500); font-size:12px;">(GP: ${res.gradePoint} · ${res.label})</span>
    <span style="font-weight:700; color:${res.passed ? "var(--c-success)" : "var(--c-danger)"}; font-size:11px; padding:2px 6px; border-radius:4px; background:${res.passed ? "rgba(15,161,93,0.1)" : "rgba(239,68,68,0.1)"};">
      ${res.passed ? "✓ PASS" : "✗ FAIL"}
    </span>
  `;
}

