import { describe, it, expect } from "vitest";
import { normalizeEmail, validateEmail, validatePassword } from "./validation.js";

describe("validation", () => {
  it("email_format_errors", () => {
    expect(validateEmail("")).toBe("Email is required");
    expect(validateEmail("nope")).toBe("Enter a valid email address");
    expect(validateEmail("a@b.co")).toBe("");
  });

  it("password_length_error", () => {
    expect(validatePassword("")).toBe("Password is required");
    expect(validatePassword("short")).toBe("Password must be at least 8 characters");
    expect(validatePassword("        ")).toBe("");
  });

  it("normalize_email_trims_and_lowercases", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });
});
