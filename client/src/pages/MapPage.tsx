import { Layers, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import GoogleMap from "../components/GoogleMap";
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

  const markers = useMemo(
    () =>
      rows.map((item) => {
        const status = normalizeStatus(item);
        return {
          lat: Number(item.latitude),
          lng: Number(item.longitude),
          color: statusColors[status] ?? "#ef4444",
          title: item.ticket_number,
          infoHtml: `
            <div style="max-width:220px">
              <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(item.ticket_number)}</p>
              <p style="margin:0 0 4px;">${escapeHtml(item.title)}</p>
              ${item.citizen_name ? `<p style="margin:0 0 4px;color:#0f172a;"><strong>Citizen:</strong> ${escapeHtml(item.citizen_name)}</p>` : ""}
              ${item.category_name ? `<p style="margin:0 0 4px;color:#0f172a;"><strong>Category:</strong> ${escapeHtml(item.category_name)}</p>` : ""}
              <p style="margin:0 0 4px;color:#334155;">${escapeHtml(item.location)}</p>
              <p style="margin:0;color:#475569;text-transform:capitalize;">
                ${escapeHtml(isCitizen ? statusLabel(status, t) : statusLabelEnglish(status))}
              </p>
            </div>
          `
        };
      }),
    [rows, isCitizen, t]
  );

  return (
    <main className="h-[calc(100vh-85px)] w-full">
      <section className="relative h-full">
        <GoogleMap
          className="h-full w-full"
          center={{ lat: center[0], lng: center[1] }}
          zoom={12}
          markers={markers}
          fitToMarkers
        />

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
