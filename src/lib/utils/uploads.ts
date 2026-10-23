import { MAX_IMAGE_BYTES } from "./validation";
export async function readUploadForm(request: Request): Promise<FormData> {
  const limit = MAX_IMAGE_BYTES + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw new Error("UPLOAD_TOO_LARGE");
  if (!request.body) throw new Error("Upload body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Error("UPLOAD_TOO_LARGE"); }
    chunks.push(result.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
}
