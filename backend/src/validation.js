import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

const REQUIRED = {
  email: "Email is required",
  password: "Password is required",
};

/** @type {Record<string, string>} */
const INVALID = {
  email: "Enter a valid email address",
  password: "Password must be at least 8 characters",
};

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: { email: string, password: string } }
 *   | { ok: false, fields: { email?: string, password?: string } }}
 */
export function parseLoginBody(body) {
  const input = typeof body === "object" && body !== null ? body : {};
  const result = loginSchema.safeParse(input);
  // zod's inferred output type needs strictNullChecks, which this project leaves off.
  if (result.success) return { ok: true, data: /** @type {{ email: string, password: string }} */ (result.data) };

  /** @type {{ email?: string, password?: string }} */
  const fields = {};
  for (const issue of result.error.issues) {
    const key = /** @type {"email" | "password"} */ (issue.path[0]);
    fields[key] ??= issue.code === "invalid_type" ? REQUIRED[key] : INVALID[key];
  }
  return { ok: false, fields };
}
