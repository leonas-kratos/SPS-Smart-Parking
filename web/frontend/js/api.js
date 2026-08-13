// ============================================================
// api.js â€“ Táº¥t cáº£ giao tiáº¿p HTTP vá»›i backend
// ============================================================

import { API_BASE_URL } from "./config.js";

const API = API_BASE_URL;

function authHeader() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// â”€â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function apiLogin(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message);
  }
  return res.json(); // { token, role, username, vehicleId, vehicleNumber }
}

// â”€â”€â”€ Sensors / Parking state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function fetchParkingStatus() {
  const res = await fetch(`${API}/sensors/status`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json(); // { slots, isFull, gasStatus, floodStatus }
}

// â”€â”€â”€ Vehicle Logs (lá»‹ch sá»­) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function fetchVehicleLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/vehicles?${qs}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export async function fetchCurrentLog(vehicleId) {
  const res = await fetch(`${API}/vehicles/current/${vehicleId}`, {
    headers: authHeader(),
  });
  if (!res.ok) return null;
  return res.json(); // null hoáº·c log hiá»‡n táº¡i
}

export async function fetchRevenue() {
  const res = await fetch(`${API}/vehicles/revenue`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to fetch revenue");
  return res.json(); // [{ date, total }, ...]
}

