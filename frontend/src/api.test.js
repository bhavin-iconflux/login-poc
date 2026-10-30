import { describe, it, expect, vi, afterEach } from "vitest";
import { login, me, ApiError } from "./api.js";
import { API_URL } from "./config.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe("api", () => {
  afterEach(() => vi.restoreAllMocks());

  it("login_posts_json_and_returns_payload", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ token: "t", user: { id: "1", email: "a@b.co" } }));
    const result = await login({ email: "a@b.co", password: "Password123!" });
    expect(result).toEqual({ token: "t", user: { id: "1", email: "a@b.co" } });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/auth/login`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "a@b.co", password: "Password123!" });
  });

  it("login_throws_api_error_with_fields_on_400", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ error: "Validation failed", fields: { email: "Enter a valid email address" } }, 400),
    );
    const err = await login({ email: "x", password: "y" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.fields.email).toBe("Enter a valid email address");
  });

  it("login_throws_status_0_on_network_failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fail"));
    const err = await login({ email: "a@b.co", password: "Password123!" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });

  it("me_sends_bearer_header_and_returns_user", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ user: { id: "1", email: "a@b.co" } }));
    const user = await me("tok");
    expect(new Headers(spy.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer tok");
    expect(user).toEqual({ id: "1", email: "a@b.co" });
  });

  it("me_throws_api_error_on_401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "Unauthorized" }, 401));
    const err = await me("tok").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
  });
});
