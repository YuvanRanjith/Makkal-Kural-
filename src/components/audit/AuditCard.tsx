"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { castAuditVote } from "@/lib/supabase/queries";
import EvidenceImage from "@/components/ui/EvidenceImage";
import {Check, X} from "lucide-react";
import Timer from "./Timer";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { errorMessage } from "@/lib/utils/validation";
import { supabase } from "@/lib/supabase/client";
import type { Complaint, AuditVoteResult } from "@/types/ticket";

interface AuditCardProps {
  complaint: Complaint;
  userId: string;
  onVoted?: (result: AuditVoteResult) => void;
}

export default function AuditCard({ complaint, userId, onVoted }: AuditCardProps) {
  const [voted, setVoted] = useState<"confirm" | "reject" | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ confirm: number; reject: number } | null>(null);

  const [error,setError] = useState("");
  const [expired,setExpired] = useState(false);
  const [checking,setChecking] = useState(true);
  useEffect(() => {
    const update = () => setExpired(!complaint.verification_deadline || new Date(complaint.verification_deadline).getTime() <= Date.now());
    update(); const interval = setInterval(update, 1000);
    supabase.from("audit_votes").select("is_verified").eq("complaint_id",complaint.complaint_id).eq("user_id",userId).eq("audit_round",complaint.audit_round).maybeSingle().then(({data,error}) => {if(error)setError(error.message);else if(data)setVoted(data.is_verified ? "confirm" : "reject");setChecking(false);});
    return () => clearInterval(interval);
  }, [complaint.complaint_id,complaint.audit_round,complaint.verification_deadline,userId]);
  async function vote(isVerified: boolean) {
    if (loading || voted || expired || checking) return;
    setLoading(true);
    setError("");
    try {
      const res = await castAuditVote(complaint.complaint_id, userId, isVerified);
      setVoted(isVerified ? "confirm" : "reject");
      setResult({ confirm: res.confirm_votes, reject: res.reject_votes });
      onVoted?.(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-primary">{complaint.category}</span>
        {complaint.verification_deadline && (
          <Timer deadline={complaint.verification_deadline} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Original issue</p>
          <EvidenceImage zoom
            src={complaint.image_url}
            alt="Before repair"
            className="w-full h-40 sm:h-48 object-cover rounded-xl"
          />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Repair submitted</p>
          {complaint.repair_image_url ? (
            <img
              src={complaint.repair_image_url}
              alt="After repair"
              className="w-full h-32 object-cover rounded-lg"
            />
          ) : (
            <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
              Pending upload
            </div>
          )}
        </div>
      </div>

      {complaint.description && (
        <p className="text-sm text-gray-600 mb-3">{complaint.description}</p>
      )}

      <Link href={"/complaints/" + complaint.complaint_id} className="mb-3 inline-block text-sm text-primary underline">View report and repair status</Link>
      {error && <ErrorNotice message={error} />}
      {expired && <p role="status" className="mb-2 text-sm">The verification window has ended.</p>}
      {voted ? (
        <div className="text-center py-2 text-sm font-medium text-gray-600">
          Your vote:{" "}
          <span className={voted === "confirm" ? "text-primary" : "text-danger"}>
            {voted === "confirm" ? "Confirmed" : "Rejected"}
          </span>
          {result && (
            <p className="text-xs text-gray-400 mt-1">
              {result.confirm} confirm · {result.reject} reject
            </p>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => vote(true)}
            disabled={loading || expired || checking}
            className="primary flex-1"
          >
            <Check size={17} aria-hidden="true"/> Looks fixed
          </button>
          <button
            onClick={() => vote(false)}
            disabled={loading || expired || checking}
            className="secondary flex-1 !border-red-200 !text-red-700 hover:!bg-red-50"
          >
            <X size={17} aria-hidden="true"/> Needs more work
          </button>
        </div>
      )}
    </div>
  );
}