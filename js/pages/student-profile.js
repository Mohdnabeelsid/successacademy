import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { renderCalendar } from "../components/calendar.js";
import { getStudentLogs, loggedDateSet, LOG_STATUS } from "../services/studylog-service.js";
import { getStudent, updateStudent } from "../services/student-service.js";
import { getSubjectsForClass, getStudentEffectiveSubjects } from "../services/subject-service.js";
import { toast } from "../components/toast.js";
import {
  renderNewAdmissionFrame,
  downloadCanvasAsPng,
  shareCanvasImage,
  getStudentAdmissionYear,
  formatStudentClass,
  formatStudentBranch
} from "../services/frame-service.js";

(async function init() {
  const authStudent = await requireAuth("student", "student-login.html");
  
  // Fetch fresh student profile from database
  const dbStudent = await getStudent(authStudent.id);
  const student = dbStudent || authStudent;

  renderSidebar("student", "profile", { name: student.name, sub: `Class ${student.class || "-"}` });

  const initials = (student.name || "S")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  document.getElementById("profile-avatar").textContent = initials;
  document.getElementById("profile-name").textContent = student.name || "—";
  document.getElementById("profile-meta").textContent =
    `Admission No: ${student.admissionNumber || "—"} · Class ${student.class || "—"} · ${student.branch || "—"} Branch`;

  document.getElementById("enrolled-class-name").textContent = `Class ${student.class || "—"}`;

  // Render enrolled subjects checkboxes
  const classAllSubjects = getSubjectsForClass(student.class);
  const activeEnrolledSubjects = new Set(getStudentEffectiveSubjects(student));

  const subjectsGrid = document.getElementById("subjects-selector-grid");
  if (subjectsGrid) {
    subjectsGrid.innerHTML = classAllSubjects
      .map((subj) => {
        const isChecked = activeEnrolledSubjects.has(subj) ? "checked" : "";
        return `
          <label style="display:flex; align-items:center; gap:8px; background:#fff; padding:8px 12px; border:1px solid var(--c-border); border-radius:var(--r-md); cursor:pointer; font-size:var(--fs-xs); font-weight:600; color:var(--c-dark);">
            <input type="checkbox" class="student-subj-checkbox" value="${subj}" ${isChecked} style="width:16px; height:16px; cursor:pointer;">
            <span>${subj}</span>
          </label>
        `;
      })
      .join("");
  }

  // Save subjects button wiring
  const saveSubjectsBtn = document.getElementById("save-subjects-btn");
  saveSubjectsBtn?.addEventListener("click", async () => {
    const checkboxes = document.querySelectorAll(".student-subj-checkbox");
    const selected = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    if (selected.length === 0) {
      toast.error("Please select at least one subject.");
      return;
    }

    saveSubjectsBtn.disabled = true;
    saveSubjectsBtn.textContent = "Saving...";

    try {
      await updateStudent(student.id, { subjects: selected });
      student.subjects = selected;
      try {
        const cached = sessionStorage.getItem("success_user_student");
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.subjects = selected;
          sessionStorage.setItem("success_user_student", JSON.stringify(parsed));
        }
      } catch (_) {}
      toast.success("Your enrolled subjects have been updated and synchronized!");
    } catch (err) {
      console.error("Save student subjects error:", err);
      toast.error("Failed to save subjects: " + (err.message || "Unknown error"));
    } finally {
      saveSubjectsBtn.disabled = false;
      saveSubjectsBtn.textContent = "Save My Subjects";
    }
  });

  const logs = await getStudentLogs(student.id, 500);

  renderCalendar(document.getElementById("calendar"), loggedDateSet(logs));

  // Subject-wise minutes (approved only)
  const bySubject = {};
  logs.filter((l) => l.status === LOG_STATUS.APPROVED).forEach((l) => {
    bySubject[l.subject] = (bySubject[l.subject] || 0) + Number(l.durationMinutes || 0);
  });
  const maxMin = Math.max(1, ...Object.values(bySubject));
  const barsEl = document.getElementById("subject-bars");
  const entries = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  barsEl.innerHTML = entries.length
    ? entries
        .map(
          ([subj, min]) => `
      <div class="bar-row">
        <div class="lbl">${subj}</div>
        <div class="progress-track" style="flex:1;">
          <div class="progress-fill" style="width:${(min / maxMin) * 100}%;"></div>
        </div>
        <div class="val">${(min / 60).toFixed(1)}h</div>
      </div>`
        )
        .join("")
    : `<div class="empty-state">No approved logs yet</div>`;

  // History table
  const historyBody = document.getElementById("history-body");
  historyBody.innerHTML = logs.length
    ? logs
        .map((l) => {
          const badge =
            l.status === LOG_STATUS.APPROVED
              ? '<span class="badge badge-success">Approved</span>'
              : l.status === LOG_STATUS.CORRECTION
              ? '<span class="badge badge-danger">Needs Correction</span>'
              : '<span class="badge badge-warning">Pending</span>';
          return `<tr><td>${l.date}</td><td>${l.day || ""}</td><td>${l.subject}</td><td>${l.chapter || "—"}</td><td>${l.durationMinutes} min</td><td>${badge}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty-state">No study logs yet</div></td></tr>`;

  // Initialize Admission Frame Studio
  initAdmissionFrameStudio(student);

  document.getElementById("page-loader").classList.add("done");
})();

// ==========================================================================
// ADMISSION FRAME STUDIO CONTROLLER
// ==========================================================================
function initAdmissionFrameStudio(student) {
  const modal = document.getElementById("frame-generator-modal");
  if (!modal) return;

  const canvas = document.getElementById("frame-canvas");
  const container = document.getElementById("canvas-container");
  const fileInput = document.getElementById("frame-file-input");
  const dropzone = document.getElementById("upload-dropzone");
  const uploadTitle = document.getElementById("upload-box-title");
  const controlsBox = document.getElementById("photo-controls-box");
  const dragHint = document.getElementById("frame-drag-hint");
  const zoomSlider = document.getElementById("frame-zoom-slider");
  const zoomLabel = document.getElementById("zoom-level-label");
  const generateBox = document.getElementById("generate-action-box");
  const successPanel = document.getElementById("frame-success-panel");

  const frameStorageKey = `success_frame_${student.id}`;
  const photoStorageKey = `success_photo_${student.id}`;

  let uploadedImg = null;
  let transform = { zoom: 1, panX: 0, panY: 0, rotation: 0 };
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialPanX = 0;
  let initialPanY = 0;

  // Pre-load official brand logo
  const logoImg = new Image();
  logoImg.src = "../assets/logo.png";
  logoImg.onload = () => {
    if (modal.classList.contains("active")) {
      updateCanvas();
    }
  };

  // Check existing generated frame status
  const savedFrameData = localStorage.getItem(frameStorageKey);
  const savedPhotoData = localStorage.getItem(photoStorageKey);
  const savedStatusEl = document.getElementById("frame-saved-status");
  const viewSavedBtn = document.getElementById("view-saved-frame-btn");
  const openModalBtn = document.getElementById("open-frame-modal-btn");

  if (savedFrameData) {
    if (savedStatusEl) savedStatusEl.style.display = "block";
    if (viewSavedBtn) viewSavedBtn.style.display = "inline-flex";
    if (openModalBtn) openModalBtn.textContent = "✨ Edit / Regenerate Frame";
  }

  // Restore saved student photo if previously stored
  if (savedPhotoData) {
    const img = new Image();
    img.onload = () => {
      uploadedImg = img;
      if (controlsBox) controlsBox.style.display = "block";
      if (dragHint) dragHint.style.display = "block";
      if (uploadTitle) uploadTitle.textContent = "Change Photograph";
      if (modal.classList.contains("active")) updateCanvas();
    };
    img.src = savedPhotoData;
  }

  function updateCanvas() {
    if (!canvas) return;
    renderNewAdmissionFrame(canvas, {
      student,
      photoImg: uploadedImg,
      transform,
      logoImg
    });
  }

  function openStudio() {
    // Populate read-only student details in modal
    document.getElementById("frame-student-name").textContent = student.name || "Student";
    document.getElementById("frame-student-class-branch").textContent =
      `${formatStudentClass(student.class)} • ${formatStudentBranch(student.branch)}`;
    document.getElementById("frame-student-year").textContent = getStudentAdmissionYear(student);

    modal.classList.add("active");
    updateCanvas();
  }

  function closeStudio() {
    modal.classList.remove("active");
  }

  // Open & Close Triggers
  document.getElementById("open-frame-modal-btn")?.addEventListener("click", openStudio);
  document.getElementById("view-saved-frame-btn")?.addEventListener("click", openStudio);
  document.getElementById("close-frame-modal")?.addEventListener("click", closeStudio);
  document.getElementById("cancel-frame-modal-btn")?.addEventListener("click", closeStudio);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeStudio();
  });

  // Photo Upload Trigger & Handling
  dropzone?.addEventListener("click", () => fileInput?.click());

  // Drag & drop file onto dropzone
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#0FA15D";
      dropzone.style.background = "rgba(15, 161, 93, 0.12)";
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "";
      dropzone.style.background = "";
    });
  });

  dropzone?.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt?.files;
    if (files && files.length > 0) {
      handlePhotoFile(files[0]);
    }
  });

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoFile(file);
  });

  function handlePhotoFile(file) {
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast.error("We couldn't process that photo. Please select a JPG, PNG, or WebP image.");
      return;
    }

    // Validate file size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image file is too large. Please choose a photo under 15MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      const img = new Image();
      img.onload = () => {
        uploadedImg = img;
        transform = { zoom: 1, panX: 0, panY: 0, rotation: 0 };
        if (zoomSlider) zoomSlider.value = "1.0";
        if (zoomLabel) zoomLabel.textContent = "1.0×";

        if (controlsBox) controlsBox.style.display = "block";
        if (dragHint) dragHint.style.display = "block";
        if (uploadTitle) uploadTitle.textContent = "Change Photograph";

        // Reset to generation mode if previously generated
        if (generateBox) generateBox.style.display = "block";
        if (successPanel) successPanel.style.display = "none";

        updateCanvas();
        toast.info("Photo loaded! Drag to reposition or use zoom controls.");

        // Cache photo for future sessions (try/catch in case of storage quota)
        try {
          localStorage.setItem(photoStorageKey, dataUrl);
        } catch {
          // Quota exceeded: ignore caching
        }
      };
      img.onerror = () => {
        toast.error("We couldn't process that photo. Please try another image.");
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      toast.error("We couldn't process that photo. Please try another image.");
    };
    reader.readAsDataURL(file);
  }

  // Interactive Reposition (Mouse Dragging)
  container?.addEventListener("mousedown", (e) => {
    if (!uploadedImg) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialPanX = transform.panX;
    initialPanY = transform.panY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const clientW = container.clientWidth || 440;
    const scaleFactor = 1080 / clientW;
    const dx = (e.clientX - dragStartX) * scaleFactor;
    const dy = (e.clientY - dragStartY) * scaleFactor;

    transform.panX = initialPanX + dx;
    transform.panY = initialPanY + dy;
    updateCanvas();
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // Interactive Reposition (Touch Dragging on Mobile)
  container?.addEventListener("touchstart", (e) => {
    if (!uploadedImg || e.touches.length !== 1) return;
    isDragging = true;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    initialPanX = transform.panX;
    initialPanY = transform.panY;
  }, { passive: false });

  container?.addEventListener("touchmove", (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault(); // Prevent page scrolling while dragging photo
    const clientW = container.clientWidth || 440;
    const scaleFactor = 1080 / clientW;
    const dx = (e.touches[0].clientX - dragStartX) * scaleFactor;
    const dy = (e.touches[0].clientY - dragStartY) * scaleFactor;

    transform.panX = initialPanX + dx;
    transform.panY = initialPanY + dy;
    updateCanvas();
  }, { passive: false });

  container?.addEventListener("touchend", () => {
    isDragging = false;
  });

  // Zoom Slider Controls
  zoomSlider?.addEventListener("input", () => {
    const val = Number(zoomSlider.value) || 1;
    transform.zoom = val;
    if (zoomLabel) zoomLabel.textContent = `${val.toFixed(2)}×`;
    updateCanvas();
  });

  document.getElementById("zoom-in-btn")?.addEventListener("click", () => {
    let val = Math.min(3.0, (Number(zoomSlider?.value) || 1) + 0.1);
    val = Number(val.toFixed(2));
    if (zoomSlider) zoomSlider.value = String(val);
    transform.zoom = val;
    if (zoomLabel) zoomLabel.textContent = `${val.toFixed(2)}×`;
    updateCanvas();
  });

  document.getElementById("zoom-out-btn")?.addEventListener("click", () => {
    let val = Math.max(0.5, (Number(zoomSlider?.value) || 1) - 0.1);
    val = Number(val.toFixed(2));
    if (zoomSlider) zoomSlider.value = String(val);
    transform.zoom = val;
    if (zoomLabel) zoomLabel.textContent = `${val.toFixed(2)}×`;
    updateCanvas();
  });

  // Rotate 90°
  document.getElementById("rotate-photo-btn")?.addEventListener("click", () => {
    transform.rotation = ((transform.rotation || 0) + 90) % 360;
    updateCanvas();
  });

  // Reset Position & Zoom
  document.getElementById("reset-photo-btn")?.addEventListener("click", () => {
    transform = { zoom: 1, panX: 0, panY: 0, rotation: 0 };
    if (zoomSlider) zoomSlider.value = "1.0";
    if (zoomLabel) zoomLabel.textContent = "1.0×";
    updateCanvas();
    toast.info("Photo position reset.");
  });

  // Generate Frame Button
  document.getElementById("generate-frame-btn")?.addEventListener("click", () => {
    if (!uploadedImg) {
      toast.error("Please upload your photograph first to generate your frame.");
      fileInput?.click();
      return;
    }

    updateCanvas();

    // Cache generated frame in localStorage
    try {
      const dataUrl = canvas.toDataURL("image/png", 0.95);
      localStorage.setItem(frameStorageKey, dataUrl);
    } catch {
      // Storage quota: ignore
    }

    // Switch to success state
    if (generateBox) generateBox.style.display = "none";
    if (successPanel) successPanel.style.display = "block";

    // Update hero card on profile page
    if (savedStatusEl) savedStatusEl.style.display = "block";
    if (viewSavedBtn) viewSavedBtn.style.display = "inline-flex";
    if (openModalBtn) openModalBtn.textContent = "✨ Edit / Regenerate Frame";

    toast.success("Your SUCCESS Admission Frame is ready! 🎉");
  });

  // Download Frame Button
  document.getElementById("download-frame-btn")?.addEventListener("click", async () => {
    const rawName = (student.name || "student").toLowerCase().replace(/\s+/g, "-");
    const filename = `success-academy-admission-${rawName}.png`;
    await downloadCanvasAsPng(canvas, filename);
    toast.success("Frame downloaded! Share it on WhatsApp and Instagram! 🎓");
  });

  // Share Frame Button
  document.getElementById("share-frame-btn")?.addEventListener("click", async () => {
    const res = await shareCanvasImage(canvas, student);
    if (res.shared && res.method === "native") {
      toast.success("Sharing your admission announcement!");
    } else if (res.shared && res.method === "whatsapp") {
      toast.info("Opening WhatsApp to share your announcement...");
    }
  });

  // Tweak Adjustments Button
  document.getElementById("tweak-frame-btn")?.addEventListener("click", () => {
    if (generateBox) generateBox.style.display = "block";
    if (successPanel) successPanel.style.display = "none";
  });
}

