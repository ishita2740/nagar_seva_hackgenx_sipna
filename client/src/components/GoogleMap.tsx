import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsApi } from "../lib/googleMaps";

type MarkerInput = {
  lat: number;
  lng: number;
  title?: string;
  color?: string;
  infoHtml?: string;
};

type Props = {
  className?: string;
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MarkerInput[];
  fitToMarkers?: boolean;
};

export default function GoogleMap({ className, center, zoom = 12, markers = [], fitToMarkers = false }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function initMap() {
      if (!mapContainerRef.current) return;
      try {
        const maps = await loadGoogleMapsApi();
        if (!active) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center,
            zoom,
            mapTypeControl: false,
            streetViewControl: false
          });
        } else {
          mapRef.current.setCenter(center);
          mapRef.current.setZoom(zoom);
        }

        markerRefs.current.forEach((marker) => marker.setMap(null));
        markerRefs.current = [];

        const bounds = new maps.LatLngBounds();
        markers.forEach((item) => {
          const marker = new maps.Marker({
            position: { lat: item.lat, lng: item.lng },
            map: mapRef.current,
            title: item.title,
            icon: item.color
              ? {
                  path: maps.SymbolPath.CIRCLE,
                  fillColor: item.color,
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 2,
                  scale: 8
                }
              : undefined
          });

          if (item.infoHtml) {
            const infoWindow = new maps.InfoWindow({ content: item.infoHtml });
            marker.addListener("click", () => {
              infoWindow.open({ map: mapRef.current, anchor: marker });
            });
          }

          markerRefs.current.push(marker);
          bounds.extend({ lat: item.lat, lng: item.lng });
        });

        if (fitToMarkers && markers.length > 1) {
          mapRef.current.fitBounds(bounds, 40);
        } else if (fitToMarkers && markers.length === 1) {
          mapRef.current.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
          mapRef.current.setZoom(Math.max(zoom, 14));
        }

        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to initialize Google Maps");
      }
    }

    void initMap();

    return () => {
      active = false;
    };
  }, [center, zoom, markers, fitToMarkers]);

  if (error) {
    return <div className={className}>Map unavailable: {error}</div>;
  }

  return <div ref={mapContainerRef} className={className} />;
}
