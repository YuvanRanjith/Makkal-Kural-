"use client";
import { useCallback, useEffect, useState } from "react";
import { getQueuedReports, syncQueuedReports, removeQueuedReport } from "@/lib/utils/offline";
import { PendingReport } from "@/lib/utils/report";
import { errorMessage } from "@/lib/utils/validation";
import { usePathname } from "next/navigation";
import { useCitizen } from "@/components/auth/CitizenProvider";
import { supabase } from "@/lib/supabase/client";
export default function AppServices() {
  const {user}=useCitizen();const pathname=usePathname();
  const [online,setOnline]=useState(true),[queue,setQueue]=useState<PendingReport[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{try{const reports=await getQueuedReports();const {data}=await supabase.auth.getSession();setQueue(reports.filter(report=>report.userId===data.session?.user.id && !data.session.user.is_anonymous));}catch(e){setMessage(errorMessage(e));}},[]);
  const sync=useCallback(async()=>{setBusy(true);setMessage("");try{const result=await syncQueuedReports();if(result.remaining)setMessage("Some reports are still pending. Reconnect using the account that created them to upload them.");else if(result.sent)setMessage(result.sent+' pending report(s) uploaded. View them in My reports.');}catch(e){setMessage('Upload paused: '+errorMessage(e));}finally{setBusy(false);await refresh();}},[refresh]);
  useEffect(()=>{
    if('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(async registration=>{
      await import("@/components/ui/MapOverlay");
      const urls=performance.getEntriesByType("resource").map(entry=>entry.name).filter(value=>{const url=new URL(value);return url.origin===location.origin && url.pathname.startsWith("/_next/static/");});
      registration.active?.postMessage({type:"CACHE_STATIC",urls:[...new Set(urls)]});
    }).catch(()=>setMessage('Offline app caching is unavailable in this browser.'));
    setOnline(navigator.onLine);void refresh();if(navigator.onLine)void sync();
    const connected=()=>{setOnline(true);void sync();},disconnected=()=>setOnline(false);
    window.addEventListener('online',connected);window.addEventListener('offline',disconnected);
    const timer=setInterval(()=>{void refresh();},5000);
    const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(()=>void refresh(),0);});
    return ()=>{window.removeEventListener('online',connected);window.removeEventListener('offline',disconnected);clearInterval(timer);data.subscription.unsubscribe();};
  },[refresh,sync]);
  if(!user || pathname.startsWith("/staff") || (online && !queue.length && !message))return null;
  return <aside aria-label="Connection and pending reports" className="mx-auto max-w-6xl px-4 py-4"><div className="rounded-xl border bg-white p-4">{!online && <p role="status">You are offline. Captured reports can be saved on this device.</p>}{message && <p role="status">{message}</p>}{queue.length>0 && <><p className="font-semibold mt-2">{queue.length} pending report(s)</p><button className="secondary my-2" disabled={!online || busy} onClick={sync}>{busy?'Uploading…':'Upload pending reports'}</button><ul className="space-y-2">{queue.map(r=><li key={r.id} className="flex flex-wrap justify-between gap-2 border-t pt-2"><span>{r.category} · {new Date(r.createdAt).toLocaleString('en-IN')}<span className="block text-xs break-all">Local receipt: {r.id}</span></span><button className="text-red-700 underline" disabled={busy} onClick={async()=>{if(window.confirm('Delete this unsent report from this device?')){try{await removeQueuedReport(r.id);await refresh();}catch(e){setMessage(errorMessage(e));}}}}>Delete pending report</button></li>)}</ul></>}</div></aside>;
}
