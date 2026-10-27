"use client";

import { DATA_QUALITY_LABELS } from "@/lib/labels";
import { formatHkStamp } from "@/lib/time";
import type { DataSourceInfo, DataQuality } from "@/lib/types";

const QUALITY_STYLES: Record<DataQuality, string> = {
  live: "bg-emerald-100 text-emerald-900",
  cached: "bg-amber-100 text-amber-900",
  fixture: "bg-slate-200 text-slate-800",
};

/**
 * 資料新鮮度標示。刻意把 fixture 顯示成灰色「演示固定資料」，
 * 避免把演示資料偽裝成實時資料。
 */
export function DataFreshnessBadge({
  quality,
  updatedAt,
}: {
  quality: DataQuality;
  updatedAt: string;
}) {
  return (
    <span className={`pill ${QUALITY_STYLES[quality]}`} title="資料品質與更新時間">
      {DATA_QUALITY_LABELS[quality]}
      <span className="font-normal opacity-80">· {formatHkStamp(updatedAt)}</span>
    </span>
  );
}

export function DataSourceList({ sources }: { sources: readonly DataSourceInfo[] }) {
  if (sources.length === 0) {
    return <p className="text-xs text-slate-500">本次沒有回報資料來源資訊。</p>;
  }
  return (
    <ul className="space-y-3">
      {sources.map((source) => (
        <li key={source.id} className="space-y-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
            <span className="text-xs text-slate-700">{source.label}</span>
            <span className="flex items-center gap-2">
              <span className={`pill ${QUALITY_STYLES[source.quality]}`}>
                {DATA_QUALITY_LABELS[source.quality]}
              </span>
              <span className="text-xs tabular-nums text-slate-500">
                {formatHkStamp(source.updatedAt)}
              </span>
            </span>
          </div>
          {source.note ? <p className="text-xs text-slate-500">{source.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
