"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function SectionCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function LoadingCard({ label }: { label: string }) {
  return (
    <div className="card" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
        />
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">正在讀取路線狀態與天氣資料…</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function ErrorNotice({
  title = "無法取得建議",
  message,
  details = [],
  code,
  onRetry,
  retryLabel = "重試",
}: {
  title?: string;
  message: string;
  details?: string[];
  code?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="card border-rose-200 bg-rose-50" role="alert">
      <h2 className="text-base font-semibold text-rose-900">{title}</h2>
      <p className="mt-1 text-sm text-rose-800">{message}</p>
      {code ? <p className="mt-1 text-xs text-rose-700">錯誤代碼：{code}</p> : null}
      {details.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-800">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry ? (
          <button type="button" className="btn-secondary" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
        <Link className="btn-secondary inline-flex items-center" href="/">
          返回輸入頁
        </Link>
      </div>
    </div>
  );
}

export function NoticeList({ notices }: { notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <h3 className="text-xs font-semibold text-amber-900">提醒（資料來源與限制）</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-900">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
