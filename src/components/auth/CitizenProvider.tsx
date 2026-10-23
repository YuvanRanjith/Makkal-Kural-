"use client";
import {createContext,useCallback,useContext,useEffect,useState,useRef} from "react";
import {usePathname,useRouter} from "next/navigation";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase/client";
import {cacheCitizenContext,getCitizenContext,CitizenContext} from "@/lib/utils/session";
import {describeSupabaseError} from "@/lib/utils/supabase-errors";
interface State {user:User|null; profile:CitizenContext|null; loading:boolean; error:string; reload:()=>Promise<void>; logout:()=>Promise<void>;}
const Context=createContext<State|null>(null);
export function useCitizen(){const value=useContext(Context);if(!value)throw new Error("CitizenProvider is missing");return value;}
export default function CitizenProvider({children}:{children:React.ReactNode}) {
 const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<CitizenContext|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const pathname=usePathname(),router=useRouter();const loaded=useRef(false);
 const reload=useCallback(async()=>{if(!loaded.current)setLoading(true);setError("");try{
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  const next=data.session?.user;
  if(!next || next.is_anonymous || !next.phone){setUser(null);setProfile(null);cacheCitizenContext(null);return;}
  setUser(next);setProfile(await getCitizenContext());
 }catch(e){setError(describeSupabaseError(e));setProfile(null);}finally{loaded.current=true;setLoading(false);}},[]);
 useEffect(()=>{void reload();const {data}=supabase.auth.onAuthStateChange((event)=>{if(event!=="TOKEN_REFRESHED" && event!=="INITIAL_SESSION"){loaded.current=false;setUser(null);setProfile(null);setLoading(true);}setTimeout(()=>void reload(),0);});const refresh=()=>void reload();window.addEventListener("mk-report-saved",refresh);return()=>{data.subscription.unsubscribe();window.removeEventListener("mk-report-saved",refresh);};},[reload]);
 const logout=useCallback(async()=>{const {error}=await supabase.auth.signOut({scope:"local"});if(error)throw error;cacheCitizenContext(null);setUser(null);setProfile(null);router.replace("/login");},[router]);
 const staff=pathname.startsWith("/staff"),login=pathname==="/login";
 useEffect(()=>{if(staff || loading || error)return;if(!user && !login)router.replace("/login?next="+encodeURIComponent(pathname));},[staff,loading,error,user,login,pathname,router]);
 const allowed=staff || login || (!loading && !error && !!user && !!profile);
 return <Context.Provider value={{user,profile,loading,error,reload,logout}}>{allowed ? children : <main id="main-content" className="min-h-screen grid place-items-center p-6"><div className="max-w-md text-center"><p role={error?"alert":"status"}>{error || "Opening your account..."}</p>{error && <><button className="primary mt-4" onClick={reload}>Try again</button><button className="secondary mt-4 ml-2" onClick={()=>void logout()}>Log out</button></>}</div></main>}</Context.Provider>;
}
