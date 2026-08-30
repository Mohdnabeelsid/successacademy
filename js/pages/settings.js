import { onAuthChange, getUserProfile, getStudentByUid, changeOwnPassword } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";

onAuthChange(async (user) => {
  if (!user) {
    window.location.href = "student-login.html";
    return;
  }

  const adminProfile = await getUserProfile(user.id);
  if (adminProfile && adminProfile.role === "admin") {
    renderSidebar("admin", "settings", { name: adminProfile.name || user.email, sub: "Branch Admin" });
    document.getElementById("account-info").textContent = `Signed in as ${user.email} (Admin)`;
  } else {
    const student = await getStudentByUid(user.id);
    if (!student) {
      window.location.href = "student-login.html";
      return;
    }
    renderSidebar("student", "settings", { name: student.name, sub: `Class ${student.class || "-"}` });
    document.getElementById("account-info").textContent = `Signed in as ${student.name} (Admission No. ${student.admissionNumber})`;
  }

  document.getElementById("page-loader").classList.add("done");
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirm = document.getElementById("confirm-password").value;

  if (next !== confirm) {
    toast.error("New passwords do not match.");
    return;
  }

  const btn = document.getElementById("password-save-btn");
  btn.disabled = true;
  try {
    await changeOwnPassword(current, next);
    toast.success("Password updated successfully.");
    e.target.reset();
  } catch (err) {
    toast.error(err.message || "Could not update password.");
  } finally {
    btn.disabled = false;
  }
});
