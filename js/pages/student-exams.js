// ==========================================================================
// STUDENT EXAMS & SCORECARDS PAGE
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { getSubjectsForClass, getStudentEffectiveSubjects } from "../services/subject-service.js";
import {
  listExams,
  getExamMarksForStudent,
  upsertExamMark,
  calcGrade
} from "../services/exam-service.js";
import { calculateGrade } from "../services/grading-service.js";
import { formatLogDate, format12Hour, getISTTodayIso } from "../utils/date-time.js";
import { getStudent } from "../services/student-service.js";
// Fix #10/#11: import shared helpers instead of duplicating them
import { escapeHtml, getExamTypeBadge } from "../utils/exam-ui.js";

let student;
let classExams = [];
let studentMarks = [];
let trendChartInstance = null;

(async function init() {
  try {
    const authStudent = await requireAuth("student", "student-login.html");
    
    // Fetch latest fresh student profile from database
    const dbStudent = await getStudent(authStudent.id);
    student = dbStudent || authStudent;

    renderSidebar("student", "exams", {
      name: student.name,
      sub: `Class ${student.class || "-"} · ${student.branch || ""}`
    });

    document.getElementById("student-class-label").textContent =
      `Class ${student.class || "—"} · ${student.branch || "MAN"} Branch · ${student.name}`;

    await refreshData();
    wireEvents();
  } catch (err) {
    console.error("Student exams init error:", err);
    toast.error("Failed to load your exam data.");
  } finally {
    document.getElementById("page-loader")?.classList.add("done");
  }
})();

async function refreshData() {
  // Re-fetch latest fresh student profile from database
  if (student?.id) {
    const freshStudent = await getStudent(student.id);
    if (freshStudent) student = freshStudent;
  }

  const studentClass = String(student.class || "").trim();
  const [examsData, marksData] = await Promise.all([
    listExams({ class: studentClass }),
    getExamMarksForStudent(student.id)
  ]);

  classExams = examsData;
  studentMarks = marksData;

  updateStudentStats();
  renderResultsTable();
  renderUpcomingTable();
  renderTrendChart();
}

// Removed: escapeHtml is now imported from ../utils/exam-ui.js
// Removed: getExamTypeBadge is now imported from ../utils/exam-ui.js


