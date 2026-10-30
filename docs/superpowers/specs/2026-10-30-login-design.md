# Login feature design

## Goal

Build a new Node/Express backend with a login API and a new React frontend with a login screen, so a user can log in with email and password, reload the page and stay logged in, and log out.

## Overview

`docs/requirements/login.md` describes a login POC for a new web app: `POST /api/auth/login`, `GET /api/auth/me`, JWT sessions, a centered login card and a placeholder welcome page. No code exists yet, so this spec fixes the stack, the file layout, the contracts and the edge cases, so a builder needs no further questions.

One conflict in the requirements is resolved here. The requirements keep the token in memory and also require that a refresh keeps the user logged in. A memory-only token cannot survive a refresh, so the token is stored in `sessionStorage`.

## Current state

| Area | Today | Source |
|------|-------|--------|
| Backend | Does not exist | repo root holds only `README.md` and `docs/` |
| Frontend | Does not exist | same |
| Requirements | Endpoints, validation rules, UI behaviour, acceptance criteria | `docs/requirements/login.md` |
| README | Contains the single word `requirements` after the title | `README.md` |

Gaps the requirements leave open: where the token lives across a refresh, how test users are seeded, repo layout and tooling, configuration, how an expired token is handled, and email case handling. The Design section settles each.

## Non-goals

- Signup, password reset, email verification, multi-factor auth, remember-me, account lockout, social login (all from the requirements).
- A real database or persistence across server restarts.
- TypeScript, a client-side router, end-to-end browser tests.
- Refresh tokens, token revocation, rate limiting.

## Design

Flow:

```
LoginForm --validate--> api.login --POST /api/auth/login--> Express
   Express: zod validate -> userStore.findByEmail -> bcrypt compare -> jwt.sign (1h)
   <-- { token, user } -- store token in sessionStorage -- show WelcomePage
Reload: token in sessionStorage -> api.me --GET /api/auth/me (Bearer)--> user or 401
```

### 1. Repo layout and tooling

A Bun workspace with a root `package.json` and two packages, each with its own `package.json`, in plain JavaScript (ES modules, `"type": "module"`). The project's checks run at the repo root: `bun run typecheck`, `bun run lint`, `bun test`.

- Root: `package.json` with `"workspaces": ["backend", "frontend"]` and scripts `typecheck` (`tsc --noEmit`) and `lint` (`eslint .`). Dev dependencies: `typescript`, `eslint`, `@eslint/js`, `eslint-plugin-react`, `globals`, `@types/react`, `@types/react-dom`, `@types/express`, `@types/bun`. `tsconfig.json` sets `allowJs`, `checkJs`, `noEmit`, `jsx: "react-jsx"` and includes `backend/src`, `backend/test`, `frontend/src`. `eslint.config.js` uses the flat config with the recommended JS and React rules. `bunfig.toml` sets `[test] preload = ["./frontend/test-setup.js"]`.
- `backend/`: Node, Express, `jsonwebtoken`, `bcryptjs`, `cors`, `zod`; dev dependency `supertest`. Scripts: `start`, `dev` (`node --watch src/server.js`), `test` (`bun test`). The code runs on Node; only the tests run on Bun.
- `frontend/`: React 18 with Vite; dev dependencies `happy-dom`, `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`. Scripts: `dev`, `build`, `test` (`bun test`). `frontend/test-setup.js` registers happy-dom globals, extends `expect` with the jest-dom matchers and runs RTL `cleanup` after each test.
- All tests import `describe`, `it`, `expect`, `mock`, `spyOn` from `bun:test`. A test that mocks `fetch` uses `spyOn(globalThis, "fetch")`.
- The preload registers a DOM for every test file, including backend ones, which is harmless for them.

### 2. Backend configuration (`backend/src/config.js`)

`loadConfig(env = process.env)` returns `{ nodeEnv, port, corsOrigin, jwtSecret, jwtExpiresIn }`.

| Setting | Env var | Default |
|---------|---------|---------|
| port | `PORT` | `4000` |
| corsOrigin | `CORS_ORIGIN` | `http://localhost:5173` |
| jwtSecret | `JWT_SECRET` | `DEV_JWT_SECRET` (`"dev-only-insecure-secret"`) |
| jwtExpiresIn | none | `"1h"` |
| nodeEnv | `NODE_ENV` | `"development"` |

