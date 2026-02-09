# RIOT Events - Implementation Details

## Project Structure

```
src/
├── access/
│   └── index.ts          # Reusable access control functions
├── collections/
│   ├── Categories.ts     # Event categories (hierarchical)
│   ├── Events.ts         # Main events collection
│   ├── Media.ts          # Media/uploads collection
│   ├── Users.ts          # User authentication & profiles
│   └── Venues.ts         # Event venues/locations
├── migrations/
│   └── *.ts              # Database migrations
├── payload.config.ts     # Main Payload configuration
└── payload-types.ts      # Generated TypeScript types
```

## Collections

### Users

Authentication collection with role-based access control.

**Fields:**

- `email` (built-in from `auth: true`)
- `firstName`, `lastName` - User's name
- `avatar` - Profile image (upload to Media)
- `roles` - Multi-select: admin, editor, attendee
  - Default: `['attendee']`
  - `saveToJWT: true` for fast access checks
  - Only admins can modify

**Access Control:**

- Read: Admins see all, users see only themselves
- Create/Delete: Admin only
- Update: Self or admin

### Media

Upload collection for images with responsive sizes.

**Fields:**

- `alt` (required) - Accessibility text
- `caption` - Display caption
- `credit` - Attribution/source
- `tags` - Array for organization/AI tagging

**Image Sizes:**

- `thumbnail`: 400x300
- `card`: 768x512
- `feature`: 1920x1080

### Categories

Hierarchical event categories for organization.

**Fields:**

- `name` (required) - Display name
- `slug` (unique, indexed) - URL-friendly identifier
- `description` - Optional description
- `color` - Hex color for UI display
- `parent` - Self-referencing relationship for hierarchy
- `ingestion` group:
  - `externalId` (indexed) - WordPress term ID
  - `lastSyncedAt` - Last sync timestamp

### Venues

Event locations with address and coordinates.

**Fields:**

- `name` (required) - Venue name
- `slug` (unique, indexed) - URL-friendly identifier
- `description` - Rich text description
- `address` group:
  - `street`, `city`, `state`, `zip`, `country`
- `coordinates` - Point field for mapping
- `website`, `phone` - Contact info
- `capacity` - Manual entry for venue capacity
- `image` - Venue photo
- `ingestion` group:
  - `externalId` (indexed) - WordPress venue ID
  - `externalUrl` - WordPress venue URL
  - `lastSyncedAt` - Last sync timestamp

### Events

Main events collection with tabbed admin interface.

**Admin UI Tabs:**

1. **Content Tab:**
   - `title` (required)
   - `slug` (unique, indexed)
   - `featuredImage` - Event image
   - `description` - Rich text content

2. **Details Tab:**
   - `startDateTime`, `endDateTime` - Date/time pickers
   - `isAllDay` - All-day event flag
   - `timezone` - IANA timezone (default: America/Halifax)
   - `venue` - Relationship to Venues
   - `website` - External event link
   - `categories` - Multi-relationship to Categories

3. **Virtual Event Tab:**
   - `isVirtual` - Virtual event flag
   - `virtualUrl` - Join URL (conditional on isVirtual)

**Sidebar Fields:**

- `status` - draft, published, cancelled, postponed
- `featured` - Highlight on frontend
- `createdBy` - Auto-set relationship to creating user
- `ingestion` group:
  - `source` - manual or wordpress
  - `externalId` (indexed) - WordPress event ID
  - `externalUrl` - WordPress event URL
  - `lastSyncedAt` - Last sync timestamp
  - `aiEnhanced` - AI processing flag
  - `aiEnhancedAt` - AI processing timestamp

**Hooks:**

- `beforeChange`: Auto-sets `createdBy` on create

## Access Control Functions

Located in `src/access/index.ts`:

```typescript
// Admin only
isAdmin: Access

// Editors or admins
isEditorOrAdmin: Access

// Any authenticated user
isAuthenticated: Access

// Admins or the user themselves (with query constraint)
isAdminOrSelf: Access

// Field-level admin restriction
adminFieldAccess: FieldAccess

// Public access
anyone: Access

// Published content or authenticated user (with query constraint)
authenticatedOrPublished: Access
```

## Database

Using PostgreSQL via `@payloadcms/db-postgres` adapter.

### Running Migrations

```bash
# Create a new migration
npm run payload migrate:create -- --name migration_name

# Run pending migrations
npm run payload migrate

# Check migration status
npm run payload migrate:status
```

## Type Generation

After schema changes, regenerate types:

```bash
npm run generate:types
```

This updates `src/payload-types.ts` with TypeScript interfaces for all collections.

## Import Map

After adding custom components, regenerate the import map:

```bash
npm run generate:importmap
```

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

## Environment Variables

Required environment variables (see `.env.example`):

```
PAYLOAD_SECRET=your-secret-key
DATABASE_URL=postgresql://user:password@host:port/database
```

## WordPress Sync (Future)

The ingestion tracking fields on Events, Venues, and Categories are designed for a future sync service that will:

1. Fetch data from WordPress API endpoints:
   - `/tribe/events/v1/events`
   - `/tribe/events/v1/venues`
   - `/tribe/events/v1/categories`

2. Match records by `externalId`

3. Create or update Payload records

4. Update `lastSyncedAt` timestamp

5. Optionally trigger AI enhancement pipeline
