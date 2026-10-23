"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {Camera,MapPin,CheckCircle2,ShieldCheck,ArrowRight,ClipboardList} from "lucide-react";
import {LoadingState} from "@/components/ui/Feedback";
import Link from "next/link";
import dynamic from "next/dynamic";
import CameraView, { CameraViewHandle } from "@/components/camera/CameraView";
import CaptureButton from "@/components/camera/CaptureButton";
import ProximityModal from "@/components/proximity/ProximityModal";
import CategoryChips from "@/components/ui/CategoryChips";
import Header from "@/components/ui/Header";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { getOrCreateUserId } from "@/lib/utils/session";
import { getCurrentPosition } from "@/lib/utils/geo";
import { checkProximity, endorseComplaint } from "@/lib/supabase/queries";
import { sendReport, PendingReport, ReportSubmissionError } from "@/lib/utils/report";
import { queueReport } from "@/lib/utils/offline";
import { useCitizen } from "@/components/auth/CitizenProvider";
import { cooldownSeconds, cooldownLabel } from "@/lib/utils/auth";
import { validateReport, errorMessage } from "@/lib/utils/validation";
import { CATEGORIES, NearbyComplaint, Complaint } from "@/types/ticket";
const MapOverlay = dynamic(() => import("@/components/ui/MapOverlay"), { ssr: false, loading: () => <p>Loading location map…</p> });
type Step = "camera" | "locating" | "form" | "checking" | "proximity" | "submitting" | "submitted" | "queued";
export default function Home() {
  const {profile}=useCitizen();
  const [retryAt,setRetryAt]=useState<string|null>(null),[clock,setClock]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const seconds=Math.max(cooldownSeconds(retryAt,clock),cooldownSeconds(profile?.next_report_at || null,clock));
  const cameraRef = useRef<CameraViewHandle>(null), requestId = useRef("");
  const [step,setStep] = useState<Step>("camera"), [ready,setReady] = useState(false), [userId,setUserId] = useState("");
  const [image,setImage] = useState(""), [coords,setCoords] = useState<{lat:number;lng:number}|null>(null), [nearby,setNearby] = useState<NearbyComplaint[]>([]);
  const [category,setCategory] = useState<string>(CATEGORIES[0]), [description,setDescription] = useState("");
  const [error,setError] = useState(""), [receipt,setReceipt] = useState<Complaint|null>(null), [busy,setBusy] = useState(false), [notice,setNotice] = useState("");
  const initSession = useCallback(async () => {try {setUserId(await getOrCreateUserId());setError("");}catch(e){setError(errorMessage(e));}}, []);
  useEffect(() => {void initSession();}, [initSession]);
  const cameraError = useCallback((message:string) => {setReady(false);setError("Camera: " + message + ". Allow camera access, then try again.");}, []);
  const [cameraKey,setCameraKey] = useState(0);
  function reset() {setImage("");setCoords(null);setNearby([]);setDescription("");setCategory(CATEGORIES[0]);setError("");setReceipt(null);setNotice("");setReady(false);setStep("camera");requestId.current="";}
  async function locate() {
    setError("");setStep("locating");
    try {const p=await getCurrentPosition();setCoords({lat:p.lat,lng:p.lng});if(p.accuracy>100)setNotice("Location accuracy is limited. Adjust the pin to the issue’s exact location.");setStep("form");}
    catch(e){setError(errorMessage(e));setStep("form");}
  }
  async function capture() {const photo=cameraRef.current?.capturePhoto();if(!photo){setError("The camera is not ready yet.");return;}setImage(photo);requestId.current=crypto.randomUUID();await locate();}
  async function submit() {
    if (busy) return;
    if (seconds>0) {setError("Please wait "+cooldownLabel(seconds)+" before submitting another report. You can still endorse an existing issue.");setStep("form");return;}
    setError("");
    if(!coords || !image){setError("Capture a photo and set the location before submitting.");setStep("form");return;}
    try {validateReport(category,description,coords.lat,coords.lng,"");}catch(e){setError(errorMessage(e));setStep("form");return;}
    setBusy(true);setStep("submitting");
    try {
      const id=userId || await getOrCreateUserId();setUserId(id);
      const report: PendingReport={id:requestId.current,userId:id,category,description,latitude:coords.lat,longitude:coords.lng,image:await (await fetch(image)).blob(),maskedPhone:"",createdAt:new Date().toISOString()};
      if(!navigator.onLine){await queueReport(report);setStep("queued");}
      else {try {setReceipt(await sendReport(report));setStep("submitted");}catch(e){if(!navigator.onLine){await queueReport(report);setStep("queued");}else throw e;}}
    }catch(e){if(e instanceof ReportSubmissionError && e.retryAt)setRetryAt(e.retryAt);setError(errorMessage(e));setStep("form");}finally{setBusy(false);}
  }
  async function check() {
    if(!coords || busy)return;
    try {validateReport(category,description,coords.lat,coords.lng,"");}catch(e){setError(errorMessage(e));return;}
    if(!navigator.onLine){await submit();return;}
    setStep("checking");setError("");
    try {const results=await checkProximity(coords.lat,coords.lng);if(results.length){setNearby(results);setStep("proximity");}else await submit();}
    catch(e){setError("Nearby reports could not be checked. " + errorMessage(e));setStep("form");}
  }
  async function endorse(id:string){if(busy)return;setBusy(true);setError("");try{await endorseComplaint(id,userId||await getOrCreateUserId());reset();setNotice("Your endorsement was recorded.");}catch(e){setError(errorMessage(e));setStep("form");}finally{setBusy(false);}}
  return <><Header /><main id="main-content" className="page"><p className="eyebrow">Make a difference, right where you are</p><h1>A better neighbourhood<br className="hidden sm:block"/> starts with your voice.</h1>{seconds>0 && <p role="status" className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Your next new report is available in <strong>{cooldownLabel(seconds)}</strong>. You can still endorse existing issues.</p>}<p className="intro mb-5">Spot an issue? Take a photo, mark the location, and we’ll help get it to the right people.</p>{notice && <p role="status" className="mb-4 rounded-lg bg-teal-50 p-3">{notice}</p>}{error && <ErrorNotice message={error} onRetry={() => {if(step === "camera"){setCameraKey(k=>k+1);void initSession();}else if(!coords){void locate();}else {setError("");void initSession();}}} />}
    <ol aria-label="Reporting progress" className="my-7 grid max-w-3xl grid-cols-3 gap-2">{["Take a photo","Add details","Track your report"].map((label,index)=>{const current=step==="camera"?0:["submitted","queued"].includes(step)?2:1;return <li key={label} aria-current={current===index?"step":undefined} className="flex items-center gap-2 text-xs sm:text-sm"><span className={"step-dot "+(index<=current?"bg-teal-800 text-white":"bg-slate-200 text-slate-500")}>{index<current?<CheckCircle2 size={16} aria-hidden="true"/>:index+1}</span><span className={index===current?"font-semibold text-teal-900":"text-slate-500"}>{label}</span></li>;})}</ol><div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_280px]"><section aria-label="Submit a civic report" className="min-w-0">{step === "camera" && <div className="surface overflow-hidden p-2"><div className="relative"><CameraView key={cameraKey} ref={cameraRef} onReady={setReady} onError={cameraError} /><div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white"><span className={"h-2 w-2 rounded-full "+(ready?"bg-emerald-400":"bg-amber-400")}/>{ready?"Camera ready":"Camera preview"}</div><div className="absolute bottom-6 left-0 right-0 flex justify-center"><CaptureButton onCapture={capture} disabled={!ready} /></div></div><div className="flex items-start gap-3 px-3 py-4"><Camera className="mt-0.5 shrink-0 text-primary" size={19} aria-hidden="true"/><div><h2 className="text-sm font-semibold">Show us what needs attention</h2><p className="mt-1 text-xs leading-5 text-slate-500">Keep the issue in frame and take a clear photo. Your camera turns off after capture.</p></div></div></div>}
    {["locating","checking","submitting"].includes(step) && <LoadingState label={step === "locating" ? "Finding the issue location..." : step === "checking" ? "Checking for similar issues nearby..." : "Saving your report. Please keep this page open..."} />}
    {step === "form" && image && <form onSubmit={e=>{e.preventDefault();void check();}} className="surface grid gap-6 p-4 sm:p-6"><img src={image} alt="Captured civic issue" className="h-64 w-full rounded-lg object-cover" />{coords ? <div><h2 className="font-semibold mb-2">Where is the issue?</h2><MapOverlay lat={coords.lat} lng={coords.lng} onChange={(lat,lng)=>setCoords({lat,lng})} /><p className="text-sm mt-1">Drag the pin or tap the map. {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p></div> : <div><p>Location is required.</p><button type="button" className="secondary mt-2" onClick={locate}>Retry GPS location</button><button type="button" className="secondary mt-2 ml-2" onClick={()=>{setCoords({lat:13.0827,lng:80.2707});setNotice("Move the map pin to the actual issue location before submitting.");}}>Choose location on map</button></div>}<fieldset><legend className="font-semibold mb-2">Category</legend><CategoryChips selected={category} onSelect={setCategory} /></fieldset><label>Tell us a little more <span className="font-normal text-slate-400">(optional)</span><textarea placeholder="What happened? Add a nearby landmark to help the team find it." maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} rows={3} /><span className="mt-2 block text-right text-xs font-normal text-slate-400">{description.length}/2,000</span></label><button className="primary" disabled={busy || !coords}>{seconds>0?"Check nearby reports":"Submit report"}</button>{error.startsWith("Nearby reports") && <button type="button" className="secondary" onClick={submit}>Submit without duplicate check</button>}<button type="button" className="muted-link min-h-11" onClick={reset}>Retake photo</button></form>}
    {step === "proximity" && <ProximityModal nearby={nearby} onEndorse={endorse} onNewReport={submit} onCancel={()=>setStep("form")} busy={busy} />}
    {(step === "submitted" || step === "queued") && <div className="surface p-6 sm:p-10 text-center"><span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-teal-50 text-teal-700"><CheckCircle2 size={32} aria-hidden="true"/></span><h2 className="text-xl font-semibold text-primary">{step === "queued" ? "Report saved on this device" : "Report submitted"}</h2>{receipt ? <><p className="my-4 break-all">Your receipt ID<br/><strong className="mt-2 block rounded-xl bg-slate-50 p-3 font-mono text-xs">{receipt.complaint_id}</strong></p><p className="mb-4 text-sm text-slate-600">{receipt.ward_id ? "The report has been routed to the ward covering its location." : "Your issue is awaiting assignment."}</p><Link href={'/complaints/'+receipt.complaint_id} className="primary">Track this report</Link></> : <p className="my-4">Reconnect and keep this app open to upload. Your pending report is available below.</p>}<div className="mt-5"><button className="primary" onClick={reset}>Report another issue</button></div></div>}
  </section><aside className="hidden space-y-4 lg:block lg:sticky lg:top-28"><div className="surface p-6"><p className="eyebrow">Every report matters</p><h2 className="text-lg font-bold">From a photo to progress.</h2><div className="mt-6 space-y-5">{[{icon:Camera,title:"Capture the issue",text:"A clear photo helps the team understand the problem."},{icon:MapPin,title:"Confirm the location",text:"Move the map pin to the exact spot. Report from any area."},{icon:ClipboardList,title:"Follow the repair",text:"See updates in My reports and help verify the result."}].map(({icon:Icon,title,text})=><div key={title} className="flex gap-3"><span className="mt-0.5 rounded-lg bg-teal-50 p-2 text-teal-700"><Icon size={17} aria-hidden="true"/></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>)}</div></div><div className="rounded-2xl border border-teal-100 bg-teal-50 p-5"><ShieldCheck className="mb-3 text-teal-700" size={23} aria-hidden="true"/><h2 className="text-sm font-semibold text-teal-900">Already reported nearby?</h2><p className="mt-2 text-xs leading-5 text-teal-800">Endorse an existing issue to add your support. New reports are limited to one every 15 minutes.</p><Link href="/complaints" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800">Explore community issues<ArrowRight size={15} aria-hidden="true"/></Link></div></aside></div></main></>;
}