When `nodeEnv` is `"production"` and `jwtSecret` is unset or equals `DEV_JWT_SECRET`, `loadConfig` throws `Error("JWT_SECRET must be set in production")`. `backend/.env.example` lists `PORT`, `CORS_ORIGIN`, `JWT_SECRET`. The server does not load `.env` files itself.

### 3. User store (`backend/src/users.js`)

```js
export async function createUserStore(seed = SEED_USERS): Promise<UserStore>
// UserStore: { findByEmail(email): User | undefined, findById(id): User | undefined,
//              verifyPassword(user | undefined, password): Promise<boolean> }
// User: { id: string, email: string, passwordHash: string }
```

`SEED_USERS` holds `{ id: "1", email: "alice@example.com", password: "Password123!" }` and `{ id: "2", email: "bob@example.com", password: "Password456!" }`. `createUserStore` hashes each password with bcrypt cost 10 and keeps only hashes. It also builds one dummy hash. `verifyPassword(undefined, pw)` compares against the dummy hash and returns `false`, so an unknown email costs the same time as a wrong password. `findByEmail` expects an already-normalized email. Plaintext passwords exist only in `SEED_USERS` and the README.

### 4. Validation (`backend/src/validation.js`)

```js
export function parseLoginBody(body): { ok: true, data: { email, password } }
                                     | { ok: false, fields: { email?: string, password?: string } }
```

- `email`: required string, trimmed and lowercased, must be a valid email (`zod` `.email()`). Messages: `"Email is required"`, `"Enter a valid email address"`.
- `password`: required string, not trimmed, at least 8 characters. Messages: `"Password is required"`, `"Password must be at least 8 characters"`.
- A missing or non-object body reports both fields.

### 5. Auth helpers and routes

`backend/src/auth.js`:

```js
export function signToken(user, config): string           // payload { sub: user.id, email }, HS256, expiresIn config.jwtExpiresIn
export function requireAuth({ config, userStore }): RequestHandler
```

`requireAuth` reads `Authorization: Bearer <token>`, verifies with `algorithms: ["HS256"]`, looks the user up by `sub`, and sets `req.user = { id, email }`. A missing header, wrong scheme, bad signature, expired token or unknown user gives `401 { "error": "Unauthorized" }`.

`backend/src/routes/auth.js` exports `createAuthRouter({ config, userStore })`:

| Request | Response |
|---------|----------|
| `POST /login`, valid and correct credentials | `200 { "token": "<jwt>", "user": { "id": "1", "email": "alice@example.com" } }` |
| `POST /login`, invalid body | `400 { "error": "Validation failed", "fields": { "email": "...", "password": "..." } }`, only invalid fields listed |
| `POST /login`, unknown email or wrong password | `401 { "error": "Invalid email or password" }`, identical for both |
| `GET /me`, valid token | `200 { "user": { "id": "1", "email": "alice@example.com" } }` |
| `GET /me`, anything else | `401 { "error": "Unauthorized" }` |

### 6. App and server (`backend/src/app.js`, `backend/src/server.js`)

`createApp({ config, userStore })` returns an Express app. Middleware order: `cors({ origin: config.corsOrigin })`, `express.json({ limit: "10kb" })`, router mounted at `/api/auth`, an error handler. The error handler maps a malformed JSON body to `400 { "error": "Invalid JSON body" }`, an oversized body (`err.type === "entity.too.large"`) to `413 { "error": "Request too large" }`, and any other error to `500 { "error": "Internal server error" }`. Passwords and request bodies are never logged. `server.js` calls `loadConfig`, `createUserStore`, `createApp`, then listens on `config.port`. A request from another origin gets no `Access-Control-Allow-Origin` header.

### 7. Frontend structure (`frontend/src`)

No router. `App` renders one of three views from auth state.

