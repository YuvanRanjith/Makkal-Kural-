"use client";
import { useEffect, useRef } from "react";
import EvidenceImage from "@/components/ui/EvidenceImage";
import type { NearbyComplaint } from "@/types/ticket";
export default function ProximityModal({ nearby,onEndorse,onNewReport,onCancel,busy }: { nearby:NearbyComplaint[];onEndorse:(id:string)=>void;onNewReport:()=>void;onCancel:()=>void;busy:boolean }) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close();},[]);
  return <dialog ref={dialog} aria-labelledby="duplicate-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}} className="w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-auto rounded-2xl p-5 sm:p-7 shadow-2xl backdrop:bg-slate-900/60"><h2 id="duplicate-title" className="text-xl font-semibold">This may already be reported</h2><p className="my-3 text-sm leading-6 text-slate-500">Endorse an existing issue if it matches yours, or create a separate report.</p><div className="max-h-80 overflow-auto space-y-3">{nearby.map(c=><div key={c.complaint_id} className="border rounded-lg p-3"><EvidenceImage src={c.image_url} alt={c.category+' nearby issue'} className="h-28 w-full object-cover rounded" /><p className="my-2">{c.category} · {Math.round(c.distance_meters)}m away · {c.upvote_count} endorsements</p><button className="primary w-full" disabled={busy} onClick={()=>onEndorse(c.complaint_id)}>Endorse this issue</button></div>)}</div><button className="secondary mt-4 w-full" disabled={busy} onClick={onNewReport}>Report a different issue</button><button className="muted-link mt-3 min-h-11 w-full" disabled={busy} onClick={onCancel}>Back to report</button></dialog>;
}
