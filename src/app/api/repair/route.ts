import { NextRequest, NextResponse } from "next/server";
import { readUploadForm } from "@/lib/utils/uploads";
import { authenticatedClient } from "@/lib/supabase/server";
import { MAX_IMAGE_BYTES, imageExtension, validUuid, errorMessage } from "@/lib/utils/validation";
export async function POST(req: NextRequest) {
  let cleanup: (() => Promise<unknown>) | undefined;
  try {
    const { client, user } = await authenticatedClient(req);
    const { data: role, error: roleError } = await client.rpc("get_my_staff_role");
    if (roleError) throw roleError;
    if (!role) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES + 65536) return NextResponse.json({ error: "Image is too large." }, { status: 413 });
    const form = await readUploadForm(req);
    const id = String(form.get("complaintId") ?? "");
    const file = form.get("image");
    if (!validUuid(id) || !file || typeof file === "string" || !file.size || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Choose a valid complaint and an image of 8 MB or smaller." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let ext: string;
    try { ext = imageExtension(bytes, file.type); } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 400 }); }
    const bucket = client.storage.from("complaint-photos");
    const fileName = user.id + '/repair-' + crypto.randomUUID() + '.' + ext;
    const { error: uploadError } = await bucket.upload(fileName, bytes, { contentType: file.type });
    if (uploadError) throw uploadError;
    cleanup = () => bucket.remove([fileName]);
    const { data: url } = bucket.getPublicUrl(fileName);
    const { data, error } = await client.rpc("submit_repair_proof", { p_complaint_id: id, p_repair_image_url: url.publicUrl });
    if (error) throw error;
    return NextResponse.json({ success: true, complaint: data });
  } catch (error) {
    if (errorMessage(error) === "UPLOAD_TOO_LARGE") return NextResponse.json({ error: "Image must be 8 MB or smaller." }, { status: 413 });
    if (cleanup) await cleanup().catch(() => undefined);
    const unauthorized = errorMessage(error) === "UNAUTHORIZED";
    return NextResponse.json({ error: unauthorized ? "Sign in again." : errorMessage(error) }, { status: unauthorized ? 401 : 400 });
  }
}
