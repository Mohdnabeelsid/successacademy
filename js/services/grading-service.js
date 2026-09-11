// ==========================================================================
// DYNAMIC EXAM GRADING ENGINE — SUCCESS ACADEMY
// Single source of truth for all grade calculations, dynamic scale generation,
// mark boundaries, percentage conversions, and academic result processing.
// ==========================================================================

/**
 * Standard Grade Hierarchy for SUCCESS Academy:
 * A+ -> A -> B+ -> B -> C+ -> C -> D+ -> D -> E -> F
 * Each tier represents ~10% step downward from top marks.
 */
export const DEFAULT_GRADE_CONFIG = [
  { grade: "A+", label: "Outstanding", minPct: 90, gradePoint: 10, isPass: true, colorHex: "#0FA15D", colorClass: "badge-success" },
  { grade: "A",  label: "Excellent",   minPct: 80, gradePoint: 9,  isPass: true, colorHex: "#10B981", colorClass: "badge-success" },
  { grade: "B+", label: "Very Good",   minPct: 70, gradePoint: 8,  isPass: true, colorHex: "#0D9488", colorClass: "badge-primary" },
  { grade: "B",  label: "Good",        minPct: 60, gradePoint: 7,  isPass: true, colorHex: "#1F7A78", colorClass: "badge-primary" },
  { grade: "C+", label: "Above Average", minPct: 50, gradePoint: 6, isPass: true, colorHex: "#2E4C8C", colorClass: "badge-info" },
  { grade: "C",  label: "Average",     minPct: 40, gradePoint: 5,  isPass: true, colorHex: "#D97706", colorClass: "badge-warning" },
  { grade: "D+", label: "Marginal Pass", minPct: 30, gradePoint: 4, isPass: true, colorHex: "#F59E0B", colorClass: "badge-warning" },
  { grade: "D",  label: "Needs Improvement", minPct: 20, gradePoint: 3, isPass: false, colorHex: "#CA8A04", colorClass: "badge-warning" },
  { grade: "E",  label: "Needs Improvement", minPct: 10, gradePoint: 2, isPass: false, colorHex: "#EA580C", colorClass: "badge-danger" },
  { grade: "F",  label: "Fail",        minPct: 0,  gradePoint: 0,  isPass: false, colorHex: "#EF4444", colorClass: "badge-danger" }
];

/**
 * Validates obtained marks against total marks.
 * @param {number|string|null|undefined} obtained 
 * @param {number|string} total 
 * @returns {{ valid: boolean, error?: string, numericObtained?: number, numericTotal?: number }}
 */
export function validateMarks(obtained, total) {
  const numericTotal = Number(total);
  if (isNaN(numericTotal) || numericTotal <= 0) {
    return { valid: false, error: "Total/Maximum marks must be a positive number greater than 0." };
  }

  if (obtained === null || obtained === undefined || obtained === "") {
    return { valid: true, numericObtained: null, numericTotal };
  }

  const numericObtained = Number(obtained);
  if (isNaN(numericObtained)) {
    return { valid: false, error: "Obtained marks must be a valid number." };
  }

  if (numericObtained < 0) {
    return { valid: false, error: `Marks obtained (${numericObtained}) cannot be negative.` };
  }

  if (numericObtained > numericTotal) {
    return { valid: false, error: `Marks obtained (${numericObtained}) cannot exceed maximum marks (${numericTotal}).` };
  }

  return { valid: true, numericObtained, numericTotal };
}

/**
 * Generates a dynamic grade scale table for any given maximum marks.
 * Computes integer mark boundaries [minMarks, maxMarks] and exact percentage bounds.
 * 
 * Boundary calculation algorithm:
 * - For an M-mark subject, there are 10 bands.
 * - Upper cutoff for band i (from A+ down to E) is calculated as Math.round(totalMarks * (9 - i) / 10).
 * - The min mark for that band is (lowerMax + 1), and its max mark is the previous band's min mark - 1.
 * - The lowest grade band (F) spans from 0 to the lowest cutoff.
 * - Guarantees NO gaps, NO overlapping ranges, and full coverage of [0..M].
 * 
 * @param {number|string} totalMarks 
 * @param {Array} [customConfig] Optional custom grading bands configuration
 * @returns {Array<{
 *   grade: string,
 *   label: string,
 *   gradePoint: number,
 *   isPass: boolean,
 *   minMarks: number,
 *   maxMarks: number,
 *   markRangeFormatted: string,
 *   minPct: number,
 *   maxPct: number,
 *   pctRangeFormatted: string,
 *   colorHex: string,
 *   colorClass: string
 * }>}
 */
