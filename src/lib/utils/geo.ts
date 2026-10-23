export interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Wraps the browser Geolocation API.
 * In development, falls back to NEXT_PUBLIC_DEV_FALLBACK_LAT/LNG if set,
 * so laptops without GPS can still test the full flow.
 */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    const fallbackLat = process.env.NEXT_PUBLIC_DEV_FALLBACK_LAT;
    const fallbackLng = process.env.NEXT_PUBLIC_DEV_FALLBACK_LNG;

    const useFallback = () => {
      if (process.env.NODE_ENV === "development" && fallbackLat && fallbackLng && Number.isFinite(Number(fallbackLat)) && Number.isFinite(Number(fallbackLng)) && Math.abs(Number(fallbackLat)) <= 90 && Math.abs(Number(fallbackLng)) <= 180) {
        console.warn("⚠️ Using DEV fallback location from .env.local");
        resolve({
          lat: parseFloat(fallbackLat),
          lng: parseFloat(fallbackLng),
          accuracy: 9999,
        });
        return true;
      }
      return false;
    };

    if (!navigator.geolocation) {
      if (!useFallback()) reject(new Error("Geolocation not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const reasons: Record<number, string> = {
          1: "PERMISSION_DENIED — you blocked location access for this site",
          2: "POSITION_UNAVAILABLE — device has no GPS / Wi-Fi positioning failed",
          3: "TIMEOUT — took too long to get a fix",
        };
        console.error("Geolocation error:", err.code, reasons[err.code] ?? err.message);

        if (!useFallback()) {
          reject(new Error(reasons[err.code] ?? err.message));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}