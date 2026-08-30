import { adminLogin } from "../services/auth-service.js";

const form = document.getElementById("admin-login-form");
const errorBox = document.getElementById("auth-error");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("show");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await adminLogin(email, password);
    window.location.href = "admin-dashboard.html";
  } catch (err) {
    errorBox.textContent = err.message || "Sign in failed. Please try again.";
    errorBox.classList.add("show");
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In";
  }
});
