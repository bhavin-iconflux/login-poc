import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { loadConfig } from "../src/config.js";
import { createUserStore } from "../src/users.js";
import { createApp } from "../src/app.js";

const ALICE = { email: "alice@example.com", password: "Password123!" };
const GENERIC_401 = { error: "Invalid email or password" };

/** @param {object} payload */
const b64url = (payload) => Buffer.from(JSON.stringify(payload)).toString("base64url");

describe("auth API", () => {
  let config;
  let app;

  beforeAll(async () => {
    config = loadConfig({});
    const userStore = await createUserStore();
    app = createApp({ config, userStore });
  });

  const login = (body) => request(app).post("/api/auth/login").send(body);
  const loginToken = async () => (await login(ALICE)).body.token;
  const me = (header) => {
    const req = request(app).get("/api/auth/me");
    return header === undefined ? req : req.set("Authorization", header);
  };

  it("login_success_returns_token_and_user", async () => {
    const res = await login(ALICE);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: "1", email: "alice@example.com" });
    const payload = /** @type {import("jsonwebtoken").JwtPayload} */ (
      jwt.verify(res.body.token, config.jwtSecret, { algorithms: ["HS256"] })
    );
    expect(payload.sub).toBe("1");
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it("login_accepts_mixed_case_email", async () => {
    const res = await login({ email: "Alice@Example.com", password: ALICE.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("alice@example.com");
  });

  it("login_400_names_invalid_fields", async () => {
    const res = await login({ email: "nope", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(Object.keys(res.body.fields).sort()).toEqual(["email", "password"]);
  });

  it("login_401_wrong_password", async () => {
    const res = await login({ ...ALICE, password: "Password999!" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
  });

  it("login_401_unknown_email_has_identical_body", async () => {
    const res = await login({ email: "nobody@example.com", password: ALICE.password });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
  });

  it("login_401_for_whitespace_only_password", async () => {
    const res = await login({ ...ALICE, password: "        " });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
  });

  it("login_400_on_malformed_json", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
  });

  it("login_413_for_oversized_body", async () => {
    const res = await login({ ...ALICE, password: "a".repeat(20000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "Request too large" });
  });

  it("me_returns_user_for_valid_token", async () => {
    const res = await me(`Bearer ${await loginToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: "1", email: "alice@example.com" } });
  });

  it("me_401_without_header", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("me_401_with_wrong_scheme", async () => {
    expect((await me("Basic abc")).status).toBe(401);
  });

  it("me_401_with_empty_bearer_token", async () => {
    expect((await me("Bearer ")).status).toBe(401);
  });

  it("me_401_with_tampered_token", async () => {
    const token = await loginToken();
    const last = token.slice(-1) === "A" ? "B" : "A";
    expect((await me(`Bearer ${token.slice(0, -1)}${last}`)).status).toBe(401);
  });

  it("me_401_with_expired_token", async () => {
    const token = jwt.sign({ sub: "1", email: ALICE.email }, config.jwtSecret, { expiresIn: -10 });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it("me_401_with_alg_none_token", async () => {
    const token = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "1", email: ALICE.email })}.`;
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it("me_401_when_user_no_longer_exists", async () => {
    const token = jwt.sign({ sub: "999", email: "gone@example.com" }, config.jwtSecret, { expiresIn: "1h" });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it("cors_allows_configured_origin", async () => {
    const res = await login(ALICE).set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("cors_omits_header_for_other_origin", async () => {
    const res = await login(ALICE).set("Origin", "http://evil.test");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("responses_never_contain_password_or_hash", async () => {
    const bodies = [(await login(ALICE)).body, (await login({ ...ALICE, password: "Password999!" })).body];
    for (const body of bodies) {
      const text = JSON.stringify(body);
      expect(text).not.toContain("Password123!");
      expect(text).not.toContain("$2");
    }
  });
});
