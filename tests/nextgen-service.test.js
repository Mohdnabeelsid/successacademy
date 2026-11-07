// ==========================================================================
// TEST SUITE: NEXTGEN ONLINE SESSION ATTENDANCE SERVICE
// Tests:
// - Google Meet URL validation (approved domains only)
// - Indian Phone number validation and normalization
// - Class level bounds (8, 9, 10, 11, 12)
// - Input validation for session creation and check-in submissions
// - CSV sanitization against spreadsheet formula injection
// - In-memory mock DB operations:
//   * Create session (scheduled)
//   * Single live session rule enforcement (cannot activate if another is live)
//   * Session lifecycle (SCHEDULED -> LIVE -> FINISHED)
//   * Public safe session info (meet_url excluded before check-in)
//   * Student check-in flow with meet_url returned only upon success
//   * Deduplication per student & phone
//   * Sibling check-in support (same phone, different name)
//   * Reject check-in when no session is live
//   * Delete session blocked when attendees exist
//   * Dashboard stats calculation
//   * CSV export generation
// ==========================================================================

import {
  NEXTGEN_STATUS,
  ALLOWED_CLASSES,
  isValidGoogleMeetUrl,
  normalizeIndianPhone,
  validateCheckInInput,
  validateSessionInput,
  sanitizeCsvValue,
  createNextgenSession,
  updateNextgenSession,
  activateNextgenSession,
  finishNextgenSession,
  deleteNextgenSession,
  getNextgenSession,
  listNextgenSessions,
  getLiveSessionInfo,
  submitCheckIn,
  listSessionAttendees,
  exportSessionAttendeesToCSV,
  getNextgenDashboardStats
} from "../js/services/nextgen-service.js";

