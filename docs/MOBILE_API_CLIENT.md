## Mobile API client with Payload SDK

This backend exposes a standard Payload REST API under `/api`. The recommended way for the mobile app (Next.js + Capacitor) to consume it is via the **Payload REST API SDK** rather than a generated OpenAPI client.

- **Package**: `@payloadcms/sdk`
- **Base URL**: your backend API origin + `/api` (for local dev this is typically `http://localhost:3000/api`).
- **Types**: Use this backend’s generated `Config` type from `src/payload-types.ts` so all SDK methods are fully typed.

### Sharing types with the mobile app

The mobile app needs access to the same `Config` type used here:

- **Option 1 – Monorepo package (recommended)**  
  - Put backend and mobile app in the same pnpm/npm workspace.  
  - Create a small package (for example `packages/riot-api-types`) that re-exports `Config` from `src/payload-types.ts`.  
  - Have the mobile app depend on `@riot/api-types` and import `Config` from there.

- **Option 2 – Copy/sync `payload-types.ts` into the mobile repo**  
  - Add a simple script or manual step to copy `src/payload-types.ts` from this repo into the mobile repo (for example into `src/backend/payload-types.ts`).  
  - In the mobile app, import `Config` from that copied file.

Either approach keeps the SDK strongly typed without maintaining a separate client.

### Using the SDK in the mobile app

In the **mobile app repo**:

1. Install the SDK:

   ```bash
   pnpm add @payloadcms/sdk
   ```

2. Create a shared SDK instance, typed with this backend’s `Config`:

   ```ts
   // src/api/payloadClient.ts (in the mobile app)
   import { PayloadSDK } from '@payloadcms/sdk'
   import type { Config } from './payload-types' // shared or copied from riot-backend

   const baseURL =
     process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') + '/api'

   export const sdk = new PayloadSDK<Config>({
     baseURL,
     baseInit: {
       // Use cookies when running as a PWA on the same origin
       credentials: 'include',
     },
   })
   ```

3. Use the SDK from your data-fetching layer (React Query, SWR, or custom hooks):

   ```ts
   // Example: fetch a page of events
   import { sdk } from './payloadClient'

   export async function fetchEvents(params?: {
     page?: number
     limit?: number
   }) {
     const { docs, totalDocs } = await sdk.find({
       collection: 'events',
       page: params?.page ?? 1,
       limit: params?.limit ?? 20,
       where: {
         status: { equals: 'published' },
       },
       sort: '-startDateTime',
     })

     return { events: docs, total: totalDocs }
   }
   ```

4. Use auth helpers for login and `me`:

   ```ts
   import { sdk } from './payloadClient'

   export async function login(email: string, password: string) {
     return sdk.login({
       collection: 'users',
       data: { email, password },
     })
   }

   export async function currentUser() {
     return sdk.me({ collection: 'users' })
   }
   ```

For custom routes that the SDK does not cover (for example, `POST /api/webhooks/wordpress`, which is intended for WordPress → backend sync), either:

- Call them from server-to-server code (not the mobile app), or  
- Use `sdk.request({ method, path, json })` if you need to hit them from typed code.

