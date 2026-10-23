import { supabase } from "@/lib/supabase/client";
import { sendReport, PendingReport } from "./report";
const DB_NAME = "makkal-kural-offline-v2";
const STORE = "pending-reports";
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function mutate(action: (store: IDBObjectStore) => void) {
  const db = await openDB();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Offline storage was interrupted."));
    action(tx.objectStore(STORE));
  }); } finally { db.close(); }
}
export async function queueReport(report: PendingReport) { const existing=await getQueuedReports();if(existing.some(item=>item.userId===report.userId && item.id!==report.id && Date.parse(item.createdAt)>Date.now()-15*60000))throw new Error("You already saved a pending report. Wait 15 minutes before creating another.");await mutate(store => { store.put(report); }); }
export async function removeQueuedReport(id: string) { await mutate(store => { store.delete(id); }); }
export async function getQueuedReports(): Promise<PendingReport[]> {
  const db = await openDB();
  try { return await new Promise<PendingReport[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
let syncing: Promise<{ sent: number; remaining: number }> | null = null;
export async function syncQueuedReports() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!navigator.onLine) return { sent: 0, remaining: (await getQueuedReports()).length };
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session || data.session.user.is_anonymous || !data.session.user.phone) return { sent: 0, remaining: (await getQueuedReports()).length };
    let sent = 0;
    for (const report of await getQueuedReports()) {
      if (report.userId !== data.session.user.id) continue;
      await sendReport(report);
      await removeQueuedReport(report.id); sent++;
    }
    return { sent, remaining: (await getQueuedReports()).length };
  })();
  try { return await syncing; } finally { syncing = null; }
}
