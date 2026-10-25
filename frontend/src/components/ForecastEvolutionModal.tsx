import { useEffect } from "react";
import { X } from "lucide-react";
import { ForecastEvolution } from "./ForecastEvolution";
import { fmtTime } from "../lib/format";

interface Props {
  targetTime: string | null;
  cutoffHour: number;
  onClose: () => void;
}

export function ForecastEvolutionModal({ targetTime, cutoffHour, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!targetTime) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16" onClick={onClose} role="dialog" aria-modal="true" aria-label="Forecast revision history">
      <div className="card w-full max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Forecast Evolution — {fmtTime(targetTime)} UTC</h2>
            <p className="card-sub">Every WINDFOR revision for this settlement period over the 48h before delivery, vs. FUELHH actual outturn.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ForecastEvolution targetTime={targetTime} cutoffHour={cutoffHour} />
      </div>
    </div>
  );
}
