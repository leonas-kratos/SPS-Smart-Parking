// ============================================================
// auth.js – Login / logout
// ============================================================
import { apiLogin } from "./api.js";
import { loadUserInfo } from "./ui.js";
import { loadStorage } from "./ui.js";

export let currentUser = null; // { token, role, username, vehicleId, vehicleNumber }

export async function login() {
  const username = document.getElementById("account-id").value.trim();
  const password = document.getElementById("password-id").value;
  const errorEl = document.getElementById("login-error");
  errorEl.innerText = "";

  try {
    const user = await apiLogin(username, password);
    currentUser = user;
    localStorage.setItem("token", user.token);

    document.getElementById("login-page").style.display = "none";

    if (user.role === "admin") {
      document.querySelector(".admin-app").style.display = "flex";
      window.switchAdminTab("dashboard");
    } else {
      document.querySelector(".app").style.display = "block";
      window.switchTab("info");
      await loadUserInfo(user.vehicleId);
      await loadStorage();
    }
  } catch (err) {
    errorEl.innerText = err.message;
  }
}

export function logout() {
  currentUser = null;
  localStorage.removeItem("token");

  document.querySelector(".app").style.display = "none";
  document.querySelector(".admin-app").style.display = "none";
  document.getElementById("login-page").style.display = "flex";
  document.getElementById("account-id").value = "";
  document.getElementById("password-id").value = "";
  document.getElementById("login-error").innerText = "";
}
