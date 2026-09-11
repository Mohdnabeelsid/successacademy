const https = require("https");

const SUPABASE_URL = "https://gsfwxqkbdrmvuvpqcllw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ix1qvKAccJd2-M8lDLah6g_W-f3phW9";

function fetchSupabase(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + "/rest/v1/" + path);
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  console.log("--- Class 8 Exams ---");
  const exams = await fetchSupabase("exams?class=in.(8,Class 8)");
  console.log(exams);

  console.log("--- Muhammed Anees F student profile ---");
  const students = await fetchSupabase("students?name=ilike.*Muhammed Anees*");
  console.log(students);

  if (students && students.length > 0) {
    const studentId = students[0].id;
    console.log("--- Student Marks for", students[0].name, "---");
    const marks = await fetchSupabase(`exam_marks?student_id=eq.${studentId}`);
    console.log(marks);
  }
}

run();
