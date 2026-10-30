import { describe, it, expect } from "vitest";
import { parseLoginBody } from "../src/validation.js";

describe("parseLoginBody", () => {
  it("normalizes_email_case_and_whitespace", () => {
    expect(parseLoginBody({ email: "  Alice@Example.COM ", password: "Password123!" })).toEqual({
      ok: true,
      data: { email: "alice@example.com", password: "Password123!" },
    });
  });

  it("rejects_invalid_email_format", () => {
    expect(parseLoginBody({ email: "not-an-email", password: "Password123!" })).toEqual({
      ok: false,
      fields: { email: "Enter a valid email address" },
    });
  });

  it("rejects_password_under_8_characters", () => {
    expect(parseLoginBody({ email: "a@b.co", password: "short" })).toEqual({
      ok: false,
      fields: { password: "Password must be at least 8 characters" },
    });
  });

  it("reports_both_fields_for_missing_body", () => {
    expect(parseLoginBody(undefined)).toEqual({
      ok: false,
      fields: { email: "Email is required", password: "Password is required" },
    });
  });

  it("does_not_trim_password", () => {
    const result = parseLoginBody({ email: "a@b.co", password: "  pass  " });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.password).toBe("  pass  ");
  });

  it("non_string_fields_report_field_errors", () => {
    const result = parseLoginBody({ email: 123, password: ["x"] });
    expect(result.ok).toBe(false);
    expect(result).toEqual({
      ok: false,
      fields: { email: expect.any(String), password: expect.any(String) },
    });
  });
});
