import { useMemo, useState } from "react";
import type { DashboardResponse, TimeseriesPoint } from "../types/api";
import { fmtDay, fmtMW, fmtSigned } from "../lib/format";
import { ChartFrame, DataTable } from "./ui/ChartFrame";

/*
 * Diverging scale, 7 classes (the legibility ceiling for colour classes):
 * crimson pole = over-forecast (desk short), blue pole = under-forecast (desk long), neutral midpoint = within ±500 MW.
 * The over-forecast side has more steps because January's errors are skewed that way.
 */
const CLASSES = [
  { max: -2000, pole: "--c-long", mix: 85, label: "< −2,000" },
  { max: -500, pole: "--c-long", mix: 40, label: "−2,000 to −500" },
  { max: 500, pole: null, mix: 0, label: "±500" },
  { max: 2000, pole: "--c-short", mix: 24, label: "500 to 2,000" },
  { max: 3500, pole: "--c-short", mix: 52, label: "2,000 to 3,500" },
  { max: 5000, pole: "--c-short", mix: 78, label: "3,500 to 5,000" },
  { max: Infinity, pole: "--c-short", mix: 100, label: "> 5,000" },
] as const;

const fillFor = (e: number | null) => {
  if (e == null) return "transparent";
  const c = CLASSES.find((k) => e < k.max) ?? CLASSES[CLASSES.length - 1];
  return c.pole ? `color-mix(in oklab, var(${c.pole}) ${c.mix}%, var(--c-heat-mid))` : "var(--c-heat-mid)";
};

const CELL_W = 14;
const CELL_H = 13;
const GAP = 2;
const LEFT = 64;
const TOP = 22;

export function ErrorCalendar({ data, onInspect }: { data: DashboardResponse; onInspect: (startTime: string) => void }) {
  const days = useMemo(() => [...new Set(data.timeseries.map((p) => p.settlementDate))], [data.timeseries]);
  const byDay = useMemo(() => {
    const m = new Map<string, TimeseriesPoint[]>();
    for (const p of data.timeseries) m.set(p.settlementDate, [...(m.get(p.settlementDate) ?? []), p]);
    return m;
  }, [data.timeseries]);
  const [hover, setHover] = useState<{ p: TimeseriesPoint; x: number; y: number } | null>(null);

  const W = LEFT + 48 * (CELL_W + GAP);
  const H = TOP + days.length * (CELL_H + GAP) + 4;
  const worstDay = [...data.daily_summary].sort((a, b) => (b.mae_mw ?? 0) - (a.mae_mw ?? 0))[0];

  return (
    <ChartFrame
      title="Every half-hour of the window, coloured by forecast error"
      note={
        <>
          One row per delivery day, one column per settlement period. Crimson means the forecast was too high and the desk was short; blue means it was too low. Fronts show up as
          diagonal bands. The worst day was {worstDay ? fmtDay(worstDay.date) : "—"} (typical miss {fmtMW(worstDay?.mae_mw)} MW). Click any cell to open its forecast revisions.
        </>
      }
      table={
        <DataTable
          label="Daily error summary"
          head={["Delivery day", "Typical miss MW", "Bias MW", "Worst shortfall MW"]}
          rows={data.daily_summary.map((d) => [fmtDay(d.date), fmtMW(d.mae_mw), fmtSigned(d.mbe_mw), fmtMW(d.max_shortfall_mw)])}
        />
      }
    >
      <div className="relative overflow-x-auto" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[640px]" role="img" aria-label="Forecast error by delivery day and settlement period">
          {[0, 6, 12, 18, 24, 30, 36, 42].map((sp) => (
            <text key={sp} x={LEFT + sp * (CELL_W + GAP)} y={12} fontSize="10" fill="var(--c-ink-3)" className="num">
              {String(sp / 2).padStart(2, "0")}:00
            </text>
          ))}
          {days.map((d, row) => {
            const y = TOP + row * (CELL_H + GAP);
            const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
            return (
              <g key={d}>
                <text x={0} y={y + CELL_H - 3} fontSize="10" fill={dow === 0 || dow === 6 ? "var(--c-ink-3)" : "var(--c-ink)"} className="num">
                  {fmtDay(d)}
                </text>
                {(byDay.get(d) ?? []).map((p) => {
                  const x = LEFT + (p.settlementPeriod - 1) * (CELL_W + GAP);
                  return (
                    <rect
                      key={p.startTime}
                      x={x}
                      y={y}
                      width={CELL_W}
                      height={CELL_H}
                      rx={2}
                      style={{ fill: fillFor(p.error_mw) }}
                      className="cursor-pointer"
                      onMouseEnter={() => setHover({ p, x: x + CELL_W / 2, y })}
                      onClick={() => onInspect(p.startTime)}
                    />
                  );
                })}
              </g>
            );
          })}
          {hover && (
            <rect
              x={LEFT + (hover.p.settlementPeriod - 1) * (CELL_W + GAP) - 1.5}
              y={hover.y - 1.5}
              width={CELL_W + 3}
              height={CELL_H + 3}
              rx={3}
              fill="none"
              stroke="var(--c-ink)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 min-w-[190px] -translate-x-1/2 -translate-y-full rounded-xl bg-panel px-3 py-2 text-[12px] shadow-lift ring-1 ring-rule"
            style={{ left: `${(100 * hover.x) / W}%`, top: `calc(${(100 * hover.y) / H}% - 6px)` }}
          >
            <div className="font-semibold text-ink">
              {fmtDay(hover.p.settlementDate)}, {hover.p.startTime.slice(11, 16)} UTC (SP{hover.p.settlementPeriod})
            </div>
            <Row k="Forecast at the cutoff" v={`${fmtMW(hover.p.forecast_mw)} MW`} />
            <Row k="Actual" v={`${fmtMW(hover.p.actual_mw)} MW`} />
            <Row k="Error" v={`${fmtSigned(hover.p.error_mw)} MW`} strong />
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px] text-ink-2" aria-label="Error scale, MW">
        <span className="mr-2 text-ink-3">Forecast − actual, MW</span>
        {CLASSES.map((c) => (
          <span key={c.label} className="flex items-center gap-1 pr-2">
            <span className="h-3 w-5 rounded-sm ring-1 ring-rule" style={{ background: c.pole ? `color-mix(in oklab, var(${c.pole}) ${c.mix}%, var(--c-heat-mid))` : "var(--c-heat-mid)" }} />
            <span className="num">{c.label}</span>
          </span>
        ))}
        <span className="ml-auto text-ink-3">Desk long ← → desk short</span>
      </div>
    </ChartFrame>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-ink-2">{k}</span>
      <span className={`num ${strong ? "font-semibold text-ink" : "text-ink"}`}>{v}</span>
    </div>
  );
}
