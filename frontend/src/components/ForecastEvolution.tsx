import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/apiClient";
import type { ForecastEvolutionResponse } from "../types/api";
import { COLORS, fmtMW, fmtSigned, fmtTime } from "../lib/format";

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

  if (error) return <p className="text-sm text-rose-300">Could not load revisions: {error}</p>;
  if (!data) return <p className="animate-pulse text-sm text-slate-400">Loading revision history…</p>;

  const rows = data.revisions.map((r) => ({ ...r, label: fmtTime(r.publishTime), lead: r.horizon_hours }));
  const selected = data.revisions.find((r) => r.publishTime === data.day_ahead_selected_publish_time);
  const final = data.revisions[data.revisions.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Actual outturn" value={`${fmtMW(data.actual_mw)} MW`} tone="text-emerald-300" />
        <Stat label={`D-1 ${String(cutoffHour).padStart(2, "0")}:00 forecast`} value={`${fmtMW(selected?.forecast_mw)} MW`} tone="text-sky-300" sub={selected ? `run ${fmtTime(selected.publishTime)} · ${selected.horizon_hours}h ahead` : "no run before cutoff"} />
        <Stat label="D-1 error" value={`${fmtSigned(selected?.error_mw)} MW`} tone={(selected?.error_mw ?? 0) > 0 ? "text-rose-300" : "text-emerald-300"} />
        <Stat label="Final revision error" value={`${fmtSigned(final?.error_mw)} MW`} sub={final ? `${final.horizon_hours}h ahead` : undefined} />
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(1)}`} width={40} domain={["auto", "auto"]} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${fmtMW(v)} MW`, "Forecast"]}
              labelFormatter={(l, p) => `Published ${l}${p?.[0] ? ` · ${p[0].payload.lead}h ahead` : ""}`}
            />
            {data.actual_mw != null && (
              <ReferenceLine y={data.actual_mw} stroke={COLORS.actual} strokeDasharray="6 3" label={{ value: "Actual", fill: COLORS.actual, fontSize: 11, position: "right" }} />
            )}
            {selected && <ReferenceLine x={fmtTime(selected.publishTime)} stroke={COLORS.risk} strokeDasharray="4 4" label={{ value: "D-1 cutoff run", fill: COLORS.risk, fontSize: 10, position: "top" }} />}
            <Line type="stepAfter" dataKey="forecast_mw" stroke={COLORS.forecast} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="max-h-56 overflow-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-3 py-2">Published</th>
              <th className="px-3 py-2 text-right">Lead (h)</th>
              <th className="px-3 py-2 text-right">Forecast MW</th>
              <th className="px-3 py-2 text-right">Error MW</th>
              <th className="px-3 py-2">Available at D-1 cutoff</th>
            </tr>
          </thead>
          <tbody className="num">
            {data.revisions.map((r) => (
              <tr key={r.publishTime} className={`border-t border-slate-800 ${r.publishTime === data.day_ahead_selected_publish_time ? "bg-amber-500/10" : ""}`}>
                <td className="px-3 py-1.5">{fmtTime(r.publishTime)}</td>
                <td className="px-3 py-1.5 text-right">{r.horizon_hours}</td>
                <td className="px-3 py-1.5 text-right">{fmtMW(r.forecast_mw)}{r.is_interpolated && <span className="text-slate-500">*</span>}</td>
                <td className={`px-3 py-1.5 text-right ${(r.error_mw ?? 0) > 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtSigned(r.error_mw)}</td>
                <td className="px-3 py-1.5">{r.available_at_day_ahead_cutoff ? "yes" : "no — published after cutoff"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.revisions.some((r) => r.is_interpolated) && <p className="text-[11px] text-slate-500">* :30 value linearly interpolated between the run's hourly points.</p>}
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-white" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`num text-lg font-semibold ${tone}`}>{value}</div>
      {sub && <div className="num text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
