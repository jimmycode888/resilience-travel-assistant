import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DECISIONS,
  DEMO_REQUEST,
  DESTINATIONS,
  ORIGINS,
  PRODUCT_NAME,
  UNAVAILABLE_DECISION,
  type Confidence,
  type Crowding,
  type DataQuality,
  type DecisionAction,
  type DecisionResponse,
  type RoutePlan,
  type RouteStatus,
  type RouteStep,
  type Scenario,
  type TransportMode,
} from "./data/decisions";

/* ------------------------------------------------------------------ *
 * 標籤：與 resilience-travel-assistant/src/lib/labels.ts 對齊
 * ------------------------------------------------------------------ */

const ACTION_LABELS: Record<DecisionAction, string> = {
  depart_now: "立即出发",
  depart_at: "按建议时间出发",
  wait: "先核实再出发",
  hold: "留在安全处持续观察",
};

const CONFIDENCE_LABELS: Record<Confidence, string> = { high: "高", medium: "中", low: "低" };

const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  ok: "服务正常",
  delayed: "服务延误",
  disrupted: "服务中断",
  unknown: "状态未确认",
};

const CROWDING_LABELS: Record<Crowding, string> = {
  low: "人流低",
  medium: "人流一般",
  high: "人流高",
  unknown: "人流未确认",
};

const MODE_LABELS: Record<TransportMode, string> = {
  walk: "步行",
  mtr: "港铁",
  bus: "巴士",
  minibus: "小巴",
  tram: "电车",
  ferry: "渡轮",
};

const DATA_QUALITY_LABELS: Record<DataQuality, string> = {
  live: "实时资料",
  cached: "快取资料",
  fixture: "演示固定资料",
};

/** 系統判斷出來的當前狀態（非使用者可選）。 */
const SYSTEM_STATUS: Record<Scenario, { text: string; tone: "ok" | "warn" | "bad" }> = {
  normal: { text: "当前状态：正常", tone: "ok" },
  heavy_rain: { text: "当前状态：暴雨影响", tone: "warn" },
  disruption: { text: "当前状态：交通中断", tone: "bad" },
};

/** 風險等級由真實 primaryPlan.status 推導，同時以文字 + 圖示表達。 */
const RISK_BY_STATUS: Record<RouteStatus, { level: "低" | "中" | "高"; tone: "ok" | "warn" | "bad" }> = {
  ok: { level: "低", tone: "ok" },
  delayed: { level: "中", tone: "warn" },
  disrupted: { level: "高", tone: "bad" },
  unknown: { level: "中", tone: "warn" },
};

const ACTION_TONE: Record<DecisionAction, "blue" | "amber" | "red" | "slate"> = {
  depart_now: "red",
  depart_at: "blue",
  wait: "amber",
  hold: "slate",
};

/* ------------------------------------------------------------------ *
 * 純工具
 * ------------------------------------------------------------------ */

/** 契約時間一律為 +08:00 的 ISO 字串，直接取字串片段顯示，不做時區換算。 */
function hhmm(iso: string): string {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : "—";
}

function stamp(iso: string): string {
  return iso && iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "—";
}

function isActionable(d: DecisionResponse): boolean {
  return d.status !== "unavailable" && d.departAt !== "" && d.primaryPlan !== null;
}

/**
 * 路線步驟在桌面預設展開、行動裝置預設收起。
 * 目的：讓行動裝置首屏（Decision Summary 之後）能更快看到「切換條件」。
 */
const defaultOpenSteps = typeof window !== "undefined" && window.innerWidth > 900;

/* ------------------------------------------------------------------ *
 * 圖示
 * ------------------------------------------------------------------ */

