# Login Frontend Implementation Plan

> **Executor:** the factory driver runs this plan using superpowers:subagent-driven-development, with one fresh factory-builder implementer per task and no per-task review. The driver keeps the ledger, makes the commits and runs the final review.

**Goal:** Build the React login UI (login card, welcome page, session restore, logout) against the backend from plan 01.

**Architecture:** A Vite React app in `frontend/` with no router. Small pure modules (`validation`, `storage`, `api`) feed a `LoginPage` component that takes its submit handler as a prop, and an `AuthProvider` that owns session state (`loading`, `anonymous`, `authenticated`). `App` picks the view from that state. Tests run on `bun:test` with happy-dom and React Testing Library.

**Tech Stack:** React 18, Vite, plain CSS with variable tokens, Bun test runner, happy-dom, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-10-30-login-design.md`

## Global Constraints

- Plain JavaScript and JSX, ES modules; no router, no UI library, no CSS framework.
- The token is stored in `sessionStorage` under key `login-poc.token` and sent as `Authorization: Bearer <token>`; every storage call is wrapped in try/catch.
- `API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000"`.
- Validation messages are exact: `"Email is required"`, `"Enter a valid email address"`, `"Password is required"`, `"Password must be at least 8 characters"`. The client email check is `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; the password is never trimmed; the email is trimmed and lowercased.
- Form-level messages: `"Invalid email or password"` on 401, `"Something went wrong. Please try again."` on status 0 or 5xx. Reload notice: `"Can't reach server"` with a Retry button.
- Submit button label `Sign in`, loading label `Signing in…`; password toggle names `Show password` / `Hide password` with `aria-pressed`.
- Field errors use `aria-invalid` and `aria-describedby`; form-level messages use `role="alert"`.
- Styling: tokens on `:root` (`--bg`, `--surface`, `--text`, `--muted`, `--primary`, `--primary-hover`, `--danger`, `--border`, `--radius` 12px, `--space-*`), a `prefers-color-scheme: dark` override, card `max-width: 400px`, 16px gutter under 480px.
- Root checks must pass from the repo root: `bun run typecheck`, `bun run lint`, `bun test`. Tests import from `bun:test`.

## Review Focus

1. Enter pressed again while a login is in flight: only one request is sent. Pinned by `ignores_second_submit_while_in_flight`.
2. Email typed as `" Alice@Example.COM "`: the API receives `alice@example.com`. Pinned by `submits_normalized_email`.
3. `sessionStorage` throws during login: the user still reaches the welcome page. Pinned by `login_succeeds_when_storage_throws`.
4. Retry pressed while the server is still down: the notice stays and the token is kept. Pinned by `retry_keeps_notice_when_still_down`.
5. A 5xx (not only a network failure) from `/me` on load: token kept, notice shown. Pinned by `keeps_token_and_shows_notice_on_5xx_from_me`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` (modify) | Add `frontend` to workspaces |
| `tsconfig.json` (modify) | Include `frontend/src` and `frontend/test-setup.js`, add `vite/client` and DOM lib |
| `eslint.config.js` (modify) | Add React plugin rules and browser globals for `frontend/` |
| `bunfig.toml` (modify) | Preload `./frontend/test-setup.js` |
| `frontend/package.json` | Frontend dependencies and scripts |
| `frontend/index.html`, `vite.config.js`, `.env.example` | Vite entry, config, `VITE_API_URL` |
| `frontend/test-setup.js` | happy-dom registration, jest-dom matchers, RTL cleanup |
| `frontend/src/config.js` | `API_URL` |
| `frontend/src/validation.js` | `normalizeEmail`, `validateEmail`, `validatePassword` |
| `frontend/src/storage.js` | `getToken`, `setToken`, `clearToken` |
| `frontend/src/api.js` | `login`, `me`, `ApiError` |
| `frontend/src/components/PasswordField.jsx` | Password input with show/hide toggle |
| `frontend/src/components/LoginPage.jsx` | Login card and form behaviour |
| `frontend/src/components/WelcomePage.jsx` | Placeholder authenticated page |
| `frontend/src/auth/AuthContext.jsx` | `AuthProvider`, `useAuth` |
| `frontend/src/App.jsx`, `main.jsx`, `styles.css` | View switch, mount point, design |
| `README.md` (modify) | Frontend run instructions |

