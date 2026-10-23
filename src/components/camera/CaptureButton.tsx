"use client";
import {Camera} from 'lucide-react';
export default function CaptureButton({onCapture,disabled}:{onCapture:()=>void;disabled?:boolean}){return <button type="button" onClick={onCapture} disabled={disabled} aria-label="Capture photo" className="flex min-h-14 items-center gap-3 rounded-full border-4 border-white/70 bg-white px-6 py-3 font-semibold text-teal-900 shadow-xl transition-transform active:scale-95 disabled:bg-slate-300"><Camera size={23} aria-hidden="true"/>Take photo</button>;}
