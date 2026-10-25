import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Header, type TabId } from "./components/Header";
import { ControlBar } from "./components/ControlBar";
import { ProcurementDeskTab } from "./components/ProcurementDeskTab";
import { AccuracyLabTab } from "./components/AccuracyLabTab";
import { ExecutivePitchTab } from "./components/ExecutivePitchTab";
import { ForecastEvolutionModal } from "./components/ForecastEvolutionModal";
import { api } from "./services/apiClient";
import type { DashboardParams, DashboardResponse, HealthResponse } from "./types/api";

export const DEFAULT_PARAMS: DashboardParams = {
  start_date: "2026-01-01",
  end_date: "2026-01-31",
  selection_mode: "day_ahead_cutoff",
  cutoff_hour_utc: 10,
  min_horizon_hours: 24,
  resolution: "half_hourly",
  demand_mw: 25000,
  risk_posture: "p90",
};

export default function App() {
  const [tab, setTab] = useState<TabId>("desk");
  const [params, setParams] = useState<DashboardParams>(DEFAULT_PARAMS);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [baseline, setBaseline] = useState<DashboardResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspect, setInspect] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setHealthError(String(e.message ?? e)));
    // The executive briefing always reports the canonical scenario (full month, D-1 10:00, P90).
    api.dashboard(DEFAULT_PARAMS).then(setBaseline).catch(() => undefined);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setLoading(true);
      api
        .dashboard(params, ctrl.signal)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => e.name !== "AbortError" && setError(String(e.message ?? e)))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 200);
    return () => {
      clearTimeout(debounce.current);
      ctrl.abort();
    };
  }, [params]);

  const onChange = useCallback((patch: Partial<DashboardParams>) => setParams((p) => ({ ...p, ...patch })), []);
  const closeInspect = useCallback(() => setInspect(null), []);

  return (
    <div className="min-h-screen">
      <Header tab={tab} onTab={setTab} health={health} healthError={healthError} />
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 sm:px-6">
        {tab !== "pitch" && <ControlBar params={params} onChange={onChange} loading={loading} />}
        {error && tab !== "pitch" && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-500/10 px-4 py-2 text-sm text-rose-200" role="alert">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}
        {tab === "pitch" ? (
          <ExecutivePitchTab baseline={baseline} health={health} />
        ) : !data ? (
          <p className="animate-pulse py-20 text-center text-sm text-slate-400">Loading January 2026 analytics…</p>
        ) : tab === "desk" ? (
          <ProcurementDeskTab data={data} onInspect={setInspect} />
        ) : (
          <AccuracyLabTab data={data} cutoffHour={params.cutoff_hour_utc} />
        )}
        <footer className="pb-6 pt-2 text-center text-[11px] text-slate-600">
          Data: Elexon BMRS FUELHH (WIND) &amp; WINDFOR · All times UTC (= GMT, UK local time in January) · Built with React, FastAPI &amp; pandas
        </footer>
      </main>
      <ForecastEvolutionModal targetTime={inspect} cutoffHour={params.cutoff_hour_utc} onClose={closeInspect} />
    </div>
  );
}