### Task 1: Frontend scaffold and pure modules

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.js`, `frontend/.env.example`, `frontend/test-setup.js`, `frontend/src/config.js`, `frontend/src/validation.js`, `frontend/src/storage.js`, `frontend/src/api.js`
- Modify: `package.json`, `tsconfig.json`, `eslint.config.js`, `bunfig.toml`
- Test: `frontend/src/validation.test.js`, `frontend/src/storage.test.js`, `frontend/src/api.test.js`

**Interfaces:**
- Consumes: the backend contract (`POST /api/auth/login` returns `{ token, user }`; `GET /api/auth/me` returns `{ user }`; 400 returns `{ error, fields }`).
- Produces: `normalizeEmail(email: string): string`; `validateEmail(email: string): string`; `validatePassword(password: string): string` (each returns `""` when valid); `getToken(): string | null`; `setToken(token: string): void`; `clearToken(): void`; `class ApiError extends Error { status: number, fields?: { email?: string, password?: string } }` (status `0` for network failure); `login({ email, password }): Promise<{ token: string, user: { id: string, email: string } }>`; `me(token: string): Promise<{ id: string, email: string }>`; `API_URL: string`.

- [ ] **Step 1: Read the references.** Read spec sections "Frontend structure", "Session behaviour" and "Login screen behaviour", and `backend/src/routes/auth.js` for the response shapes.

- [ ] **Step 2: Scaffold the package and root wiring.**
  - `frontend/package.json`: `"type": "module"`, dependencies `react`, `react-dom`, dev dependencies `vite`, `@vitejs/plugin-react`, `happy-dom`, `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, scripts `"dev": "vite"`, `"build": "vite build"`, `"test": "bun test"`.
  - `frontend/index.html` mounts `#root` and loads `/src/main.jsx`; `vite.config.js` uses `@vitejs/plugin-react`; `frontend/.env.example` holds `VITE_API_URL=http://localhost:4000`.
  - Root `package.json`: add `"frontend"` to `workspaces`; add dev dependencies `eslint-plugin-react`, `@types/react`, `@types/react-dom`.
  - `tsconfig.json`: add `frontend/src` and `frontend/test-setup.js` to `include`, `jsx` `react-jsx`, `lib` `["es2022", "dom"]`, and `"vite/client"` to `types`.
  - `eslint.config.js`: add a block for `frontend/**/*.{js,jsx}` with `eslint-plugin-react` recommended and jsx-runtime configs, browser globals, and `react/prop-types` off.
  - `bunfig.toml`: `[test]` with `preload = ["./frontend/test-setup.js"]`.
  - Run `bun install`.

- [ ] **Step 3: Write `frontend/test-setup.js`.** Registration must happen before Testing Library is imported, and static imports are hoisted, so use dynamic imports:

```js
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, afterEach } from "bun:test";

GlobalRegistrator.register();

const matchers = await import("@testing-library/jest-dom/matchers");
const { cleanup } = await import("@testing-library/react");
expect.extend(matchers);
afterEach(() => cleanup());
```

- [ ] **Step 4: Write the failing tests.** `validation.test.js`:

```js
it("email_format_errors", () => {
  expect(validateEmail("")).toBe("Email is required");
  expect(validateEmail("nope")).toBe("Enter a valid email address");
  expect(validateEmail("a@b.co")).toBe("");
});
```

| Test | Assertions |
|------|------------|
| `password_length_error` | `validatePassword("")` is `"Password is required"`; `"short"` is `"Password must be at least 8 characters"`; `"        "` (8 spaces) is `""` |
| `normalize_email_trims_and_lowercases` | `normalizeEmail("  Alice@Example.COM ")` is `"alice@example.com"` |

`storage.test.js` (clear storage in `beforeEach`; `survives_storage_throwing` swaps `globalThis.sessionStorage` for a stub whose methods throw, via `Object.defineProperty(globalThis, "sessionStorage", { value: stub, configurable: true })`, and restores the original afterwards):

