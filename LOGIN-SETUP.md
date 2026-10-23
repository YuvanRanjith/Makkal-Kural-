# Updated setup

Ward selection has been removed. Follow [LOCATION-REPORTING-SETUP.md](LOCATION-REPORTING-SETUP.md) for the current behavior and focused upgrade. The historical ward restrictions below are superseded.

# V1.1 citizen login and ward access

## Apply to your existing Supabase project

1. Run the entire supabase/upgrade-citizen-login.sql in Supabase SQL Editor. It adds the ward profile, private-photo policies, scoped reads and a database-enforced 15-minute report cooldown. Existing accounts and reports are retained. The complaint-photos bucket becomes private; V1.1 signs only images the viewer is allowed to access. This changes live access rules, so use the V1.1 app with this migration.
2. Enable the Phone provider in Supabase Authentication. Disable phone-number confirmation for this password-only college-project flow. Do not disable the Email provider: staff still use email and password. No SMS provider or SMS hook is needed when phone confirmation is disabled.
3. Disable new Anonymous sign-ins. Old anonymous sessions are rejected by the new database rules, even if their tokens have not expired.
4. Start this project copy with npm run dev. Open /login and create a civilian account using a mobile number and password. Select a ward once. The phone number is an account identifier, not proof of phone ownership or residence. Ward names are available during onboarding; other wards' reports and statistics are not.
5. Staff continue to use /staff directly. Staff navigation and assignments are absent from civilian pages. Staff roles can only be assigned by the project administrator.

For a fresh Supabase database, run schema.sql instead: it includes the same access rules.

## What the new rules enforce

- A civilian can read, endorse, report and vote only inside their selected ward.
- Staff names, email directory and assignment IDs are not exposed to civilians. The complaint read view redacts staff fields; direct table column grants also prevent bypassing it through REST.
- Image files are private and require an authorized signed URL. Previously issued public object URLs stop working after migration. Sample SVG illustrations under /demo are static presentation assets, not private citizen photos.
- One successfully saved new report per account every 15 minutes. The database serializes concurrent requests for that account, so rapid clicks or direct API calls cannot bypass the limit.
- Retrying the same request returns its existing receipt. Failed saves do not start a cooldown. Endorsements and audit votes do not consume the reporting allowance.
- Offline reports remain queued per account. Sync respects the same server cooldown and leaves blocked entries pending for a later retry.
- Ward selection is locked after onboarding. To correct a selection, the project administrator can update that user's ward_id in public.users through SQL Editor. Previously submitted complaints remain in their original ward; they are not moved or automatically claimed by a different account.
- Passwords are handled by Supabase Auth. There is no password reset based only on entering a phone number; recovery requires project-administrator assistance until a verified recovery channel is added.

## Validate

Run npm run typecheck, npm test, and npm run build. Database CI runs supabase/tests/citizen-access.sql for cross-ward reads, staff-data redaction, private photos, cooldown rejection, idempotent retries and the 15-minute boundary. These SQL tests need PostgreSQL/PostGIS or the local Supabase stack; they are not part of the mocked API tests.

Manual check: create two civilian accounts in different wards; create a report with each; verify neither can see the other's reports, map statistics, audit cards or photos. Submit two reports rapidly and confirm the second returns a wait message. Sign out and confirm the other account's offline entries are hidden. Finally, sign into /staff and check assignment and repair-photo workflows still work.

Supabase reference: https://supabase.com/docs/guides/auth/passwords
