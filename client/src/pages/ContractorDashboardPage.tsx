import { CircleCheck, LoaderCircle, Wrench } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { closeContractorComplaint, listContractorGrievances, updateAuthorityComplaintStatus } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Grievance } from "../types";

type MediaItem = { url: string; type: "image" | "video" };

export default function ContractorDashboardPage() {
  const { token } = useAuth();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [closeOpenId, setCloseOpenId] = useState<number | null>(null);
  const [submittingCloseId, setSubmittingCloseId] = useState<number | null>(null);
  const [resolutionFiles, setResolutionFiles] = useState<Record<number, File | undefined>>({});

  async function loadComplaints() {
    if (!token) return;
    try {
      const data = await listContractorGrievances(token);
      setGrievances(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadComplaints();
    const timer = setInterval(() => {
      void loadComplaints();
    }, 10000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCount = useMemo(
    () => grievances.filter((item) => item.complaint_status === "accepted" || item.complaint_status === "in_progress").length,
    [grievances]
  );

  async function onStatus(id: number, status: "accepted" | "in_progress") {
    if (!token) return;
    setUpdatingId(id);
    try {
      await updateAuthorityComplaintStatus(token, id, status);
      setToast(`Status updated to ${status === "in_progress" ? "In Progress" : "Accepted"}.`);
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function onCloseSubmit(event: FormEvent<HTMLFormElement>, complaint: Grievance) {
    event.preventDefault();
    if (!token) return;
    const file = resolutionFiles[complaint.id];
    if (!file) {
      setError("Please upload a resolved issue image.");
      return;
    }

    setSubmittingCloseId(complaint.id);
    setError(null);
    try {
      await closeContractorComplaint(token, complaint.id, file);
      setResolutionFiles((prev) => ({ ...prev, [complaint.id]: undefined }));
      setCloseOpenId(null);
      setToast(`${complaint.ticket_number} marked as Resolved/Closed.`);
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close complaint");
    } finally {
      setSubmittingCloseId(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="inline-flex items-center gap-2 text-slate-600">
          <LoaderCircle className="animate-spin" size={18} /> Loading contractor complaints...
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {toast ? <div className="mb-4 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">{toast}</div> : null}
      <section className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-slate-900">Government Contractor Dashboard</h1>
          <p className="mt-1 text-xl text-slate-600">Accepted and in-progress complaints assigned for field action</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-500">Open Workload</p>
          <p className="text-3xl font-black text-slate-900">{openCount}</p>
        </div>
      </section>

      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p> : null}

      {grievances.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 inline-flex rounded-full bg-slate-100 p-4 text-slate-500">
            <CircleCheck size={30} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">No accepted or in-progress complaints</h2>
          <p className="mt-2 text-slate-500">New assigned complaint actions will appear here.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {grievances.map((item) => {
            const media = parseMedia(item.images_json);
            const imageOnly = media.filter((m) => m.type === "image");
            const closeOpen = closeOpenId === item.id;
            const busy = updatingId === item.id || submittingCloseId === item.id;

            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">
                      {item.ticket_number} - {item.title}
                    </h3>
                    <p className="mt-1 text-slate-700">{item.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{statusLabel(item)}</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Detail label="Citizen Name" value={item.citizen_name ?? item.reporter_name ?? "-"} />
                  <Detail label="Citizen Email" value={item.citizen_email ?? item.reporter_email ?? "-"} />
                  <Detail label="Citizen Mobile" value={item.citizen_phone ?? item.reporter_mobile ?? "-"} />
                  <Detail label="Department" value={item.assigned_department ?? "-"} />
                  <Detail label="Location" value={item.location} />
                  <Detail
                    label="Submitted On"
                    value={item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
                  />
                </div>

                <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="mb-3 text-lg font-semibold text-slate-900">Action</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onStatus(item.id, "accepted")}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      {busy ? "Updating..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onStatus(item.id, "in_progress")}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      {busy ? "Updating..." : "In Progress"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCloseOpenId((prev) => (prev === item.id ? null : item.id))}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      <Wrench size={16} />
                      Close
                    </button>
                  </div>
                </section>

                {closeOpen ? (
                  <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h4 className="text-lg font-semibold text-slate-900">Close Complaint</h4>
                    <p className="mt-1 text-sm text-slate-700">
                      Upload proof image of the resolved issue and submit to mark this complaint as Resolved/Closed.
                    </p>

                    <div className="mt-3">
                      <p className="mb-2 text-sm font-medium text-slate-700">Citizen Complaint Image</p>
                      {imageOnly.length > 0 ? (
                        <img src={imageOnly[0].url} alt="Citizen submitted complaint" className="h-44 w-full rounded-lg object-cover sm:w-72" />
                      ) : (
                        <p className="text-sm text-slate-500">No citizen image available.</p>
                      )}
                    </div>

                    <form onSubmit={(event) => void onCloseSubmit(event, item)} className="mt-4 space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Upload Resolved Issue Image
                        <input
                          type="file"
                          accept="image/*"
                          required
                          onChange={(event) =>
                            setResolutionFiles((prev) => ({
                              ...prev,
                              [item.id]: event.target.files?.[0]
                            }))
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={submittingCloseId === item.id || !resolutionFiles[item.id]}
                        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                      >
                        {submittingCloseId === item.id ? "Submitting..." : "Submit Resolution"}
                      </button>
                    </form>
                  </section>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}

function statusLabel(item: Grievance) {
  if (item.complaint_status === "in_progress") return "In Progress";
  if (item.complaint_status === "accepted") return "Accepted";
  return "Accepted";
}

function parseMedia(raw: string | null | undefined): MediaItem[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as string[];
    return list.map((url) => ({
      url,
      type: /\.(mp4|webm|mov)$/i.test(url) ? "video" : "image"
    }));
  } catch {
    return [];
  }
}
