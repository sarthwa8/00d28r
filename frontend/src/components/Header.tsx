import type { HealthResponse } from "../types/api";

export type TabId = "desk" | "lab" | "briefing" | "tech";

const GROUPS: { group: string; tabs: { id: TabId; label: string }[] }[] = [
  {
    group: "Trade",
    tabs: [
      { id: "desk", label: "Procurement desk" },
      { id: "lab", label: "Error lab" },
    ],
  },
  {
    group: "Present",
    tabs: [
      { id: "briefing", label: "Client briefing" },
      { id: "tech", label: "Tech review" },
    ],
  },
];

/** Meteorological wind barb: the staff points into the wind, each full feather is 10 knots. */
function WindBarb() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      <rect width="40" height="40" rx="10" fill="#13233A" />
      <g stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M11 30 L28 11" />
        <path d="M28 11 L34 17" />
        <path d="M24.5 15 L30.5 21" />
        <path d="M21 19 L24.5 22.5" />
      </g>
      <circle cx="11" cy="30" r="3" fill="#0F9D8A" />
    </svg>
  );
}

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  health: HealthResponse | null;
  healthError: string | null;
}

export function Header({ tab, onTab, health, healthError }: Props) {
  const ok = health?.status === "ok";
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <WindBarb />
          <div className="leading-tight">
            <h1 className="font-expanded text-[19px] font-bold text-ink">WindSight GB</h1>
            <p className="text-[12px] text-ink-2">Day-ahead wind risk for the GB trading desk</p>
          </div>
        </div>

        <nav className="order-3 flex w-full gap-6 overflow-x-auto lg:order-2 lg:w-auto" aria-label="Workspaces">
          {GROUPS.map(({ group, tabs }) => (
            <div key={group} className="flex items-center gap-1.5">
              <span className="pr-1 text-[12px] text-ink-3">{group}</span>
              <div className="flex gap-1" role="tablist" aria-label={group}>
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => onTab(t.id)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                      tab === t.id ? "bg-ink text-white" : "text-ink-2 hover:bg-white hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div
          className="order-2 ml-auto flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] text-ink-2 ring-1 ring-rule lg:order-3"
          data-testid="status-badge"
          title={health ? `Snapshot fetched ${health.fetched_at_utc}` : undefined}
        >
          <span className={`h-2 w-2 rounded-full ${ok ? "bg-wind" : healthError ? "bg-short" : "bg-ink-3 animate-pulse"}`} />
          {health
            ? `Elexon BMRS verified, ${health.publish_runs} forecast runs`
            : healthError
              ? `API unavailable: ${healthError}`
              : "Connecting to the analytics engine"}
        </div>
      </div>
    </header>
  );
}
