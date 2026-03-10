# PR: Session support, cookie auth config, and self-registration

**Branch:** `session-support`

## Summary

Adds cookie-based session auth configuration, a public self-registration endpoint, and env-driven settings for cross-origin/cross-site cookie behavior. Enables frontend apps (e.g. Next.js on a different origin) to register users and maintain sessions via the `payload-token` cookie.

## Changes

### 1. Users collection — cookie auth config

- **File:** `src/collections/Users.ts`
- **Change:** `auth: true` replaced with explicit auth config:
  - **Token expiration:** 7 days (`604800` seconds)
  - **Cookies:** Driven by env:
    - `COOKIE_SAMESITE` — `Lax` (default), `Strict`, or `None` (for cross-site; use with `Secure` in prod)
    - `COOKIE_DOMAIN` — optional; set for cross-subdomain cookies
    - `secure` — `true` in production, `false` in dev

### 2. New `/api/register` endpoint

- **File:** `src/endpoints/register.ts`
- **Behavior:**
  - **POST** only; expects JSON: `email`, `password`, optional `firstName`, `lastName`
  - Validates: required email/password, email format, password length ≥ 8
  - Checks for existing user by email; returns 400 if duplicate
  - Creates user with **attendee** role only (`overrideAccess: true` for create)
  - Auto-logs in via `payload.login()` and returns user + token
  - Sets `payload-token` cookie on response (SameSite, Secure, Domain, Max-Age 7 days) so browser clients get a session without handling the token manually
- **Responses:**
  - **201** — User created and logged in; body includes `message`, `user`, `token`, `exp`; `Set-Cookie` header set
  - **400** — Invalid JSON, missing/invalid email or password, or email already exists
  - **500** — Registration succeeded but auto-login failed (rare)

### 3. Payload config

- **File:** `src/payload.config.ts`
- **Changes:**
  - **serverURL:** Set from `PAYLOAD_PUBLIC_SERVER_URL` (used for cookie domain, CSRF, and self-referencing URLs)
  - **csrf:** Set to same value as `cors` (comma-separated origins) so cookie-authenticated mutations are only accepted from allowed origins
  - **endpoints:** Registers the new `registerEndpoint`

### 4. Environment variables

- **File:** `.env.example`
- **Added:**
  - `PAYLOAD_PUBLIC_SERVER_URL` — e.g. `http://localhost:3000` (dev) or production API URL
  - `COOKIE_DOMAIN` — optional; for cross-subdomain cookies
  - `COOKIE_SAMESITE` — `Lax` (default), `Strict`, or `None` (for cross-site; requires `Secure` in production)

### 5. Documentation

- **docs/SESSION_AND_SAVED_EVENTS.md** — Frontend integration guide: register, login, logout, forgot/reset password, and Saved Events usage with cookie auth
- **docs/openapi.yaml** — New `POST /api/register` path with request/response schemas and error descriptions

## Security / access

- Registration is **unauthenticated** (public). New users are restricted to the **attendee** role.
- Create user and login use `overrideAccess: true` only where required (user creation and Payload’s own login); no broader privilege escalation.
- CSRF and CORS are aligned so only configured origins can perform cookie-authenticated mutations.

## Testing suggestions

- [ ] Register with valid email/password → 201, user + token in body, `payload-token` cookie set
- [ ] Register with duplicate email → 400
- [ ] Register with invalid email or password &lt; 8 chars → 400
- [ ] Login after register using cookie (no token in body) → session works for protected routes
- [ ] With `COOKIE_SAMESITE=None` and `Secure` in prod, verify cross-origin cookie is sent from allowed frontend origin

## Follow-up / docs

- Frontend integration details (including Saved Events with cookie auth) are in **docs/SESSION_AND_SAVED_EVENTS.md**.