- `main.jsx`: mounts `<AuthProvider><App /></AuthProvider>`.
- `config.js`: `API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000"`. `frontend/.env.example` lists `VITE_API_URL`.
- `validation.js`: `normalizeEmail(email)`, `validateEmail(email)`, `validatePassword(password)`, each returning an error string or `""`. The rules and messages match section 4.
- `storage.js`: `getToken()`, `setToken(token)`, `clearToken()` over `sessionStorage` key `login-poc.token`. Every call is wrapped in try/catch and falls back to no-op or `null`.
- `api.js`: `login({ email, password })` and `me(token)`. Failures throw `ApiError { status, fields? }`. A network failure throws `ApiError` with `status: 0`.
- `auth/AuthContext.jsx`: provides `{ status, user, notice, login, logout, retry }`. `status` is `"loading"`, `"anonymous"` or `"authenticated"`.
- `components/LoginPage.jsx`, `components/PasswordField.jsx`, `components/WelcomePage.jsx`, `styles.css`.

### 8. Session behaviour

- On mount: no token gives `anonymous`. A token gives `loading`, then `me(token)`.
- `me` succeeds: `authenticated`.
- `me` returns 401: `clearToken()`, `anonymous`, no message.
- `me` fails with status 0 or 5xx: `anonymous`, token kept, `notice` set to `"Can't reach server"`. The login page shows the notice with a Retry button that calls `retry()`, which re-runs the restore.
- `logout()`: `clearToken()`, `user` null, `anonymous`.
- While `loading`, the app shows a plain "Loading…" text, not the login form.

### 9. Login screen behaviour

- Fields: email (`type="email"`, `autocomplete="username"`) and password (`autocomplete="current-password"`) with a show/hide toggle button (`aria-pressed`, label "Show password" or "Hide password"). The password toggles between `type="password"` and `type="text"`.
- Submit: trim and lowercase the email, run both validators. If either fails, show inline error text under that field and send no request.
- While the request is in flight the button is disabled and shows a spinner with "Signing in…". Inputs are disabled too.
- 200: store the token, set the user, show `WelcomePage`.
- 401: show one form-level message `"Invalid email or password"` above the submit button. No field error.
- 400 with `fields`: show the server messages inline under those fields.
- Status 0 or 5xx: form-level message `"Something went wrong. Please try again."`
- Errors clear for a field when the user edits it. Field errors use `aria-invalid` and `aria-describedby`; form-level messages use `role="alert"`.
- `WelcomePage` shows `Welcome, {email}` and a Logout button.

### 10. Visual design (`styles.css`)

Clean and minimal. Tokens on `:root`: `--bg`, `--surface`, `--text`, `--muted`, `--primary`, `--primary-hover`, `--danger`, `--border`, `--radius` (12px), `--space-*` scale. A `prefers-color-scheme: dark` block redefines the color tokens. A system font stack is used. The card is centered on the page, `max-width: 400px`, with a soft shadow and generous padding. Errors are red (`--danger`) with a red input border. The primary button is visibly dimmed with a spinner while loading. Inputs show a visible focus ring. At widths under 480px the card fills the width with a 16px gutter.

## Error handling and edge cases

| Case | Behaviour |
|------|-----------|
| `Alice@Example.com ` as email | Trimmed and lowercased on client and server; logs in as `alice@example.com` |
| Unknown email | `401 Invalid email or password`; bcrypt still runs against the dummy hash |
| Password of 7 characters | Client blocks it; server returns `400` with `fields.password` |
| Password with leading or trailing spaces | Not trimmed; compared as typed |
| Missing, non-JSON or empty body | `400` (missing body lists both fields; bad JSON gives `Invalid JSON body`) |
| Body over 10kb | `express.json` rejects it with status 413; the error handler returns that status with `{ "error": "Request too large" }` |
| `/me` with expired or tampered token | `401 Unauthorized` |
| `/me` token signed with `alg: none` | `401` (algorithms pinned to HS256) |
| Request from another origin | No `Access-Control-Allow-Origin` header |
| Production start without `JWT_SECRET` | `loadConfig` throws |
| Stored token expired on reload | `me` returns 401, token cleared, login screen, no message |
| Server down on reload | Login screen with "Can't reach server" and Retry; token kept |
| `sessionStorage` unavailable | Storage helpers no-op; the user logs in again after a refresh |
| Double click on submit | Second click ignored: button disabled while in flight |

## Testing

