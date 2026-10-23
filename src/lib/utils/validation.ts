import { CATEGORIES } from "@/types/ticket";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export function validCoordinates(lat: number, lng: number) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
export function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function validateReport(category: string, description: string, lat: number, lng: number, phone: string) {
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new Error("Select a valid category.");
  if (!validCoordinates(lat, lng)) throw new Error("Choose a valid location.");
  if (description.length > 2000) throw new Error("Description must be 2,000 characters or fewer.");
  if (phone && !/^\+?[\d ()-]{8,20}$/.test(phone)) throw new Error("Enter a valid phone number.");
  if (phone && (phone.replace(/\D/g, "").length < 10 || phone.replace(/\D/g, "").length > 15)) throw new Error("Phone number must contain 10–15 digits.");
}
export function imageExtension(bytes: Uint8Array, mime: string): string {
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (mime === "image/png" && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "png";
  if (mime === "image/webp" && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "webp";
  throw new Error("Upload a valid JPEG, PNG, or WebP image.");
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Something went wrong. Please try again."; }
