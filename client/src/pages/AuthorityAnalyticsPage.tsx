import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { listGrievances } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Grievance } from "../types";

const palette = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

export default function AuthorityAnalyticsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      setLoading(true);
      const data = await listGrievances(token);
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const statusData = useMemo(() => toPieData(rows, (item) => normalizeStatus(item)), [rows]);
  const categoryData = useMemo(() => toPieData(rows, (item) => item.category_name ?? "Uncategorized"), [rows]);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="inline-flex items-center gap-2 text-slate-600">
          <LoaderCircle className="animate-spin" size={18} /> Loading analytics...
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <section className="mb-6">
        <h1 className="text-5xl font-black text-slate-900">Complaint Analytics</h1>
        <p className="mt-1 text-xl text-slate-600">Visual breakdown of complaints by status and category.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="By Status" data={statusData} />
        <ChartCard title="By Category" data={categoryData} />
      </section>
    </main>
  );
}

function ChartCard({ title, data }: { title: string; data: PieSlice[] }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      {data.length === 0 ? (
        <p className="mt-4 text-slate-500">No data available.</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-[240px_1fr] sm:items-center">
          <PieChart slices={data} />
          <ul className="space-y-2">
            {data.map((slice, index) => (
              <li key={slice.label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                  {slice.label}
                </span>
                <span className="font-semibold text-slate-900">{slice.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function PieChart({ slices }: { slices: PieSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 90;
  const center = 110;
  let angleCursor = -90;

  return (
    <svg viewBox="0 0 220 220" className="h-56 w-56">
      {slices.map((slice, index) => {
        const angle = (slice.value / total) * 360;
        const start = polar(center, center, radius, angleCursor);
        const end = polar(center, center, radius, angleCursor + angle);
        const largeArc = angle > 180 ? 1 : 0;
        angleCursor += angle;
        const path = `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
        return <path key={slice.label} d={path} fill={palette[index % palette.length]} />;
      })}
      <circle cx={center} cy={center} r={42} fill="white" />
      <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" className="fill-slate-700 text-[14px] font-semibold">
        Total
      </text>
      <text x={center} y={center + 18} textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 text-[18px] font-black">
        {total}
      </text>
    </svg>
  );
}

type PieSlice = { label: string; value: number };

function toPieData(rows: Grievance[], getLabel: (item: Grievance) => string): PieSlice[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = getLabel(row);
    counts.set(label, Number(counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function normalizeStatus(item: Grievance) {
  if (item.complaint_status === "accepted") return "Accepted";
  if (item.complaint_status === "in_progress") return "In Progress";
  if (item.complaint_status === "closed") return "Closed";
  if (item.status === "resolved") return "Closed";
  if (item.status === "under_review" || item.status === "assigned" || item.status === "escalated" || item.status === "reopened") return "Accepted";
  if (item.status === "in_progress" || item.status === "awaiting_confirmation") return "In Progress";
  if (item.status === "closed") return "Closed";
  return "Submitted";
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
