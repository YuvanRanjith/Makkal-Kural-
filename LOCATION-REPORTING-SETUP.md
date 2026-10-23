# Location-based reporting update

1. Run the entire supabase/upgrade-location-reporting.sql in your Supabase SQL Editor, after the citizen-login migration you already applied. No accounts, passwords, reports or photos are deleted.
2. Restart this V1.1 project with npm run dev. Existing phone/password accounts still work. New accounts go directly to reporting; /ward redirects to the report page.
3. Try a report outside your former signup ward. The issue GPS selects the smallest matching imported ward boundary, excluding the old city-wide demo envelope. No matching boundary leaves the report marked Ward not assigned for staff review.
4. Community issues, repair verification and the ward map default to current-location browsing. Allow location access or choose an area / All areas. Nearby issues use a roughly 3 km bounding box; the map highlights the ward containing your GPS. Area selection does not change your account or restrict reporting.
5. My reports shows all your submissions. Staff identities and assignment IDs remain redacted for citizens. Photos still require authorized signed URLs, but citizen community evidence is now available across areas as requested. The 15-minute limit, idempotent retries and staff permissions remain enforced.

Existing users.ward_id values are retained for compatibility but no longer control reporting, reads, endorsements or verification. Staff can review unassigned reports in their existing workspace; importing correct ward boundaries enables automatic routing of future reports. Existing unassigned reports are not silently reassigned.

Validation: npm test and npm run typecheck; npm run build. SQL integration tests in supabase/tests/citizen-access.sql cover no-home-ward accounts, cross-area discovery, staff redaction, coordinate routing, unmapped reports, cooldown, retries and anonymous-session denial. Run them only on a disposable local/CI database: they use rolled-back test fixtures.