| Test | Assertions |
|------|------------|
| `round_trips_token` | `setToken("abc")` then `getToken()` is `"abc"`; `sessionStorage.getItem("login-poc.token")` is `"abc"` |
| `clear_removes_token` | after `clearToken()`, `getToken()` is `null` |
| `survives_storage_throwing` | with the throwing stub, `getToken()` is `null` and `setToken("x")` and `clearToken()` do not throw |

`api.test.js` (mock with `spyOn(globalThis, "fetch")`, restore in `afterEach`):

```js
it("login_posts_json_and_returns_payload", async () => {
  const spy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ token: "t", user: { id: "1", email: "a@b.co" } }), { status: 200 }),
  );
  const result = await login({ email: "a@b.co", password: "Password123!" });
  expect(result).toEqual({ token: "t", user: { id: "1", email: "a@b.co" } });
  const [url, init] = spy.mock.calls[0];
  expect(url).toBe(`${API_URL}/api/auth/login`);
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ email: "a@b.co", password: "Password123!" });
});
```

| Test | Setup | Assertions |
|------|-------|------------|
| `login_throws_api_error_with_fields_on_400` | fetch resolves 400 `{ error: "Validation failed", fields: { email: "Enter a valid email address" } }` | rejects with an `ApiError`, `status` 400, `fields.email` set |
| `login_throws_status_0_on_network_failure` | fetch rejects `new TypeError("fail")` | rejects with `ApiError`, `status` 0 |
| `me_sends_bearer_header_and_returns_user` | fetch resolves 200 `{ user: { id: "1", email: "a@b.co" } }` | `init.headers.Authorization` is `"Bearer tok"`, result is the user |
| `me_throws_api_error_on_401` | fetch resolves 401 `{ error: "Unauthorized" }` | rejects with `ApiError`, `status` 401 |

- [ ] **Step 5: Run to verify failure.** Run `bun test frontend/src`. Expected: fails with `Cannot find module './validation.js'` (and the same for `storage.js`, `api.js`).

- [ ] **Step 6: Implement the modules.** `config.js` exports `API_URL`. `validation.js`, `storage.js` and `api.js` follow the Interfaces block. `api.js` sends `Content-Type: application/json`; a non-OK response throws `new ApiError(status, body.fields)`; a rejected `fetch` throws `new ApiError(0)`.

- [ ] **Step 7: Run to verify pass.** Run `bun test`, `bun run typecheck`, `bun run lint` from the repo root. Expected: 45 tests pass (34 backend, 11 frontend), typecheck and lint exit 0. If the backend suites fail only because of the happy-dom preload, report that as a blocker instead of working around it.

### Task 2: Login form and styling

**Files:**
- Create: `frontend/src/components/PasswordField.jsx`, `frontend/src/components/LoginPage.jsx`, `frontend/src/styles.css`
- Test: `frontend/src/components/LoginPage.test.jsx`

**Interfaces:**
- Consumes: `validateEmail`, `validatePassword`, `normalizeEmail`, `ApiError` from Task 1.
- Produces: `PasswordField({ id: string, value: string, onChange: (value: string) => void, disabled: boolean, error: string })`; `LoginPage({ onSubmit, notice, onRetry })` where `onSubmit: ({ email: string, password: string }) => Promise<void>` (rejects with `ApiError` on failure), `notice?: string`, `onRetry?: () => void`.

- [ ] **Step 1: Read the references.** Read spec sections "Login screen behaviour" and "Visual design"; skim `frontend/src/api.js` for `ApiError`.

- [ ] **Step 2: Write the failing tests** in `LoginPage.test.jsx`, using `render` and `screen` from RTL and `userEvent`. Inputs are found by label (`Email`, `Password`), the button by name `Sign in`. Example:

```js
it("shows_inline_errors_and_sends_no_request_when_invalid", async () => {
  const onSubmit = mock(() => Promise.resolve());
  render(<LoginPage onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText("Email"), "nope");
  await userEvent.type(screen.getByLabelText("Password"), "short");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
  expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  expect(onSubmit).not.toHaveBeenCalled();
});
```