function updateStudentStats() {
  const gradedMarks = studentMarks.filter(
    (m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined
  );

  document.getElementById("stat-tests-taken").textContent = gradedMarks.length;

  if (gradedMarks.length === 0) {
    document.getElementById("stat-avg-pct").textContent = "—";
    document.getElementById("stat-overall-grade").textContent = "—";
    document.getElementById("stat-tests-passed").textContent = "0";
    return;
  }

  const examMap = Object.fromEntries(classExams.map((e) => [e.id, e]));

  let totalPct = 0;
  let passedCount = 0;

  gradedMarks.forEach((m) => {
    const exam = examMap[m.examId];
    const max = Number(m.maxMarks) || (exam ? Number(exam.maxMarks) : 100);
    const pass = exam ? Number(exam.passingMarks) : 35;
    const score = Number(m.marksObtained);

    const pct = (score / max) * 100;
    totalPct += pct;

    if (score >= pass) passedCount++;
  });

  const avgPct = (totalPct / gradedMarks.length).toFixed(1);
  const overallGrade = calcGrade(avgPct);

  document.getElementById("stat-avg-pct").textContent = `${avgPct}%`;
  document.getElementById("stat-overall-grade").textContent = `${overallGrade.grade} (${overallGrade.label})`;
  document.getElementById("stat-tests-passed").textContent = `${passedCount} / ${gradedMarks.length}`;
}

function renderResultsTable() {
  const tbody = document.getElementById("student-results-body");
  if (!studentMarks.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h4>No exam marks recorded yet</h4>Click "Enter My Exam Marks" above to submit your scores.</div></td></tr>`;
    return;
  }

  const examMap = Object.fromEntries(classExams.map((e) => [e.id, e]));

  // Sort marks by exam date descending
  const sorted = [...studentMarks].sort((a, b) => {
    const da = examMap[a.examId]?.examDate || a.createdAt || "";
    const db = examMap[b.examId]?.examDate || b.createdAt || "";
    return db.localeCompare(da);
  });

  tbody.innerHTML = sorted
    .map((m) => {
      const exam = examMap[m.examId];
      const examTitle = exam ? exam.title : "School Exam";
      const examType = exam ? exam.examType : "Assessment";
      const examDate = exam ? formatLogDate(exam.examDate) : formatLogDate(m.createdAt);
      const subject = m.subject || (exam ? exam.subject : "General");
      const maxMarks = m.maxMarks || (exam ? exam.maxMarks : 100);
      const passingMarks = exam ? Number(exam.passingMarks) : 35;

      if (m.isAbsent) {
        return `
        <tr>
          <td>
            <div style="font-weight:700; color:var(--c-dark);">${escapeHtml(examTitle)}</div>
            <div style="margin-top:4px;">${getExamTypeBadge(examType)}</div>
          </td>
          <td><strong>${escapeHtml(subject)}</strong></td>
          <td>${examDate}</td>
          <td>—</td>
          <td>—</td>
          <td><span class="badge badge-warning" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5;">Absent</span></td>
          <td><span style="color:var(--c-danger); font-weight:700; font-size:11px;">ABSENT</span></td>
          <td style="text-align:right;">
            <button class="btn btn-ghost btn-sm" data-edit-mark="${m.examId}" data-subject="${escapeHtml(subject)}" style="padding:4px 8px;">Edit</button>
          </td>
        </tr>`;
      }

      const score = Number(m.marksObtained);
      const res = calculateGrade(score, Number(maxMarks), { passingMarks });

      return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--c-dark);">${escapeHtml(examTitle)}</div>
          <div style="margin-top:4px;">${getExamTypeBadge(examType)}</div>
        </td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; font-size:var(--fs-xs); color:var(--c-slate-700); background:var(--surface-1); padding:3px 8px; border-radius:var(--r-sm); border:1px solid var(--c-border);">
            ${escapeHtml(subject)}
          </span>
        </td>
        <td>${examDate}</td>
        <td><strong>${score}</strong> / ${maxMarks}</td>
        <td><strong>${res.percentageFormatted}</strong></td>
        <td><span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800;">${res.grade}</span></td>
        <td>
          ${res.passed
            ? '<span class="badge badge-success" style="font-size:11px;">Passed ✓</span>'
            : '<span class="badge badge-danger" style="font-size:11px;">Needs Focus</span>'}
        </td>
        <td style="text-align:right;">
          <button class="btn btn-ghost btn-sm" data-edit-mark="${m.examId}" data-subject="${escapeHtml(subject)}" style="padding:4px 8px;">Edit</button>
        </td>
      </tr>`;
    })
    .join("");
}

// Fix #3: show only exams scheduled on or after today, not all ungraded exams.
// Previously, any exam without a student mark appeared as "upcoming" even if it
// happened months ago.
function renderUpcomingTable() {
  const tbody = document.getElementById("upcoming-exams-body");
  const gradedExamIds = new Set(studentMarks.map((m) => m.examId));
  const today = getISTTodayIso(); // e.g. "2026-09-03"

  const upcoming = classExams.filter(
    (e) => !gradedExamIds.has(e.id) && (e.examDate || "") >= today
  );

  if (!upcoming.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h4>All caught up!</h4>No upcoming exams scheduled for Class ${escapeHtml(student.class)}.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = upcoming
    .map((e) => {
      const formattedDate = formatLogDate(e.examDate);
      const timeDisplay = e.startTime ? ` · ${format12Hour(e.startTime)}` : "";

      return `
      <tr>
        <td><div style="font-weight:700;">${escapeHtml(e.title)}</div></td>
        <td>${getExamTypeBadge(e.examType)}</td>
        <td><strong>${escapeHtml(e.subject)}</strong></td>
        <td>${formattedDate}${timeDisplay}</td>
        <td><strong>${e.maxMarks}</strong> (Pass: ${e.passingMarks})</td>
        <td style="text-align:right;">
          <button class="btn btn-primary btn-sm" data-enter-exam="${e.id}" style="padding:6px 12px;">
            ✍️ Enter Marks
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderTrendChart() {
  const ctx = document.getElementById("student-trend-chart")?.getContext("2d");
  if (!ctx) return;

  const examMap = Object.fromEntries(classExams.map((e) => [e.id, e]));

  // Get chronological graded tests
  const graded = studentMarks
    .filter((m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined)
    .map((m) => {
      const exam = examMap[m.examId];
      const date = exam?.examDate || m.createdAt || "";
      const max = Number(m.maxMarks) || (exam ? Number(exam.maxMarks) : 100);
      const pct = ((Number(m.marksObtained) / max) * 100);
      const label = exam ? `${exam.title} (${m.subject || exam.subject})` : (m.subject || "Exam");
      return { date, pct, label, marksObtained: m.marksObtained, maxMarks: max };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (trendChartInstance) trendChartInstance.destroy();

  if (!graded.length) {
    document.getElementById("chart-summary-badge").textContent = "No data yet";
    return;
  }

  document.getElementById("chart-summary-badge").textContent = `${graded.length} Test(s) Tracked`;

  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: graded.map((g) => g.label),
      datasets: [
        {
          label: "Score Percentage (%)",
          data: graded.map((g) => g.pct.toFixed(1)),
          borderColor: "#0FA15D",
          backgroundColor: "rgba(15, 161, 93, 0.12)",
          fill: true,
          tension: 0.35,
          pointBackgroundColor: "#0FA15D",
          pointBorderColor: "#fff",
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            callback: (val) => `${val}%`
          }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Score: ${ctx.parsed.y}% (${graded[ctx.dataIndex].marksObtained}/${graded[ctx.dataIndex].maxMarks})`
          }
        }
      }
    }
  });
}

