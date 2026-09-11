// ==========================================================================
// SUCCESS ACADEMY — ADMISSION FRAME GENERATOR SERVICE
// Canvas Template Engine for high-fidelity, 1080x1080 branded admission frames.
// Architecture: Extensible template definition, dynamic profile integration,
// photo transformation (zoom, pan, rotation), and high-res export.
// ==========================================================================

export const FRAME_CONFIG = {
  width: 1080,
  height: 1080,
  colors: {
    primary: "#0FA15D",       // Emerald Green
    secondary: "#1F7A78",     // Teal
    blue: "#2E4C8C",          // Academic Blue
    dark: "#071A17",          // Deep Forest Green
    darkForestTeal: "#0E3B36",// Dark Forest Teal
    beige: "#D8C7AA",         // Warm Beige
    white: "#FFFFFF",         // Crisp White
    slate50: "#F6F8F6",
    slate100: "#E7EEEA",
    slate300: "#A9B8B2",
    slate500: "#64756F",
    slate700: "#33433F"
  },
  fonts: {
    display: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sans: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  }
};

/**
 * Calculates academic year label from student profile or current date.
 * @param {Object} student 
 * @returns {string} e.g. "2026–2027" or "2026"
 */
export function getStudentAdmissionYear(student) {
  if (student?.academicYear) return student.academicYear;
  if (student?.admissionDate) {
    const yr = new Date(student.admissionDate).getFullYear();
    if (!isNaN(yr)) return `${yr}–${yr + 1}`;
  }
  if (student?.createdAt) {
    const yr = new Date(student.createdAt).getFullYear();
    if (!isNaN(yr)) return `${yr}–${yr + 1}`;
  }
  const currentYr = new Date().getFullYear();
  return `${currentYr}–${currentYr + 1}`;
}

/**
 * Formats class display string.
 * @param {string|number} cls 
 * @returns {string} e.g. "Class 10" or "Class 11 Science"
 */
export function formatStudentClass(cls) {
  if (!cls) return "Classroom Journey";
  const str = String(cls).trim();
  if (str.toLowerCase().startsWith("class")) return str;
  return `Class ${str}`;
}

/**
 * Formats branch display string.
 * Supports the two official branches: Alappuzha (ALP) & Mannancherry (MAN).
 * @param {string} branch 
 * @returns {string}
 */
export function formatStudentBranch(branch) {
  if (!branch) return "Mannancherry Campus";
  const b = String(branch).trim().toUpperCase();
  if (b === "MAN" || b === "MANNANCHERRY") return "Mannancherry Campus";
  if (b === "ALP" || b === "ALAPPUZHA") return "Alappuzha Campus";
  return `${branch} Campus`;
}

/**
 * Helper to draw a rounded rectangle path on canvas.
 */
