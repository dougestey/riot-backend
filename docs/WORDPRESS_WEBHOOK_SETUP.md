# WordPress Webhook Setup — TEC → RIOT Sync

A must-use (mu) plugin for WordPress that sends event data to RIOT whenever a
The Events Calendar (TEC) event is created or updated. One-way, fire-and-forget.

## Prerequisites

- WordPress 5.8+, PHP 7.4+
- [The Events Calendar](https://theeventscalendar.com/) plugin active
- Your RIOT backend deployed with the `/api/webhooks/wordpress` route enabled
- A shared webhook secret configured on both sides

## Installation

### 1. Add constants to `wp-config.php`

```php
/* RIOT webhook — event sync */
define( 'RIOT_WEBHOOK_URL',    'https://your-riot-backend.example.com/api/webhooks/wordpress' );
define( 'RIOT_WEBHOOK_SECRET', 'your-shared-secret-here' );
```

> Use the same secret value you set in `WORDPRESS_WEBHOOK_SECRET` on the RIOT
> backend (`.env` or hosting environment).

### 2. Drop the mu-plugin file

Save the PHP below as:

```
wp-content/mu-plugins/riot-webhook.php
```

mu-plugins are loaded automatically — no activation step required.

---

## Full mu-plugin code

```php
<?php
/**
 * Plugin Name: RIOT Event Webhook
 * Description: Sends TEC event data to RIOT on save/update.
 * Version:     1.0.0
 * Author:      RIOT
 */

// Bail early if not configured.
if ( ! defined( 'RIOT_WEBHOOK_URL' ) || ! defined( 'RIOT_WEBHOOK_SECRET' ) ) {
    return;
}

/**
 * Fire webhook after TEC persists all event meta.
 *
 * Hook: tribe_events_update_meta
 * Fires after venue, dates, and categories are all saved.
 * Does NOT fire on autosave or revisions.
 *
 * @param int              $event_id Post ID of the event.
 * @param array            $data     Meta data array (unused).
 * @param WP_Post|int|null $event    The event post object.
 */
add_action( 'tribe_events_update_meta', 'riot_send_webhook', 10, 3 );

// -------------------------------------------------------------------------
// Payload builders
// -------------------------------------------------------------------------

/**
 * Build venue payload from a TEC venue post ID.
 *
 * @param  int        $venue_id
 * @return array|null
 */
function riot_build_venue_payload( $venue_id ) {
    if ( ! $venue_id || get_post_type( $venue_id ) !== 'tribe_venue' ) {
        return null;
    }

    $meta = function ( $key ) use ( $venue_id ) {
        return get_post_meta( $venue_id, $key, true ) ?: null;
    };

    $lat = $meta( '_VenueLat' );
    $lng = $meta( '_VenueLng' );

    return array(
        'id'       => (int) $venue_id,
        'venue'    => get_the_title( $venue_id ) ?: null,
        'slug'     => get_post_field( 'post_name', $venue_id ) ?: null,
        'address'  => $meta( '_VenueAddress' ),
        'city'     => $meta( '_VenueCity' ),
        'province' => $meta( '_VenueProvince' ) ?: $meta( '_VenueState' ),
        'country'  => $meta( '_VenueCountry' ),
        'zip'      => $meta( '_VenueZip' ),
        'phone'    => $meta( '_VenuePhone' ),
        'website'  => $meta( '_VenueURL' ),
        'geo_lat'  => $lat !== null ? (float) $lat : null,
        'geo_lng'  => $lng !== null ? (float) $lng : null,
    );
}

/**
 * Build categories payload for a TEC event.
 *
 * @param  int   $event_id
 * @return array
 */
function riot_build_category_payload( $event_id ) {
    $terms = get_the_terms( $event_id, 'tribe_events_cat' );
    if ( ! $terms || is_wp_error( $terms ) ) {
        return array();
    }

    return array_values( array_map( function ( $term ) {
        return array(
            'id'   => (int) $term->term_id,
            'name' => $term->name,
            'slug' => $term->slug,
        );
    }, $terms ) );
}

/**
 * Assemble the full event payload that matches WPEvent in RIOT.
 *
 * @param  int        $event_id
 * @return array|null Null if the event is not usable.
 */
function riot_build_event_payload( $event_id ) {
    $event = function_exists( 'tribe_get_event' )
        ? tribe_get_event( $event_id )
        : get_post( $event_id );

    if ( ! $event ) {
        return null;
    }

    // Featured image
    $image     = null;
    $thumb_id  = get_post_thumbnail_id( $event_id );
    $thumb_url = $thumb_id ? wp_get_attachment_url( $thumb_id ) : null;
    if ( $thumb_url ) {
        $image = array( 'url' => $thumb_url );
    }

    // Virtual event fields (addon may not be installed)
    $is_virtual  = (bool) get_post_meta( $event_id, '_tribe_events_is_virtual', true );
    $virtual_url = get_post_meta( $event_id, '_tribe_events_virtual_url', true ) ?: null;

    // Venue — tribe_get_event() decorates with ->venues collection
    $venue_payload = null;
    if ( isset( $event->venues ) && $event->venues instanceof WP_List_Util ) {
        $venues = $event->venues->getAll();
        if ( ! empty( $venues ) ) {
            $venue_payload = riot_build_venue_payload( reset( $venues )->ID );
        }
    } elseif ( function_exists( 'tribe_get_venue_id' ) ) {
        $venue_id = tribe_get_venue_id( $event_id );
        if ( $venue_id ) {
            $venue_payload = riot_build_venue_payload( $venue_id );
        }
    }

    return array(
        'id'          => (int) $event_id,
        'title'       => get_the_title( $event_id ),
        'slug'        => $event->post_name,
        'status'      => $event->post_status,
        'start_date'  => isset( $event->start_date )  ? $event->start_date  : get_post_meta( $event_id, '_EventStartDate', true ),
        'end_date'    => isset( $event->end_date )    ? $event->end_date    : get_post_meta( $event_id, '_EventEndDate', true ),
        'timezone'    => isset( $event->timezone )     ? $event->timezone    : get_post_meta( $event_id, '_EventTimezone', true ),
        'all_day'     => (bool) ( isset( $event->all_day ) ? $event->all_day : get_post_meta( $event_id, '_EventAllDay', true ) ),
        'website'     => get_post_meta( $event_id, '_EventURL', true ) ?: null,
        'featured'    => (bool) ( isset( $event->featured ) ? $event->featured : get_post_meta( $event_id, '_tribe_featured', true ) ),
        'image'       => $image,
        'is_virtual'  => $is_virtual,
        'virtual_url' => $virtual_url,
        'modified'    => $event->post_modified,
        'categories'  => riot_build_category_payload( $event_id ),
        'venue'       => $venue_payload,
    );
}

// -------------------------------------------------------------------------
// Webhook sender
// -------------------------------------------------------------------------

/**
 * Build the event payload and POST it to the RIOT webhook endpoint.
 *
 * @param int              $event_id
 * @param array            $data  (unused)
 * @param WP_Post|int|null $event (unused — we re-fetch via tribe_get_event)
 */
function riot_send_webhook( $event_id, $data = array(), $event = null ) {
    $payload = riot_build_event_payload( $event_id );
    if ( ! $payload ) {
        return;
    }

    $body = wp_json_encode( array( 'event' => $payload ) );
    if ( ! $body ) {
        error_log( '[RIOT Webhook] JSON encode failed for event ' . $event_id );
        return;
    }

    $response = wp_remote_post( RIOT_WEBHOOK_URL, array(
        'headers'  => array(
            'Content-Type'     => 'application/json',
            'X-Webhook-Secret' => RIOT_WEBHOOK_SECRET,
        ),
        'body'     => $body,
        'timeout'  => 15,
        'blocking' => false,
    ) );

    if ( is_wp_error( $response ) ) {
        error_log( '[RIOT Webhook] Failed for event ' . $event_id . ': ' . $response->get_error_message() );
    }
}
```

---

## Testing

### Quick test via WP-CLI

```bash
wp shell
```

```php
// Trigger the webhook for an existing event (replace 12345 with a real post ID)
do_action( 'tribe_events_update_meta', 12345, array(), get_post( 12345 ) );
```

### Manual test via admin

1. Open any event in **Events → Edit**
2. Make a trivial change (e.g. add a space to the description)
3. Click **Update**
4. Check your RIOT backend logs for the incoming webhook

### Verify with blocking mode

Temporarily change `'blocking' => true` in the plugin, save an event, then check
the PHP error log for any failure messages. Remember to set it back to `false`
when done.

## Troubleshooting

| Symptom                  | Check                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| No webhook fires at all  | Confirm `RIOT_WEBHOOK_URL` and `RIOT_WEBHOOK_SECRET` are defined in `wp-config.php`. The plugin silently exits if they're missing. |
| 401 Unauthorized         | The secret in `wp-config.php` doesn't match `WORDPRESS_WEBHOOK_SECRET` on the RIOT backend.                                        |
| 400 Bad Request          | The payload is missing `event.id` or `event.start_date`. Check that TEC meta saved correctly.                                      |
| Venue/categories missing | Ensure TEC venue and category data is populated. The webhook tolerates missing venue/categories but won't invent them.             |
| No error log output      | With `'blocking' => false`, `wp_remote_post` won't report HTTP errors. Set `'blocking' => true` temporarily to debug.              |
| Plugin not loading       | mu-plugins must be single files directly in `wp-content/mu-plugins/`, not in subdirectories.                                       |

## Payload Reference

The webhook sends a `POST` request with:

- **Header:** `X-Webhook-Secret: <your-secret>`
- **Content-Type:** `application/json`
- **Body:** `{ "event": { ... } }` matching the `WPEvent` type in `src/lib/wordpress.ts`

All field names align with the TypeScript types: `start_date`, `end_date`,
`venue.venue`, `venue.geo_lat`, `venue.geo_lng`, `categories[].slug`, etc.

For a formal schema and response shape, see the `/api/webhooks/wordpress` path
in the OpenAPI docs at `/docs/api` (backed by `docs/openapi.yaml` and
`/api/docs/openapi.json`).
