import { errorMessage } from "./validation";
export function describeSupabaseError(error: unknown): string {
  const message = errorMessage(error);
  if (/get_citizen_context|get_ward_options|set_my_ward/.test(message) && /schema cache|does not exist|could not find/i.test(message)) return "Login database setup is incomplete. Run supabase/upgrade-citizen-login.sql in Supabase SQL Editor.";
  if (/invalid login credentials/i.test(message)) return "The mobile number or password is incorrect. Please try again.";
  if (/phone.*not.*confirmed/i.test(message)) return "Phone confirmation is still enabled. Follow LOGIN-SETUP.md for the password-only configuration.";
  if (/complaint_details/i.test(message) && /schema cache|does not exist|could not find/i.test(message)) {
    return "Database setup is incomplete: complaint_details is missing. Run the updated supabase/schema.sql in Supabase SQL Editor, then try again.";
  }
  if (/failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(message)) {
    return "Cannot reach Supabase. Check that your project is active and NEXT_PUBLIC_SUPABASE_URL is correct, then restart the app after any configuration change.";
  }
  if (/anonymous.*disabled|anonymous.*not.*enabled/i.test(message)) {
    return "Anonymous sign-ins are disabled. Enable them in your Supabase project's Authentication settings, then try again.";
  }
  if (/invalid api key|invalid.*apikey/i.test(message)) {
    return "Supabase rejected the API key. Use the public anon or publishable key from the same project as NEXT_PUBLIC_SUPABASE_URL, then restart the app.";
  }
  return message;
}
