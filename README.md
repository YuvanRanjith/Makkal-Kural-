## Ward data and future improvements

Reports are saved even when their GPS location does not match an imported ward. These reports await assignment and remain visible to staff and in the reporter’s My reports page. Importing accurate official ward boundaries is a future improvement for automatic routing; see `supabase/import-wards.sql`.

## Location-based reporting update

Signup no longer asks for a ward. For the latest Supabase update and behavior, see [LOCATION-REPORTING-SETUP.md](LOCATION-REPORTING-SETUP.md).

# V1.1 update

Citizen access now uses phone number + password, one-time ward selection and one new report per 15 minutes. Apply the instructions in [LOGIN-SETUP.md](LOGIN-SETUP.md) before using this version. Older anonymous-login instructions below describe V1 and are superseded by this setup.

# Makkal Kural

A civic reporting app built with Next.js, Supabase Auth/PostGIS, and Leaflet.

## Run locally

1. Install Node.js 22 LTS and run `npm ci`.
2. Copy `.env.example` to `.env.local` and set your Supabase project URL and public anon key. Never put a service-role key in the browser environment.
3. Complete the database setup below, then run `npm run dev`.
4. Open http://localhost:3000. Camera access requires localhost or HTTPS.

## Database setup and upgrades

Back up an existing database first. Run `supabase/schema.sql` in the Supabase SQL Editor as the project administrator. It creates fresh tables or upgrades the original project's tables, preserves existing reports, replaces the original public write policies, and adds authenticated RPCs. PostgreSQL 15+ is required for the security-invoker coordinate view. If your existing database has unrelated custom policies on these app tables, review their replacement before applying.

Enable **Authentication → Providers → Anonymous sign-ins**. Citizens now receive Supabase Auth sessions. Old `mk_user_id` values are intentionally not accepted as authentication: existing legacy reports stay public, but cannot be automatically claimed by an unverified browser ID. Guest tracking lasts only while that browser retains its Supabase session. Staff login uses a separate session and does not replace citizen identity.

Run `supabase/schedule.sql` to enable the five-minute expired-audit job through Supabase Cron. Verify the job exists in the Cron dashboard. A repair resolves early with at least three confirming votes and a confirming majority; three rejecting votes with a rejecting majority return it to work. At expiry, a confirming majority resolves it; zero votes or a tie return it to work. Each repair attempt has a separate audit round. Contractors cannot verify their own assigned repairs.

Create staff accounts in **Authentication → Users** (or invite them), then assign a role from SQL Editor:

```sql
insert into public.staff_roles(user_id, role)
values ('AUTH_USER_UUID', 'contractor')
on conflict(user_id) do update set role=excluded.role;
-- Use 'admin' for an administrator. Only the database administrator can grant roles.
```

Staff open /staff and sign in with email/password. Contractors can take open complaints and upload proof for their assigned in-progress work; admins can assign or reassign open/in-progress work to authorized staff and upload proof for any in-progress complaint.

## Ward boundaries

Use authoritative WGS84 GeoJSON for your municipality. The repository does not invent civic boundaries. In `supabase/import-wards.sql`, replace the empty FeatureCollection with your actual polygons, mapping each feature's properties to `ward_id` (integer), `ward_name`, and `zone_name`. Run it in SQL Editor. The script supports Polygon/MultiPolygon, imports/upserts wards, and assigns previously unassigned complaints. The map shows a clear message until real boundaries are imported.

Health score is the resolved fraction of ward complaints (0–100), with 100 for a ward having no reports. Average resolution time uses only reports with an actual `resolved_at` timestamp; legacy resolved reports without that timestamp are excluded. Open, in-progress, pending, rejected and resolved counts are shown separately.

## Offline and installable app