Remaining tests (valid input is `alice@example.com` / `Password123!`; "pending" means `onSubmit` returns a promise the test resolves or rejects by hand):

| Test | Setup | Assertions |
|------|-------|------------|
| `disables_button_and_shows_loading_while_in_flight` | `onSubmit` pending, submit | button is disabled with name `Signing in…`; both inputs disabled |
| `shows_generic_message_on_401_not_under_a_field` | `onSubmit` rejects `new ApiError(401)` | `role="alert"` shows `"Invalid email or password"`; no field has `aria-invalid="true"` |
| `maps_400_fields_to_inline_errors` | rejects `new ApiError(400, { password: "Password must be at least 8 characters" })` | that text appears under the password field |
| `shows_retryable_message_on_network_error` | rejects `new ApiError(0)`, then a second submit resolves | alert shows `"Something went wrong. Please try again."`; after the second submit the alert is gone |
| `password_toggle_switches_input_type` | click `Show password` | password input `type` is `"text"`, button name becomes `Hide password` with `aria-pressed="true"`; clicking again restores `"password"` |
| `submits_normalized_email` | type `" Alice@Example.COM "` | `onSubmit` called once with `{ email: "alice@example.com", password: "Password123!" }` |
| `ignores_second_submit_while_in_flight` | `onSubmit` pending; `fireEvent.submit` on the form twice | `onSubmit` called once |
| `clears_field_error_on_edit` | submit invalid email, then type a character in the email field | the email error text is gone |
| `shows_notice_with_retry_button` | render with `notice="Can't reach server"` and `onRetry` mock | text visible; clicking `Retry` calls `onRetry` once |

- [ ] **Step 3: Run to verify failure.** Run `bun test frontend/src/components/LoginPage.test.jsx`. Expected: fails with `Cannot find module './LoginPage.jsx'`.

- [ ] **Step 4: Implement `PasswordField` in `frontend/src/components/PasswordField.jsx`.** Label `Password`, `type` toggled by internal state, a button named `Show password` / `Hide password` with `aria-pressed`, `autocomplete="current-password"`, error text in an element with id `${id}-error` referenced by `aria-describedby`.

- [ ] **Step 5: Implement `LoginPage` in `frontend/src/components/LoginPage.jsx`.** Behaviour per spec "Login screen behaviour": normalize the email, run both validators before calling `onSubmit`; guard re-entry with a ref so a second submit while pending is ignored; map `ApiError` 401, 400 (`fields`) and 0 or 5xx to the messages in Global Constraints; clear a field's error when that field changes; render `notice` with a `Retry` button when `onRetry` is provided. The email input uses `type="email"` and `autocomplete="username"`.

- [ ] **Step 6: Write `frontend/src/styles.css`** per the "Visual design" spec section and Global Constraints: tokens, dark mode override, centered card, red error text and input border, dimmed button with a CSS spinner while loading, focus ring, narrow-screen gutter.

- [ ] **Step 7: Run to verify pass.** Run `bun test`, `bun run typecheck`, `bun run lint` from the repo root. Expected: 55 tests pass (34 backend, 11 + 10 frontend), typecheck and lint exit 0.

### Task 3: Session state, app shell and README

**Files:**
- Create: `frontend/src/auth/AuthContext.jsx`, `frontend/src/components/WelcomePage.jsx`, `frontend/src/App.jsx`, `frontend/src/main.jsx`
- Modify: `README.md`
- Test: `frontend/src/App.test.jsx`

**Interfaces:**
- Consumes: `login`, `me`, `ApiError` (api), `getToken`, `setToken`, `clearToken` (storage), `LoginPage` from Tasks 1 and 2.
- Produces: `AuthProvider({ children })`; `useAuth(): { status: "loading" | "anonymous" | "authenticated", user: { id, email } | null, notice: string, login(credentials): Promise<void>, logout(): void, retry(): void }`; `App()`; `WelcomePage({ email, onLogout })` rendering `Welcome, {email}` and a `Logout` button.

