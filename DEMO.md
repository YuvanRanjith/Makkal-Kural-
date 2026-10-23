# Faculty demonstration: 48-hour audit loop

## Prepare the sample

1. Restart npm run dev so the sample illustrations and latest audit UI are served.
2. Run supabase/seed-demo-audit.sql in Supabase SQL Editor. It returns the sample ID, pending status, deadline and round. No real reports are modified. The sample is clearly labelled, and the images are illustrations, not actual repair evidence.
3. Open Verify repairs. The sample shows before/after images, a countdown close to 48 hours, and Confirm/Reject buttons.

Sample report URL: /complaints/b4e46fce-c707-4f91-82b5-9b757725239f

## Demonstrate confirmation

Use three separate citizen browser sessions/devices. The normal browser, a private browser window, and another browser/device work. Multiple tabs or multiple private windows in the same private session share a guest identity and do not count as distinct voters. Staff login is separate from the citizen session.

Vote Confirm Fixed once from each session. After the third confirming vote, the card disappears from the pending list and the outcome banner says the report is resolved. Open the sample report to show the Resolved badge. Do not describe this as waiting 48 hours: it demonstrates the early three-vote decision. The real expiry job is set up separately with schedule.sql.

## Demonstrate rejection and another repair attempt

Re-run seed-demo-audit.sql to reset only the sample to a new repair round with a fresh deadline. Previous votes are retained as history but do not count in the new round. Vote Reject from three citizen sessions. The sample returns to In progress. In Staff, choose In progress and find the presentation sample. A real staff repair upload would open the next 48-hour round. You can instead reset the sample again before the presentation to keep one audit visible.

## Explain expiry honestly

In the actual system the window is 48 hours. When the scheduled expiry job runs after the deadline, a confirming majority resolves the complaint; zero votes, tied votes, or a rejecting majority return it to work. Running schema.sql defines this logic; schedule.sql activates the five-minute job. The presentation sample does not fake citizen votes or shorten the real window.

Suggested narration: “This sample demonstrates how citizens can verify a reported repair. Three confirmations can close it early, while rejection sends it back for more work. Otherwise the scheduled process reviews the result after the 48-hour window.”
