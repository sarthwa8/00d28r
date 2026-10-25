import { CalendarDays, Clock, Gauge, Shield } from "lucide-react";
import type { DashboardParams, RiskPosture } from "../types/api";

export const PRESETS = [
  { id: "decisions", label: "Jan 2026 decisions (deliver 2 Jan–1 Feb)", start: "2026-01-02", end: "2026-02-01" },
  { id: "month", label: "Full Month (Jan 2026)", start: "2026-01-01", end: "2026-01-31" },
  { id: "w1", label: "Week 1 (Jan 1–7)", start: "2026-01-01", end: "2026-01-07" },
  { id: "w2", label: "Week 2 (Jan 8–14)", start: "2026-01-08", end: "2026-01-14" },
  { id: "w3", label: "Week 3 (Jan 15–21)", start: "2026-01-15", end: "2026-01-21" },
  { id: "w4", label: "Week 4 (Jan 22–31)", start: "2026-01-22", end: "2026-01-31" },
] as const;

const CUTOFF_HOURS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 23];

interface Props {
  params: DashboardParams;
  onChange: (patch: Partial<DashboardParams>) => void;
  loading: boolean;
}

export function ControlBar({ params, onChange, loading }: Props) {
  const preset = PRESETS.find((p) => p.start === params.start_date && p.end === params.end_date)?.id;
  const singleDay = params.start_date === params.end_date;

  return (
    <section className="card p-4" aria-label="Decision controls">
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1.3fr_1.1fr_1fr]">
        <div>
          <span className="field-label flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Delivery window
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange({ start_date: p.start, end_date: p.end })}
                aria-pressed={preset === p.id}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  preset === p.id
                    ? "border-sky-500 bg-sky-500/15 text-sky-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <label className="flex items-center gap-1.5">
              <span className={singleDay ? "text-sky-300" : ""}>Single delivery day</span>
              <input
                type="date"
                aria-label="Single delivery day"
                min="2026-01-01"
                max="2026-02-01"
                value={singleDay ? params.start_date : ""}
                onChange={(e) => e.target.value && onChange({ start_date: e.target.value, end_date: e.target.value })}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 [color-scheme:dark]"
              />
            </label>
            <span className="num text-slate-500">
              {params.start_date} → {params.end_date}
            </span>
          </div>
        </div>

        <div>
          <span className="field-label flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Decision rule (which forecast was available?)
          </span>
          <div className="seg mb-2">
            <button aria-pressed={params.selection_mode === "day_ahead_cutoff"} onClick={() => onChange({ selection_mode: "day_ahead_cutoff" })}>
              D-1 Auction Cutoff
            </button>
            <button aria-pressed={params.selection_mode === "horizon_hours"} onClick={() => onChange({ selection_mode: "horizon_hours" })}>
              Rolling Lead-Time
            </button>
          </div>
          {params.selection_mode === "day_ahead_cutoff" ? (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Cutoff on D-1
              <select
                aria-label="Cutoff hour"
                value={params.cutoff_hour_utc}
                onChange={(e) => onChange({ cutoff_hour_utc: Number(e.target.value) })}
                className="num rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
              >
                {CUTOFF_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00 UTC{h === 10 ? " (pre 11:00 auction)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-xs text-slate-400">
              <span className="flex justify-between">
                <span>Minimum lead time</span>
                <span className="num text-sky-300">{params.min_horizon_hours}h</span>
              </span>
              <input
                type="range"
                aria-label="Minimum lead time hours"
                min={0}
                max={48}
                step={1}
                value={params.min_horizon_hours}
                onChange={(e) => onChange({ min_horizon_hours: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          )}
        </div>

        <div>
          <span className="field-label flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Portfolio demand
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              aria-label="Demand slider"
              min={15000}
              max={45000}
              step={500}
              value={params.demand_mw}
              onChange={(e) => onChange({ demand_mw: Number(e.target.value) })}
              className="w-full"
            />
            <input
              type="number"
              aria-label="Demand MW"
              min={0}
              max={100000}
              step={500}
              value={params.demand_mw}
              onChange={(e) => onChange({ demand_mw: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) })}
              className="num w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-slate-200"
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Flat MW baseline for the half-hourly residual thermal calc.</p>
        </div>

        <div>
          <span className="field-label flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Hedging buffer
          </span>
          <div className="seg flex-wrap">
            {(["raw", "bias", "p90", "p95"] as RiskPosture[]).map((r) => (
              <button
                key={r}
                aria-pressed={params.risk_posture === r}
                onClick={() => onChange({ risk_posture: r })}
                title={{ raw: "Trust the forecast as published", bias: "Remove the median historical error for this lead time", p90: "Cover 90% of historical shortfalls", p95: "Cover 95% of historical shortfalls" }[r]}
              >
                {{ raw: "Raw", bias: "De-bias", p90: "P90", p95: "P95" }[r]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            Resolution
            <div className="seg">
              <button aria-pressed={params.resolution === "half_hourly"} onClick={() => onChange({ resolution: "half_hourly" })}>
                30-min
              </button>
              <button aria-pressed={params.resolution === "hourly_native"} onClick={() => onChange({ resolution: "hourly_native" })}>
                Hourly native
              </button>
            </div>
            {loading && <span className="animate-pulse text-sky-400">updating…</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