function wireEvents() {
  // Tabs
  const tabResults = document.getElementById("tab-btn-results");
  const tabUpcoming = document.getElementById("tab-btn-upcoming");
  const contentResults = document.getElementById("tab-content-results");
  const contentUpcoming = document.getElementById("tab-content-upcoming");

  tabResults?.addEventListener("click", () => {
    tabResults.classList.add("active");
    tabUpcoming.classList.remove("active");
    contentResults.style.display = "block";
    contentUpcoming.style.display = "none";
  });

  tabUpcoming?.addEventListener("click", () => {
    tabUpcoming.classList.add("active");
    tabResults.classList.remove("active");
    contentResults.style.display = "none";
    contentUpcoming.style.display = "block";
  });

  // Modal controls
  const modal = document.getElementById("student-mark-modal");
  const openModalBtn = document.getElementById("open-enter-marks-modal");
  const closeModalBtn = document.getElementById("close-student-mark-modal");
  const cancelModalBtn = document.getElementById("cancel-student-mark-modal");

  const openModal = (preselectedExamTitle = "") => {
    const subEl = document.getElementById("sm-modal-sub");
    if (subEl) {
      subEl.textContent = `Class ${student.class || "—"} · ${student.name || "Student"} · Sync marks to database`;
    }
    populateExamDropdown(preselectedExamTitle);
    if (preselectedExamTitle) {
      onExamSelectionChange(preselectedExamTitle);
    } else {
      const select = document.getElementById("sm-exam-select");
      if (select && select.value) onExamSelectionChange(select.value);
    }
    modal.classList.add("active");
  };

  const closeModal = () => modal.classList.remove("active");

  openModalBtn?.addEventListener("click", () => openModal());
  closeModalBtn?.addEventListener("click", closeModal);
  cancelModalBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // Table click delegation for Edit / Enter Marks
  document.getElementById("student-results-body")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-mark]");
    if (editBtn) {
      const examId = editBtn.dataset.editMark;
      const exam = classExams.find((x) => x.id === examId);
      openModal(exam ? exam.title : "");
    }
  });

  document.getElementById("upcoming-exams-body")?.addEventListener("click", (e) => {
    const enterBtn = e.target.closest("[data-enter-exam]");
    if (enterBtn) {
      const examId = enterBtn.dataset.enterExam;
      const exam = classExams.find((x) => x.id === examId);
      openModal(exam ? exam.title : "");
    }
  });

  // Exam select change in modal
  document.getElementById("sm-exam-select")?.addEventListener("change", (e) => {
    onExamSelectionChange(e.target.value);
  });

  // Form submission (Saves all entered subject marks in one click)
  document.getElementById("student-mark-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("save-student-mark-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving & Synchronizing...";

    const rows = document.querySelectorAll("#sm-subjects-body tr.sm-subj-row");
    const marksToSave = [];

    rows.forEach((r) => {
      const examId = r.dataset.examId;
      const subject = r.dataset.subject;
      const maxMarks = Number(r.dataset.max) || 100;
      const marksInput = r.querySelector(".sm-input-marks");
      const val = marksInput ? marksInput.value.trim() : "";

      if (val !== "") {
        marksToSave.push({
          examId,
          subject,
          marksObtained: Number(val),
          maxMarks
        });
      }
    });

    if (!marksToSave.length) {
      toast.error("Please enter obtained marks for at least one subject.");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Synchronize Marks";
      return;
    }

    try {
      await Promise.all(
        marksToSave.map((m) =>
          upsertExamMark(m.examId, student.id, {
            subject: m.subject,
            marksObtained: m.marksObtained,
            maxMarks: m.maxMarks,
            enteredBy: "student"
          })
        )
      );

      toast.success(`Successfully saved marks for ${marksToSave.length} subject(s)!`);
      closeModal();
      document.getElementById("student-mark-form").reset();
      await refreshData();
    } catch (err) {
      console.error("Save student marks error:", err);
      toast.error(err.message || "Failed to save marks.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Synchronize Marks";
    }
  });
}

