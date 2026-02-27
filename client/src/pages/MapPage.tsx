import { Layers, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import { listMapMarkers } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";
import { Grievance } from "../types";

const statusColors: Record<string, string> = {
  submitted: "#ef4444",
  accepted: "#f59e0b",
  in_progress: "#3b82f6",
  closed: "#22c55e"
};

export default function MapPage() {
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const isCitizen = user?.role === "citizen";
  const [rows, setRows] = useState<Grievance[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      const data = await listMapMarkers(token);
      if (!cancelled) {
        setRows(data.filter((item) => item.latitude !== null && item.longitude !== null));
      }
    }
    if (!token) return;
    void load();
    const timer = setInterval(() => {
      void load();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  const center = useMemo<[number, number]>(() => {
    if (!rows.length) return [18.5204, 73.8567];
    const lat = rows.reduce((sum, row) => sum + Number(row.latitude ?? 0), 0) / rows.length;
    const lng = rows.reduce((sum, row) => sum + Number(row.longitude ?? 0), 0) / rows.length;
    return [lat, lng];
  }, [rows]);

  return (
    <main className="h-[calc(100vh-85px)] w-full">
      <section className="relative h-full">
        <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
          <FitToMarkers rows={rows} />
          <TileLayer attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {rows.map((item) => (
            <CircleMarker
              key={item.id}
              center={[Number(item.latitude), Number(item.longitude)]}
              radius={11}
              pathOptions={{ color: "white", weight: 2, fillColor: statusColors[normalizeStatus(item)] ?? "#ef4444", fillOpacity: 0.95 }}
            >
              <Popup>
                <p className="font-semibold">{item.ticket_number}</p>
                <p>{item.title}</p>
                <p className="text-slate-700">{item.location}</p>
                <p className="capitalize text-slate-600">
                  {isCitizen ? statusLabel(normalizeStatus(item), t) : statusLabelEnglish(normalizeStatus(item))}
                </p>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="absolute left-5 top-5 z-[500] rounded-xl border border-slate-200 bg-white p-3 shadow-md">
          <div className="inline-flex items-center gap-2 rounded-lg bg-nagar-blue px-3 py-2 text-white">
            <MapPin size={16} />
            {isCitizen ? t("markers") : "Markers"}
          </div>
        </div>

        <div className="absolute bottom-5 right-5 z-[500] rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <p className="mb-2 inline-flex items-center gap-2 font-semibold text-slate-700">
            <Layers size={16} />
            {isCitizen ? t("statusLegend") : "Status Legend"}
          </p>
          <ul className="space-y-2 text-slate-700">
            {Object.entries(statusColors).map(([status, color]) => (
              <li key={status} className="flex items-center gap-2 capitalize">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                {isCitizen ? statusLabel(status, t) : status.replace("_", " ")}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500">
            {isCitizen ? t("complaintsCount", { count: rows.length }) : `${rows.length} complaints`}
          </p>
        </div>
      </section>
    </main>
  );
}

function normalizeStatus(item: Grievance) {
  if (item.complaint_status === "accepted") return "accepted";
  if (item.complaint_status === "in_progress") return "in_progress";
  if (item.complaint_status === "closed") return "closed";
  if (item.status === "resolved") return "closed";
  if (item.status === "under_review" || item.status === "assigned" || item.status === "escalated" || item.status === "reopened") return "accepted";
  if (item.status === "in_progress" || item.status === "awaiting_confirmation") return "in_progress";
  if (item.status === "closed") return "closed";
  return "submitted";
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "in_progress") return t("inProgress");
  if (status === "accepted") return t("accepted");
  if (status === "closed") return t("closed");
  return t("submitted");
}

function statusLabelEnglish(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "accepted") return "Accepted";
  if (status === "closed") return "Closed";
  return "Submitted";
}

function FitToMarkers({ rows }: { rows: Grievance[] }) {
  const map = useMap();

  useEffect(() => {
    if (rows.length === 0) return;
    const points = rows.map((item) => [Number(item.latitude), Number(item.longitude)] as [number, number]);
    const bounds = new LatLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [rows, map]);

  return null;
}
