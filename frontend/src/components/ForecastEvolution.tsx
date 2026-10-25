import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/apiClient";
import type { ForecastEvolutionResponse } from "../types/api";
import { COLORS, fmtMW, fmtSigned, fmtTime } from "../lib/format";
import { ChartTooltip } from "./ui/ChartTooltip";

/** Revision-history chart + table for one settlement period; shared by the modal and the Error Lab inspector. */
export function ForecastEvolution({ targetTime, cutoffHour }: { targetTime: string; cutoffHour: number }) {
  const [data, setData] = useState<ForecastEvolutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api
      .forecastEvolution(targetTime, cutoffHour, ctrl.signal)
      .then(setData)
      .catch((e) => e.name !== "AbortError" && setError(String(e.message ?? e)));
    return () => ctrl.abort();
  }, [targetTime, cutoffHour]);

  if (error) return <p className="text-sm text-short">Could not load the revision history: {error}</p>;
  if (!data) return <p className="animate-pulse text-sm text-ink-3">Loading revision history…</p>;

  const rows = data.revisions.map((r) => ({ ...r, label: fmtTime(r.publishTime) }));
  const selected = data.revisions.find((r) => r.publishTime === data.day_ahead_selected_publish_time);
  const final = data.revisions[data.revisions.length - 1];
  // Keep the actual inside the y-range, otherwise its reference line silently falls off the chart.
  const values = data.revisions.map((r) => r.forecast_mw ?? 0).concat(data.actual_mw != null ? [data.actual_mw] : []);
  const pad = Math.max(250, (Math.max(...values) - Math.min(...values)) * 0.08);
  const yDomain: [number, number] = [Math.max(0, Math.min(...values) - pad), Math.max(...values) + pad];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-rule ring-1 ring-rule md:grid-cols-4">
        <Stat label="Actual output" value={`${fmtMW(data.actual_mw)} MW`} tone="text-wind" />
        <Stat
          label={`Forecast at D-1 ${String(cutoffHour).padStart(2, "0")}:00`}
          value={`${fmtMW(selected?.forecast_mw)} MW`}
          tone="text-fcst"
          sub={selected ? `Run of ${fmtTime(selected.publishTime)}, ${selected.horizon_hours} h ahead` : "No run before the cutoff"}
        />
        <Stat label="Error at decision time" value={`${fmtSigned(selected?.error_mw)} MW`} tone={(selected?.error_mw ?? 0) > 0 ? "text-short" : "text-wind"} />
        <Stat label="Error of the last revision" value={`${fmtSigned(final?.error_mw)} MW`} sub={final ? `${final.horizon_hours} h ahead` : undefined} />
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 16, right: 48, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(1)} GW`} width={56} domain={yDomain} tickLine={false} axisLine={false} />
            <Tooltip
              content={
                <ChartTooltip
                  title={(l, p) => `Published ${l}${(p[0] as { payload?: { horizon_hours?: number } })?.payload ? `, ${(p[0] as { payload: { horizon_hours: number } }).payload.horizon_hours} h ahead` : ""}`}
                  rows={(p) => [{ name: "Forecast", value: `${fmtMW(p[0].value as number)} MW`, color: COLORS.forecast }]}
                />
              }
            />
            {data.actual_mw != null && (
              <ReferenceLine y={data.actual_mw} stroke={COLORS.actual} strokeWidth={2} strokeDasharray="6 4" label={{ value: "Actual", fill: COLORS.actual, fontSize: 11, position: "right" }} />
            )}
            {selected && (
              <ReferenceLine x={fmtTime(selected.publishTime)} stroke={COLORS.risk} strokeDasharray="3 3" label={{ value: "Used at cutoff", fill: COLORS.risk, fontSize: 10, position: "top" }} />
            )}
            <Line type="stepAfter" dataKey="forecast_mw" stroke={COLORS.forecast} strokeWidth={2.2} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="max-h-56 overflow-auto rounded-xl ring-1 ring-rule">
        <table className="font-condensed w-full text-[13px]">
          <thead className="sticky top-0 bg-paper text-left text-ink-2">
            <tr>
              <th className="px-3 py-2 font-medium">Published</th>
              <th className="px-3 py-2 text-right font-medium">Lead (h)</th>
              <th className="px-3 py-2 text-right font-medium">Forecast MW</th>
              <th className="px-3 py-2 text-right font-medium">Error MW</th>
              <th className="px-3 py-2 font-medium">Known at the D-1 cutoff?</th>
            </tr>
          </thead>
          <tbody className="num bg-white">
            {data.revisions.map((r) => (
              <tr key={r.publishTime} className={`border-t border-rule ${r.publishTime === data.day_ahead_selected_publish_time ? "bg-thermal/10" : ""}`}>
                <td className="px-3 py-1.5">{fmtTime(r.publishTime)}</td>
                <td className="px-3 py-1.5 text-right text-ink-2">{r.horizon_hours}</td>
                <td className="px-3 py-1.5 text-right">
                  {fmtMW(r.forecast_mw)}
                  {r.is_interpolated && <span className="text-ink-3">*</span>}
                </td>
                <td className={`px-3 py-1.5 text-right ${(r.error_mw ?? 0) > 0 ? "text-short" : "text-wind"}`}>{fmtSigned(r.error_mw)}</td>
                <td className="px-3 py-1.5 text-ink-2">{r.available_at_day_ahead_cutoff ? "yes" : "no — published after cutoff"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.revisions.some((r) => r.is_interpolated) && <p className="text-[12px] text-ink-3">* The :30 value is interpolated between the run's hourly points.</p>}
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-ink" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white px-3.5 py-3">
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className={`num font-semi-expanded mt-0.5 text-[18px] font-semibold ${tone}`}>{value}</div>
      {sub && <div className="num text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}
