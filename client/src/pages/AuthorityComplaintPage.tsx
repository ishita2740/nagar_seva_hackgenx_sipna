import { LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { Link, useParams } from "react-router-dom";
import { closeContractorComplaint, getAuthorityComplaint, updateAuthorityComplaintStatus } from "../lib/api";
import { useAuth } from "../lib/auth";

type MediaItem = { url: string; type: "image" | "video" };

export default function AuthorityComplaintPage() {
  const { token } = useAuth();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [complaint, setComplaint] = useState<any>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolutionImage, setResolutionImage] = useState<File | null>(null);

  useEffect(() => {
    async function load() {
      if (!token || !id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getAuthorityComplaint(token, Number(id));
        setComplaint(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load complaint");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token, id]);

  const media = useMemo<MediaItem[]>(() => {
    const raw = complaint?.images_json;
    if (!raw) return [];
    try {
      const list = JSON.parse(raw) as string[];
      return list.map((url) => ({
        url: normalizeMediaUrl(url),
        type: /\.(mp4|webm|mov)$/i.test(url) ? "video" : "image"
      }));
    } catch {
      return [];
    }
  }, [complaint]);

  async function onStatus(status: "accepted" | "in_progress" | "closed") {
    if (!token || !id) return;
    setUpdating(true);
    setError(null);
    try {
      await updateAuthorityComplaintStatus(token, Number(id), status);
      const refreshed = await getAuthorityComplaint(token, Number(id));
      setComplaint(refreshed);
      const message = `Government authority has changed status to ${status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}.`;
      setToast(message);
      window.alert(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  async function onCloseSubmit() {
    if (!token || !id || !resolutionImage) return;
    setUpdating(true);
    setError(null);
    try {
      await closeContractorComplaint(token, Number(id), resolutionImage);
      const refreshed = await getAuthorityComplaint(token, Number(id));
      setComplaint(refreshed);
      setResolutionImage(null);
      setCloseOpen(false);
      const message = "Complaint marked as Resolved/Closed.";
      setToast(message);
      window.alert(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close complaint");
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="inline-flex items-center gap-2 text-slate-600">
          <LoaderCircle className="animate-spin" size={18} /> Loading complaint...
        </p>
      </main>
    );
  }

  if (!complaint) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-red-600">{error ?? "Complaint not found"}</p>
        <Link to="/dashboard" className="mt-3 inline-block text-blue-700 underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {toast ? (
        <div className="mb-4 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">{toast}</div>
      ) : null}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900">Complaint Management</h1>
          <p className="text-slate-600">{complaint.ticket_number}</p>
        </div>
        <Link to="/dashboard" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700">
          Back
        </Link>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p> : null}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <Info label="Citizen Name" value={complaint.citizen_name ?? complaint.reporter_name} />
        <Info label="Email" value={complaint.citizen_email ?? complaint.reporter_email} />
        <Info label="Mobile" value={complaint.citizen_phone ?? complaint.reporter_mobile ?? "-"} />
        <Info label="Department" value={complaint.assigned_department ?? "General Department"} />
        <Info label="Current Status" value={statusLabel(complaint)} />
        <Info label="Submitted On" value={new Date(complaint.created_at).toLocaleString()} />
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Complaint Description</h2>
        <p className="mt-2 text-slate-700">{complaint.description}</p>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Uploaded Photos / Videos</h2>
        {media.length === 0 ? (
          <p className="mt-2 text-slate-500">No media uploaded.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((item) =>
              item.type === "video" ? (
                <video key={item.url} src={item.url} controls className="h-40 w-full rounded-xl object-cover" />
              ) : (
                <img key={item.url} src={item.url} alt="Complaint media" className="h-40 w-full rounded-xl object-cover" />
              )
            )}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xl font-bold text-slate-900">Complaint Location</h2>
        <p className="mb-3 inline-flex items-center gap-2 text-slate-700">
          <MapPin size={16} />
          {complaint.location}
        </p>
        {complaint.latitude !== null && complaint.longitude !== null ? (
          <div className="h-72 overflow-hidden rounded-xl">
            <MapContainer center={[Number(complaint.latitude), Number(complaint.longitude)]} zoom={14} className="h-full w-full">
              <TileLayer attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <CircleMarker center={[Number(complaint.latitude), Number(complaint.longitude)]} radius={10} pathOptions={{ color: "white", weight: 2, fillColor: "#0A4C84", fillOpacity: 0.9 }}>
                <Popup>{complaint.location}</Popup>
              </CircleMarker>
            </MapContainer>
          </div>
        ) : (
          <p className="text-slate-500">Location coordinates not available.</p>
        )}
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          disabled={updating}
          onClick={() => onStatus("accepted")}
          className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white disabled:opacity-70"
        >
          {updating ? "Updating..." : "Accept"}
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => onStatus("in_progress")}
          className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-70"
        >
          {updating ? "Updating..." : "In Progress"}
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => setCloseOpen((prev) => !prev)}
          className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-70"
        >
          {closeOpen ? "Hide Close Form" : "Close"}
        </button>
      </section>

      {closeOpen ? (
        <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Close Complaint</h2>
          <p className="mt-1 text-slate-700">Upload proof image of the resolved issue to confirm closure.</p>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Citizen Complaint Image</p>
            {media.find((item) => item.type === "image") ? (
              <img
                src={media.find((item) => item.type === "image")!.url}
                alt="Citizen complaint"
                className="h-44 w-full rounded-xl object-cover sm:w-72"
              />
            ) : (
              <p className="text-sm text-slate-500">No citizen image available.</p>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">
              Upload Resolved Issue Image
              <input
                type="file"
                accept="image/*"
                required
                onChange={(event) => setResolutionImage(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={updating || !resolutionImage}
            onClick={() => void onCloseSubmit()}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {updating ? "Submitting..." : "Submit Resolution"}
          </button>
        </section>
      ) : null}
    </main>
  );
}

function normalizeMediaUrl(rawUrl: string) {
  const cleaned = String(rawUrl ?? "").trim().replace(/\\/g, "/");
  if (!cleaned) return "";
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://") || cleaned.startsWith("data:")) return cleaned;
  if (cleaned.startsWith("/uploads/")) return cleaned;
  if (cleaned.startsWith("uploads/")) return `/${cleaned}`;
  const uploadsIndex = cleaned.toLowerCase().indexOf("/uploads/");
  if (uploadsIndex >= 0) return cleaned.slice(uploadsIndex);
  const fileName = cleaned.split("/").pop();
  return fileName ? `/uploads/${fileName}` : cleaned;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function statusLabel(complaint: { status?: string; complaint_status?: string }) {
  if (complaint.complaint_status === "accepted") return "Accepted";
  if (complaint.complaint_status === "in_progress") return "In Progress";
  if (complaint.complaint_status === "closed") return "Closed";
  if (complaint.status === "resolved") return "Closed";
  if (complaint.status === "under_review" || complaint.status === "assigned" || complaint.status === "escalated" || complaint.status === "reopened") return "Accepted";
  if (complaint.status === "in_progress" || complaint.status === "awaiting_confirmation") return "In Progress";
  if (complaint.status === "closed") return "Closed";
  return "Submitted";
}
