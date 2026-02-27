import { CheckCircle2, Circle, LoaderCircle, MapPin, Search, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { trackComplaintById } from "../lib/api";
import { useLanguage } from "../lib/language";
import { Grievance } from "../types";

export default function HomePage() {
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const isCitizen = user?.role === "citizen";
  const [ticket, setTicket] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Grievance & { tracking_stage: string }) | null>(null);

  const stages = useMemo(
    () => [
      { key: "submitted", label: "Submitted" },
      { key: "accepted", label: "Accepted" },
      { key: "in_progress", label: "In Progress" },
      { key: "closed", label: "Closed" }
    ].map((item) => ({ ...item, label: isCitizen ? t(item.key === "in_progress" ? "inProgress" : item.key) : item.label })),
    [isCitizen, t]
  );

  async function onTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    if (!token) {
      setError(isCitizen ? t("pleaseSignInFirst") : "Please sign in first.");
      return;
    }
    if (!ticket.trim()) {
      setError(isCitizen ? t("pleaseEnterComplaintId") : "Please enter complaint ID.");
      return;
    }

    setLoading(true);
    try {
      const response = await trackComplaintById(token, ticket.trim());
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : isCitizen ? t("unableToTrack") : "Unable to track complaint");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !result?.ticket_number) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const refreshed = await trackComplaintById(token, result.ticket_number);
        if (!cancelled) setResult(refreshed);
      } catch {
        // Keep existing result if polling fails.
      }
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, result?.ticket_number]);

  function stageState(stageKey: string) {
    const order = ["submitted", "accepted", "in_progress", "closed"];
    const currentIndex = order.indexOf(result?.tracking_stage ?? "submitted");
    const thisIndex = order.indexOf(stageKey);
    if (thisIndex < currentIndex) return "done";
    if (thisIndex === currentIndex) return "current";
    return "pending";
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-5 py-2 text-sky-800">
        <Sparkles size={16} />
        {isCitizen ? t("complaintTracking") : "Complaint Tracking"}
      </div>
      <h1 className="text-5xl font-black leading-tight text-nagar-ink md:text-6xl">
        {isCitizen ? t("trackComplaintById") : "Track Complaint by ID"}
      </h1>
      <p className="mt-6 max-w-3xl text-xl leading-relaxed text-slate-600">
        {isCitizen ? t("trackHelp") : "Enter your complaint ID and view current progress: Submitted, Accepted, In Progress, or Closed."}
      </p>

      <form onSubmit={onTrack} className="mt-9 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <input
            value={ticket}
            onChange={(event) => setTicket(event.target.value)}
            placeholder={isCitizen ? t("enterComplaintId") : "Enter complaint ID (e.g., CMP-ABC123-123)"}
            className="h-12 w-full rounded-xl border border-slate-300 px-4 text-lg outline-none focus:border-nagar-blue"
          />
          <button
            type="submit"
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-nagar-blue px-4 text-white"
          >
            {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}
            {isCitizen ? t("track") : "Track"}
          </button>
        </div>
        {error ? <p className="mt-3 text-left text-red-600">{error}</p> : null}
      </form>

      {result ? (
        <section className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
          <div className="mb-4">
            <p className="text-sm text-slate-500">{isCitizen ? t("complaintId") : "Complaint ID"}</p>
            <p className="text-xl font-bold text-slate-900">{result.ticket_number}</p>
            <p className="mt-1 text-slate-700">{result.title}</p>
            <p className="inline-flex items-center gap-1 text-slate-600">
              <MapPin size={14} /> {result.location}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {stages.map((stage) => {
              const state = stageState(stage.key);
              return (
                <div
                  key={stage.key}
                  className={`rounded-xl border p-3 text-center ${
                    state === "done"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : state === "current"
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <div className="mb-1 flex justify-center">
                    {state === "pending" ? <Circle size={18} /> : <CheckCircle2 size={18} />}
                  </div>
                  <p className="font-semibold">{stage.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