export function generateGradeScale(totalMarks, customConfig = DEFAULT_GRADE_CONFIG) {
  const total = Math.max(1, Math.round(Number(totalMarks) || 100));
  const config = customConfig && customConfig.length ? customConfig : DEFAULT_GRADE_CONFIG;
  const numBands = config.length;

  const bands = [];
  let currentMax = total;

  for (let i = 0; i < numBands; i++) {
    const tier = config[i];

    if (i === numBands - 1) {
      // Final band (F) covers from 0 up to currentMax
      const minMarks = 0;
      const maxMarks = Math.max(0, currentMax);
      const minPct = Number(((minMarks / total) * 100).toFixed(2));
      const maxPct = Number(((maxMarks / total) * 100).toFixed(2));

      bands.push({
        grade: tier.grade,
        label: tier.label,
        gradePoint: tier.gradePoint ?? 0,
        isPass: tier.isPass ?? false,
        minMarks,
        maxMarks,
        markRangeFormatted: `${minMarks}–${maxMarks}`,
        minPct,
        maxPct,
        pctRangeFormatted: `${minPct}%–${maxPct}%`,
        colorHex: tier.colorHex || "#EF4444",
        colorClass: tier.colorClass || "badge-danger"
      });
    } else {
      // Step fraction: for 10 bands, fractions are 0.9, 0.8, 0.7, ..., 0.1
      const stepFraction = (numBands - 1 - i) / numBands;
      const lowerMax = Math.round(total * stepFraction);
      const minMarks = Math.min(currentMax, lowerMax + 1);
      const maxMarks = currentMax;

      const minPct = Number(((minMarks / total) * 100).toFixed(2));
      const maxPct = Number(((maxMarks / total) * 100).toFixed(2));

      bands.push({
        grade: tier.grade,
        label: tier.label,
        gradePoint: tier.gradePoint ?? 0,
        isPass: tier.isPass ?? true,
        minMarks,
        maxMarks,
        markRangeFormatted: `${minMarks}–${maxMarks}`,
        minPct,
        maxPct,
        pctRangeFormatted: `${minPct}%–${maxPct}%`,
        colorHex: tier.colorHex || "#1F7A78",
        colorClass: tier.colorClass || "badge-primary"
      });

      currentMax = Math.max(0, lowerMax);
    }
  }

  return bands;
}

/**
 * Calculates grade and performance metrics for an obtained mark out of total marks.
 * Handles integer marks, decimal marks, absence, missing values, and validations.
 *
 * @param {number|string|null|undefined} obtainedMarks 
 * @param {number|string} totalMarks 
 * @param {Object} [options]
 * @param {boolean} [options.isAbsent=false]
 * @param {number} [options.passingMarks] Custom passing marks (defaults to scale isPass)
 * @param {Array} [options.customConfig]
 * @returns {{
 *   obtainedMarks: number|null,
 *   totalMarks: number,
 *   percentage: number|null,
 *   percentageFormatted: string,
 *   grade: string,
 *   gradePoint: number,
 *   label: string,
 *   passed: boolean,
 *   status: 'Graded'|'Absent'|'Not Entered'|'Error',
 *   error?: string,
 *   colorHex: string,
 *   colorClass: string
 * }}
 */
export function calculateGrade(obtainedMarks, totalMarks, options = {}) {
  const { isAbsent = false, passingMarks = null, customConfig = DEFAULT_GRADE_CONFIG } = options;
  const total = Number(totalMarks) || 100;

  // Case 1: Student is Absent
  if (isAbsent) {
    return {
      obtainedMarks: null,
      totalMarks: total,
      percentage: null,
      percentageFormatted: "—",
      grade: "Absent",
      gradePoint: 0,
      label: "Absent",
      passed: false,
      status: "Absent",
      colorHex: "#64748B",
      colorClass: "badge-ghost"
    };
  }

  // Case 2: Marks Not Entered / Empty
  if (obtainedMarks === null || obtainedMarks === undefined || obtainedMarks === "") {
    return {
      obtainedMarks: null,
      totalMarks: total,
      percentage: null,
      percentageFormatted: "—",
      grade: "—",
      gradePoint: 0,
      label: "Not Entered",
      passed: false,
      status: "Not Entered",
      colorHex: "#94A3B8",
      colorClass: "badge-ghost"
    };
  }

  // Validation
  const validation = validateMarks(obtainedMarks, total);
  if (!validation.valid) {
    return {
      obtainedMarks: Number(obtainedMarks) || 0,
      totalMarks: total,
      percentage: null,
      percentageFormatted: "—",
      grade: "Invalid",
      gradePoint: 0,
      label: validation.error,
      passed: false,
      status: "Error",
      error: validation.error,
      colorHex: "#EF4444",
      colorClass: "badge-danger"
    };
  }

  const obtained = validation.numericObtained;
  const percentage = (obtained / total) * 100;
  const percentageFormatted = `${percentage.toFixed(1).replace(/\.0$/, "")}%`;

  // Determine Grade from Dynamic Scale
  const scale = generateGradeScale(total, customConfig);
  let matchedBand = scale[scale.length - 1]; // Default fallback to lowest (F)

  for (let i = 0; i < scale.length; i++) {
    const band = scale[i];
    // If it's the lowest band (F), any non-negative obtained mark <= band.maxMarks belongs to F
    if (i === scale.length - 1) {
      matchedBand = band;
      break;
    }
    // For higher bands, if obtained mark exceeds the max mark of the band below it,
    // it belongs to this band (e.g. for A+, anything > 72, which includes 72.5 and 73..80)
    const bandBelow = scale[i + 1];
    if (obtained > bandBelow.maxMarks) {
      matchedBand = band;
      break;
    }
  }

  // Determine Pass/Fail status
  let isPassed = matchedBand.isPass;
  if (passingMarks !== null && passingMarks !== undefined && !isNaN(Number(passingMarks))) {
    isPassed = obtained >= Number(passingMarks);
  }

  return {
    obtainedMarks: obtained,
    totalMarks: total,
    percentage: Number(percentage.toFixed(2)),
    percentageFormatted,
    grade: matchedBand.grade,
    gradePoint: matchedBand.gradePoint,
    label: matchedBand.label,
    passed: isPassed,
    status: "Graded",
    colorHex: matchedBand.colorHex,
    colorClass: matchedBand.colorClass
  };
}

/**
 * Helper to get grade badge HTML directly.
 * @param {Object} gradeResult 
 * @returns {string}
 */
export function renderGradeBadge(gradeResult) {
  if (!gradeResult) return `<span class="badge badge-ghost">—</span>`;
  const text = gradeResult.grade || "—";
  const bg = gradeResult.colorHex || "#64748B";
  return `<span class="badge" style="background-color: ${bg}18; color: ${bg}; border: 1px solid ${bg}44; font-weight:700;">${text}</span>`;
}
