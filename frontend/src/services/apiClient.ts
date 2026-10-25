import type { DashboardParams, DashboardResponse, ForecastEvolutionResponse, HealthResponse } from "../types/api";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>("/api/v1/health", { signal }),
  dashboard: (p: DashboardParams, signal?: AbortSignal) =>
    request<DashboardResponse>(`/api/v1/dashboard?${qs({ ...p })}`, { signal }),
  forecastEvolution: (targetTime: string, cutoffHour: number, signal?: AbortSignal) =>
    request<ForecastEvolutionResponse>(
      `/api/v1/forecast-evolution?${qs({ target_time: targetTime, cutoff_hour_utc: cutoffHour })}`,
      { signal },
    ),
  refresh: () => request<HealthResponse>("/api/v1/system/refresh", { method: "POST" }),
};
