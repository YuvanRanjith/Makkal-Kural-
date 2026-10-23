import { supabase, requireSupabaseConfig } from "@/lib/supabase/client";
const CACHE="mk_citizen_context";
export interface CitizenContext { user_id:string; ward_id:number|null; ward_name:string|null; next_report_at:string|null; }
export function readCitizenCache(): CitizenContext|null {try{return JSON.parse(localStorage.getItem(CACHE)||"null");}catch{return null;}}
export function cacheCitizenContext(value:CitizenContext|null) {try{if(value)localStorage.setItem(CACHE,JSON.stringify(value));else localStorage.removeItem(CACHE);}catch{}}
export function getOfflineOwnerId(){return readCitizenCache()?.user_id || "";}
export async function getCitizenContext():Promise<CitizenContext> {
 requireSupabaseConfig();
 const {data:session,error:sessionError}=await supabase.auth.getSession();
 if(sessionError)throw sessionError;
 if(!session.session || session.session.user.is_anonymous || !session.session.user.phone)throw new Error("Please log in with your phone number and password.");
 if(!navigator.onLine){const cached=readCitizenCache();if(cached?.user_id===session.session.user.id)return cached;throw new Error("Connect once to load your ward.");}
 const {data,error}=await supabase.rpc("get_citizen_context");if(error)throw error;
 cacheCitizenContext(data);return data;
}
export async function getOrCreateUserId():Promise<string> {
 const context=await getCitizenContext();return context.user_id;
}
export async function attachPhoneToUser(userId:string,maskedPhone:string) {
 const {error}=await supabase.rpc("update_user_phone",{p_user_id:userId,p_masked_phone:maskedPhone});if(error)throw error;
}
export async function getAccessToken(client=supabase,expectedUserId?:string) {
 const {data,error}=await client.auth.getSession();if(error || !data.session)throw new Error("Your session expired. Please log in again.");
 if(expectedUserId && (data.session.user.id!==expectedUserId || data.session.user.is_anonymous || !data.session.user.phone))throw new Error("Log in to the account that created this pending report.");
 return data.session.access_token;
}
