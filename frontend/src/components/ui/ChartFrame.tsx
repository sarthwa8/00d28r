import { useState, type ReactNode } from "react";

/** Panel with a Chart/Table switch: every chart has a table twin, so no value is reachable only by hovering. */
export function ChartFrame({
  title,
  note,
  table,
  children,
  actions,
}: {
  title: string;
  note?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="panel min-w-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[90ch]">
          <h2 className="panel-title">{title}</h2>
          {note && <p className="panel-note mt-0.5">{note}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {table && (
            <div className="seg" role="group" aria-label={`${title}: view`}>
              <button aria-pressed={view === "chart"} onClick={() => setView("chart")}>
                Chart
              </button>
              <button aria-pressed={view === "table"} onClick={() => setView("table")}>
                Table
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3">{view === "chart" || !table ? children : <div className="max-h-[420px] overflow-auto rounded-xl ring-1 ring-rule">{table}</div>}</div>
    </section>
  );
}

export function DataTable({ head, rows, label }: { head: string[]; rows: (string | number)[][]; label: string }) {
  return (
    <table className="font-condensed w-full text-[13px]" aria-label={label}>
      <thead className="sticky top-0 bg-paper text-left text-ink-2">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`px-3 py-2 font-medium ${i ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="num bg-panel">
        {rows.map((r) => (
          <tr key={String(r[0])} className="border-t border-rule">
            {r.map((c, i) => (
              <td key={i} className={`px-3 py-1.5 ${i ? "text-right" : "font-medium"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
