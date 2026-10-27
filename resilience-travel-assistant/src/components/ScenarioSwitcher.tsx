"use client";

import { SCENARIO_LABELS } from "@/lib/labels";
import type { Scenario } from "@/lib/types";

const ORDER: readonly Scenario[] = ["normal", "heavy_rain", "disruption", "live"];

const HINTS: Record<Scenario, string> = {
  normal: "一般通勤狀況",
  heavy_rain: "暴雨警告生效",
  disruption: "鐵路服務中斷",
  live: "嘗試實時資料，失敗時回退演示資料",
};

/**
 * 情景切換器。提示文字在手機上隱藏，避免佔用第一屏高度
 * （手機的第一屏必須留給「幾點走、到達信心、什麼時候切換」）。
 */
export function ScenarioSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: Scenario;
  onChange: (scenario: Scenario) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="演示情景" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ORDER.map((scenario) => {
        const active = scenario === value;
        return (
          <button
            key={scenario}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            aria-label={SCENARIO_LABELS[scenario]}
            title={HINTS[scenario]}
            disabled={disabled}
            onClick={() => onChange(scenario)}
            onKeyDown={(event) => {
              const offset = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 :
                ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const index = event.key === "Home" ? 0 : event.key === "End" ? ORDER.length - 1 :
                (ORDER.indexOf(scenario) + offset + ORDER.length) % ORDER.length;
              const next = ORDER[index];
              if (!next) return;
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
              buttons?.[index]?.focus();
              onChange(next);
            }}
            className={`min-h-11 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            }`}
          >
            <span className="block text-sm font-semibold">{SCENARIO_LABELS[scenario]}</span>
            <span className={`hidden text-[11px] sm:block ${active ? "text-slate-200" : "text-slate-600"}`}>
              {HINTS[scenario]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
