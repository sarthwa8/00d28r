import type { DashboardParams, RiskPosture } from "../types/api";
import { POSTURE_LABEL } from "../lib/format";

export const PRESETS = [
  { id: "decisions", label: "All January decisions", hint: "Deliveries 2 Jan – 1 Feb", start: "2026-01-02", end: "2026-02-01" },
  { id: "month", label: "Calendar January", hint: "Deliveries 1 – 31 Jan", start: "2026-01-01", end: "2026-01-31" },
  { id: "w1", label: "Week 1", hint: "1 – 7 Jan", start: "2026-01-01", end: "2026-01-07" },
  { id: "w2", label: "Week 2", hint: "8 – 14 Jan", start: "2026-01-08", end: "2026-01-14" },
  { id: "w3", label: "Week 3", hint: "15 – 21 Jan", start: "2026-01-15", end: "2026-01-21" },
  { id: "w4", label: "Week 4", hint: "22 – 31 Jan", start: "2026-01-22", end: "2026-01-31" },
] as const;

const CUTOFF_HOURS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 23];

const POSTURE_HINT: Record<RiskPosture, string> = {
  raw: "Trust the forecast as published.",
  bias: "Remove the typical error for this lead time.",
  p90: "Cover 9 in 10 historical shortfalls.",
  p95: "Cover 19 in 20 historical shortfalls.",
};

interface Props {
  params: DashboardParams;
  onChange: (patch: Partial<DashboardParams>) => void;
  loading: boolean;
}

/** Decision setup: a sticky sidebar on wide screens, a stacked panel on narrow ones. */
export function ControlBar({ params, onChange, loading }: Props) {
  const preset = PRESETS.find((p) => p.start === params.start_date && p.end === params.end_date)?.id;
  const singleDay = params.start_date === params.end_date;

  return (
    <aside className="panel space-y-6 p-5 lg:sticky lg:top-[84px]" aria-label="Decision setup">
      <div className="flex items-baseline justify-between">
        <h2 className="panel-title">Decision setup</h2>
        <span className={`text-[12px] ${loading ? "text-fcst" : "text-ink-3"}`} aria-live="polite">
          {loading ? "Recalculating…" : "Up to date"}
        </span>
      </div>

      <fieldset>
        <legend className="field-label">Delivery window</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ start_date: p.start, end_date: p.end })}
              aria-pressed={preset === p.id}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                p.id === "decisions" ? "col-span-2" : ""
              } ${preset === p.id ? "border-ink bg-ink text-panel" : "border-rule bg-panel text-ink hover:border-ink-3"}`}
            >
              <span className="block text-[13px] font-medium">{p.label}</span>
              <span className={`num block text-[11px] ${preset === p.id ? "text-panel/70" : "text-ink-3"}`}>{p.hint}</span>
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center justify-between gap-2 text-[13px] text-ink-2">
          One delivery day
          <input
            type="date"
            aria-label="Single delivery day"
            min="2026-01-01"
            max="2026-02-01"
            value={singleDay ? params.start_date : ""}
            onChange={(e) => e.target.value && onChange({ start_date: e.target.value, end_date: e.target.value })}
            className="input"
          />
        </label>
      </fieldset>

      <fieldset>
        <legend className="field-label">Which forecast was available?</legend>
        <div className="seg w-full">
          <button className="flex-1" aria-pressed={params.selection_mode === "day_ahead_cutoff"} onClick={() => onChange({ selection_mode: "day_ahead_cutoff" })}>
            Auction cutoff
          </button>
          <button className="flex-1" aria-pressed={params.selection_mode === "horizon_hours"} onClick={() => onChange({ selection_mode: "horizon_hours" })}>
            Fixed lead time
          </button>
        </div>
        {params.selection_mode === "day_ahead_cutoff" ? (
          <label className="mt-2.5 flex items-center justify-between gap-2 text-[13px] text-ink-2">
            Decide on D-1 at
            <select aria-label="Cutoff hour" value={params.cutoff_hour_utc} onChange={(e) => onChange({ cutoff_hour_utc: Number(e.target.value) })} className="input">
              {CUTOFF_HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 UTC{h === 10 ? " (auction 11:00)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="mt-2.5 block text-[13px] text-ink-2">
            <span className="flex justify-between">
              At least this far ahead
              <span className="num font-semibold text-ink">{params.min_horizon_hours} h</span>
            </span>
            <input type="range" aria-label="Minimum lead time hours" min={0} max={48} step={1} value={params.min_horizon_hours} onChange={(e) => onChange({ min_horizon_hours: Number(e.target.value) })} className="mt-1 w-full" />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className="field-label">Portfolio demand</legend>
        <div className="flex items-center gap-3">
          <input type="range" aria-label="Demand slider" min={15000} max={45000} step={500} value={params.demand_mw} onChange={(e) => onChange({ demand_mw: Number(e.target.value) })} className="w-full" />
          <label className="flex items-center gap-1 text-[12px] text-ink-3">
            <input
              type="number"
              aria-label="Demand MW"
              min={0}
              max={100000}
              step={500}
              value={params.demand_mw}
              onChange={(e) => onChange({ demand_mw: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) })}
              className="input w-[88px] text-right"
            />
            MW
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label">How much to trust the forecast</legend>
        <div className="seg grid w-full grid-cols-4">
          {(["raw", "bias", "p90", "p95"] as RiskPosture[]).map((r) => (
            <button key={r} aria-pressed={params.risk_posture === r} onClick={() => onChange({ risk_posture: r })} title={POSTURE_LABEL[r]}>
              {{ raw: "Raw", bias: "De-bias", p90: "P90", p95: "P95" }[r]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-3">{POSTURE_HINT[params.risk_posture]}</p>
      </fieldset>

      <fieldset className="border-t border-rule pt-4">
        <legend className="field-label">Comparison resolution</legend>
        <div className="seg w-full">
          <button className="flex-1" aria-pressed={params.resolution === "half_hourly"} onClick={() => onChange({ resolution: "half_hourly" })}>
            30 min
          </button>
          <button className="flex-1" aria-pressed={params.resolution === "hourly_native"} onClick={() => onChange({ resolution: "hourly_native" })}>
            Hourly, native
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-3">WINDFOR is hourly; 30-min values are interpolated within each run.</p>
      </fieldset>
    </aside>
  );
}
