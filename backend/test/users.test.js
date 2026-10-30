import { describe, it, expect, beforeAll } from "vitest";
import { createUserStore } from "../src/users.js";

describe("user store", () => {
  /** @type {Awaited<ReturnType<typeof createUserStore>>} */
  let store;

  beforeAll(async () => {
    store = await createUserStore();
  });

  it("seed_users_are_stored_as_bcrypt_hashes", () => {
    const user = store.findByEmail("alice@example.com");
    expect(user.passwordHash.startsWith("$2")).toBe(true);
    expect(user.passwordHash).not.toContain("Password123!");
    expect(user).not.toHaveProperty("password");
  });

  it("verify_password_true_for_correct_password", async () => {
    const user = store.findByEmail("alice@example.com");
    expect(await store.verifyPassword(user, "Password123!")).toBe(true);
  });

  it("verify_password_false_for_wrong_password", async () => {
    const user = store.findByEmail("alice@example.com");
    expect(await store.verifyPassword(user, "Password999!")).toBe(false);
  });

  it("verify_password_false_for_unknown_user", async () => {
    expect(await store.verifyPassword(undefined, "Password123!")).toBe(false);
  });

  it("find_by_id_returns_seeded_user", () => {
    expect(store.findById("2").email).toBe("bob@example.com");
  });
});