The production build registers a service worker and provides app icons and a manifest. Visit the reporting page online once and establish a guest session before going offline. Keep the same browser data; private browsing and browser storage cleanup can discard pending entries. Photo, chosen coordinates, category, description and a **masked** optional number are stored in IndexedDB. Reconnect and keep the app open, or use Upload pending reports. Reports use stable request IDs so retries cannot create duplicates. Raw phone numbers are never persisted. Optional phone storage is informational only: masked numbers cannot be used to contact citizens.

Only the public reporting shell and static assets are cached. API responses, database responses, staff credentials and complaint details are not cached by the service worker. Unvisited pages show an offline fallback. The app does not promise background syncing while closed. GPS permission failure offers manual pin selection; review the pin carefully. Development fallback coordinates are ignored in production.

## Validate

- `npm run typecheck`: strict TypeScript validation.
- `npm test`: regression tests for input validation, bounded uploads, image signatures, phone privacy, countdown expiry, development-only GPS fallback, API authentication, idempotency and failed-upload recovery.
- `npm run build`: production build.
- `npm run check`: all of the above.
- `npm run lint` is a compatibility alias for type checking; it is not an ESLint ruleset.
- `supabase/tests/lifecycle.sql`: transactional database integration tests. Run only against a disposable local/staging database with `psql -v ON_ERROR_STOP=1 -f supabase/tests/lifecycle.sql`. Tests roll back their fixtures. The GitHub workflow provisions a local Supabase stack and runs them automatically.

## Build output on Windows

If OneDrive marks old generated build files as reparse points, Next.js can fail to clean them with a readlink error. Use a fresh output folder for verification: set `MK_BUILD_DIR=.next-verification` before `npm run build`, and use the same value for `npm start`. The default remains `.next`. This changes generated output only.

## Deploy

1. Apply and verify the schema, anonymous sign-ins, staff roles, ward data, and scheduled job in your target Supabase project.
2. Deploy to a Node-compatible Next.js host such as Vercel. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before building. Public environment variables are baked into the bundle; rebuild after changing them.
3. For self-hosting: `npm ci`, `npm run build`, then `npm start` behind HTTPS. Allow multipart uploads slightly over 8 MB in your reverse proxy.
4. Set the production site URL in Supabase Auth and configure anonymous sign-in abuse protection for your expected traffic.
5. Smoke-test on a real mobile device: camera permission → GPS/pin → submission → receipt/My reports → endorsement; staff work assignment → repair photo → citizen votes; offline capture → reconnect → one report; install the app and relaunch.

The SQL migration and production host are not deployed automatically by editing this repository. Run database tests and these device checks before opening the app to citizens.

Official references: [Supabase anonymous authentication](https://supabase.com/docs/guides/auth/auth-anonymous), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function permissions](https://supabase.com/docs/guides/database/functions).

## Missing complaint_details after an upgrade

If the app reports that public.complaint_details is missing from the schema cache, run the updated supabase/schema.sql in SQL Editor. The migration now explicitly replaces the older get_ward_heatmap_data RPC whose return columns differ, and reloads the PostgREST schema cache at commit. If SQL Editor reports an error, resolve it before retrying: the migration is transactional, so a failed statement rolls back the view creation. Reloading the schema cache alone cannot create a missing view.

The Ward map hides only the confirmed oversized demo overlay (ward 104, Demo Ward — Live Zone, Live Demo). Other ward boundaries, including moderate/yellow wards, remain unchanged. The database record is retained.

## Report save: geometry/geography mismatch

If the terminal reports that location is geometry but the inserted expression is geography, run supabase/fix-report-location.sql in Supabase SQL Editor. This focused patch replaces only create_report and check_nearby_complaints, preserving existing rows and column types. The full schema.sql includes the same fix. Report insertion supplies a WGS84 geometry point, which PostGIS automatically converts if the destination column is geography. Nearby queries explicitly use geography so the 15-metre radius is interpreted in metres for both table layouts. Database CI runs the lifecycle tests against both layouts.

References: [PostGIS casting](https://postgis.net/docs/en/geometry.html), [ST_DWithin distance units](https://postgis.net/docs/manual-3.5/en/ST_DWithin.html).
