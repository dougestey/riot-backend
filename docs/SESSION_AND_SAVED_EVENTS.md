# Session & Saved Events — Frontend Integration Guide

## Authentication Flow

All auth endpoints are built into Payload under `/api/users/`. Cookie-based auth is the recommended approach for browser clients.

### Register

```
POST /api/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "firstName": "Jane",
  "lastName": "Doe"
}
```

**Success (201):**

```json
{
  "message": "Registration successful",
  "user": { "id": 1, "email": "user@example.com", "firstName": "Jane", "roles": ["attendee"], ... },
  "token": "eyJ...",
  "exp": 1234567890
}
```

The response sets a `payload-token` cookie automatically. New users always get the `attendee` role.

**Errors:**

- `400` — Missing fields, invalid email, password too short (< 8 chars), or email already exists

### Login

```
POST /api/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Success (200):**

```json
{
  "user": { "id": 1, "email": "user@example.com", ... },
  "token": "eyJ...",
  "exp": 1234567890
}
```

Sets `payload-token` cookie (7-day expiry).

### Logout

```
POST /api/users/logout
```

Clears the `payload-token` cookie.

### Forgot Password

```
POST /api/users/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

### Reset Password

```
POST /api/users/reset-password
Content-Type: application/json

{ "token": "reset-token-from-email", "password": "newpassword" }
```

---

## Session Handling

### Cookie Auth (Recommended for Browsers)

All requests should include `credentials: 'include'` so the browser sends the `payload-token` cookie:

```ts
const res = await fetch('https://api.example.com/api/users/me', {
  credentials: 'include',
})
```

The cookie is:

- **HttpOnly** — not accessible via JavaScript
- **SameSite=Lax** by default (set `COOKIE_SAMESITE=None` + `Secure` for cross-site deploys)
- **7-day expiry** — Payload refreshes the token on authenticated requests

### Bearer Token Auth (Alternative)

You can also pass the token in the `Authorization` header:

```
Authorization: Bearer eyJ...
```

### CORS & CSRF

- The backend allows requests from origins listed in `CORS_ORIGINS` env var
- Cookie-authenticated mutations are protected by CSRF — only allowed from `CORS_ORIGINS`
- Make sure your frontend origin is in this list

---

## Current User

```
GET /api/users/me
```

Returns the authenticated user. Sensitive fields (`hash`, `salt`, `resetPasswordToken`) are excluded by Payload.

**Response (200):**

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "roles": ["attendee"],
    "avatar": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Not authenticated (200):**

```json
{ "user": null }
```

### Update Profile

```
PATCH /api/users/{id}
Content-Type: application/json

{ "firstName": "Updated", "lastName": "Name" }
```

Users can update their own profile. Only admins can modify `roles`.

---

## Saved Events API

All saved-events endpoints require authentication. The `user` field is auto-set from the session.

### Save an Event

```
POST /api/saved-events
Content-Type: application/json

{ "event": 42 }
```

**Success (201):**

```json
{
  "doc": {
    "id": 1,
    "user": 5,
    "event": 42,
    "savedAt": "2025-06-01T12:00:00.000Z"
  }
}
```

**Errors:**

- `400` — `"Event already saved"` (duplicate prevention via hook)
- `401` — Not authenticated

### List Saved Events

```
GET /api/saved-events?depth=1&sort=-savedAt&limit=20&page=1
```

Returns only events belonging to the current user (access control scoped).

With `depth=1`, the `event` field is populated with the full Event object.

**Response (200):**

```json
{
  "docs": [
    {
      "id": 1,
      "user": 5,
      "event": { "id": 42, "title": "Art Walk", ... },
      "savedAt": "2025-06-01T12:00:00.000Z"
    }
  ],
  "totalDocs": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "hasNextPage": false,
  "hasPrevPage": false
}
```

### Check if Event is Saved

```
GET /api/saved-events?where[event][equals]=42&limit=1
```

If `totalDocs > 0`, the event is saved.

### Batch Check Multiple Events

```
GET /api/saved-events?where[event][in]=42,43,44
```

Returns saved-event docs for any of the specified event IDs.

### Unsave an Event

```
DELETE /api/saved-events/{savedEventId}
```

**Success (200):** Returns the deleted doc.

**Errors:**

- `403` — Not the owner
- `401` — Not authenticated

---

## Error Format

All errors follow Payload's standard format:

```json
{
  "errors": [{ "message": "Error description" }]
}
```

Common status codes:

- `400` — Validation error (bad input, duplicate saved event)
- `401` — Not authenticated
- `403` — Forbidden (not owner / insufficient role)
- `404` — Resource not found
