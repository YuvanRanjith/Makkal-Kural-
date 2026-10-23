"use client";
import {EmptyState,LoadingState} from "@/components/ui/Feedback";
import AreaBrowser,{useBrowseArea} from "@/components/ui/AreaBrowser";
import { useCallback, useEffect, useState } from "react";
import { getActiveAudits } from "@/lib/supabase/queries";
import { getOrCreateUserId } from "@/lib/utils/session";
import { describeSupabaseError } from "@/lib/utils/supabase-errors";
import { auditVoteMessage } from "@/lib/utils/audit";
import AuditCard from "@/components/audit/AuditCard";
import Header from "@/components/ui/Header";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Complaint, AuditVoteResult } from "@/types/ticket";
export default function AuditPage() {
  const browse=useBrowseArea();
  const [audits, setAudits] = useState<Complaint[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if(!browse.area){setAudits([]);setLoading(false);return;}
    setLoading(true);
    setError("");
    try {
      setUserId(await getOrCreateUserId());
      setAudits(await getActiveAudits(browse.area));
    } catch (error) { setError(describeSupabaseError(error)); }
    finally { setLoading(false); }
  }, [browse.area]);
  useEffect(() => { void load(); }, [load]);
  function onVoted(result: AuditVoteResult) {
    setNotice(auditVoteMessage(result));
    void load();
  }
  return <>
    <Header />
    <main id="main-content" className="page">
      <p className="eyebrow">The final check is yours</p><h1>Help verify a repair.</h1>
      <p className="intro mb-5">Compare the original issue with repair proof. Each repair has a 48-hour verification window.</p>
      <p className="mb-5 max-w-3xl text-xs leading-6 text-slate-500">Three confirmations with a confirming majority resolve a repair early. Three rejections with a rejecting majority return it to staff. Each account can vote once per repair attempt.</p>
      <AreaBrowser browse={browse}/>{notice && <p role="status" className="mb-5 rounded-lg border border-teal-200 bg-teal-50 p-4">{notice}</p>}
      {error ? <ErrorNotice message={error} onRetry={load} /> : loading || browse.busy ? <LoadingState label={browse.busy?"Finding repairs near you...":"Loading repairs..."}/> : !audits.length ? <EmptyState location={!browse.area} title={!browse.area?"Choose an area to verify repairs":"No repairs awaiting your review"} description={!browse.area?"Use your location or select an area above to find repair updates.":"When staff submit repair photos in this area, they will appear here for a 48-hour community review."} action="Explore community issues" href="/complaints"/> :
        <div className="grid gap-4 lg:grid-cols-2">
          {audits.map(complaint => <AuditCard key={complaint.complaint_id + ":" + complaint.audit_round} complaint={complaint} userId={userId} onVoted={onVoted} />)}
        </div>
      }
    </main>
  </>;
}
