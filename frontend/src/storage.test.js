import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken } from "./storage.js";

describe("storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("round_trips_token", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
    expect(sessionStorage.getItem("login-poc.token")).toBe("abc");
  });

  it("clear_removes_token", () => {
    setToken("abc");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("survives_storage_throwing", () => {
    const original = globalThis.sessionStorage;
    const boom = () => {
      throw new Error("blocked");
    };
    Object.defineProperty(globalThis, "sessionStorage", {
      value: { getItem: boom, setItem: boom, removeItem: boom },
      configurable: true,
    });
    try {
      expect(getToken()).toBeNull();
      expect(() => setToken("x")).not.toThrow();
      expect(() => clearToken()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        value: original,
        configurable: true,
      });
    }
  });
});
