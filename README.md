# login-poc

A login proof of concept: a Node/Express backend with a JWT login API, and a React frontend login screen.

## Backend

```sh
npm install
npm run dev -w backend      # or: node backend/src/server.js
```

The API listens on `http://localhost:4000`:

- `POST /api/auth/login` takes `{ "email", "password" }` and returns `{ token, user }`.
- `GET /api/auth/me` takes `Authorization: Bearer <token>` and returns `{ user }`.

### Environment variables

Copy `backend/.env.example` for reference; the server reads these from the process environment.

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `4000` | Port to listen on |
| `CORS_ORIGIN` | `http://localhost:5173` | The only origin CORS allows |
| `JWT_SECRET` | `dev-only-insecure-secret` | Required in production; the server refuses to start with the default |

### Test users

| Email | Password |
|-------|----------|
| `alice@example.com` | `Password123!` |
| `bob@example.com` | `Password456!` |

## Frontend

_To be added._

## Checks

Run from the repo root:

```sh
npm run typecheck
npm run lint
npm test
```
