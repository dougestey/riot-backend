# Social event ingestion

All social and calendar sources create `ingestion-records` and draft `events`. Only editors and
admins can publish or feature an imported event. Source identity is namespaced and idempotent;
probable cross-source duplicates are held in `needs-review`.

## Ambassador setup

1. An admin assigns the `ambassador` role and one or more `assignedCities`.
2. The ambassador starts Google OAuth with `POST /api/integrations/google/authorize`, supplying
   `cityId`.
3. After the Google callback, list calendars with
   `GET /api/integrations/google/calendars?connectionId=...`.
4. Select the dedicated RIOT intake calendar with `POST /api/integrations/google/select`.
5. In Facebook, use **Add to Calendar** and select that Google calendar. Incremental sync creates
   a RIOT draft on the next worker run.

OAuth uses PKCE and a single-use, ten-minute state. Refresh tokens are AES-256-GCM encrypted with
`OAUTH_ENCRYPTION_KEY`. Generate the key with:

```sh
openssl rand -base64 32
```

Google's Calendar scopes require a production OAuth consent screen and may require Google
verification.

## File imports

`POST /api/event-imports/preview` and `POST /api/event-imports` accept multipart fields `file` and
`cityId`. Supported files are:

- `.ics`, including bounded recurrence expansion
- Facebook event export `.json` files or ZIP archives
- `.csv` with headers `title,start,end,timezone,description,location,url,id,all day`

CSV timestamps must be ISO-8601 values containing `Z` or a numeric UTC offset. Uploads, expanded
ZIP content, row count, recurrence count, and parser errors are bounded. Full source archives are
not retained.

## Instagram monitoring

The RIOT-owned Instagram Business/Creator account requires a long-lived token with
`instagram_basic`, `instagram_manage_insights`, and `pages_read_engagement`. Configure
`META_INSTAGRAM_ACCESS_TOKEN` and `META_INSTAGRAM_USER_ID`, then set a venue's normalized city,
Instagram username, and monitoring toggle.

Business Discovery polls only public Business/Creator accounts. Images or available video
thumbnails are copied into Payload Media before their CDN URLs expire. OpenAI Structured Outputs
extract event details; incomplete or low-confidence results remain in review and never publish.
Set `OPENAI_API_KEY` and optionally pin `OPENAI_VISION_MODEL`.

## Facebook Graph gate

Meta currently restricts User/Page Event access to Facebook Marketing Partners. Direct Graph
ingestion is disabled unless all of the following are set:

- `FACEBOOK_EVENTS_ENABLED=true`
- `META_FACEBOOK_EVENT_TEST_TOKEN`
- `META_FACEBOOK_TEST_EVENT_ID`

An admin runs `POST /api/integrations/facebook/feasibility`. The token must belong to a real
production ambassador who is not an app developer/tester. Both known-event and `/me/events`
checks must succeed. If they do not, keep direct ingestion disabled and use Google Calendar or
file imports. `pages_events` is not a substitute for Facebook calendar Event access.

## Worker and operations

Invoke `npm run jobs:run` every minute from the deployment scheduler. Payload schedules Google
polling every five minutes and Instagram polling every fifteen minutes. Jobs use retries,
exponential backoff for source-specific tasks, source-key idempotency, and structured errors.

Monitor:

- OAuth connections in `error` or `revoked`
- ingestion records in `failed` or `needs-review`
- Meta and Google rate-limit/authentication failures
- OpenAI refusals, timeouts, and extraction confidence

Do not log tokens, authorization codes, source archives, image bytes, or complete private event
descriptions. Rotate `OAUTH_ENCRYPTION_KEY` only with a credential re-encryption procedure.