All tests use Bun's runner (`bun:test`). Commands, from the repo root: `bun test` (every suite), `bun run typecheck`, `bun run lint`. A single package: `cd backend && bun test` or `cd frontend && bun test`.

Backend (`backend/test/`):

- `config.test.js`: `defaults_apply_when_env_empty`; `production_without_jwt_secret_throws`; `production_with_dev_secret_throws`.
- `users.test.js`: `seed_users_are_stored_as_bcrypt_hashes`; `verify_password_true_for_correct_password`; `verify_password_false_for_wrong_password`; `verify_password_false_for_unknown_user`.
- `validation.test.js`: `normalizes_email_case_and_whitespace`; `rejects_invalid_email_format`; `rejects_password_under_8_characters`; `reports_both_fields_for_missing_body`; `does_not_trim_password`.
- `auth.test.js` (supertest against `createApp`): `login_success_returns_token_and_user`; `login_accepts_mixed_case_email`; `login_400_names_invalid_fields`; `login_401_wrong_password`; `login_401_unknown_email_has_identical_body`; `login_400_on_malformed_json`; `me_returns_user_for_valid_token`; `me_401_without_header`; `me_401_with_wrong_scheme`; `me_401_with_tampered_token`; `me_401_with_expired_token`; `me_401_with_alg_none_token`; `cors_allows_configured_origin`; `cors_omits_header_for_other_origin`; `responses_never_contain_password_or_hash`.

Frontend (`frontend/src/**/*.test.jsx`, `fetch` mocked):

- `validation.test.js`: `email_format_errors`; `password_length_error`; `normalize_email_trims_and_lowercases`.
- `storage.test.js`: `round_trips_token`; `clear_removes_token`; `survives_storage_throwing`.
- `LoginPage.test.jsx`: `shows_inline_errors_and_sends_no_request_when_invalid`; `disables_button_and_shows_loading_while_in_flight`; `shows_generic_message_on_401_not_under_a_field`; `maps_400_fields_to_inline_errors`; `shows_retryable_message_on_network_error`; `password_toggle_switches_input_type`; `successful_login_shows_welcome_with_email`.
- `AuthContext.test.jsx` (through `App`): `restores_session_from_stored_token`; `clears_token_and_shows_login_on_401_from_me`; `keeps_token_and_shows_notice_when_server_unreachable`; `retry_restores_session_after_outage`; `logout_clears_token_and_returns_to_login`; `no_token_skips_me_call`.

## Files changed

New files:

- `package.json`, `tsconfig.json`, `eslint.config.js`, `bunfig.toml`
- `frontend/test-setup.js`
- `backend/package.json`, `backend/.env.example`
- `backend/src/config.js`, `users.js`, `validation.js`, `auth.js`, `app.js`, `server.js`, `routes/auth.js`
- `backend/test/config.test.js`, `users.test.js`, `validation.test.js`, `auth.test.js`
- `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.js`, `frontend/.env.example`
- `frontend/src/main.jsx`, `App.jsx`, `config.js`, `validation.js`, `storage.js`, `api.js`, `styles.css`, `auth/AuthContext.jsx`, `components/LoginPage.jsx`, `components/PasswordField.jsx`, `components/WelcomePage.jsx`, plus the test files listed above and a test setup file
- `.gitignore` (`node_modules`, `dist`, `.env`)

Modified: `README.md` (how to run both apps, test users and their passwords, env vars).

## Constraints

- Passwords are bcrypt-hashed before storage; no plaintext in logs, errors or API responses.
- Login failure messages never reveal whether the email or the password was wrong.
- CORS allows only `CORS_ORIGIN`.
- The token goes in `sessionStorage` and is sent as `Authorization: Bearer <token>`.
- No new runtime dependency beyond those named in section 1.

## Acceptance criteria

