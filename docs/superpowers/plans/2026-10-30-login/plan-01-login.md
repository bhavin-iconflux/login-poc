# Login Backend Implementation Plan

> **Executor:** the factory driver runs this plan using superpowers:subagent-driven-development, with one fresh factory-builder implementer per task and no per-task review. The driver keeps the ledger, makes the commits and runs the final review.

**Goal:** Stand up the root Bun workspace and the Express backend with `POST /api/auth/login` and `GET /api/auth/me`.

**Architecture:** A Bun workspace at the repo root (checks run there) with a `backend/` package. The backend is plain ES-module JavaScript on Node: `createApp({ config, userStore })` builds the Express app, pure modules (config, users, validation, auth helpers) sit under it, and tests run on `bun:test` with `supertest`.

**Tech Stack:** Node, Express, `jsonwebtoken`, `bcryptjs`, `cors`, `zod`, Bun test runner, TypeScript (`checkJs` only), ESLint.

**Spec:** `docs/superpowers/specs/2026-10-30-login-design.md`

## Global Constraints

- Plain JavaScript, ES modules (`"type": "module"`); no TypeScript source files.
- Root checks must pass from the repo root: `bun run typecheck`, `bun run lint`, `bun test`.
- Tests import `describe`, `it`, `expect`, `mock`, `spyOn` from `bun:test`.
- Passwords stored only as bcrypt hashes (cost 10, `bcryptjs`); no plaintext in logs, errors or responses.
- Login failure body is `{ "error": "Invalid email or password" }` for both unknown email and wrong password.
- JWT: HS256 only, payload `{ sub, email }`, expires in `"1h"`, sent as `Authorization: Bearer <token>`.
- Ports and origins: `PORT` default `4000`, `CORS_ORIGIN` default `http://localhost:5173`, `JWT_SECRET` default `DEV_JWT_SECRET` (`"dev-only-insecure-secret"`), refused in production.
- JSON body limit `10kb`; CORS allows only `CORS_ORIGIN`.
- No runtime dependency beyond `express`, `jsonwebtoken`, `bcryptjs`, `cors`, `zod`.
- This plan creates only the backend side of the workspace. The `frontend` workspace entry, the frontend `tsconfig` include and the `bunfig.toml` preload are added by plan 02, because `frontend/` does not exist yet.

## Review Focus

1. Password of eight spaces: passes validation (not trimmed), then `401 Invalid email or password`, never `400`. Pinned by `login_401_for_whitespace_only_password`.
2. JSON body whose fields are not strings (`{"email":123,"password":["x"]}`): `400` with field errors, never `500`. Pinned by `non_string_fields_report_field_errors`.
3. `Authorization: Bearer ` with an empty token: `401 Unauthorized`. Pinned by `me_401_with_empty_bearer_token`.
4. A validly signed token whose user no longer exists: `401`. Pinned by `me_401_when_user_no_longer_exists`.
5. Body over 10kb: `413 { "error": "Request too large" }`, not `500`. Pinned by `login_413_for_oversized_body`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Root workspace (`backend` only for now), `typecheck` and `lint` scripts, shared dev dependencies |
| `tsconfig.json` | `checkJs` type checking for `backend/src` and `backend/test` |
| `eslint.config.js` | Flat config, recommended JS rules, Node and Bun globals |
| `bunfig.toml` | Bun test settings (no preload yet) |
| `.gitignore` | `node_modules`, `dist`, `.env` |
| `backend/package.json` | Backend dependencies and scripts |
| `backend/.env.example` | `PORT`, `CORS_ORIGIN`, `JWT_SECRET` |
| `backend/src/config.js` | `loadConfig`, `DEV_JWT_SECRET` |
| `backend/src/users.js` | Seeded in-memory user store with bcrypt verification |
| `backend/src/validation.js` | `parseLoginBody` |
| `backend/src/auth.js` | `signToken`, `requireAuth` |
| `backend/src/routes/auth.js` | `createAuthRouter` |
| `backend/src/app.js` | `createApp` with CORS, JSON parsing, error handler |
| `backend/src/server.js` | Process entry point |
| `backend/test/*.test.js` | One test file per source module, plus `auth.test.js` for the HTTP API |
| `README.md` | Backend run instructions, env vars, test users, checks |

### Task 1: Root tooling and backend config

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `bunfig.toml`, `.gitignore`, `backend/package.json`, `backend/.env.example`, `backend/src/config.js`
- Test: `backend/test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadConfig(env = process.env): { nodeEnv: string, port: number, corsOrigin: string, jwtSecret: string, jwtExpiresIn: string }` and `DEV_JWT_SECRET: string`, both exported from `backend/src/config.js`.