import { setSupabaseClient } from "../js/config/supabase-config.js";

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  testsRun++;
  if (actual === expected) {
    testsPassed++;
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message} | Expected: ${expected}, Got: ${actual}`);
  }
}

function assertThrows(fn, expectedSubstr, message) {
  testsRun++;
  try {
    fn();
    testsFailed++;
    console.error(`❌ FAIL: ${message} | Expected exception containing "${expectedSubstr}" but none was thrown.`);
  } catch (err) {
    if (!expectedSubstr || (err.message && err.message.toLowerCase().includes(expectedSubstr.toLowerCase()))) {
      testsPassed++;
    } else {
      testsFailed++;
      console.error(`❌ FAIL: ${message} | Exception thrown: "${err.message}", expected substring: "${expectedSubstr}"`);
    }
  }
}

async function assertRejects(promiseFn, expectedSubstr, message) {
  testsRun++;
  try {
    await promiseFn();
    testsFailed++;
    console.error(`❌ FAIL: ${message} | Expected rejection containing "${expectedSubstr}" but resolved.`);
  } catch (err) {
    if (!expectedSubstr || (err.message && err.message.toLowerCase().includes(expectedSubstr.toLowerCase()))) {
      testsPassed++;
    } else {
      testsFailed++;
      console.error(`❌ FAIL: ${message} | Rejection: "${err.message}", expected substring: "${expectedSubstr}"`);
    }
  }
}

console.log("================================================================");
console.log("  RUNNING SUCCESS ACADEMY NEXTGEN MODULE TEST SUITE");
console.log("================================================================\n");

// --------------------------------------------------------------------------
// SECTION 1: Google Meet URL Validation
// --------------------------------------------------------------------------
console.log("▶ Section 1: Google Meet URL Validation");

assert(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij"), "Standard Google Meet URL is valid");
assert(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij?authuser=0"), "Meet URL with query params is valid");
assert(isValidGoogleMeetUrl("http://meet.google.com/abc-defg-hij"), "HTTP Meet URL is accepted/normalized");
assert(isValidGoogleMeetUrl("meet.google.com/abc-defg-hij"), "Bare meet.google.com URL is valid");

assert(!isValidGoogleMeetUrl("https://zoom.us/j/1234567890"), "Zoom URL is rejected");
assert(!isValidGoogleMeetUrl("https://teams.microsoft.com/l/meetup"), "Teams URL is rejected");
assert(!isValidGoogleMeetUrl("https://google.com/meet"), "Generic google.com URL is rejected");
assert(!isValidGoogleMeetUrl("https://malicious-meet.google.com.attacker.com"), "Phishing URL is rejected");
assert(!isValidGoogleMeetUrl(""), "Empty string is rejected");
assert(!isValidGoogleMeetUrl(null), "Null URL is rejected");

// --------------------------------------------------------------------------
// SECTION 2: Indian Phone Number Validation & Normalization
// --------------------------------------------------------------------------
console.log("▶ Section 2: Indian Phone Validation & Normalization");

assertEqual(normalizeIndianPhone("9876543210"), "+919876543210", "10-digit number normalizes to +91XXXXXXXXXX");
assertEqual(normalizeIndianPhone("+919876543210"), "+919876543210", "+91 prefix preserved");
assertEqual(normalizeIndianPhone("09876543210"), "+919876543210", "Leading 0 normalized");
assertEqual(normalizeIndianPhone("+91 98765-43210"), "+919876543210", "Spaces and hyphens stripped");
assertEqual(normalizeIndianPhone("  7012345678  "), "+917012345678", "Starting with 7 is valid");
assertEqual(normalizeIndianPhone("8012345678"), "+918012345678", "Starting with 8 is valid");
assertEqual(normalizeIndianPhone("6012345678"), "+916012345678", "Starting with 6 is valid");

assert(normalizeIndianPhone("5012345678") === null, "Numbers starting with 5 return null in default mode");
assertThrows(() => normalizeIndianPhone("5012345678", true), "valid indian mobile", "Numbers starting with 5 are rejected in strict mode");
assertThrows(() => normalizeIndianPhone("1234567890", true), "valid indian mobile", "Numbers starting with 1 are rejected in strict mode");
assertThrows(() => normalizeIndianPhone("987654321", true), "10 digits", "9-digit number is rejected in strict mode");
assertThrows(() => normalizeIndianPhone("987654321000", true), "10 digits", "12-digit number without +91 is rejected in strict mode");
assertThrows(() => normalizeIndianPhone("abcdefghij", true), "10 digits", "Non-numeric strings rejected in strict mode");
assertThrows(() => normalizeIndianPhone("", true), "required", "Empty phone rejected in strict mode");

// --------------------------------------------------------------------------
// SECTION 3: Class Level & Input Validation
// --------------------------------------------------------------------------
console.log("▶ Section 3: Check-in & Session Input Validation");

assertEqual(ALLOWED_CLASSES.length, 5, "ALLOWED_CLASSES has 5 classes (8 to 12)");
assert(ALLOWED_CLASSES.includes(8) && ALLOWED_CLASSES.includes(12), "Classes 8 and 12 are in allowed set");

// validateCheckInInput
const validCheckin = validateCheckInInput({
  student_name: "Aparna Nair",
  class_level: 10,
  school_name: "St. Joseph's HSS",
  phone: "9847123456"
});
assertEqual(validCheckin.phone, "+919847123456", "Check-in normalizes phone number");
assertEqual(validCheckin.class_level, 10, "Class level preserved as integer");

assertThrows(() => validateCheckInInput({
  student_name: "A",
  class_level: 10,
  school_name: "St. Joseph's",
  phone: "9847123456"
}, { throwOnError: true }), "student name", "Name shorter than 2 chars rejected");

assertThrows(() => validateCheckInInput({
  student_name: "Aparna",
  class_level: 7,
  school_name: "St. Joseph's",
  phone: "9847123456"
}, { throwOnError: true }), "class", "Class 7 rejected");

assertThrows(() => validateCheckInInput({
  student_name: "Aparna",
  class_level: 10,
  school_name: "S",
  phone: "9847123456"
}, { throwOnError: true }), "school name", "Short school name rejected");

// validateSessionInput
const validSession = validateSessionInput({
  title: "Career Guidance 2026",
  facilitator_name: "Dr. K. George",
  scheduled_at: "2026-11-10T19:00:00Z",
  meet_url: "https://meet.google.com/uvw-xyz-abc"
});
assertEqual(validSession.title, "Career Guidance 2026", "Session title preserved");

assertThrows(() => validateSessionInput({
  title: "A",
  facilitator_name: "Dr. George",
  scheduled_at: "2026-11-10T19:00:00Z",
  meet_url: "https://meet.google.com/uvw-xyz-abc"
}, { throwOnError: true }), "title", "Short session title rejected");

assertThrows(() => validateSessionInput({
  title: "Career Guidance",
  facilitator_name: "Dr. George",
  scheduled_at: "2026-11-10T19:00:00Z",
  meet_url: "https://zoom.us/j/123"
}, { throwOnError: true }), "google meet link", "Invalid meet url rejected in session validation");

// --------------------------------------------------------------------------
// SECTION 4: CSV Sanitization & Formula Injection Protection
// --------------------------------------------------------------------------
console.log("▶ Section 4: CSV Sanitization");

assertEqual(sanitizeCsvValue("Normal Name"), "\"Normal Name\"", "Safe value left unchanged and quoted");
assertEqual(sanitizeCsvValue("=cmd|'/C calc'!A0"), "\"'=cmd|'/C calc'!A0\"", "Leading = prepended with single quote");
assertEqual(sanitizeCsvValue("+12345"), "\"'+12345\"", "Leading + prepended with single quote");
assertEqual(sanitizeCsvValue("-SUM(A1:A10)"), "\"'-SUM(A1:A10)\"", "Leading - prepended with single quote");
assertEqual(sanitizeCsvValue("@HYPERLINK(...)"), "\"'@HYPERLINK(...)\"", "Leading @ prepended with single quote");

// --------------------------------------------------------------------------
// SECTION 5: In-Memory Mock DB & Service Integration Tests
// --------------------------------------------------------------------------
console.log("▶ Section 5: Mock DB Integration & Session Lifecycle");

// Setup in-memory mock tables
let mockSessions = [];
let mockAttendees = [];

function createMockSupabase() {
  return {
    from: (tableName) => {
      if (tableName === "nextgen_sessions") {
        return {
          select: (fields) => {
            const getSessionData = () => {
              return mockSessions.map(s => {
                const atts = mockAttendees.filter(a => a.session_id === s.id);
                return {
                  ...s,
                  nextgen_attendees: [{ count: atts.length }]
                };
              });
            };

            const queryObj = {
              then: (onFulfilled, onRejected) => {
                return Promise.resolve({ data: getSessionData(), error: null }).then(onFulfilled, onRejected);
              },
              order: (sortCol, { ascending } = { ascending: true }) => {
                let list = getSessionData();
                list.sort((a, b) => {
                  const valA = a[sortCol];
                  const valB = b[sortCol];
                  if (valA < valB) return ascending ? -1 : 1;
                  if (valA > valB) return ascending ? 1 : -1;
                  return 0;
                });
                return Promise.resolve({ data: list, error: null });
              },
              eq: (col, val) => {
                const filtered = () => mockSessions.filter(s => s[col] === val);
                return {
                  then: (onFulfilled, onRejected) => {
                    return Promise.resolve({ data: filtered(), error: null }).then(onFulfilled, onRejected);
                  },
                  single: () => {
                    const found = mockSessions.find(s => s[col] === val);
                    if (!found) return Promise.resolve({ data: null, error: { message: "Not found" } });
                    return Promise.resolve({ data: { ...found }, error: null });
                  },
                  maybeSingle: () => {
                    const found = mockSessions.find(s => s[col] === val);
                    if (!found) return Promise.resolve({ data: null, error: null });
                    return Promise.resolve({ data: { ...found }, error: null });
                  },
                  limit: (num) => {
                    const list = filtered().slice(0, num);
                    return Promise.resolve({ data: list, error: null });
                  }
                };
              }
            };
            return queryObj;
          },
          insert: (records) => {
            const inserted = records.map(r => ({
              id: "session-" + Math.random().toString(36).substring(2, 9),
              ...r,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));
            mockSessions.push(...inserted);
            return {
              select: () => {
                const p = Promise.resolve({ data: inserted, error: null });
                p.single = () => Promise.resolve({ data: { ...inserted[0] }, error: null });
                p.maybeSingle = () => Promise.resolve({ data: { ...inserted[0] }, error: null });
                return p;
              }
            };
          },
          update: (updates) => {
            return {
              eq: (col, val) => {
                const idx = mockSessions.findIndex(s => s[col] === val);
                if (idx !== -1) {
                  // Partial unique constraint check: status = 'live'
                  if (updates.status === "live") {
                    const existingLive = mockSessions.find(s => s.status === "live" && s.id !== val);
                    if (existingLive) {
                      return Promise.resolve({
                        data: null,
                        error: { message: `Another session is already live: "${existingLive.title}".` }
                      });
                    }
                  }
                  mockSessions[idx] = { ...mockSessions[idx], ...updates, updated_at: new Date().toISOString() };
                  return {
                    select: () => ({
                      single: () => Promise.resolve({ data: { ...mockSessions[idx] }, error: null }),
                      maybeSingle: () => Promise.resolve({ data: { ...mockSessions[idx] }, error: null })
                    })
                  };
                }
                return Promise.resolve({ data: null, error: { message: "Not found" } });
              }
            };
          },
          delete: () => {
            return {
              eq: (col, val) => {
                const idx = mockSessions.findIndex(s => s[col] === val);
                if (idx !== -1) {
                  mockSessions.splice(idx, 1);
                  return Promise.resolve({ error: null });
                }
                return Promise.resolve({ error: { message: "Not found" } });
              }
            };
          }
        };
      } else if (tableName === "nextgen_attendees") {
        return {
          select: (fields, options) => {
            if (options && options.head && options.count === "exact") {
              return {
                then: (onFulfilled, onRejected) => {
                  return Promise.resolve({ count: mockAttendees.length, error: null }).then(onFulfilled, onRejected);
                },
                eq: (col, val) => {
                  const count = mockAttendees.filter(a => a[col] === val).length;
                  return Promise.resolve({ count, error: null });
                }
              };
            }
            return {
              eq: (col, val) => {
                return {
                  order: (sortCol, { ascending } = { ascending: true }) => {
                    const filtered = mockAttendees.filter(a => a[col] === val);
                    return Promise.resolve({ data: filtered, error: null });
                  },
                  eq: (col2, val2) => {
                    return {
                      limit: (n) => {
                        const filtered = mockAttendees.filter(a => a[col] === val && a[col2] === val2).slice(0, n);
                        return Promise.resolve({ data: filtered, error: null });
                      }
                    };
                  }
                };
              }
            };
          },
          insert: (records) => {
            const inserted = records.map(r => ({
              id: "att-" + Math.random().toString(36).substring(2, 9),
              ...r,
              submitted_at: r.submitted_at || new Date().toISOString()
            }));
            mockAttendees.push(...inserted);
            return {
              select: () => {
                const p = Promise.resolve({ data: inserted, error: null });
                p.single = () => Promise.resolve({ data: { ...inserted[0] }, error: null });
                p.maybeSingle = () => Promise.resolve({ data: { ...inserted[0] }, error: null });
                return p;
              }
            };
          }
        };
      }
      return {};
    },
    rpc: (funcName, args) => {
      // Simulate PostgreSQL functions
      if (funcName === "create_nextgen_session") {
        const session = {
          id: "session-" + Math.random().toString(36).substring(2, 9),
          title: args.p_title,
          facilitator_name: args.p_facilitator_name,
          scheduled_at: args.p_scheduled_at,
          meet_url: args.p_meet_url,
          status: "scheduled",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        mockSessions.push(session);
        return Promise.resolve({ data: session, error: null });
      }

      if (funcName === "get_live_nextgen_session") {
        const live = mockSessions.find(s => s.status === "live");
        if (!live) return Promise.resolve({ data: null, error: null });
        // Public safe: NO meet_url
        return Promise.resolve({
          data: {
            id: live.id,
            title: live.title,
            facilitator_name: live.facilitator_name,
            scheduled_at: live.scheduled_at,
            status: "live",
            live_at: live.live_at
          },
          error: null
        });
      }

      if (funcName === "activate_nextgen_session") {
        const existingLive = mockSessions.find(s => s.status === "live" && s.id !== args.p_session_id);
        if (existingLive) {
          return Promise.resolve({
            data: null,
            error: { message: `Another session is already live: "${existingLive.title}".` }
          });
        }
        const session = mockSessions.find(s => s.id === args.p_session_id);
        if (!session) return Promise.resolve({ data: null, error: { message: "Session not found" } });
        session.status = "live";
        session.live_at = new Date().toISOString();
        return Promise.resolve({ data: session, error: null });
      }

      if (funcName === "finish_nextgen_session") {
        const session = mockSessions.find(s => s.id === args.p_session_id);
        if (!session) return Promise.resolve({ data: null, error: { message: "Session not found" } });
        session.status = "finished";
        session.finished_at = new Date().toISOString();
        return Promise.resolve({ data: session, error: null });
      }

      if (funcName === "check_in_nextgen_attendee") {
        const live = mockSessions.find(s => s.status === "live");
        if (!live) {
          return Promise.resolve({ data: null, error: { message: "There is currently no live NEXTGEN session." } });
        }
        // Deduplication
        const normalizedPhone = args.p_phone;
        const studentNameTrimmed = args.p_student_name.trim().toLowerCase();
        let existing = mockAttendees.find(
          a => a.session_id === live.id &&
               a.phone_normalized === normalizedPhone &&
               a.student_name.trim().toLowerCase() === studentNameTrimmed
        );
        if (!existing) {
          existing = {
            id: "att-" + Math.random().toString(36).substring(2, 9),
            session_id: live.id,
            student_name: args.p_student_name.trim(),
            class_level: args.p_class_level,
            school_name: args.p_school_name.trim(),
            phone: args.p_phone,
            phone_normalized: normalizedPhone,
            submitted_at: new Date().toISOString()
          };
          mockAttendees.push(existing);
        }
        return Promise.resolve({
          data: {
            attendee_id: existing.id,
            session_id: live.id,
            session_title: live.title,
            meet_url: live.meet_url,
            is_duplicate: false
          },
          error: null
        });
      }

      return Promise.resolve({ data: null, error: { message: "Unknown RPC" } });
    }
  };
}

// Inject Mock Supabase
setSupabaseClient(createMockSupabase());

async function runAsyncTests() {
  // Test 5.1: Create scheduled session
  const session1 = await createNextgenSession({
    title: "Engineering & NEET Orientation",
    facilitator_name: "Prof. Narayanan",
    scheduled_at: "2026-11-15T18:30:00Z",
    meet_url: "https://meet.google.com/eng-neet-2026"
  });
  assertEqual(session1.title, "Engineering & NEET Orientation", "Created session title matches");
  assertEqual(session1.status, NEXTGEN_STATUS.SCHEDULED, "Initial status is scheduled");

  // Test 5.2: Create second scheduled session
  const session2 = await createNextgenSession({
    title: "Civil Services Roadmap for School Students",
    facilitator_name: "Dr. Ananya IAS",
    scheduled_at: "2026-11-20T19:00:00Z",
    meet_url: "https://meet.google.com/ias-road-2026"
  });
  assertEqual(session2.status, NEXTGEN_STATUS.SCHEDULED, "Session 2 status is scheduled");

  // Test 5.3: Public safe info when NO session is live
  const publicInfoNone = await getLiveSessionInfo();
  assertEqual(publicInfoNone, null, "getLiveSessionInfo returns null when no session is live");

  // Test 5.4: Submit check-in when no session is live -> fails
  await assertRejects(
    () => submitCheckIn({
      student_name: "Kavya S",
      class_level: 11,
      school_name: "Govt HSS Alappuzha",
      phone: "9447112233"
    }),
    "no live nextgen session",
    "Check-in rejected when no session is live"
  );

  // Test 5.5: Activate Session 1 (SCHEDULED -> LIVE)
  const activated1 = await activateNextgenSession(session1.id);
  assertEqual(activated1.status, NEXTGEN_STATUS.LIVE, "Session 1 is now LIVE");

  // Test 5.6: Single Live Session Enforcement
  // Attempting to activate Session 2 while Session 1 is live MUST fail
  await assertRejects(
    () => activateNextgenSession(session2.id),
    "already live",
    "Cannot activate Session 2 while Session 1 is live"
  );

  // Test 5.7: Public Safe Info (meet_url must be hidden)
  const publicLiveInfo = await getLiveSessionInfo();
  assert(publicLiveInfo !== null, "Public sees live session exists");
  assertEqual(publicLiveInfo.title, "Engineering & NEET Orientation", "Public sees session title");
  assertEqual(publicLiveInfo.meet_url, undefined, "CRITICAL: meet_url is NEVER exposed in getLiveSessionInfo");

  // Test 5.8: Public Check-in against live session
  const checkinRes1 = await submitCheckIn({
    student_name: "Kavya S",
    class_level: 11,
    school_name: "Govt HSS Alappuzha",
    phone: "9447112233"
  });
  assert(checkinRes1.success, "Check-in successful");
  assertEqual(checkinRes1.meetUrl, "https://meet.google.com/eng-neet-2026", "Meet URL returned upon successful check-in");

  // Test 5.9: Sibling check-in (same phone, different student name)
  const checkinRes2 = await submitCheckIn({
    student_name: "Karthik S", // sibling sharing same mobile number
    class_level: 9,
    school_name: "Govt HSS Alappuzha",
    phone: "9447112233"
  });
  assert(checkinRes2.success, "Sibling check-in with same phone succeeded");

  // Test 5.10: Deduplication (same student, same phone, same session)
  const checkinRes3 = await submitCheckIn({
    student_name: "Kavya S",
    class_level: 11,
    school_name: "Govt HSS Alappuzha",
    phone: "9447112233"
  });
  assert(checkinRes3.success, "Duplicate check-in handled gracefully");
  assertEqual(mockAttendees.length, 2, "Only 2 attendee records exist (no duplicate created)");

  // Test 5.11: List Session Attendees
  const attendeesList = await listSessionAttendees(session1.id);
  assertEqual(attendeesList.length, 2, "Session 1 has 2 attendees");
  assertEqual(attendeesList[0].student_name, "Kavya S", "First attendee is Kavya S");
  assertEqual(attendeesList[1].student_name, "Karthik S", "Second attendee is Karthik S");

  // Test 5.12: Deletion safety — Session 1 has attendees, delete MUST be blocked
  await assertRejects(
    () => deleteNextgenSession(session1.id),
    "attendees",
    "Cannot delete session containing recorded attendees"
  );

  // Test 5.13: Finish Session 1 (LIVE -> FINISHED)
  const finished1 = await finishNextgenSession(session1.id);
  assertEqual(finished1.status, NEXTGEN_STATUS.FINISHED, "Session 1 marked as finished");

  // Test 5.14: Check-in after session finished -> rejected
  await assertRejects(
    () => submitCheckIn({
      student_name: "New Student",
      class_level: 10,
      school_name: "Model School",
      phone: "9876543210"
    }),
    "no live nextgen session",
    "Check-in rejected after session finishes"
  );

  // Test 5.15: Now Session 2 can be activated
  const activated2 = await activateNextgenSession(session2.id);
  assertEqual(activated2.status, NEXTGEN_STATUS.LIVE, "Session 2 successfully activated after Session 1 finished");

  // Test 5.16: Session 2 deletion safety (0 attendees -> can be deleted when finished)
  await finishNextgenSession(session2.id);
  const deleteRes = await deleteNextgenSession(session2.id);
  assert(deleteRes, "Session with 0 attendees deleted successfully");

  // Test 5.17: Dashboard Stats
  const stats = await getNextgenDashboardStats();
  assertEqual(stats.totalSessions, 1, "Stats show 1 remaining session");
  assertEqual(stats.totalAttendees, 2, "Stats show 2 total attendees");
  assertEqual(stats.finishedSessions, 1, "Stats show 1 finished session");
  assertEqual(stats.liveSession, null, "No session is currently live");

  // Test 5.18: CSV Export Functionality
  // Export attendees of Session 1
  const session1Data = await getNextgenSession(session1.id);
  const exportedCount = exportSessionAttendeesToCSV(session1Data, attendeesList);
  assertEqual(exportedCount, 2, "Exported 2 attendees to CSV");

  console.log("\n================================================================");
  console.log(`  NEXTGEN TEST SUMMARY: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
  console.log("================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAsyncTests().catch(err => {
  console.error("Fatal Test Suite Failure:", err);
  process.exit(1);
});
