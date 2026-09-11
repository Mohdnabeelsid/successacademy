import { studentLogin } from "../services/auth-service.js";
import { initPasswordToggles, setButtonLoading } from "../utils/ui-helpers.js";

const form = document.getElementById("student-login-form");
const errorBox = document.getElementById("auth-error");
const submitBtn = document.getElementById("submit-btn");

initPasswordToggles();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("show");
  setButtonLoading(submitBtn, true, "Signing in...");

  const admission = document.getElementById("admission").value;
  const password = document.getElementById("password").value;

  try {
    await studentLogin(admission, password);
    window.location.href = "student-dashboard.html";
  } catch (err) {
    errorBox.textContent = err.message || "Sign in failed. Please try again.";
    errorBox.classList.add("show");
    setButtonLoading(submitBtn, false);
  }
});