- [ ] **Step 1: Read the references.** Read spec section "Session behaviour" and `frontend/src/components/LoginPage.jsx` for its props.

- [ ] **Step 2: Write the failing tests** in `App.test.jsx`. Each test renders `<AuthProvider><App /></AuthProvider>`, seeds `sessionStorage` when needed, and mocks `fetch` with `spyOn(globalThis, "fetch")` routing by URL suffix (`/api/auth/login`, `/api/auth/me`). Example:

```js
it("restores_session_from_stored_token", async () => {
  setToken("tok");
  const spy = mockApi({ me: () => json(200, { user: { id: "1", email: "alice@example.com" } }) });
  render(<AuthProvider><App /></AuthProvider>);
  expect(screen.getByText("Loading…")).toBeInTheDocument();
  expect(await screen.findByText("Welcome, alice@example.com")).toBeInTheDocument();
  expect(spy.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
});
```

`mockApi` and `json(status, body)` are small helpers in the test file.

| Test | Setup | Assertions |
|------|-------|------------|
| `no_token_skips_me_call` | no token | login form shown; fetch never called |
| `clears_token_and_shows_login_on_401_from_me` | token set, `/me` 401 | login form shown, no alert and no notice, `getToken()` is `null` |
| `keeps_token_and_shows_notice_when_server_unreachable` | token set, fetch rejects | `"Can't reach server"` and `Retry` visible, `getToken()` still set |
| `keeps_token_and_shows_notice_on_5xx_from_me` | token set, `/me` 500 | same as above |
| `retry_restores_session_after_outage` | first `/me` rejects, then 200 | click `Retry`, then `Welcome, alice@example.com` appears |
| `retry_keeps_notice_when_still_down` | `/me` rejects twice | after `Retry` the notice is still visible and the token is kept |
| `successful_login_shows_welcome_with_email` | no token, login 200 `{ token: "t", user }` | after submitting the form, `Welcome, alice@example.com` shown; `getToken()` is `"t"` |
| `login_succeeds_when_storage_throws` | `globalThis.sessionStorage` replaced by a throwing stub (restored afterwards); login 200 | welcome page still shown |
| `logout_clears_token_and_returns_to_login` | authenticated via restore | click `Logout`: login form shown, `getToken()` is `null` |

- [ ] **Step 3: Run to verify failure.** Run `bun test frontend/src/App.test.jsx`. Expected: fails with `Cannot find module './App.jsx'`.

- [ ] **Step 4: Implement `AuthProvider` and `useAuth` in `frontend/src/auth/AuthContext.jsx`.** On mount: no token gives `anonymous`; a token gives `loading`, then `me(token)`: success sets `authenticated`, `ApiError` 401 clears the token and sets `anonymous`, any other failure sets `anonymous` with `notice` `"Can't reach server"` and keeps the token. `login` calls the API, then stores the token (failure to store is ignored) and sets the user. `retry` re-runs the restore. `logout` clears the token and returns to `anonymous`.

- [ ] **Step 5: Implement `WelcomePage`, `App` and `main.jsx`.** `App` renders `Loading…` while `loading`, `WelcomePage` when `authenticated`, otherwise `LoginPage` with `onSubmit={login}`, `notice` and `onRetry={retry}`. `main.jsx` imports `./styles.css` and mounts `<AuthProvider><App /></AuthProvider>` into `#root`.

- [ ] **Step 6: Run to verify pass.** Run `bun test`, `bun run typecheck`, `bun run lint` from the repo root. Expected: 65 tests pass (34 backend, 31 frontend: 11 + 10 + 10), typecheck and lint exit 0.

- [ ] **Step 7: Verify the production build.** Run `cd frontend && bunx vite build`. Expected: build succeeds and writes `frontend/dist`.

- [ ] **Step 8: Update `README.md`.** Fill the "Frontend" heading: `cd frontend && bun run dev`, `VITE_API_URL`, the default dev URL `http://localhost:5173`, and a short "how to log in" line pointing at the seeded users.

Next plan: none
