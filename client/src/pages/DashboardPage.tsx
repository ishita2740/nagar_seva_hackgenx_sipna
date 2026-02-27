import { CircleCheck, Clock3, FileText, Filter, Plus, RotateCcw, Star } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listContractorGrievances, listGrievances, listMyGrievances } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";
import { Grievance } from "../types";

const FEEDBACK_STORAGE_KEY = "citizen-feedback-submitted";

export default function DashboardPage() {
  const { user, token } = useAuth();
  const { t } = useLanguage();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const [feedbackSubmittedIds, setFeedbackSubmittedIds] = useState<number[]>([]);
  const [feedbackDialogFor, setFeedbackDialogFor] = useState<Grievance | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const isStaff = user?.role === "authority" || user?.role === "contractor";
  const isCitizen = user?.role === "citizen";
  const previousStatuses = useRef<Map<number, string>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    if (!isCitizen) return;
    try {
      const stored = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as number[];
      if (Array.isArray(parsed)) {
        setFeedbackSubmittedIds(parsed.filter((value) => typeof value === "number"));
      }
    } catch (error) {
      console.error("Failed to restore feedback submitted state:", error);
    }
  }, [isCitizen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      let data: Grievance[] = [];
      if (user?.role === "citizen") {
        data = await listMyGrievances(token);
      } else if (user?.role === "contractor") {
        data = await listContractorGrievances(token);
      } else {
        data = await listGrievances(token);
      }
      if (cancelled) return;

      const nextStatuses = new Map<number, string>();
      data.forEach((item) => nextStatuses.set(item.id, normalizeStatus(item)));

      if (initialized.current) {
        const changed = data.find((item) => {
          const prev = previousStatuses.current.get(item.id);
          const curr = normalizeStatus(item);
          return prev && prev !== curr;
        });
        if (changed) {
          const current = normalizeStatus(changed);
          const previous = previousStatuses.current.get(changed.id);
          const closedByContractor = isCitizen && previous !== "closed" && current === "closed";
          const message = closedByContractor
            ? `${changed.ticket_number} has been resolved by the contractor. Please give your feedback.`
            : `Government authority has changed status of ${changed.ticket_number} to ${statusLabel(current, isCitizen ? t : undefined)}.`;
          setToast(message);
          window.alert(message);
        }
      } else {
        initialized.current = true;
      }

      previousStatuses.current = nextStatuses;
      setGrievances(data);
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, token, isCitizen, t]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const normalized = grievances.map((item) => normalizeStatus(item));
    const total = normalized.length;
    const closed = normalized.filter((status) => status === "closed").length;
    const accepted = normalized.filter((status) => status === "accepted").length;
    const inProgress = normalized.filter((status) => status === "in_progress").length;
    const open = total - closed;
    return { total, open, closed, accepted, inProgress };
  }, [grievances]);

  const categories = useMemo(() => {
    const all = grievances
      .map((item) => item.category_name)
      .filter((item): item is string => Boolean(item));
    return [...new Set(all)];
  }, [grievances]);

  const filteredGrievances = useMemo(() => {
    return grievances.filter((item) => {
      const normalizedStatus = normalizeStatus(item);
      const statusOk = statusFilter === "all" || normalizedStatus === statusFilter;
      const categoryOk = categoryFilter === "all" || item.category_name === categoryFilter;
      return statusOk && categoryOk;
    });
  }, [grievances, statusFilter, categoryFilter]);

  function openFeedbackDialog(item: Grievance) {
    setFeedbackDialogFor(item);
    setFeedbackRating(0);
  }

  function closeFeedbackDialog() {
    setFeedbackDialogFor(null);
    setFeedbackRating(0);
  }

  function onSubmitFeedbackRating() {
    if (!feedbackDialogFor) return;
    if (feedbackRating < 1) {
      window.alert("Please select a star rating before submitting.");
      return;
    }

    const complaint = feedbackDialogFor;
    setFeedbackSubmittedIds((previous) => {
      if (previous.includes(complaint.id)) return previous;
      const next = [...previous, complaint.id];
      try {
        window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.error("Failed to persist feedback submitted state:", error);
      }
      return next;
    });

    const thankYouMessage = `Thanks for rating ${complaint.ticket_number} with ${feedbackRating} star${feedbackRating > 1 ? "s" : ""}.`;
    setToast(thankYouMessage);
    window.alert(thankYouMessage);
    closeFeedbackDialog();
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {toast ? (
        <div className="fixed right-4 top-24 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-slate-900">{isStaff ? "Authority Console" : isCitizen ? t("myComplaints") : "My Complaints"}</h1>
          <p className="mt-1 text-2xl text-slate-600">
            {isStaff ? "Review, filter, and monitor all citizen complaints" : isCitizen ? t("trackMyIssues") : "Track all your reported issues"}
          </p>
        </div>
        {!isStaff ? (
          <Link
            to="/file-complaint"
            className="inline-flex items-center gap-2 rounded-xl bg-nagar-blue px-6 py-3 text-xl font-semibold text-white"
          >
            <Plus size={18} />
            {isCitizen ? t("newComplaint") : "New Complaint"}
          </Link>
        ) : null}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={isStaff ? "Total Cases" : isCitizen ? t("totalFiled") : "Total Filed"} value={stats.total} icon={<FileText size={20} />} />
        <StatCard title={isCitizen ? t("open") : "Open"} value={stats.open} icon={<Clock3 size={20} />} />
        <StatCard title={isCitizen ? t("closed") : "Closed"} value={stats.closed} icon={<CircleCheck size={20} />} />
        <StatCard title={isStaff ? "Accepted" : isCitizen ? t("inProgress") : "In Progress"} value={isStaff ? stats.accepted : stats.inProgress} icon={<RotateCcw size={20} />} />
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex text-slate-500">
          <Filter size={20} />
        </span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-12 min-w-52 rounded-xl border border-slate-300 bg-white px-4 text-lg"
        >
          <option value="all">{isCitizen ? t("allStatuses") : "All Statuses"}</option>
          <option value="submitted">{isCitizen ? t("submitted") : "Submitted"}</option>
          <option value="accepted">{isCitizen ? t("accepted") : "Accepted"}</option>
          <option value="in_progress">{isCitizen ? t("inProgress") : "In Progress"}</option>
          <option value="closed">{isCitizen ? t("closed") : "Closed"}</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-12 min-w-52 rounded-xl border border-slate-300 bg-white px-4 text-lg"
        >
          <option value="all">{isCitizen ? t("allCategories") : "All Categories"}</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {filteredGrievances.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 inline-flex rounded-2xl bg-slate-100 p-4 text-slate-500">
              <FileText size={34} />
            </div>
            <h2 className="text-4xl font-bold text-slate-900">{isCitizen ? t("noComplaintsFound") : "No complaints found"}</h2>
            <p className="mt-2 text-2xl text-slate-500">
              {isStaff ? "No complaints match the current filters." : isCitizen ? t("noComplaintsYet") : "You haven&apos;t filed any complaints yet."}
            </p>
            {!isStaff ? (
              <Link to="/file-complaint" className="mt-6 inline-flex rounded-xl bg-nagar-blue px-6 py-3 text-xl font-semibold text-white">
                {isCitizen ? t("fileFirstComplaint") : "File Your First Complaint"}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGrievances.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                {(() => {
                  const normalizedStatus = normalizeStatus(item);
                  const feedbackSubmitted = feedbackSubmittedIds.includes(item.id);
                  return (
                    <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {item.ticket_number} - {item.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                      {priorityLabel(item.priority)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize text-slate-700">
                      {statusLabel(normalizedStatus, isCitizen ? t : undefined)}
                    </span>
                    {isStaff ? (
                      <Link
                        to={`/authority/complaints/${item.id}`}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                      >
                        Action
                      </Link>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-slate-600">{item.location}</p>
                {isCitizen && normalizedStatus === "closed" ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-medium text-emerald-900">Issue resolved by contractor. Please provide feedback.</p>
                    <button
                      type="button"
                      disabled={feedbackSubmitted}
                      onClick={() => openFeedbackDialog(item)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {feedbackSubmitted ? "Feedback Submitted" : "Give Feedback"}
                    </button>
                  </div>
                ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </section>

      {feedbackDialogFor ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Rate Resolution</h3>
            <p className="mt-2 text-sm text-slate-600">
              {feedbackDialogFor.ticket_number} was resolved. Please rate your experience.
            </p>
            <div className="mt-4 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setFeedbackRating(star)}
                  className="rounded-md p-1 text-amber-500 hover:bg-amber-50"
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star size={30} fill={feedbackRating >= star ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeFeedbackDialog}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmitFeedbackRating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Submit Rating
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="inline-flex rounded-2xl bg-slate-100 p-3 text-nagar-blue">{icon}</div>
      <p className="mt-4 text-5xl font-black text-slate-900">{value}</p>
      <p className="text-xl text-slate-600">{title}</p>
    </article>
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

function statusLabel(status: string, t?: (key: string) => string) {
  if (status === "in_progress") return t ? t("inProgress") : "In Progress";
  if (status === "accepted") return t ? t("accepted") : "Accepted";
  if (status === "closed") return t ? t("closed") : "Closed";
  return t ? t("submitted") : "Submitted";
}

function priorityLabel(priority: Grievance["priority"]) {
  if (priority === "high" || priority === "urgent") return "🔴 High";
  if (priority === "low") return "🟢 Low";
  return "🟠 Medium";
}