type IconName =
  | "arrow" | "clock" | "route" | "shield" | "alert" | "swap" | "pin"
  | "chevron" | "refresh" | "rain" | "train" | "bus" | "walk" | "block" | "info";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9.5 12 1.7 1.7 3.5-4" /></>,
    alert: <><path d="M10.3 4.4 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    swap: <><path d="m7 7 3-3 3 3" /><path d="M10 4v12" /><path d="m17 17-3 3-3-3" /><path d="M14 20V8" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
    rain: <><path d="M7 17a4 4 0 1 1 1.2-7.8A5.5 5.5 0 0 1 18.7 11 3 3 0 0 1 18 17Z" /><path d="m8 20-1 2M13 20l-1 2M18 20l-1 2" /></>,
    train: <><rect x="5" y="3" width="14" height="13" rx="3" /><path d="M5 11h14" /><path d="m8 19-2 3M16 19l2 3" /><path d="M9 16h6" /></>,
    bus: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 10h16" /><path d="M7 20v-2M17 20v-2" /><circle cx="8" cy="13.5" r="1" /><circle cx="16" cy="13.5" r="1" /></>,
    walk: <><circle cx="13" cy="4" r="1.6" /><path d="m9 21 2-5-2-3 3-4 3 3 3 1" /><path d="M9 13 7 21" /></>,
    block: <><circle cx="12" cy="12" r="9" /><path d="m6 18 12-12" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function modeIcon(mode: TransportMode): IconName {
  if (mode === "mtr") return "train";
  if (mode === "bus" || mode === "minibus") return "bus";
  if (mode === "walk") return "walk";
  return "route";
}

/* ------------------------------------------------------------------ *
 * 資料載入：優先使用現有 API（Vite dev proxy /api），失敗時回退真實 golden 輸出
 * ------------------------------------------------------------------ */

interface TripRequest {
  origin: string;
  destination: string;
  arriveBy: string;
  constraints: { maxExtraCost: number; maxTransfers: number };
  scenario: Scenario;
}

type DataSource = "api" | "fixture";
type ForcedView = "auto" | "loading" | "unavailable" | "error";

async function fetchDecision(request: TripRequest, signal: AbortSignal): Promise<DecisionResponse> {
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as DecisionResponse;
  if (!data || typeof data.status !== "string" || !Array.isArray(data.reasons)) {
    throw new Error("BAD_RESPONSE");
  }
  return data;
}

