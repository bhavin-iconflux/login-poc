import { API_URL } from "./config.js";

export class ApiError extends Error {
  /**
   * @param {number} status 0 for a network failure
   * @param {{ email?: string, password?: string }} [fields]
   */
  constructor(status, fields) {
    super(`Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request(path, init) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.fields);
  return body;
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function me(token) {
  const body = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return body.user;
}