- [ ] **Step 1: Read the references.** Read spec sections "Repo layout and tooling" and "Backend configuration", and `docs/requirements/login.md` (Security baseline).

- [ ] **Step 2: Write the failing tests** in `backend/test/config.test.js`:

```js
import { describe, it, expect } from "bun:test";
import { loadConfig, DEV_JWT_SECRET } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults_apply_when_env_empty", () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: "development",
      port: 4000,
      corsOrigin: "http://localhost:5173",
      jwtSecret: DEV_JWT_SECRET,
      jwtExpiresIn: "1h",
    });
  });

  it("env_overrides_defaults", () => {
    const config = loadConfig({ PORT: "5000", CORS_ORIGIN: "http://example.test", JWT_SECRET: "s3cret" });
    expect(config.port).toBe(5000);
    expect(config.corsOrigin).toBe("http://example.test");
    expect(config.jwtSecret).toBe("s3cret");
  });

  it("production_without_jwt_secret_throws", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("JWT_SECRET must be set in production");
  });

  it("production_with_dev_secret_throws", () => {
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: DEV_JWT_SECRET })).toThrow(
      "JWT_SECRET must be set in production",
    );
  });
});
```

- [ ] **Step 3: Run to verify failure.** Run `bun test backend/test/config.test.js` from the repo root. Expected: fails with `Cannot find module '../src/config.js'`.

- [ ] **Step 4: Implement `loadConfig` and `DEV_JWT_SECRET` in `backend/src/config.js`.** Signature as in Interfaces; `port` is `Number(env.PORT ?? 4000)`; throw `new Error("JWT_SECRET must be set in production")` when `nodeEnv === "production"` and the secret is unset or equals `DEV_JWT_SECRET`.

- [ ] **Step 5: Scaffold the workspace and install.**
  - `package.json`: `"private": true`, `"type": "module"`, `"workspaces": ["backend"]`, scripts `"typecheck": "tsc --noEmit"` and `"lint": "eslint ."`. Dev dependencies: `typescript`, `eslint`, `@eslint/js`, `globals`, `@types/bun`, `@types/node`, `@types/express`, `@types/cors`, `@types/jsonwebtoken`, `@types/supertest`.
  - `tsconfig.json`: `target` `es2022`, `module` `esnext`, `moduleResolution` `bundler`, `allowJs`, `checkJs`, `noEmit`, `skipLibCheck`, `strict` false, `types` `["bun"]`, `include` `["backend/src", "backend/test"]`.
  - `eslint.config.js`: flat config exporting `@eslint/js` recommended plus a block setting `languageOptions.globals` to `globals.node`, ignoring `**/dist` and `**/node_modules`.
  - `bunfig.toml`: a `[test]` table with no preload (plan 02 adds it).
  - `.gitignore`: `node_modules`, `dist`, `.env`.
  - `backend/package.json`: `"type": "module"`, dependencies `express`, `jsonwebtoken`, `bcryptjs`, `cors`, `zod`, dev dependency `supertest`, scripts `"start": "node src/server.js"`, `"dev": "node --watch src/server.js"`, `"test": "bun test"`.
  - `backend/.env.example`: `PORT=4000`, `CORS_ORIGIN=http://localhost:5173`, `JWT_SECRET=change-me`.
  - Run `bun install` at the repo root.

- [ ] **Step 6: Verify.** Run `bun test`, `bun run typecheck`, `bun run lint` from the repo root. Expected: 4 tests pass, typecheck and lint exit 0.

### Task 2: User store and validation

