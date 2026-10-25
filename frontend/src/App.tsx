import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Header, type TabId } from "./components/Header";
import { ControlBar } from "./components/ControlBar";
import { ProcurementDeskTab } from "./components/ProcurementDeskTab";
import { AccuracyLabTab } from "./components/AccuracyLabTab";
import { ClientBriefingTab } from "./components/ClientBriefingTab";
import { TechReviewTab } from "./components/TechReviewTab";
import { ForecastEvolutionModal } from "./components/ForecastEvolutionModal";
import { api } from "./services/apiClient";
import type { DashboardParams, DashboardResponse, HealthResponse } from "./types/api";

export const DEFAULT_PARAMS: DashboardParams = {
  // Purchase decisions made 1–31 Jan 2026 on D-1 => delivery days 2 Jan .. 1 Feb.
  start_date: "2026-01-02",
  end_date: "2026-02-01",
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
    // The executive briefing always reports the canonical scenario (all Jan 2026 decisions, D-1 10:00, P90).
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
      <main className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6">
        {tab === "briefing" ? (
          <ClientBriefingTab baseline={baseline} />
        ) : tab === "tech" ? (
          <TechReviewTab baseline={baseline} health={health} />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <ControlBar params={params} onChange={onChange} loading={loading} />
            <div className="min-w-0 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-short/10 px-4 py-3 text-sm text-short ring-1 ring-short/30" role="alert">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </div>
              )}
              {!data ? (
                <p className="animate-pulse py-24 text-center text-sm text-ink-3">Loading January 2026 analytics…</p>
              ) : tab === "desk" ? (
                <ProcurementDeskTab data={data} onInspect={setInspect} />
              ) : (
                <AccuracyLabTab data={data} cutoffHour={params.cutoff_hour_utc} />
              )}
            </div>
          </div>
        )}
        <footer className="pb-4 pt-10 text-center text-[12px] text-ink-3">
          Data from Elexon BMRS (FUELHH wind outturn and WINDFOR forecasts). Times are UTC, which is UK local time in January.
        </footer>
      </main>
      <ForecastEvolutionModal targetTime={inspect} cutoffHour={params.cutoff_hour_utc} onClose={closeInspect} />
    </div>
  );
}
