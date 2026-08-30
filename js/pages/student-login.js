import { studentLogin } from "../services/auth-service.js";

const form = document.getElementById("student-login-form");
const errorBox = document.getElementById("auth-error");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("show");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  const admission = document.getElementById("admission").value;
  const password = document.getElementById("password").value;

  try {
    await studentLogin(admission, password);
    window.location.href = "student-dashboard.html";
  } catch (err) {
    errorBox.textContent = err.message || "Sign in failed. Please try again.";
    errorBox.classList.add("show");
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In";
  }
});