**Files:**
- Create: `backend/src/users.js`, `backend/src/validation.js`
- Test: `backend/test/users.test.js`, `backend/test/validation.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the installed dependencies.
- Produces, from `backend/src/users.js`: `SEED_USERS: { id: string, email: string, password: string }[]` and `createUserStore(seed = SEED_USERS): Promise<UserStore>` where `UserStore = { findByEmail(email: string): User | undefined, findById(id: string): User | undefined, verifyPassword(user: User | undefined, password: string): Promise<boolean> }` and `User = { id: string, email: string, passwordHash: string }`. From `backend/src/validation.js`: `parseLoginBody(body: unknown): { ok: true, data: { email: string, password: string } } | { ok: false, fields: { email?: string, password?: string } }`.

- [ ] **Step 1: Read the references.** Read spec sections "User store" and "Validation" (messages are exact).

- [ ] **Step 2: Write the failing tests.** `users.test.js` example, built once in `beforeAll` with `store = await createUserStore()`:

```js
it("verify_password_true_for_correct_password", async () => {
  const user = store.findByEmail("alice@example.com");
  expect(await store.verifyPassword(user, "Password123!")).toBe(true);
});
```

| Test | Inputs | Assertions |
|------|--------|------------|
| `seed_users_are_stored_as_bcrypt_hashes` | `store.findByEmail("alice@example.com")` | `passwordHash` starts with `"$2"` and does not contain `"Password123!"`; user has no `password` property |
| `verify_password_false_for_wrong_password` | alice, `"Password999!"` | `false` |
| `verify_password_false_for_unknown_user` | `undefined`, `"Password123!"` | `false` |
| `find_by_id_returns_seeded_user` | `store.findById("2")` | email is `"bob@example.com"` |

`validation.test.js` example:

```js
it("normalizes_email_case_and_whitespace", () => {
  expect(parseLoginBody({ email: "  Alice@Example.COM ", password: "Password123!" })).toEqual({
    ok: true,
    data: { email: "alice@example.com", password: "Password123!" },
  });
});
```

| Test | Input body | Expected result |
|------|------------|-----------------|
| `rejects_invalid_email_format` | `{ email: "not-an-email", password: "Password123!" }` | `{ ok: false, fields: { email: "Enter a valid email address" } }` |
| `rejects_password_under_8_characters` | `{ email: "a@b.co", password: "short" }` | `{ ok: false, fields: { password: "Password must be at least 8 characters" } }` |
| `reports_both_fields_for_missing_body` | `undefined` | `{ ok: false, fields: { email: "Email is required", password: "Password is required" } }` |
| `does_not_trim_password` | `{ email: "a@b.co", password: "  pass  " }` | `ok` true, `data.password` is `"  pass  "` |
| `non_string_fields_report_field_errors` | `{ email: 123, password: ["x"] }` | `ok` false, `fields.email` and `fields.password` both set |

- [ ] **Step 3: Run to verify failure.** Run `bun test backend/test/users.test.js backend/test/validation.test.js`. Expected: fails with `Cannot find module '../src/users.js'` and `'../src/validation.js'`.

- [ ] **Step 4: Implement `backend/src/users.js`.** Seed users: `{ id: "1", email: "alice@example.com", password: "Password123!" }`, `{ id: "2", email: "bob@example.com", password: "Password456!" }`. Hash with `bcryptjs` cost 10, keep only hashes, build one dummy hash at creation; `verifyPassword(undefined, pw)` compares against the dummy hash and returns `false`.

- [ ] **Step 5: Implement `backend/src/validation.js`.** Use a `zod` schema: email is a string, trimmed, lowercased, `.email()`; password is a string with `.min(8)`, untrimmed. Map zod issues to the exact spec messages (`"Email is required"` for a missing or non-string email, `"Password is required"` likewise). Treat a non-object body as `{}`.

- [ ] **Step 6: Run to verify pass.** Run `bun test` from the repo root. Expected: 15 pass (4 config, 5 users, 6 validation); `bun run typecheck` and `bun run lint` exit 0.

### Task 3: Auth helpers, routes, app, server, README

**Files:**
- Create: `backend/src/auth.js`, `backend/src/routes/auth.js`, `backend/src/app.js`, `backend/src/server.js`
- Modify: `README.md`
- Test: `backend/test/auth.test.js`

**Interfaces:**
- Consumes: `loadConfig`, `createUserStore`, `parseLoginBody` as defined in Tasks 1 and 2.
- Produces: `signToken(user: { id, email }, config): string`; `requireAuth({ config, userStore }): RequestHandler` setting `req.user = { id, email }`; `createAuthRouter({ config, userStore }): Router`; `createApp({ config, userStore }): Express`.

- [ ] **Step 1: Read the references.** Read spec sections "Auth helpers and routes", "App and server" and "Error handling and edge cases".

- [ ] **Step 2: Write the failing tests** in `backend/test/auth.test.js`. Setup in `beforeAll`: `config = loadConfig({})`, `userStore = await createUserStore()`, `app = createApp({ config, userStore })`. Example:

```js
it("login_success_returns_token_and_user", async () => {
  const res = await request(app).post("/api/auth/login").send({ email: "alice@example.com", password: "Password123!" });
  expect(res.status).toBe(200);
  expect(res.body.user).toEqual({ id: "1", email: "alice@example.com" });
  const payload = jwt.verify(res.body.token, config.jwtSecret, { algorithms: ["HS256"] });
  expect(payload.sub).toBe("1");
  expect(payload.exp - payload.iat).toBe(3600);
});
```

Remaining tests, using a `loginToken()` helper that logs in as alice:

| Test | Request | Assertions |
|------|---------|------------|
| `login_accepts_mixed_case_email` | login `"Alice@Example.com"` | 200, `user.email` `"alice@example.com"` |
| `login_400_names_invalid_fields` | `{ email: "nope", password: "short" }` | 400, `body.error` `"Validation failed"`, `body.fields` has `email` and `password` |
| `login_401_wrong_password` | alice, `"Password999!"` | 401, body `{ error: "Invalid email or password" }` |
| `login_401_unknown_email_has_identical_body` | `nobody@example.com`, `"Password123!"` | 401, body equals the wrong-password body |
| `login_401_for_whitespace_only_password` | alice, `"        "` | 401, same generic body |
| `login_400_on_malformed_json` | raw body `{bad`, `Content-Type: application/json` | 400, `{ error: "Invalid JSON body" }` |
| `login_413_for_oversized_body` | password of 20000 `"a"` characters | 413, `{ error: "Request too large" }` |
| `me_returns_user_for_valid_token` | `GET /api/auth/me` with the login token | 200, `{ user: { id: "1", email: "alice@example.com" } }` |
| `me_401_without_header` | no header | 401, `{ error: "Unauthorized" }` |
| `me_401_with_wrong_scheme` | `Authorization: Basic abc` | 401 |
| `me_401_with_empty_bearer_token` | `Authorization: Bearer ` | 401 |
| `me_401_with_tampered_token` | valid token with the last signature character changed | 401 |
| `me_401_with_expired_token` | `jwt.sign({ sub: "1", email: "alice@example.com" }, config.jwtSecret, { expiresIn: -10 })` | 401 |
| `me_401_with_alg_none_token` | `base64url(header {"alg":"none","typ":"JWT"}) + "." + base64url(payload {"sub":"1","email":"alice@example.com"}) + "."` | 401 |
| `me_401_when_user_no_longer_exists` | token signed with `config.jwtSecret` and `sub: "999"` | 401 |
| `cors_allows_configured_origin` | login with `Origin: http://localhost:5173` | header `access-control-allow-origin` equals `http://localhost:5173` |
| `cors_omits_header_for_other_origin` | login with `Origin: http://evil.test` | no `access-control-allow-origin` header |
| `responses_never_contain_password_or_hash` | successful and failed login | `JSON.stringify(res.body)` contains neither `"Password123!"` nor `"$2"` |

- [ ] **Step 3: Run to verify failure.** Run `bun test backend/test/auth.test.js`. Expected: fails with `Cannot find module '../src/app.js'`.

- [ ] **Step 4: Implement `signToken` and `requireAuth` in `backend/src/auth.js`.** `signToken` signs `{ sub: user.id, email: user.email }` with `config.jwtSecret`, `algorithm: "HS256"`, `expiresIn: config.jwtExpiresIn`. `requireAuth` parses the `Bearer` scheme, verifies with `algorithms: ["HS256"]`, loads the user with `userStore.findById(sub)`, and answers `401 { "error": "Unauthorized" }` on any failure.

- [ ] **Step 5: Implement `createAuthRouter` in `backend/src/routes/auth.js`.** `POST /login`: `parseLoginBody`; on failure `400 { error: "Validation failed", fields }`; look up the user, call `userStore.verifyPassword` (always, even for an unknown user); on false `401 { error: "Invalid email or password" }`; on true `200 { token, user: { id, email } }`. `GET /me` runs `requireAuth` then answers `200 { user: req.user }`.

- [ ] **Step 6: Implement `createApp` in `backend/src/app.js`.** Middleware order: `cors({ origin: config.corsOrigin })`, `express.json({ limit: "10kb" })`, router at `/api/auth`, error handler. The error handler maps `err.type === "entity.parse.failed"` to `400 { error: "Invalid JSON body" }`, `err.type === "entity.too.large"` to `413 { error: "Request too large" }`, anything else to `500 { error: "Internal server error" }`. It never logs request bodies.

- [ ] **Step 7: Implement `backend/src/server.js`.** Call `loadConfig()`, `await createUserStore()`, `createApp(...)`, listen on `config.port`, log only the port.

- [ ] **Step 8: Run to verify pass.** Run `bun test`, `bun run typecheck`, `bun run lint` from the repo root. Expected: 34 tests pass (4 config, 5 users, 6 validation, 19 auth), typecheck and lint exit 0.

- [ ] **Step 9: Smoke-test the server on Node.** Run `node backend/src/server.js` in the background, then `curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"Password123!"}'`. Expected: JSON with `token` and `user`. Stop the server.

- [ ] **Step 10: Update `README.md`.** Replace the placeholder with sections: project overview, how to run the backend (`bun install`, `cd backend && npm run dev` or `node src/server.js`), the env vars table, the seeded test users with their passwords (`alice@example.com` / `Password123!`, `bob@example.com` / `Password456!`), and the three root checks. Leave a "Frontend" heading for plan 02 to fill.

Next plan: docs/superpowers/plans/2026-10-30-login/plan-02-login.md
