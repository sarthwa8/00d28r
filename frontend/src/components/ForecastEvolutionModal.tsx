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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 backdrop-blur-sm p-4 pt-16" onClick={onClose} role="dialog" aria-modal="true" aria-label="Forecast revision history">
      <div className="panel w-full max-w-4xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semi-expanded text-[18px] font-semibold text-ink">How the forecast for {fmtTime(targetTime)} UTC evolved</h2>
            <p className="panel-note">Every WINDFOR run for this half-hour in the 48 hours before delivery, against the FUELHH actual.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-2 hover:bg-paper hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ForecastEvolution targetTime={targetTime} cutoffHour={cutoffHour} />
      </div>
    </div>
  );
}
