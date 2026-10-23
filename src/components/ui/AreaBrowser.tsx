"use client";
import {useCallback,useEffect,useState,useRef} from 'react';
import {LocateFixed} from 'lucide-react';
import {supabase} from '@/lib/supabase/client';
import type {BrowseArea} from '@/lib/utils/area';
interface Ward {ward_id:number;ward_name:string;zone_name:string;}
export function useBrowseArea(enabled=true){
 const [area,setArea]=useState<BrowseArea|null>(null),[wards,setWards]=useState<Ward[]>([]),[value,setValue]=useState('nearby'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef(0);
 const locate=useCallback(()=>{const id=++request.current;setValue('nearby');setArea(null);setError('');setBusy(true);
 if(!navigator.geolocation){setError('Location is unavailable. Choose an area below.');setBusy(false);return;}
 navigator.geolocation.getCurrentPosition(async position=>{if(id!==request.current)return;const {latitude:lat,longitude:lng}=position.coords;
 try{const {data,error}=await supabase.rpc('get_ward_for_location',{lat,lng});if(error)throw error;if(id!==request.current)return;setArea({lat,lng,wardId:data??undefined});}catch{if(id!==request.current)return;setArea({lat,lng});setError('Ward lookup is unavailable. Showing issues near your location.');}finally{if(id===request.current)setBusy(false);}
 },()=>{if(id!==request.current)return;setError('Location access is unavailable. Choose an area below or browse all areas.');setBusy(false);},{timeout:10000,maximumAge:60000});
 },[]);
 useEffect(()=>{if(!enabled)return;let active=true;void supabase.rpc('get_ward_options').then(({data,error})=>{if(active){if(error)setError('Area list could not load. Reload this page to retry.');else setWards(data||[]);}});locate();return()=>{active=false;request.current++;};},[locate,enabled]);
 function choose(next:string){request.current++;setValue(next);setError('');if(next==='nearby'){locate();return;}setBusy(false);setArea(next==='all'?{all:true}:{wardId:Number(next)});}
 return {area,wards,value,error,busy,choose,locate};
}
export default function AreaBrowser({browse}:{browse:ReturnType<typeof useBrowseArea>}){return <section aria-label="Browse community by area" className="surface my-6 p-4 sm:p-5"><div className="flex flex-wrap items-end gap-3"><label className="min-w-0 basis-56 flex-1">Explore an area<select value={browse.value} onChange={e=>browse.choose(e.target.value)}><option value="nearby">Near my current location</option><option value="all">All areas</option>{browse.wards.map(w=><option key={w.ward_id} value={w.ward_id}>{w.ward_name} - {w.zone_name}</option>)}</select></label><button type="button" className="secondary" onClick={browse.locate} disabled={browse.busy}><LocateFixed size={17} aria-hidden="true"/>{browse.busy?'Finding location...':'Use my location'}</button></div><p className="mt-3 text-xs leading-5 text-slate-500">Choose an area to explore. You can report an issue from anywhere.</p>{browse.error && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">{browse.error}</p>}</section>;}
