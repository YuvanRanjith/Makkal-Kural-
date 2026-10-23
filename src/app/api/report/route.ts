import { NextRequest, NextResponse } from "next/server";
import { readUploadForm } from "@/lib/utils/uploads";
import { authenticatedClient } from "@/lib/supabase/server";
import { maskPhoneNumber } from "@/lib/utils/privacy";
import { MAX_IMAGE_BYTES, imageExtension, validateReport, validUuid, errorMessage } from "@/lib/utils/validation";
export async function POST(req: NextRequest) {
  let stage: "session" | "lookup" | "upload" | "save" = "session";
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const { client, user } = await authenticatedClient(req);
    if (user.is_anonymous || !user.phone) return NextResponse.json({ error: "Log in with your phone number and password before reporting." }, { status: 401 });
    if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES + 65536) return NextResponse.json({ error: "Image must be 8 MB or smaller." }, { status: 413 });
    const form = await readUploadForm(req);
    const category = String(form.get("category") ?? "");
    const description = String(form.get("description") ?? "").trim();
    const latText = form.get("latitude"), lngText = form.get("longitude");
    const latitude = latText === null || latText === "" ? NaN : Number(latText);
    const longitude = lngText === null || lngText === "" ? NaN : Number(lngText);
    const phone = String(form.get("phone") ?? "").trim();
    const requestId = String(form.get("requestId") ?? "");
    const maskedPhone = String(form.get("maskedPhone") ?? "");
    const file = form.get("image");
    try {
      validateReport(category, description, latitude, longitude, phone);
      if (maskedPhone && !/^\+[0-9]{1,5} [0-9]{2}\*{6}[0-9]{2}$/.test(maskedPhone)) throw new Error("Invalid masked phone.");
      if (!validUuid(requestId)) throw new Error("Invalid report request ID.");
      if (!file || typeof file === "string" || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Choose an image of 8 MB or smaller.");
    } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 400 }); }
    if (!file || typeof file === "string") return NextResponse.json({ error: "Image is required." }, { status: 400 });
    stage = "lookup";
    const { data: existing, error: lookupError } = await client.from("complaint_details").select("*").eq("user_id", user.id).eq("request_id", requestId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return NextResponse.json({ success: true, complaint: existing });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let ext: string;
    try { ext = imageExtension(bytes, file.type); } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 400 }); }
    const fileName = user.id + '/' + requestId + '.' + ext;
    const bucket = client.storage.from("complaint-photos");
    stage = "upload";
    const { error: uploadError } = await bucket.upload(fileName, bytes, { contentType: file.type, upsert: false });
    if (uploadError && !("statusCode" in uploadError && String(uploadError.statusCode) === "409")) throw uploadError;
    cleanup = async () => {
      const { data, error } = await client.from("complaint_details").select("complaint_id").eq("user_id", user.id).eq("request_id", requestId).maybeSingle();
      if (!error && !data) await bucket.remove([fileName]);
    };
    const { data: url } = bucket.getPublicUrl(fileName);
    stage = "save";
    const { data: complaint, error } = await client.rpc("create_report", { p_category: category, p_description: description || null, p_image_url: url.publicUrl, p_lat: latitude, p_lng: longitude, p_request_id: requestId, p_masked_phone: phone ? maskPhoneNumber(phone) : maskedPhone || null });
    if (error) throw error;
    return NextResponse.json({ success: true, complaint });
  } catch (error) {
    if (errorMessage(error) === "REPORT_COOLDOWN") {
      if (cleanup) await cleanup().catch(() => undefined);
      const raw=error && typeof error==="object" && "details" in error ? String(error.details) : "";
      const deadline=Date.parse(raw);const retryAt=Number.isFinite(deadline)?new Date(deadline).toISOString():new Date(Date.now()+15*60000).toISOString();
      const seconds=Math.max(1,Math.ceil((Date.parse(retryAt)-Date.now())/1000));
      return NextResponse.json({error:"You can submit one new report every 15 minutes. Please wait before reporting again.",retryAt},{status:429,headers:{"Retry-After":String(seconds)}});
    }
    if (errorMessage(error) === "UPLOAD_TOO_LARGE") return NextResponse.json({ error: "Image must be 8 MB or smaller." }, { status: 413 });
    if (cleanup) await cleanup().catch(() => undefined);
    const unauthorized = errorMessage(error) === "UNAUTHORIZED";
    const detail = errorMessage(error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    console.error("Report submission failed:", { stage, message: detail, code });
    const errorLabels = { session: "Could not verify your session.", lookup: "Could not check existing reports.", upload: "Your photo could not be uploaded.", save: "Your photo uploaded, but the report could not be saved." };
    return NextResponse.json({ error: unauthorized ? "Your session expired. Reconnect and try again." : errorLabels[stage] + " You can retry the same photo.", ...(process.env.NODE_ENV === "development" && !unauthorized ? { detail, stage, code } : {}) }, { status: unauthorized ? 401 : 500 });
  }
}