function useDecision(request: TripRequest, forced: ForcedView) {
  const key = JSON.stringify(request);
  const [state, setState] = useState<{ data: DecisionResponse | null; source: DataSource; loading: boolean }>({
    data: null,
    source: "fixture",
    loading: true,
  });

  useEffect(() => {
    if (forced === "loading" || forced === "error") return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    setState((prev) => ({ ...prev, loading: true }));

    fetchDecision(request, controller.signal)
      .then((data) => {
        if (!cancelled) setState({ data, source: "api", loading: false });
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = JSON.parse(key) as TripRequest;
          setState({ data: DECISIONS[fallback.scenario], source: "fixture", loading: false });
        }
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, forced]);

  return state;
}

/* ------------------------------------------------------------------ *
 * 共用區塊
 * ------------------------------------------------------------------ */

function Card({ title, hint, action, children, className = "" }: {
  title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="card-head">
          <div>
            <h3>{title}</h3>
            {hint ? <p className="card-hint">{hint}</p> : null}
          </div>
          {action ? <div className="card-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConfidenceScale({ level }: { level: Confidence }) {
  const active = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <div className={`confidence-scale ${level}`} aria-hidden="true">
      {[1, 2, 3].map((i) => <i key={i} className={i <= active ? "active" : ""} />)}
    </div>
  );
}

function Header({ scenario, dataUpdatedAt, onHome }: {
  scenario: Scenario; dataUpdatedAt: string; onHome: () => void;
}) {
  const status = SYSTEM_STATUS[scenario];
  return (
    <header className="global-header">
      <div className="topbar">
        <button className="brand-button" onClick={onHome} aria-label="返回行程输入">
          <span className="product-icon"><Icon name="route" size={17} /></span>
          <span className="brand">{PRODUCT_NAME}</span>
        </button>
        <div className="topbar-meta">
          <span className={`system-status ${status.tone}`}>
            <span className="dot" />{status.text}
          </span>
          <span className="status-divider" />
          <span className="data-stamp">数据更新：{stamp(dataUpdatedAt)}</span>
        </div>
      </div>
    </header>
  );
}

function GlobalFooter() {
  return (
    <footer className="global-footer">
      <div className="global-footer-inner">
        <div className="footer-identity">
          <span className="brand">{PRODUCT_NAME}</span>
          <p>将天气与交通资料转化为清晰的出行决定。</p>
        </div>
        <p className="footer-disclaimer">
          出行建议仅供参考，实际行程可能受突发天气、交通事故及营运安排影响。请遵从相关部门的安全指引。
        </p>
        <div className="footer-meta">
          <strong>演示版本</strong>
          <span>固定资料 · 估算仅供参考</span>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ *
 * 輸入頁
 * ------------------------------------------------------------------ */

function LocationField({ label, value, options, onChange }: {
  label: string; value: string; options: readonly { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function TripInput({ onSubmit, request, setRequest }: {
  onSubmit: () => void; request: TripRequest; setRequest: (r: TripRequest) => void;
}) {
  const [origin, setOrigin] = useState(request.origin);
  const [destination, setDestination] = useState(request.destination);
  const [arriveBy, setArriveBy] = useState(request.arriveBy);
  const [maxExtraCost, setMaxExtraCost] = useState(String(request.constraints.maxExtraCost));
  const [maxTransfers, setMaxTransfers] = useState(String(request.constraints.maxTransfers));
  const [issues, setIssues] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: string[] = [];
    // 與 src/lib/validation.ts 的規則一致：整數、0–500 / 0–5，0 是有效值。
    const cost = Number(maxExtraCost);
    if (maxExtraCost.trim() === "" || !Number.isInteger(cost) || cost < 0 || cost > 500) {
      next.push("可接受的额外车费必须是 0–500 的整数（0 表示只接受不额外付费的方案）。");
    }
    const transfers = Number(maxTransfers);
    if (maxTransfers.trim() === "" || !Number.isInteger(transfers) || transfers < 0 || transfers > 5) {
      next.push("可接受的转乘次数必须是 0–5 的整数。");
    }
    if (!arriveBy) next.push("请选择最迟到达日期与时间。");
    setIssues(next);
    if (next.length > 0) return;

    setRequest({
      origin,
      destination,
      arriveBy,
      constraints: { maxExtraCost: cost, maxTransfers: transfers },
      scenario: request.scenario,
    });
    onSubmit();
  }

  return (
    <main className="input-page">
      <div className="input-intro">
        <span className="demo-pill"><span />固定通勤走廊 · 首版只支援一条走廊</span>
        <p className="kicker">{PRODUCT_NAME}</p>
        <h1>把复杂路况，<br />变成一个清晰决定。</h1>
        <p className="intro-copy">
          综合天气、交通和历史波动，告诉你何时出发、走哪条路，以及什么时候该改变计划。
        </p>
        <div className="trust-row">
          <span><Icon name="shield" size={16} />可靠性优先</span>
          <span><Icon name="refresh" size={16} />动态更新</span>
        </div>
      </div>

      <form className="input-card" onSubmit={handleSubmit} noValidate>
        <div className="card-heading">
          <span className="step-number">01</span>
          <div>
            <h2>规划你的行程</h2>
            <p>选择预设地点，我们会比较最可靠的路线。</p>
          </div>
        </div>

        <div className="location-fields">
          <LocationField label="起点" value={origin} options={ORIGINS} onChange={setOrigin} />
          <LocationField label="终点" value={destination} options={DESTINATIONS} onChange={setDestination} />
        </div>

        <div className="form-grid">
          <label className="field arrival-field">
            <span className="field-label">最迟到达时间（香港时间）</span>
            <input type="datetime-local" value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">可接受的额外车费（HK$）</span>
            <input type="number" min={0} max={500} step={1} value={maxExtraCost}
              onChange={(e) => setMaxExtraCost(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">可接受的转乘次数</span>
            <input type="number" min={0} max={5} step={1} value={maxTransfers}
              onChange={(e) => setMaxTransfers(e.target.value)} />
          </label>
        </div>

        {issues.length > 0 ? (
          <ul className="field-errors" role="alert">
            {issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
        ) : null}

        <button className="primary-button" type="submit">
          获取出行建议 <Icon name="arrow" size={18} />
        </button>
        <p className="form-footnote">
          <Icon name="shield" size={15} />
          建议会优先确保你在 {hhmm(arriveBy + ":00")} 前到达
        </p>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * 結果頁：狀態面板
 * ------------------------------------------------------------------ */

function StatusPanel({ state, onRetry, onEdit, reasonsId }: {
  state: "loading" | "unavailable" | "error";
  onRetry: () => void;
  onEdit: () => void;
  reasonsId?: string;
}) {
  const content = {
    loading: ["正在分析", "正在读取路线状态与天气资料", "我们正在整合最新天气与交通资料，通常只需几秒。"],
    unavailable: ["资料状态", "实时建议暂时不可用", "未能取得足够的交通资料。你仍可查看固定时刻表。"],
    error: ["资料状态", "建议未能载入", "连接出现问题，请稍后重试。你的行程资料已保留。"],
  }[state];

  function scrollToReasons() {
    if (reasonsId && typeof document !== "undefined") {
      document.getElementById(reasonsId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <section className={`status-panel ${state}`}>
      <div className="status-visual">
        {state === "loading"
          ? <span className="loader" />
          : <Icon name={state === "unavailable" ? "block" : "refresh"} size={28} />}
      </div>
      <p className="section-label">{content[0]}</p>
      <h2>{content[1]}</h2>
      <p>{content[2]}</p>
      {state === "loading" ? (
        <>
          <div className="skeleton" aria-hidden="true"><i /><i /><i /></div>
          <p className="status-note">正在读取路线状态与天气资料…</p>
        </>
      ) : (
        <div className="status-actions">
          {state === "error" ? (
            <>
              <button className="primary-button compact" onClick={onRetry}>
                <Icon name="refresh" size={16} /> 重试
              </button>
              <button className="secondary-button" onClick={onEdit}>返回输入页</button>
            </>
          ) : (
            <>
              <button className="primary-button compact" onClick={onEdit}>调整行程条件</button>
              <button className="secondary-button" onClick={scrollToReasons}>
                <Icon name="info" size={16} /> 查看原因
              </button>
              <span className="hold-note">
                <Icon name="shield" size={15} /> 或留在安全处持续观察
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 結果頁：主要區塊
 * ------------------------------------------------------------------ */

function DecisionSummary({ data }: { data: DecisionResponse }) {
  const plan = data.primaryPlan as RoutePlan;
  const risk = RISK_BY_STATUS[plan.status];
  return (
    <section className="decision-card">
      <div className="decision-main">
        <span className="section-label">
          为确保 {hhmm(data.generatedFor.arriveBy)} 前到达
        </span>
        <h1>建议 <span>{hhmm(data.departAt)}</span> 出发</h1>

        <div className="decision-meta">
          <span className={`action-badge ${ACTION_TONE[data.action]}`}>
            <span />{ACTION_LABELS[data.action]}
          </span>
          <span className={`chip ${risk.tone}`}>
            <Icon name={plan.status === "ok" ? "shield" : "alert"} size={14} />
            服务：{ROUTE_STATUS_LABELS[plan.status]}
          </span>
        </div>

        <div className="arrival-block">
          <span>预计到达</span>
          <strong>{hhmm(data.etaRange[0])} – {hhmm(data.etaRange[1])}</strong>
          <small>演示估算 · 非校准概率</small>
        </div>

        <div className="latest-row">
          <Icon name="clock" size={15} />
          最迟出发 <strong>{hhmm(data.latestDepartAt)}</strong>
          <span>（逾时建议改用其他方式）</span>
        </div>
      </div>

      <div className="decision-route">
        <span className="route-icon"><Icon name="route" size={22} /></span>
        <div className="route-primary">
          <span>推荐路线</span>
          <strong>{plan.label}</strong>
          <p>
            {plan.durationMinutes} 分钟 · 转乘 {plan.transfers} 次 · 额外车费 ${plan.extraCostHkd}
          </p>
        </div>
        <div className="confidence">
          <strong>到达信心：{CONFIDENCE_LABELS[data.confidence]}</strong>
          <ConfidenceScale level={data.confidence} />
          <small>定性判断 · 未经历史校准</small>
        </div>
      </div>
    </section>
  );
}

function NoticeList({ notices }: { notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="notice-list" role="note">
      <h3><Icon name="info" size={15} /> 提醒</h3>
      <ul>{notices.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

function UncertainBanner({ items }: { items: readonly string[] }) {
  return (
    <div className="uncertain-banner" role="note">
      <span className="banner-icon"><Icon name="alert" size={18} /></span>
      <div>
        <strong>建议可用但不确定</strong>
        <p>出发前请再确认港铁、运输署与香港天文台的官方公告。</p>
        {items.length > 0 ? <ul>{items.slice(0, 3).map((i) => <li key={i}>{i}</li>)}</ul> : null}
      </div>
    </div>
  );
}

/** 精簡路線示意：只畫真實起訖節點，不顯示距離，不畫虛構地理。 */
function RouteStrip({ steps, tone }: { steps: readonly RouteStep[]; tone: "blue" | "amber" | "red" | "slate" }) {
  if (steps.length === 0) return null;
  const first = steps[0];
  const last = steps[steps.length - 1];
  return (
    <div className={`route-strip ${tone}`}>
      <span className="strip-node">{first.from}</span>
      <span className="strip-line" />
      <span className="strip-node">{last.to}</span>
    </div>
  );
}

function Timeline({ steps }: { steps: readonly RouteStep[] }) {
  if (steps.length === 0) {
    return <p className="muted">没有可显示的路線步骤。</p>;
  }
  return (
    <ol className="timeline">
      {steps.map((s, i) => (
        <li key={s.id}>
          <div className="timeline-time">
            <strong>{hhmm(s.departAt)}</strong>
            <span>{s.durationMinutes} 分</span>
          </div>
          <div className={`timeline-body ${i === steps.length - 1 ? "is-last" : ""}`}>
            <div className="timeline-mode">
              <span className="mode-chip"><Icon name={modeIcon(s.mode)} size={13} />{MODE_LABELS[s.mode]}</span>
              {s.line ? <span className="line-name">{s.line}</span> : null}
            </div>
            <p className="timeline-instruction">{s.instruction}</p>
            <p className="timeline-route">{s.from} → {s.to} · 抵达 {hhmm(s.arriveAt)}</p>
            {s.note ? <p className="timeline-note">{s.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RouteOverview({ data }: { data: DecisionResponse }) {
  const plan = data.primaryPlan as RoutePlan;
  const risk = RISK_BY_STATUS[plan.status];
  const [showSteps, setShowSteps] = useState(defaultOpenSteps);
  return (
    <Card title="路线概览" hint={plan.summary} className="route-overview">
      <RouteStrip steps={data.primaryRoute} tone={risk.tone === "ok" ? "blue" : risk.tone === "warn" ? "amber" : "red"} />
      <div className="stat-row">
        <Stat label="全程" value={`${plan.durationMinutes} 分钟`} />
        <Stat label="转乘" value={`${plan.transfers} 次`} />
        <Stat label="额外车费" value={`$${plan.extraCostHkd}`} />
        <Stat label="人流" value={CROWDING_LABELS[plan.crowding]} />
      </div>
      <button className="disclosure" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
        <Icon name="chevron" size={14} />
        {showSteps ? "收起路线步骤" : `查看路线步骤（${data.primaryRoute.length} 步）`}
      </button>
      {showSteps ? <Timeline steps={data.primaryRoute} /> : null}
    </Card>
  );
}

function PlanBCard({ data }: { data: DecisionResponse }) {
  if (!data.planBPlan || data.planB.length === 0) {
    return (
      <Card title="Plan B">
        <p className="muted">本次没有可用的备用路线。一旦主路线受阻，将没有备案。</p>
      </Card>
    );
  }
  const plan = data.planBPlan;
  const [showSteps, setShowSteps] = useState(defaultOpenSteps);
  return (
    <Card
      title="Plan B"
      hint={plan.summary}
      action={<span className="tag">备选</span>}
      className="plan-b"
    >
      <RouteStrip steps={data.planB} tone="slate" />
      <div className="stat-row">
        <Stat label="出发" value={hhmm(plan.departAt)} />
        <Stat label="到达" value={hhmm(plan.arriveAt)} />
        <Stat label="全程" value={`${plan.durationMinutes} 分钟`} />
        <Stat label="额外车费" value={`$${plan.extraCostHkd}`} />
      </div>
      <button className="disclosure" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
        <Icon name="chevron" size={14} />
        {showSteps ? "收起路线步骤与风险" : `查看路线步骤与风险（${data.planB.length} 步）`}
      </button>
      {showSteps ? (
        <>
          <div className="stat-row">
            <Stat label="服务状态" value={ROUTE_STATUS_LABELS[plan.status]} />
            <Stat label="人流" value={CROWDING_LABELS[plan.crowding]} />
          </div>
          <Timeline steps={data.planB} />
          <div className="risk-notes">
            <h4>备用路线风险</h4>
            <ul>{plan.riskNotes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </>
      ) : null}
      <p className="cross-ref">何时切换到 Plan B，见下方「切换条件」。</p>
    </Card>
  );
}

function SwitchCard({ data }: { data: DecisionResponse }) {
  if (!data.switchCondition) return null;
  return (
    <section className="switch-card">
      <span className="section-label">切换条件</span>
      <h3>什么时候要改变计划？</h3>
      <p className="switch-text">{data.switchCondition}</p>
      {data.switchDeadline ? (
        <div className="switch-deadline">
          <Icon name="clock" size={16} />
          <span>最迟切换决定：<strong>{hhmm(data.switchDeadline)}</strong></span>
        </div>
      ) : null}
    </section>
  );
}

function RiskCard({ data }: { data: DecisionResponse }) {
  const plan = data.primaryPlan as RoutePlan;
  const risk = RISK_BY_STATUS[plan.status];
  return (
    <Card title="当前风险" className="risk-card">
      <div className={`risk-head ${risk.tone}`}>
        <span className="risk-icon"><Icon name={risk.tone === "ok" ? "shield" : "alert"} size={20} /></span>
        <div>
          <strong>{risk.level}风险</strong>
          <span>{ROUTE_STATUS_LABELS[plan.status]} · {CROWDING_LABELS[plan.crowding]}</span>
        </div>
      </div>
      <ul className="risk-notes-list">{plan.riskNotes.map((n) => <li key={n}>{n}</li>)}</ul>
    </Card>
  );
}

function ReasonsCard({ data }: { data: DecisionResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <Card title="推荐理由" hint="全部由规则与资料产生" className="reasons-card">
      <ul className="reason-list">{data.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {data.basis.length > 0 ? (
        <>
          <button className="disclosure" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Icon name="chevron" size={14} />
            {open ? "隐藏依据" : `查看依据（${data.basis.length} 条）`}
          </button>
          {open ? (
            <ul className="basis-list">
              {data.basis.map((b) => (
                <li key={b.claim}>
                  <span className={`basis-tag ${b.type}`}>{b.type === "rule" ? "规则" : b.type === "data" ? "资料" : "统计"}</span>
                  <div>
                    <p>{b.claim}</p>
                    <small>{b.source}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function UncertaintyCard({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <Card title="我们不知道什么" className="uncertainty-card">
      <ul className="uncertainty-list">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </Card>
  );
}

function CandidatesCard({ data }: { data: DecisionResponse }) {
  const [open, setOpen] = useState(false);
  if (data.candidates.length === 0 && data.excludedRoutes.length === 0) return null;
  return (
    <Card
      title="其他候选路线"
      hint="决策层评估过的所有路线"
      action={
        <button className="disclosure inline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Icon name="chevron" size={14} />{open ? "收起" : "展开"}
        </button>
      }
    >
      {data.excludedRoutes.length > 0 ? (
        <div className="excluded">
          <h4><Icon name="block" size={14} /> 已排除路线</h4>
          <ul>
            {data.excludedRoutes.map((e) => (
              <li key={e.routeId}>
                <strong>{e.routeId} · {e.label}</strong>
                <span>{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open ? (
        <ul className="candidate-list">
          {data.candidates.map((c) => (
            <li key={c.routeId}>
              <div className="candidate-head">
                <strong>{c.routeId} · {c.label}</strong>
                <span className={`chip ${RISK_BY_STATUS[c.status].tone}`}>{ROUTE_STATUS_LABELS[c.status]}</span>
              </div>
              <p className="candidate-meta">
                {c.durationMinutes} 分钟 · 转乘 {c.transfers} 次 · 额外车费 ${c.extraCostHkd} ·
                评分 {c.score.toFixed(3)} · 人流 {CROWDING_LABELS[c.crowding]}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function DataSourcesCard({ data, source }: { data: DecisionResponse; source: DataSource }) {
  return (
    <Card
      title="数据来源"
      hint={`演示资料时间：${stamp(data.dataUpdatedAt)}`}
      action={<span className="quality-chip">{DATA_QUALITY_LABELS[data.dataQuality]}</span>}
    >
      <ul className="source-list">
        {data.dataSources.map((s) => (
          <li key={s.id}>
            <div className="source-head">
              <span>{s.label}</span>
              <span className="quality-chip small">{DATA_QUALITY_LABELS[s.quality]}</span>
            </div>
            <div className="source-meta">更新于 {stamp(s.updatedAt)}</div>
            {s.note ? <p className="source-note">{s.note}</p> : null}
          </li>
        ))}
      </ul>
      <p className="source-foot">
        本次结果由 <strong>{source === "api" ? "现有决策 API（POST /api/decision）" : "固定演示资料（与 API 输出一致）"}</strong> 产生。
      </p>
    </Card>
  );
}

function Disclaimer({ text }: { text: string }) {
  return (
    <section className="disclaimer-block">
      <h4><Icon name="info" size={15} /> 免责声明</h4>
      <p>{text}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Demo 控制（僅供演示，不屬於使用者流程）
 * ------------------------------------------------------------------ */

function DemoControl({ open, onToggle, scenario, setScenario, forced, setForced }: {
  open: boolean; onToggle: () => void;
  scenario: Scenario; setScenario: (s: Scenario) => void;
  forced: ForcedView; setForced: (v: ForcedView) => void;
}) {
  return (
    <section className={`demo-control ${open ? "open" : ""}`}>
      <button className="demo-toggle" onClick={onToggle} aria-expanded={open}>
        <Icon name="chevron" size={14} />
        演示控制（仅用于演示，不属于用户界面）
      </button>
      {open ? (
        <div className="demo-body">
          <div className="demo-row">
            <span className="demo-label">系统判断的情景</span>
            <div className="demo-group">
              {([["normal", "正常通勤"], ["heavy_rain", "暴雨影响"], ["disruption", "交通中断"]] as const).map(([k, label]) => (
                <button key={k} className={scenario === k ? "active" : ""}
                  onClick={() => { setScenario(k); setForced("auto"); }}>{label}</button>
              ))}
            </div>
          </div>
          <div className="demo-row">
            <span className="demo-label">界面状态</span>
            <div className="demo-group">
              {([["auto", "依资料"], ["loading", "加载中"], ["unavailable", "不可用"], ["error", "错误"]] as const).map(([k, label]) => (
                <button key={k} className={forced === k ? "active" : ""}
                  onClick={() => setForced(k)}>{label}</button>
              ))}
            </div>
          </div>
          <p className="demo-note">
            真实产品中情景由数据与系统判定，用户不选择情景。此面板仅用于比赛演示。
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 結果頁
 * ------------------------------------------------------------------ */

function ResultPage({ request, scenario, forced, onHome, demoSlot, setScenario, setForced }: {
  request: TripRequest; scenario: Scenario; forced: ForcedView; onHome: () => void;
  demoSlot: ReactNode; setScenario: (s: Scenario) => void; setForced: (v: ForcedView) => void;
}) {
  const { data, source, loading } = useDecision(request, forced);
  const decision = useMemo(
    () => (forced === "unavailable" ? UNAVAILABLE_DECISION : data),
    [forced, data],
  );

  const showLoading = forced === "loading" || (loading && forced === "auto");
  const showError = forced === "error";

  return (
    <main className="result-page">
      <div className="result-topline">
        <button className="back-link" onClick={onHome}>← 修改行程</button>
        {decision && decision.primaryPlan && decision.status !== "unavailable" && forced !== "error" ? (
          <span className="service-chip">
            推荐路线：{ROUTE_STATUS_LABELS[decision.primaryPlan.status]}
          </span>
        ) : null}
      </div>

      {demoSlot}

      {showLoading ? <StatusPanel state="loading" onRetry={() => setForced("auto")} onEdit={onHome} /> : null}

      {showError ? <StatusPanel state="error" onRetry={() => setForced("auto")} onEdit={onHome} /> : null}

      {!showLoading && !showError && decision && !isActionable(decision) ? (
        <>
          <StatusPanel
            state="unavailable"
            onRetry={() => setForced("auto")}
            onEdit={onHome}
            reasonsId="unavailable-reasons"
          />
          <div id="unavailable-reasons">
            <Card title="为什么没有可行的建议" hint="依你的限制条件逐条说明">
              <ul className="reason-list">{decision.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </Card>
          </div>
          <CandidatesCard data={decision} />
        </>
      ) : null}

      {!showLoading && !showError && decision && isActionable(decision) ? (
        <>
          <DecisionSummary data={decision} />

          {decision.status === "uncertain" ? <UncertainBanner items={decision.uncertainty} /> : null}
          <NoticeList notices={decision.notices} />

          <div className="result-grid">
            <div className="col-main">
              <RouteOverview data={decision} />
              <PlanBCard data={decision} />
            </div>
            <aside className="col-side">
              <SwitchCard data={decision} />
              <RiskCard data={decision} />
              <ReasonsCard data={decision} />
              <UncertaintyCard items={decision.uncertainty} />
            </aside>
          </div>

          <CandidatesCard data={decision} />
          <DataSourcesCard data={decision} source={source} />
          <Disclaimer text={decision.disclaimer} />
        </>
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * 根元件
 * ------------------------------------------------------------------ */

export default function App() {
  const demoMode = typeof window !== "undefined" && window.location.search.includes("demo=1");
  const [page, setPage] = useState<"input" | "result">("input");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [forced, setForced] = useState<ForcedView>("auto");
  const [demoOpen, setDemoOpen] = useState(demoMode);

  const [request, setRequest] = useState<TripRequest>({
    origin: DEMO_REQUEST.origin,
    destination: DEMO_REQUEST.destination,
    arriveBy: DEMO_REQUEST.arriveBy,
    constraints: { maxExtraCost: DEMO_REQUEST.maxExtraCost, maxTransfers: DEMO_REQUEST.maxTransfers },
    scenario: "normal",
  });

  const activeRequest: TripRequest = { ...request, scenario };
  const headerDataUpdatedAt = DECISIONS[scenario].dataUpdatedAt;

  const demoSlot = demoMode ? (
    <DemoControl
      open={demoOpen}
      onToggle={() => setDemoOpen((v) => !v)}
      scenario={scenario}
      setScenario={setScenario}
      forced={forced}
      setForced={setForced}
    />
  ) : null;

  return (
    <div className="app">
      <Header scenario={scenario} dataUpdatedAt={headerDataUpdatedAt} onHome={() => setPage("input")} />
      {page === "input" ? (
        <>
          <TripInput onSubmit={() => setPage("result")} request={request} setRequest={setRequest} />
          {demoSlot ? <div className="demo-wrap">{demoSlot}</div> : null}
        </>
      ) : (
        <ResultPage
          request={activeRequest}
          scenario={scenario}
          forced={forced}
          onHome={() => setPage("input")}
          demoSlot={demoSlot}
          setScenario={setScenario}
          setForced={setForced}
        />
      )}
      <GlobalFooter />
    </div>
  );
}
