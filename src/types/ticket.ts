import type { ComplaintStatus } from "./database";

export type { ComplaintStatus };

export const CATEGORIES = ["Pothole", "Streetlight", "Drainage", "Garbage", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Complaint {
  complaint_id: string;
  user_id: string | null;
  category: Category | string;
  description: string | null;
  image_url: string;
  repair_image_url: string | null;
  latitude: number;
  longitude: number;
  ward_id: number | null;
  ward_name?: string;
  status: ComplaintStatus;
  upvote_count: number;
  created_at: string;
  verification_deadline: string | null;
  resolved_at: string | null;
  assigned_to: string | null;
  audit_round: number;
  request_id: string | null;
}

export interface NearbyComplaint {
  complaint_id: string;
  category: string;
  image_url: string;
  status: ComplaintStatus;
  upvote_count: number;
  distance_meters: number;
  created_at: string;
}

export interface AuditVoteResult {
  confirm_votes: number;
  reject_votes: number;
  new_status: ComplaintStatus;
}

export interface PhotoMetadata {
  latitude: number;
  longitude: number;
  timestamp: string;
  deviceInfo?: string;
}

export interface WardHeatmapData {
  ward_id: number;
  ward_name: string;
  zone_name: string;
  open_count: number;
  in_progress_count: number;
  pending_count: number;
  rejected_count: number;
  resolved_count: number;
  total_count: number;
  avg_resolution_hours: number | null;
  health_score: number;
  boundary_geojson: string;
}
