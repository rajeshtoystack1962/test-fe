// Where the browser sends API calls.
// Leave VITE_API_BASE_URL empty (the default) so calls stay on this
// app as /api/... and Vite or server.js forwards them to Django.
// Set VITE_API_BASE_URL=http://localhost:8000 to call Django directly.
const rawBase = import.meta.env.VITE_API_BASE_URL || "";
export const API_BASE = rawBase.replace(/\/$/, "");

export const apiLabel = API_BASE
  ? `${API_BASE}/api`
  : "/api (forwarded to Django)";

export async function api(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  }
  return data;
}