function roundRect(ctx, x, y, width, height, radius = 0) {
  ctx.beginPath();
  if (typeof radius === "number") {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  }
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

/**
 * Renders the Redesigned New Admission Frame onto an HTML5 canvas (1080 x 1080).
 * Rebuilt strictly around the STUDENT and the milestone of beginning a new journey.
 * 
 * Visual Hierarchy:
 * 1. STUDENT PHOTO (Hero portrait, sophisticated rounded composition)
 * 2. "I'M PART OF SUCCESS ACADEMY"
 * 3. STUDENT NAME (Prominent ExtraBold display)
 * 4. CLASS + BRANCH (e.g. CLASS 10 • MANNANCHERRY CAMPUS)
 * 5. "A NEW JOURNEY BEGINS." (Emerald accent)
 * 6. SUCCESS ACADEMY branding (Minimal elegant top mark)
 * 
 * Typography: Montserrat throughout
 * Color Palette: Emerald Green, Deep Forest Green, Teal, Warm Beige, White
 * 
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} options
 * @param {Object} options.student - Authenticated student profile object { name, class, branch }
 * @param {HTMLImageElement|null} options.photoImg - Uploaded student photo element
 * @param {Object} [options.transform] - Photo adjustments { zoom, panX, panY, rotation }
 * @param {HTMLImageElement|null} [options.logoImg] - Optional brand logo image element
 */
export function renderNewAdmissionFrame(canvas, options = {}) {
  const {
    student = {},
    photoImg = null,
    transform = { zoom: 1, panX: 0, panY: 0, rotation: 0 },
    logoImg = null
  } = options;

  const width = FRAME_CONFIG.width;
  const height = FRAME_CONFIG.height;

  // Set high-res canvas dimensions
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Helper to safely set letterSpacing
  const setLetterSpacing = (val) => {
    if ("letterSpacing" in ctx) {
      try { ctx.letterSpacing = val; } catch (_) {}
    }
  };

  // 1. BASE BACKGROUND: Pure Crisp White with generous whitespace
  ctx.fillStyle = FRAME_CONFIG.colors.white;
  ctx.fillRect(0, 0, width, height);

  // Sophisticated minimal architectural outer frame
  const margin = 36;
  const frameW = width - margin * 2;
  const frameH = height - margin * 2;

  // Thin outer boundary line
  ctx.strokeStyle = FRAME_CONFIG.colors.slate100;
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, margin, frameW, frameH);

  // Delicate corner framing accents in Warm Beige (#D8C7AA)
  const cornerLen = 28;
  ctx.strokeStyle = FRAME_CONFIG.colors.beige;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  // Top-Left
  ctx.moveTo(margin, margin + cornerLen);
  ctx.lineTo(margin, margin);
  ctx.lineTo(margin + cornerLen, margin);
  // Top-Right
  ctx.moveTo(width - margin - cornerLen, margin);
  ctx.lineTo(width - margin, margin);
  ctx.lineTo(width - margin, margin + cornerLen);
  // Bottom-Left
  ctx.moveTo(margin, height - margin - cornerLen);
  ctx.lineTo(margin, height - margin);
  ctx.lineTo(margin + cornerLen, height - margin);
  // Bottom-Right
  ctx.moveTo(width - margin - cornerLen, height - margin);
  ctx.lineTo(width - margin, height - margin);
  ctx.lineTo(width - margin, height - margin - cornerLen);
  ctx.stroke();

  // Subtle Emerald Green center top micro-bar
  ctx.fillStyle = FRAME_CONFIG.colors.primary;
  ctx.fillRect(width / 2 - 32, margin, 64, 2.5);

  // 2. TOP BRANDING (Minimal, Premium Header)
  // SUCCESS ACADEMY
  // From Classrooms to Careers.
  const headerCenterY = 82;

  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const logoW = 44;
    const logoH = 44;
    ctx.drawImage(logoImg, width / 2 - logoW / 2, headerCenterY - 22, logoW, logoH);

    ctx.fillStyle = FRAME_CONFIG.colors.dark;
    ctx.font = `700 20px ${FRAME_CONFIG.fonts.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setLetterSpacing("3px");
    ctx.fillText("SUCCESS ACADEMY", width / 2, headerCenterY + 38);

    ctx.fillStyle = FRAME_CONFIG.colors.secondary;
    ctx.font = `500 11px ${FRAME_CONFIG.fonts.sans}`;
    setLetterSpacing("2.5px");
    ctx.fillText("FROM CLASSROOMS TO CAREERS.", width / 2, headerCenterY + 58);
  } else {
    // Minimalist geometric monogram shield
    const badgeSize = 36;
    ctx.fillStyle = FRAME_CONFIG.colors.dark;
    roundRect(ctx, width / 2 - badgeSize / 2, headerCenterY - 20, badgeSize, badgeSize, 8);
    ctx.fill();

    ctx.fillStyle = FRAME_CONFIG.colors.primary;
    ctx.font = `800 19px ${FRAME_CONFIG.fonts.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setLetterSpacing("0px");
    ctx.fillText("S", width / 2, headerCenterY - 2);

    ctx.fillStyle = FRAME_CONFIG.colors.dark;
    ctx.font = `700 20px ${FRAME_CONFIG.fonts.sans}`;
    setLetterSpacing("3px");
    ctx.fillText("SUCCESS ACADEMY", width / 2, headerCenterY + 32);

    ctx.fillStyle = FRAME_CONFIG.colors.secondary;
    ctx.font = `500 11px ${FRAME_CONFIG.fonts.sans}`;
    setLetterSpacing("2.5px");
    ctx.fillText("FROM CLASSROOMS TO CAREERS.", width / 2, headerCenterY + 52);
  }

  // 3. CENTER STAGE: HERO STUDENT PORTRAIT (Large, Commanding, Editorial)
  // Large portrait composition: 520px wide × 550px high
  const photoW = 520;
  const photoH = 550;
  const photoX = (width - photoW) / 2;
  const photoY = 168;
  const photoRadius = 26;

  // Layered soft ambient drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(7, 26, 23, 0.09)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = FRAME_CONFIG.colors.white;
  roundRect(ctx, photoX, photoY, photoW, photoH, photoRadius);
  ctx.fill();
  ctx.restore();

  // Outer Warm Beige accent border (minimal, refined)
  ctx.strokeStyle = FRAME_CONFIG.colors.beige;
  ctx.lineWidth = 1.5;
  roundRect(ctx, photoX - 4, photoY - 4, photoW + 8, photoH + 8, photoRadius + 3);
  ctx.stroke();

  // Inner Emerald Green micro-accent line
  ctx.strokeStyle = `${FRAME_CONFIG.colors.primary}55`;
  ctx.lineWidth = 1;
  roundRect(ctx, photoX - 1, photoY - 1, photoW + 2, photoH + 2, photoRadius + 1);
  ctx.stroke();

  // Photo clipping viewport
  ctx.save();
  roundRect(ctx, photoX, photoY, photoW, photoH, photoRadius);
  ctx.clip();

  // Smooth editorial card background inside clip (ideal for transparent/cutout photos)
  const photoBackdropGrad = ctx.createLinearGradient(photoX, photoY, photoX, photoY + photoH);
  photoBackdropGrad.addColorStop(0, "#FFFFFF");
  photoBackdropGrad.addColorStop(1, "#F4F7F5");
  ctx.fillStyle = photoBackdropGrad;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  if (photoImg && photoImg.complete && photoImg.naturalWidth > 0) {
    const centerX = photoX + photoW / 2;
    const centerY = photoY + photoH / 2;

    ctx.translate(centerX, centerY);

    // Apply rotation
    if (transform.rotation) {
      ctx.rotate((transform.rotation * Math.PI) / 180);
    }

    // Cover scale calculation
    const imgRatio = photoImg.naturalWidth / photoImg.naturalHeight;
    const boxRatio = photoW / photoH;
    let baseW, baseH;

    if (imgRatio > boxRatio) {
      baseH = photoH;
      baseW = photoH * imgRatio;
    } else {
      baseW = photoW;
      baseH = photoW / imgRatio;
    }

    // Apply zoom
    const zoom = Math.max(0.2, Number(transform.zoom) || 1);
    const renderW = baseW * zoom;
    const renderH = baseH * zoom;

    // Apply pan
    const panX = Number(transform.panX) || 0;
    const panY = Number(transform.panY) || 0;

    ctx.drawImage(
      photoImg,
      -renderW / 2 + panX,
      -renderH / 2 + panY,
      renderW,
      renderH
    );
  } else {
    // Minimalist modern portrait placeholder
    const iconCenterX = photoX + photoW / 2;
    const iconCenterY = photoY + photoH / 2 - 20;

    ctx.fillStyle = FRAME_CONFIG.colors.slate100;
    roundRect(ctx, photoX, photoY, photoW, photoH, photoRadius);
    ctx.fill();

    // Subtle head & shoulder silhouette
    ctx.fillStyle = FRAME_CONFIG.colors.slate300;
    ctx.beginPath();
    ctx.arc(iconCenterX, iconCenterY - 15, 48, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(iconCenterX, iconCenterY + 90, 92, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = FRAME_CONFIG.colors.slate500;
    ctx.font = `600 15px ${FRAME_CONFIG.fonts.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setLetterSpacing("1px");
    ctx.fillText("Select Student Photograph", iconCenterX, iconCenterY + 125);
  }
  ctx.restore();

  // 4. LOWER CENTER SECTION: THE MILESTONE ANNOUNCEMENT
  // "I'M PART OF"
  // "SUCCESS ACADEMY"
  const textStartY = photoY + photoH + 42; // ~760

  // "I'M PART OF" — Medium / SemiBold, Emerald Green
  ctx.fillStyle = FRAME_CONFIG.colors.primary;
  ctx.font = `600 15px ${FRAME_CONFIG.fonts.sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setLetterSpacing("3.5px");
  ctx.fillText("I'M PART OF", width / 2, textStartY);

  // Subtle decorative Warm Beige flanking lines for "I'M PART OF"
  const flankY = textStartY;
  ctx.strokeStyle = FRAME_CONFIG.colors.beige;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 130, flankY);
  ctx.lineTo(width / 2 - 80, flankY);
  ctx.moveTo(width / 2 + 80, flankY);
  ctx.lineTo(width / 2 + 130, flankY);
  ctx.stroke();

  // "SUCCESS ACADEMY" — ExtraBold, Deep Forest Green
  const brandTitleY = textStartY + 32; // ~792
  ctx.fillStyle = FRAME_CONFIG.colors.dark;
  ctx.font = `800 28px ${FRAME_CONFIG.fonts.sans}`;
  setLetterSpacing("2.5px");
  ctx.fillText("SUCCESS ACADEMY", width / 2, brandTitleY);

  // Refined Warm Beige divider accent bar with center dot
  const dividerY = brandTitleY + 22; // ~814
  ctx.strokeStyle = FRAME_CONFIG.colors.beige;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 28, dividerY);
  ctx.lineTo(width / 2 + 28, dividerY);
  ctx.stroke();

  ctx.fillStyle = FRAME_CONFIG.colors.primary;
  ctx.beginPath();
  ctx.arc(width / 2, dividerY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // 5. STUDENT NAME (ExtraBold, Visually Prominent Hero Typography)
  const studentNameRaw = (student?.name || "STUDENT NAME").trim();
  const studentName = studentNameRaw.toUpperCase();

  let nameFontSize = 40;
  ctx.font = `800 ${nameFontSize}px ${FRAME_CONFIG.fonts.sans}`;
  setLetterSpacing("2px");
  // Scale down gracefully for very long names
  while (ctx.measureText(studentName).width > width - 200 && nameFontSize > 22) {
    nameFontSize -= 2;
    ctx.font = `800 ${nameFontSize}px ${FRAME_CONFIG.fonts.sans}`;
  }

  const nameY = dividerY + 44; // ~858
  ctx.fillStyle = FRAME_CONFIG.colors.dark;
  ctx.fillText(studentName, width / 2, nameY);

  // 6. CLASS + BRANCH BADGE
  // e.g. "CLASS 10 • MANNANCHERRY CAMPUS"
  const studentClass = formatStudentClass(student?.class).toUpperCase();
  const branchName = formatStudentBranch(student?.branch).toUpperCase();
  const classBranchText = `${studentClass}   •   ${branchName}`;

  const badgeY = nameY + 42; // ~900
  ctx.save();
  ctx.font = `600 13.5px ${FRAME_CONFIG.fonts.sans}`;
  setLetterSpacing("2px");
  const metaTextWidth = ctx.measureText(classBranchText).width;
  const pillW = metaTextWidth + 40;
  const pillH = 30;
  const pillX = width / 2 - pillW / 2;

  // Airy, elegant emerald tint badge
  ctx.fillStyle = "#0FA15D10";
  roundRect(ctx, pillX, badgeY - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.strokeStyle = "#0FA15D35";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = FRAME_CONFIG.colors.secondary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(classBranchText, width / 2, badgeY);
  ctx.restore();

  // 7. BOTTOM MILESTONE MESSAGE: "A NEW JOURNEY BEGINS."
  // Generous whitespace separates the badge from the bottom line
  const journeyY = 988;
  ctx.fillStyle = FRAME_CONFIG.colors.primary;
  ctx.font = `700 14.5px ${FRAME_CONFIG.fonts.sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setLetterSpacing("3.5px");
  ctx.fillText("A NEW JOURNEY BEGINS.", width / 2, journeyY);

  // Delicate Warm Beige accent flanking lines
  ctx.strokeStyle = FRAME_CONFIG.colors.beige;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 180, journeyY);
  ctx.lineTo(width / 2 - 130, journeyY);
  ctx.moveTo(width / 2 + 130, journeyY);
  ctx.lineTo(width / 2 + 180, journeyY);
  ctx.stroke();

  // Generous whitespace to bottom: 988 to 1080 is completely clean.
}

/**
 * Converts a rendered canvas to a PNG Blob.
 * @param {HTMLCanvasElement} canvas 
 * @returns {Promise<Blob>}
 */
export function getCanvasPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to generate PNG blob from canvas."));
      },
      "image/png",
      1.0
    );
  });
}

/**
 * Triggers browser download of canvas as high-resolution PNG.
 * @param {HTMLCanvasElement} canvas 
 * @param {string} [filename]
 */
export async function downloadCanvasAsPng(canvas, filename = "success-academy-admission-frame.png") {
  const blob = await getCanvasPngBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Native Web Share API helper. Shares image file directly on mobile devices
 * with fallback to WhatsApp URL if file sharing is not supported.
 * 
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} student 
 * @returns {Promise<{ shared: boolean, method: 'native'|'whatsapp'|'download' }>}
 */
export async function shareCanvasImage(canvas, student = {}) {
  const studentName = student?.name || "Student";
  const title = `I'm part of SUCCESS ACADEMY!`;
  const text = `Excited to announce that ${studentName} has joined SUCCESS ACADEMY — From Classrooms to Careers! 🎓✨`;

  try {
    const blob = await getCanvasPngBlob(canvas);
    const file = new File([blob], `success-admission-${studentName.toLowerCase().replace(/\s+/g, "-")}.png`, {
      type: "image/png"
    });

    // Check if navigator.share and file sharing is supported
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title,
        text,
        files: [file]
      });
      return { shared: true, method: "native" };
    }

    if (navigator.share) {
      await navigator.share({
        title,
        text,
        url: window.location.origin
      });
      return { shared: true, method: "native" };
    }
  } catch (err) {
    // If user cancelled share sheet, do not trigger error
    if (err.name === "AbortError") {
      return { shared: false, method: "native" };
    }
    console.warn("Native share error, falling back:", err);
  }

  // WhatsApp fallback
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `🎓 *I'M PART OF SUCCESS ACADEMY!*\n\n${text}\n\nJoin the journey: ${window.location.origin}`
  )}`;
  window.open(waUrl, "_blank");
  return { shared: true, method: "whatsapp" };
}