function populateExamDropdown(preselectedTitle = "") {
  const select = document.getElementById("sm-exam-select");
  if (!select) return;

  // Group exams by title
  const titleGroups = {};
  classExams.forEach((e) => {
    const key = e.title || "Exam";
    if (!titleGroups[key]) {
      titleGroups[key] = { title: key, examType: e.examType, exams: [] };
    }
    titleGroups[key].exams.push(e);
  });

  const groupKeys = Object.keys(titleGroups);
  if (!groupKeys.length) {
    select.innerHTML = '<option value="">No scheduled exams found for your class</option>';
    return;
  }

  let opts = '<option value="">Choose a scheduled exam...</option>';
  groupKeys.forEach((key) => {
    const grp = titleGroups[key];
    const isSelected = (key === preselectedTitle || groupKeys.length === 1) ? "selected" : "";
    opts += `<option value="${escapeHtml(key)}" ${isSelected}>${escapeHtml(grp.title)} (${escapeHtml(grp.examType)} · ${grp.exams.length} subject${grp.exams.length > 1 ? 's' : ''})</option>`;
  });
  select.innerHTML = opts;
}

function onExamSelectionChange(selectedTitle) {
  const section = document.getElementById("sm-subjects-section");
  const tbody = document.getElementById("sm-subjects-body");
  if (!section || !tbody) return;

  if (!selectedTitle) {
    section.style.display = "none";
    tbody.innerHTML = "";
    return;
  }

  const matchingExams = classExams.filter((e) => (e.title || "") === selectedTitle);
  if (!matchingExams.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  // Build subject list using student's personalized enrolled subjects
  let subjectsConfig = [];
  const studentEnrolledSubjects = new Set(getStudentEffectiveSubjects(student));

  const isAllSubjects = matchingExams.some((e) => e.subject === "All Subjects");
  if (isAllSubjects) {
    const baseExam = matchingExams.find((e) => e.subject === "All Subjects") || matchingExams[0];
    const enrolledList = getStudentEffectiveSubjects(student);
    subjectsConfig = enrolledList.map((subj) => ({
      examId: baseExam.id,
      subject: subj,
      maxMarks: baseExam.maxMarks || 100,
      passingMarks: baseExam.passingMarks || 35
    }));
  } else {
    // Show all scheduled subjects for this class exam, ensuring no subject is hidden
    const classAllSubjects = new Set(getSubjectsForClass(student.class));
    subjectsConfig = matchingExams
      .filter((e) => studentEnrolledSubjects.has(e.subject) || classAllSubjects.has(e.subject) || e.subject === "All Subjects")
      .map((e) => ({
        examId: e.id,
        subject: e.subject,
        maxMarks: e.maxMarks || 100,
        passingMarks: e.passingMarks || 35
      }));
  }

  // Pre-fill existing marks if any
  const studentMarksMap = {};
  studentMarks.forEach((m) => {
    const key = `${m.examId}::${m.subject}`;
    studentMarksMap[key] = m;
  });

  tbody.innerHTML = subjectsConfig.map((sc) => {
    const markKey = `${sc.examId}::${sc.subject}`;
    const existing = studentMarksMap[markKey];
    const existingVal = existing && !existing.isAbsent && existing.marksObtained !== null ? existing.marksObtained : "";

    let initialBadge = '<span class="badge badge-ghost">—</span>';
    if (existingVal !== "") {
      const res = calculateGrade(Number(existingVal), Number(sc.maxMarks), { passingMarks: Number(sc.passingMarks) });
      const passLabel = res.passed
        ? '<span style="color:var(--c-success); font-size:11px; font-weight:700;">PASS</span>'
        : '<span style="color:var(--c-danger); font-size:11px; font-weight:700;">FAIL</span>';
      initialBadge = `<span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; margin-right:4px;">${res.grade} (${res.percentageFormatted})</span> ${passLabel}`;
    }

    return `
      <tr class="sm-subj-row" data-exam-id="${sc.examId}" data-subject="${escapeHtml(sc.subject)}" data-max="${sc.maxMarks}" data-pass="${sc.passingMarks}">
        <td>
          <div style="font-weight:700; font-size:var(--fs-xs); color:var(--c-dark);">${escapeHtml(sc.subject)}</div>
        </td>
        <td>
          <span class="badge badge-neutral" style="font-weight:700;">/ ${sc.maxMarks}</span>
        </td>
        <td>
          <input type="number" step="0.5" min="0" max="${sc.maxMarks}" class="sm-input-marks" placeholder="Obtained" value="${existingVal}" style="width:105px; padding:6px 8px; font-size:var(--fs-xs);">
        </td>
        <td class="sm-live-grade-cell">
          ${initialBadge}
        </td>
      </tr>
    `;
  }).join("");

  updateModalTotalSummary();

  // Wire input listeners for live grade updates
  tbody.querySelectorAll(".sm-subj-row").forEach((row) => {
    const input = row.querySelector(".sm-input-marks");
    const gradeCell = row.querySelector(".sm-live-grade-cell");
    const maxMarks = Number(row.dataset.max) || 100;
    const passMarks = Number(row.dataset.pass) || 35;

    input?.addEventListener("input", () => {
      const val = input.value.trim();
      if (val === "" || isNaN(Number(val))) {
        input.style.borderColor = "";
        gradeCell.innerHTML = '<span class="badge badge-ghost">—</span>';
      } else {
        const res = calculateGrade(val, maxMarks, { passingMarks: passMarks });
        if (res.status === "Error") {
          input.style.borderColor = "var(--c-danger)";
          gradeCell.innerHTML = `<span class="badge badge-danger" title="${escapeHtml(res.error || '')}">⚠️ ${res.error?.includes("exceed") ? "Exceeds Max" : "Invalid"}</span>`;
        } else {
          input.style.borderColor = "";
          const passLabel = res.passed
            ? '<span style="color:var(--c-success); font-size:11px; font-weight:700;">PASS</span>'
            : '<span style="color:var(--c-danger); font-size:11px; font-weight:700;">FAIL</span>';
          gradeCell.innerHTML = `<span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; margin-right:4px;">${res.grade} (${res.percentageFormatted})</span> ${passLabel}`;
        }
      }
      updateModalTotalSummary();
    });
  });
}

function updateModalTotalSummary() {
  const rows = document.querySelectorAll("#sm-subjects-body tr.sm-subj-row");
  const summaryEl = document.getElementById("sm-total-summary");
  if (!summaryEl) return;

  let totalObtained = 0;
  let totalMax = 0;
  let count = 0;

  rows.forEach((r) => {
    const val = r.querySelector(".sm-input-marks")?.value.trim();
    const max = Number(r.dataset.max) || 100;
    if (val !== "" && !isNaN(Number(val))) {
      totalObtained += Number(val);
      totalMax += max;
      count++;
    }
  });

  if (count === 0) {
    summaryEl.textContent = "Total: —";
  } else {
    const res = calculateGrade(totalObtained, totalMax);
    summaryEl.innerHTML = `Total: <strong>${totalObtained} / ${totalMax}</strong> (${res.percentageFormatted} · <span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800;">${res.grade}</span>)`;
  }
}
