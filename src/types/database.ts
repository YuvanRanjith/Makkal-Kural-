export type ComplaintStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "RESOLVED"
  | "REJECTED";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          user_id: string;
          masked_phone: string | null;
          ward_id: number | null;
          is_anonymous: boolean;
          created_at: string;
        };
        Insert: {
          user_id?: string;
          masked_phone?: string | null;
          is_anonymous?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };

      wards: {
        Row: {
          ward_id: number;
          ward_name: string;
          zone_name: string;
          boundary: unknown;
        };
        Insert: {
          ward_id: number;
          ward_name: string;
          zone_name: string;
          boundary: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["wards"]["Insert"]>;
      };

      complaints: {
        Row: {
          complaint_id: string;
          user_id: string | null;
          category: string;
          description: string | null;
          image_url: string;
          repair_image_url: string | null;
          location: unknown;
          ward_id: number | null;
          status: ComplaintStatus;
          upvote_count: number;
          created_at: string;
          verification_deadline: string | null;
          assigned_to: string | null;
          resolved_at: string | null;
          request_id: string | null;
          audit_round: number;
        };
        Insert: {
          user_id?: string | null;
          category: string;
          description?: string | null;
          image_url: string;
          location: unknown;
          request_id?: string;
          ward_id?: number | null;
          status?: ComplaintStatus;
        };
        Update: Partial<Database["public"]["Tables"]["complaints"]["Insert"]>;
      };

      complaint_endorsements: {
        Row: {
          endorsement_id: string;
          complaint_id: string | null;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          complaint_id: string;
          user_id: string;
        };
        Update: never;
      };

      audit_votes: {
        Row: {
          vote_id: string;
          complaint_id: string | null;
          user_id: string | null;
          is_verified: boolean;
          feedback_notes: string | null;
          audit_round: number;
          created_at: string;
        };
        Insert: {
          complaint_id: string;
          user_id: string;
          is_verified: boolean;
          feedback_notes?: string | null;
          audit_round?: number;
        };
        Update: never;
      };
    };
  };
}
