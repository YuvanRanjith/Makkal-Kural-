import type { ComplaintStatus } from "@/types/ticket";
export const STATUSES: ComplaintStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION", "RESOLVED", "REJECTED"];
export function statusLabel(status: string) { return status.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase()); }
export default function StatusBadge({ status }: { status: ComplaintStatus }) {
  const color = ({OPEN:"bg-blue-50 text-blue-800 ring-blue-200",IN_PROGRESS:"bg-amber-50 text-amber-900 ring-amber-200",PENDING_VERIFICATION:"bg-violet-50 text-violet-800 ring-violet-200",RESOLVED:"bg-emerald-50 text-emerald-800 ring-emerald-200",REJECTED:"bg-red-50 text-red-800 ring-red-200"})[status] || "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={'inline-block rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 ring-inset ' + color}>{statusLabel(status)}</span>;
}
