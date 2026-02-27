const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let googleMapsLoader: Promise<any> | null = null;

export function getGoogleMapsKey() {
  return GOOGLE_MAPS_API_KEY ?? "";
}

export async function loadGoogleMapsApi(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Google Maps can only load in browser");
  }

  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    throw new Error("VITE_GOOGLE_MAPS_API_KEY is missing");
  }

  if (window.google?.maps) {
    return window.google.maps;
  }

  if (googleMapsLoader) {
    return googleMapsLoader;
  }

  googleMapsLoader = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-loader="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = "true";
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const maps = await loadGoogleMapsApi();
    return await new Promise((resolve, reject) => {
      const geocoder = new maps.Geocoder();
      geocoder.geocode(
        {
          address,
          region: "IN"
        },
        (results: any[], status: string) => {
          if (status !== "OK" || !results?.[0]?.geometry?.location) {
            if (status === "ZERO_RESULTS") return resolve(null);
            return reject(new Error(`Address geocoding failed (${status})`));
          }
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
        }
      );
    });
  } catch {
    return geocodeAddressWithOsm(address);
  }
}

export async function reverseGeocodeByCoordinates(lat: number, lng: number): Promise<string | null> {
  try {
    const maps = await loadGoogleMapsApi();
    return await new Promise((resolve, reject) => {
      const geocoder = new maps.Geocoder();
      geocoder.geocode(
        {
          location: { lat, lng },
          language: "en"
        },
        (results: any[], status: string) => {
          if (status !== "OK") {
            if (status === "ZERO_RESULTS") return resolve(null);
            return reject(new Error(`Reverse geocoding failed (${status})`));
          }

          const ranked = results ?? [];
          const preferred =
            ranked.find((item) => item.types?.includes("street_address")) ??
            ranked.find((item) => item.types?.includes("premise")) ??
            ranked.find((item) => item.types?.includes("route")) ??
            ranked.find((item) => item.types?.includes("sublocality")) ??
            ranked[0];

          resolve(preferred?.formatted_address ?? null);
        }
      );
    });
  } catch {
    return reverseGeocodeWithOsm(lat, lng);
  }
}

async function reverseGeocodeWithOsm(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { display_name?: string };
    return json.display_name ?? null;
  } catch {
    return null;
  }
}

async function geocodeAddressWithOsm(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`
    );
    if (!response.ok) return null;
    const json = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = json[0];
    if (!first?.lat || !first?.lon) return null;
    return { lat: Number(first.lat), lng: Number(first.lon) };
  } catch {
    return null;
  }
}
