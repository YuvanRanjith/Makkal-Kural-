import {nearbyBounds, type BrowseArea} from "@/lib/utils/area";
import { authorizedPhotos } from "./photos";
import { visibleWardLayers } from "@/lib/utils/ward-layers";
import { supabase, staffSupabase } from "./client";
import type { Complaint, NearbyComplaint, AuditVoteResult, WardHeatmapData } from "@/types/ticket";
function applyArea(query:any,area?:BrowseArea){
 if(area?.all || !area)return query;
 if(area.lat!==undefined && area.lng!==undefined){const b=nearbyBounds(area.lat,area.lng);return query.gte('latitude',b.south).lte('latitude',b.north).gte('longitude',b.west).lte('longitude',b.east);}
 if(area.wardId!==undefined)return query.eq('ward_id',area.wardId);
 return query;
}
export async function checkProximity(lat: number, lng: number, radiusMeters = 15): Promise<NearbyComplaint[]> {
  const { data, error } = await supabase.rpc("check_nearby_complaints", { lat, lng, radius_meters: radiusMeters });
  if (error) throw error;
 const rows=data ?? [];const photos=await authorizedPhotos(supabase, rows.map((row:NearbyComplaint)=>({...row,repair_image_url:null})));
 return rows.map((row:NearbyComplaint,index:number)=>({...row,image_url:photos[index].image_url}));
}
export async function endorseComplaint(complaintId: string, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("endorse_complaint", { p_complaint_id: complaintId, p_user_id: userId });
  if (error) throw error; return data;
}
export async function getActiveAudits(area?:BrowseArea): Promise<Complaint[]> {
  const { data, error } = await applyArea(supabase.from("complaint_details").select("*"),area).eq("status", "PENDING_VERIFICATION").gt("verification_deadline", new Date().toISOString()).order("verification_deadline");
  if (error) throw error; return authorizedPhotos(supabase, data ?? []);
}
export async function castAuditVote(complaintId: string, userId: string, isVerified: boolean, feedbackNotes?: string): Promise<AuditVoteResult> {
  const { data, error } = await supabase.rpc("cast_audit_vote", { p_complaint_id: complaintId, p_user_id: userId, p_is_verified: isVerified, p_feedback_notes: feedbackNotes ?? null });
  if (error) throw error; return data[0];
}
export async function getWardHeatmapData(): Promise<WardHeatmapData[]> {
  const { data, error } = await supabase.rpc("get_ward_heatmap_data");
  if (error) throw error; return visibleWardLayers(data ?? []);
}
export async function getComplaintsInBounds(minLat: number, minLng: number, maxLat: number, maxLng: number): Promise<Complaint[]> {
  const { data, error } = await supabase.from("complaint_details").select("*").gte("latitude", minLat).lte("latitude", maxLat).gte("longitude", minLng).lte("longitude", maxLng).order("created_at", { ascending: false }).limit(500);
  if (error) throw error; return authorizedPhotos(supabase, data ?? []);
}
export async function listComplaints(options: { userId?: string; status?: string; category?: string; page?: number; staff?: boolean; area?:BrowseArea } = {}): Promise<{ complaints: Complaint[]; count: number }> {
  let query = (options.staff ? staffSupabase : supabase).from("complaint_details").select("*", { count: "exact" });
  if(!options.staff && !options.userId)query=applyArea(query,options.area);
  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.status) query = query.eq("status", options.status);
  if (options.category) query = query.eq("category", options.category);
  const start = (options.page ?? 0) * 20;
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(start, start + 19);
  if (error) throw error; return { complaints: await authorizedPhotos(options.staff ? staffSupabase : supabase, data ?? []), count: count ?? 0 };
}
export async function getComplaint(id: string): Promise<Complaint | null> {
  const { data, error } = await supabase.from("complaint_details").select("*").eq("complaint_id", id).maybeSingle();
  if (error) throw error; return data ? (await authorizedPhotos(supabase, [data]))[0] : null;
}
export async function getStaffRole(): Promise<"admin" | "contractor" | null> {
  const { data, error } = await staffSupabase.rpc("get_my_staff_role");
  if (error) throw error; return data;
}
export async function startWork(id: string) {
  const { error } = await staffSupabase.rpc("start_work", { p_complaint_id: id });
  if (error) throw error;
}

export interface StaffMember { user_id: string; email: string; role: "admin" | "contractor"; }
export async function getStaffMembers(): Promise<StaffMember[]> {
 const { data,error }=await staffSupabase.rpc("get_staff_members");if(error)throw error;return data ?? [];
}
export async function assignWork(complaintId:string,staffId:string) {
 const { error }=await staffSupabase.rpc("assign_work",{p_complaint_id:complaintId,p_staff_id:staffId});if(error)throw error;
}
