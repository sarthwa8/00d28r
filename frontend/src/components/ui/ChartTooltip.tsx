import type { TooltipProps } from "recharts";

type Row = { name: string; value: string; color?: string };

/** Shared light tooltip: a title plus coloured rows; callers decide how each series is formatted. */
export function ChartTooltip({
  active,
  payload,
  label,
  title,
  rows,
}: TooltipProps<number | number[], string> & {
  title?: (label: unknown, payload: unknown[]) => string;
  rows?: (payload: NonNullable<TooltipProps<number | number[], string>["payload"]>) => Row[];
}) {
  if (!active || !payload?.length) return null;
  const items: Row[] = rows
    ? rows(payload)
    : payload.map((p) => ({ name: String(p.name), value: String(p.value), color: p.color }));
  return (
    <div className="min-w-[180px] rounded-xl border border-rule bg-panel/95 px-3 py-2 text-[12px] shadow-lift backdrop-blur">
      <div className="mb-1 font-semibold text-ink">{title ? title(label, payload) : String(label)}</div>
      {items.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.name}
          </span>
          <span className="num font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
