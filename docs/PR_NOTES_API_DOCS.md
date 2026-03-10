# PR Notes: API documentation and CORS

Adds OpenAPI-based API docs and Payload SDK guidance for mobile consumption, plus env-driven CORS for credentialed requests.

## API documentation

- **`docs/openapi.yaml`** — OpenAPI 3.1 spec for Payload REST (events, venues, categories, organizers, saved-events, users/auth) and `POST /api/webhooks/wordpress` with request/response schemas.
- **`GET /api/docs/openapi.json`** — Next.js route that reads and returns the spec as JSON (no auth).
- **`/docs/api`** — Interactive API reference page (Swagger UI) loading the spec from the JSON endpoint.
- **`docs/MOBILE_API_CLIENT.md`** — Guide for consuming the API from the mobile app via `@payloadcms/sdk` with shared `Config` types (monorepo package or copy of `payload-types.ts`), including baseURL, auth, and example usage.
- **`docs/WORDPRESS_WEBHOOK_SETUP.md`** — Cross-link added to the OpenAPI docs for the webhook schema.

Dependencies added: `yaml`, `swagger-ui-react`.

## CORS

- **`src/payload.config.ts`** — CORS is driven only by the `CORS_ORIGINS` env var (comma-separated list of allowed origins). No dev wildcard, so credentialed requests (e.g. from an app on another port) work when the app origin is listed.
- **`.env.example`** — Documents `CORS_ORIGINS` for all environments with a dev example (`http://localhost:3000,http://localhost:3001`).

Set `CORS_ORIGINS` in every environment (e.g. in `.env` for local) so the frontend/mobile origin is allowed.

## Validation

- `npm build` (or equivalent) succeeds.
- With `CORS_ORIGINS` set (e.g. `http://localhost:3000,http://localhost:3001`), cross-origin credentialed requests to the Payload API are allowed by the browser.
