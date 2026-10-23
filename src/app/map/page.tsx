"use client";

import AreaBrowser,{useBrowseArea} from "@/components/ui/AreaBrowser";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/ui/Header";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { describeSupabaseError as errorMessage } from "@/lib/utils/supabase-errors";
import { getWardHeatmapData } from "@/lib/supabase/queries";
import type { WardHeatmapData } from "@/types/ticket";

// Leaflet needs to be loaded client-side only (no SSR)
const WardMap = dynamic(() => import("@/components/map/WardMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-400">
      Loading map...
    </div>
  ),
});

export default function MapPage() {
  const browse=useBrowseArea();
  const [wards, setWards] = useState<WardHeatmapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWard, setSelectedWard] = useState<WardHeatmapData | null>(null);

  const [error,setError] = useState("");
  const load = useCallback(async () => {setLoading(true);setError("");try{setSelectedWard(null);setWards(await getWardHeatmapData());}catch(e){setError(errorMessage(e));}finally{setLoading(false);}},[]);
  useEffect(() => {void load();}, [load]);

  useEffect(()=>setSelectedWard(null),[browse.area]);
  return (
    <main id="main-content" className="flex flex-col min-h-screen pb-28 lg:pb-10">
      <Header />
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
        <p className="eyebrow">A clearer picture of your community</p><h1>Ward health map</h1><p className="intro">Explore local progress. Select a coloured ward to see its report and repair activity.</p>
        <p className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-600"/>Healthy</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-600"/>Moderate</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600"/>Needs attention</span>
        </p>
      </div>

      <div className="mx-auto w-full max-w-6xl px-3"><AreaBrowser browse={browse}/></div>
      <div className="relative mx-auto w-[calc(100%-2rem)] max-w-6xl h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        {loading ? <p role="status" className="p-6">Loading ward data…</p> : error ? <ErrorNotice message={error} onRetry={load} /> : <><WardMap wards={wards.filter(w=>browse.area?.all || w.ward_id===browse.area?.wardId)} center={browse.area?.lat!==undefined && browse.area.lng!==undefined ? [browse.area.lat,browse.area.lng]:undefined} onSelectWard={setSelectedWard} />{browse.area && !browse.area.all && !wards.some(w=>w.ward_id===browse.area?.wardId) && <p role="status" className="absolute top-3 left-12 right-3 z-[1000] bg-white rounded p-3 shadow">No mapped ward matches this location. Choose another area to explore, or report here for staff review.</p>}</>}
      </div>

      {selectedWard && (
        <div className="surface mx-auto mt-5 w-[calc(100%-2rem)] max-w-6xl p-5">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="font-semibold">{selectedWard.ward_name}</p>
              <p className="text-xs text-gray-500">{selectedWard.zone_name}</p>
            </div>
            <button
              aria-label="Close ward details"
              onClick={() => setSelectedWard(null)}
              className="secondary !min-h-9 !px-3 !py-1"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="bg-red-50 rounded-lg p-2">
              <p className="text-lg font-bold text-danger">{selectedWard.open_count}</p>
              <p className="text-xs text-gray-500">Open</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2">
              <p className="text-lg font-bold text-warning">
                {selectedWard.in_progress_count}
              </p>
              <p className="text-xs text-gray-500">In Progress</p>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <p className="text-lg font-bold text-primary">{selectedWard.resolved_count}</p>
              <p className="text-xs text-gray-500">Resolved</p>
            </div>
          </div>

          <p className="mb-2 text-sm">Awaiting verification: {selectedWard.pending_count} · Rejected: {selectedWard.rejected_count}</p>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">
              Avg. Resolution: {selectedWard.avg_resolution_hours === null ? "N/A" : selectedWard.avg_resolution_hours + "h"}
            </span>
            <span className="font-semibold">
              Health Score: {selectedWard.health_score}/100
            </span>
          </div>
        </div>
      )}
    </main>
  );
}