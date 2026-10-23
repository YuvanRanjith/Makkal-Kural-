import type { AuditVoteResult } from "@/types/ticket";
export function auditVoteMessage(result: AuditVoteResult): string {
  const counts = result.confirm_votes + " confirm · " + result.reject_votes + " reject.";
  if (result.new_status === "RESOLVED") return "Repair verified by the community. Report marked resolved. " + counts;
  if (result.new_status === "IN_PROGRESS") return "Repair rejected by the community. Report returned to staff for more work. " + counts;
  return "Your vote was recorded. Verification is still open. " + counts;
}
