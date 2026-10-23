"use client";
import {useEffect,useRef,useState} from 'react';
import {ImageOff,Expand,X} from 'lucide-react';
export default function EvidenceImage({src,alt,className='',loading='lazy',zoom=false}:{src:string;alt:string;className?:string;loading?:'lazy'|'eager';zoom?:boolean}){
 const [failed,setFailed]=useState(false);const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>setFailed(false),[src]);
 if(failed || !src)return <div role="img" aria-label={alt+' (photo unavailable)'} className={'flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 '+className}><ImageOff size={24} aria-hidden="true"/><span className="text-xs text-slate-500">Photo unavailable</span></div>;
 const photo=<img src={src} alt={alt} loading={loading} onError={()=>setFailed(true)} className={'bg-slate-100 '+className}/>;
 if(!zoom)return photo;
 return <><button type="button" aria-label={'Enlarge '+alt.toLowerCase()} onClick={()=>dialog.current?.showModal()} className="relative block w-full overflow-hidden rounded-xl text-left">{photo}<span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/65 p-2 text-white"><Expand size={16} aria-hidden="true"/></span></button><dialog ref={dialog} aria-label={alt} className="w-[calc(100%-2rem)] max-w-4xl rounded-2xl bg-white p-4 shadow-xl backdrop:bg-slate-900/75" onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{alt}</p><button type="button" autoFocus aria-label="Close photo" className="secondary !min-h-11 !p-2" onClick={()=>dialog.current?.close()}><X size={20} aria-hidden="true"/></button></div><img src={src} alt={alt} className="max-h-[75dvh] w-full rounded-lg bg-slate-100 object-contain"/></dialog></>;
}
