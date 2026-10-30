# Login feature

## Overview
A login feature for a new web app: a Node/Express backend API and a React frontend, with a simple login form, validation, and session handling.

## Scope
- Login with email + password (assumption: no username, no social login)
- Since there's no signup feature yet, the backend seeds one or more test users at startup (assumption — replace with a real signup flow later, or tell me now if you want signup included in this same POC)
- Logout (clears the session client-side)
- Out of scope for this POC: password reset, email verification, multi-factor auth, remember-me, account lockout after repeated failures

## Backend API

### POST /api/auth/login
Request body:
```json
{ "email": "user@example.com", "password": "string" }
```

Validation:
- `email`: required, valid email format
- `password`: required, minimum 8 characters

Responses:
- `200`: `{ "token": "<jwt>", "user": { "id": "...", "email": "..." } }`
- `400`: validation error, body names the invalid field(s)
- `401`: invalid email or password (generic message — don't reveal which one was wrong)
- `500`: server error

Session approach: JWT (assumption) — stateless token returned on login, sent by the frontend as `Authorization: Bearer <token>` on subsequent requests. Token expiry: 1 hour (assumption).

### GET /api/auth/me
Returns the current user from a valid token, or `401` if missing/expired/invalid. Used by the frontend to check login state on page load.

### Security baseline
- Passwords hashed with bcrypt before storage (even for seeded test users)
- No plaintext passwords in logs or error messages
- CORS restricted to the frontend's origin

## Frontend (React)

### Login screen
- Centered card with email field, password field (masked, with show/hide toggle), submit button
- Client-side validation mirrors backend rules (email format, password length) with inline error text per field
- Submit button shows a loading state while the request is in flight and is disabled during submission
- On `401`, show a single generic error message ("Invalid email or password") near the form — not under a specific field
- On success, store the token (assumption: in memory / React state, not localStorage, to avoid XSS token theft — flag if you'd prefer localStorage for POC simplicity) and redirect to a placeholder authenticated page (e.g. "Welcome, {email}" with a logout button)

### Logged-in state
- On app load, call `GET /api/auth/me` if a token is present to restore session
- A simple logout button clears the token and returns to the login screen

## Design notes
(assumption — replace with your own direction) Clean, minimal styling: single centered card, generous spacing, clear error states in red, disabled/loading states visually distinct. No specific brand colors/fonts assumed — fill in if you have a design system or reference to match.

## Acceptance criteria
- A user with correct credentials can log in and reach the authenticated placeholder page
- A user with incorrect credentials sees a clear error and stays on the login screen
- Invalid input (bad email format, short password) is caught client-side before hitting the API
- Refreshing the authenticated page keeps the user logged in (via `GET /api/auth/me`)
- Logout clears the session and returns to the login screen
