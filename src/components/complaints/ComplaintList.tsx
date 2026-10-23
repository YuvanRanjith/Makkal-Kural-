"use client";
import Link from "next/link";
import {Plus} from "lucide-react";
import {EmptyState,LoadingState} from "@/components/ui/Feedback";
import AreaBrowser,{useBrowseArea} from "@/components/ui/AreaBrowser";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/ui/Header";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { STATUSES, statusLabel } from "@/components/ui/StatusBadge";
import ComplaintCard from "./ComplaintCard";
import { listComplaints } from "@/lib/supabase/queries";
import { getOrCreateUserId } from "@/lib/utils/session";
import { describeSupabaseError as errorMessage } from "@/lib/utils/supabase-errors";
import { CATEGORIES, Complaint } from "@/types/ticket";
export default function ComplaintList({ mine = false }: { mine?: boolean }) {
  const browse=useBrowseArea(!mine);
  const [rows,setRows] = useState<Complaint[]>([]), [count,setCount] = useState(0), [page,setPage] = useState(0);
  const [status,setStatus] = useState(""), [category,setCategory] = useState(""), [loading,setLoading] = useState(true), [error,setError] = useState("");
  const load = useCallback(async () => {
    if(!mine && !browse.area){setRows([]);setCount(0);setLoading(false);return;}
    setLoading(true); setError("");
    try { const userId = mine ? await getOrCreateUserId() : undefined; const result = await listComplaints({ userId, status, category, page,area:browse.area??undefined }); setRows(result.complaints); setCount(result.count); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [mine,status,category,page,browse.area]);
  useEffect(()=>setPage(0),[browse.area]);
  useEffect(() => { void load(); }, [load]);
  return <><Header /><main id="main-content" className="page"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{mine?"Your contributions":"Around the community"}</p><h1>{mine ? "My reports" : "Community issues"}</h1><p className="intro">{mine ? "Track the reports submitted with your account." : "Follow civic issues near you or browse another area."}</p></div><Link className="primary" href="/"><Plus size={17} aria-hidden="true"/>Report an issue</Link></div>{!mine && <AreaBrowser browse={browse}/>}<div className="surface my-5 grid grid-cols-2 gap-3 p-4 sm:max-w-xl sm:p-5"><label>Status<select value={status} onChange={e => {setStatus(e.target.value);setPage(0);}}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>Category<select value={category} onChange={e => {setCategory(e.target.value);setPage(0);}}><option value="">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label></div>{error ? <ErrorNotice message={error} onRetry={load} /> : loading || browse.busy ? <LoadingState label={browse.busy?"Finding issues near you...":"Loading reports..."}/> : <><p className="mb-3 text-sm text-slate-500">{count} {count===1?"report":"reports"}</p>{rows.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map(c => <ComplaintCard key={c.complaint_id} complaint={c} />)}</div> : <EmptyState location={!mine && !browse.area} title={!mine && !browse.area?"Choose where to explore":mine && !status && !category?"Your first report starts here":"Nothing here just yet"} description={!mine && !browse.area?"Allow location access or choose an area above to see community reports.":status || category?"Try another status or category to find more reports.":mine?"Spot something that needs attention? Submit a report and follow its progress here.":"No reports were found in this area. You can help by reporting an issue."} action={mine && !status && !category?"Report an issue":undefined} href="/"/>}{count>20 && <div className="mt-6 flex items-center justify-center gap-4"><button className="secondary" disabled={page === 0} onClick={() => setPage(p => p-1)}>Previous</button><span>Page {page+1}</span><button className="secondary" disabled={(page+1)*20 >= count} onClick={() => setPage(p => p+1)}>Next</button></div>}</>}</main></>;
}