- `POST /api/auth/login` with correct credentials returns `200` with `token` and `user`, and the token expires after 1 hour.
- Invalid input returns `400` naming the invalid fields; wrong credentials return `401` with one generic message for unknown email and wrong password.
- `GET /api/auth/me` returns the user for a valid token and `401` for a missing, expired, tampered or `alg: none` token.
- Emails are trimmed and lowercased on client and server.
- Passwords are stored only as bcrypt hashes and never appear in responses.
- CORS answers only the configured origin.
- The server refuses to start in production without a real `JWT_SECRET`.
- A user with correct credentials logs in and reaches the welcome page showing their email.
- A user with wrong credentials sees "Invalid email or password" near the form and stays on the login screen.
- A bad email format or a short password is caught client-side with inline errors and no API call.
- The submit button is disabled and shows a loading state while the request is in flight.
- The password field has a working show/hide toggle.
- Refreshing the welcome page keeps the user logged in via `GET /api/auth/me`.
- An expired token on reload returns the user to the login screen silently; an unreachable server shows "Can't reach server" with a working Retry and keeps the token.
- Logout clears the token and returns to the login screen.
- The styling is a centered card using CSS-variable tokens, with a dark-mode variant and distinct error, loading and disabled states.
- `bun run typecheck`, `bun run lint` and `bun test` all pass from the repo root, and `bun test` runs the backend and frontend suites.
- The README explains how to run both apps and the three checks.

## Out of scope

Signup, password reset, email verification, MFA, remember-me, lockout, social login, databases, TypeScript, routing, end-to-end tests, deployment.

## Decisions

- Where does the token live so a refresh keeps the user logged in? Options: sessionStorage, localStorage, httpOnly cookie, memory only. Chosen: sessionStorage. Decided by: user
- Is signup in scope, and how are users seeded? Options: two hard-coded users in memory, JSON/env seed, signup endpoint and screen, SQLite. Chosen: no signup, two hard-coded users bcrypt-hashed at startup in an in-memory store. Decided by: user
- What are the repo layout and tooling? Options: backend/ and frontend/ in plain JS, the same in TypeScript, npm workspaces, single package. Chosen: backend/ (Node, Express, plain JS) and frontend/ (React with Vite, plain JS, per the recommended option). Decided by: user
- How is the frontend styled? Options: plain CSS with variable tokens, Tailwind, component library, CSS Modules. Chosen: hand-written plain CSS with design tokens as CSS variables. Decided by: user
- How are ports, the JWT secret and the CORS origin configured? Options: env vars with dev defaults, hard-coded, env vars without defaults, Vite dev proxy. Chosen: env vars with dev defaults (PORT 4000, CORS_ORIGIN http://localhost:5173, JWT_SECRET dev default that is refused in production, VITE_API_URL default http://localhost:4000, .env.example, no proxy). Decided by: user
- How are expired tokens and email matching handled? Options: silent clear on 401 only with normalized emails and a dummy-hash compare, clear on any failure, case-sensitive with no dummy hash, show a session-expired message. Chosen: on 401 from /me clear the token silently; on network or 5xx keep the token and show a small "Can't reach server" notice; trim and lowercase emails on client and server; always run bcrypt compare with a dummy hash for unknown emails. Decided by: user
- How much automated testing? Options: focused backend and frontend tests, backend only, plus Playwright, minimal smoke. Chosen: focused tests on both sides, no browser end-to-end tests. Decided by: user
- How do the project's root checks (`bun run typecheck`, `bun run lint`, `bun test`) work? Options: Bun's test runner everywhere with a root workspace, Vitest with root scripts, Vitest with the registry checks changed. Chosen: Bun's test runner everywhere (`bun:test`, happy-dom preload via `bunfig.toml`), a root workspace `package.json` with `typecheck` (tsc with checkJs) and `lint` (ESLint). Decided by: user
- Navigation after login? Chosen: state-based view switch with no router, since there are only two views. Decided by: call
- Retry control for an unreachable server on reload? Chosen: a Retry button on the notice. Decided by: call
- Backend module system and bcrypt library? Chosen: ES modules and `bcryptjs` (pure JS, no native build). Decided by: call
- Which document wins? Chosen: this spec supersedes `docs/requirements/login.md`, which stays in the repo as background. Decided by: call
- After an outage on reload, how does the user continue? Chosen: the login form shows with the notice and Retry; a successful login or a successful Retry replaces the kept token. Decided by: call
- How does the client check email format without zod? Chosen: a simple regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); the server stays the authority and its `400` fields are shown inline when the two differ. Decided by: call
- Oversized request bodies? Chosen: 10kb JSON limit, answered with 413. Decided by: call
