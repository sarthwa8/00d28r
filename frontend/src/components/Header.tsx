import { Activity, BarChart3, Briefcase, Wind } from "lucide-react";
import type { HealthResponse } from "../types/api";

export type TabId = "desk" | "lab" | "pitch";

const TABS: { id: TabId; label: string; icon: typeof Wind }[] = [
  { id: "desk", label: "Day-Ahead Procurement Desk", icon: Briefcase },
  { id: "lab", label: "Forecast Accuracy & Error Lab", icon: BarChart3 },
  { id: "pitch", label: "Executive Pitch & Architecture", icon: Activity },
];

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  health: HealthResponse | null;
  healthError: string | null;
}

export function Header({ tab, onTab, health, healthError }: Props) {
  const ok = health?.status === "ok";
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/40">
            <Wind className="h-5 w-5 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              WindSight <span className="text-emerald-400">GB</span>
            </h1>
            <p className="text-xs text-slate-400">UK Day-Ahead Wind Forecast &amp; Procurement Intelligence</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${
            ok ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300" : "border-rose-700/60 bg-rose-500/10 text-rose-300"
          }`}
          data-testid="status-badge"
          title={health ? `Snapshot fetched ${health.fetched_at_utc} · ${health.actuals_count} actuals · ${health.forecasts_raw_count} forecasts` : undefined}
        >
          <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
          {health
            ? `Elexon BMRS Verified • Jan 2026 Decision Window • ${health.publish_runs} forecast runs`
            : healthError
              ? `API unavailable: ${healthError}`
              : "Connecting to analytics engine…"}
        </div>
      </div>
      <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 sm:px-6" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === id ? "border-sky-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
