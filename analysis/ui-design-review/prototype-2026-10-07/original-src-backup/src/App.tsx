import { useState, type ReactNode } from "react";

type ScenarioKey = "normal" | "rain" | "disruption";
type ViewState = "ready" | "loading" | "uncertain" | "unavailable" | "error";

type Scenario = {
  label: string;
  eyebrow: string;
  action: string;
  actionTone: "blue" | "amber" | "red";
  depart: string;
  arrival: string;
  route: string;
  duration: string;
  confidence: string;
  confidenceLevel: "high" | "medium" | "low";
  risk: string;
  reason: string;
  switchRule: string;
  alternative: string;
  alternativeDuration: string;
  alternativeConfidence: string;
  alternativeReason: string;
  note?: string;
  source?: string;
  weather?: {
    title: string;
    detail: string;
  };
  disruption?: {
    title: string;
    detail: string;
  };
};

const scenarios: Record<ScenarioKey, Scenario> = {
  normal: {
    label: "正常通勤",
    eyebrow: "准时到达机会高",
    action: "按计划出发",
    actionTone: "blue",
    depart: "08:05",
    arrival: "08:38–08:47",
    route: "港铁优先",
    duration: "约 37 分钟",
    confidence: "到达信心：高",
    confidenceLevel: "high",
    risk: "低风险",
    reason: "路况稳定，港铁服务正常",
    switchRule: "若 08:10 仍未离开起点，改乘的士直达",
    alternative: "的士直达",
    alternativeDuration: "约 31–42 分钟",
    alternativeConfidence: "到达信心：中",
    alternativeReason: "出发延误超过 5 分钟时更稳妥",
  },
  rain: {
    label: "暴雨影响",
    eyebrow: "降雨将拉长接驳时间",
    action: "提前出发",
    actionTone: "amber",
    depart: "07:42",
    arrival: "08:29–08:46",
    route: "港铁 + 室内步行",
    duration: "约 51 分钟",
    confidence: "到达信心：中",
    confidenceLevel: "medium",
    risk: "中等风险",
    reason: "红色暴雨警告，地面接驳或有延误",
    switchRule: "若 07:35 雨量升至每小时 70mm，直接改乘港铁路线",
    alternative: "巴士 101 + 港铁",
    alternativeDuration: "约 58–72 分钟",
    alternativeConfidence: "到达信心：低",
    alternativeReason: "港铁拥挤时可分散候车风险",
    weather: {
      title: "红色暴雨警告生效",
      detail: "未来 60 分钟维港两岸雨势持续，预计步行与候车时间增加 8–12 分钟。",
    },
  },
  disruption: {
    label: "交通中断",
    eyebrow: "原定路线已受影响",
    action: "立即出发",
    actionTone: "red",
    depart: "现在 · 07:56",
    arrival: "08:35–08:49",
    route: "巴士 101 + 步行",
    duration: "约 46 分钟",
    confidence: "到达信心：中",
    confidenceLevel: "medium",
    risk: "较高风险",
    reason: "港铁金钟站信号故障，列车间隔不稳定",
    switchRule: "若 08:08 前仍未上车，转乘过海的士",
    alternative: "过海的士",
    alternativeDuration: "约 35–50 分钟",
    alternativeConfidence: "到达信心：中",
    alternativeReason: "巴士候车超过 12 分钟时节省时间",
    disruption: {
      title: "荃湾线局部服务受阻",
      detail: "金钟站信号设备故障，列车班次约每 8–10 分钟一班。",
    },
    source: "港铁服务更新 · 07:51",
  },
};

function Icon({
  name,
  size = 18,
}: {
  name: "arrow" | "clock" | "route" | "shield" | "alert" | "swap" | "pin" | "chevron" | "refresh" | "rain";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
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
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">出行可靠性决策助手</div>
  );
}

function Header({ onHome }: { onHome: () => void }) {
  return (
    <header className="global-header">
      <div className="topbar">
        <button className="brand-button" onClick={onHome} aria-label="返回行程输入">
          <span className="product-icon"><Icon name="route" size={17} /></span>
          <Brand />
        </button>
        <div className="topbar-meta">
          <span className="demo-status"><span className="fixed-dot" />演示固定资料 · 08:00 HKT</span>
          <span className="status-divider" />
          <span className="service-status"><span className="service-dot" />服务正常</span>
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
          <Brand />
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

function LocationField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="select-shell">
        <span className="field-icon"><Icon name="pin" size={17} /></span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <span className="select-chevron">⌄</span>
      </span>
    </label>
  );
}

function TripInput({
  onSubmit,
  scenario,
  setScenario,
}: {
  onSubmit: () => void;
  scenario: ScenarioKey;
  setScenario: (scenario: ScenarioKey) => void;
}) {
  const [origin, setOrigin] = useState("西营盘 · 皇后大道西");
  const [destination, setDestination] = useState("九龙湾 · 宏照道");
  return (
    <main className="input-page">
      <section className="input-intro">
        <div className="demo-pill"><span /> 演示情景 · 固定资料</div>
        <p className="kicker">AI 出行可靠性决策助手</p>
        <h1>把复杂路况，<br />变成一个清晰决定。</h1>
        <p className="intro-copy">综合天气、交通和历史波动，告诉你何时出发、走哪条路，以及什么时候该改变计划。</p>
        <div className="trust-row">
          <span><Icon name="shield" size={17} /> 可靠性优先</span>
          <span><Icon name="refresh" size={17} /> 动态更新</span>
        </div>
      </section>

      <section className="input-card">
        <div className="card-heading">
          <span className="step-number">01</span>
          <div>
            <h2>规划你的行程</h2>
            <p>选择预设地点，我们会比较最可靠的路线。</p>
          </div>
        </div>
        <div className="demo-scenario">
          <div className="demo-scenario-label">
            <span>演示情景</span>
            <small>固定演示资料，非个人偏好</small>
          </div>
          <div className="demo-scenario-options" aria-label="固定演示情景">
            {([
              ["normal", "正常通勤"],
              ["rain", "暴雨影响"],
              ["disruption", "交通中断"],
            ] as [ScenarioKey, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={scenario === key ? "active" : ""}
                onClick={() => setScenario(key)}
                aria-pressed={scenario === key}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="location-fields">
          <LocationField
            label="起点"
            value={origin}
            options={["西营盘 · 皇后大道西", "中环 · 国际金融中心", "湾仔 · 会展站"]}
            onChange={setOrigin}
          />
          <button className="swap-button" aria-label="交换起点和终点"><Icon name="swap" size={16} /></button>
          <LocationField
            label="终点"
            value={destination}
            options={["九龙湾 · 宏照道", "观塘 · 创纪之城", "启德 · AIRSIDE"]}
            onChange={setDestination}
          />
        </div>
        <div className="form-grid">
          <label className="field arrival-field">
            <span className="field-label">最迟到达时间 <em>香港时间</em></span>
            <span className="input-shell">
              <span className="field-icon"><Icon name="clock" size={17} /></span>
              <input type="time" defaultValue="09:00" />
            </span>
          </label>
          <label className="field">
            <span className="field-label">可接受的额外车费 <em>选填</em></span>
            <span className="select-shell simple">
              <select defaultValue="HK$80 以内">
                <option>HK$40 以内</option>
                <option>HK$80 以内</option>
                <option>HK$150 以内</option>
              </select>
              <span className="select-chevron">⌄</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">可接受的转乘次数 <em>选填</em></span>
            <span className="select-shell simple">
              <select defaultValue="最多 2 次">
                <option>不转乘</option>
                <option>最多 1 次</option>
                <option>最多 2 次</option>
              </select>
              <span className="select-chevron">⌄</span>
            </span>
          </label>
        </div>
        <button className="primary-button" onClick={onSubmit}>
          获取出行建议 <Icon name="arrow" />
        </button>
        <p className="form-footnote"><Icon name="shield" size={15} /> 建议会优先确保你在 09:00 前到达</p>
      </section>
    </main>
  );
}

function MapCard({ scenario }: { scenario: ScenarioKey }) {
  const stages = scenario === "disruption"
    ? [["07:56", "步行", "前往巴士站"], ["08:02", "巴士", "乘搭 101"], ["08:38", "步行", "前往目的地"], ["08:46", "到达", "九龙湾"]]
    : scenario === "rain"
      ? [["07:42", "步行", "室内通道"], ["07:52", "港铁", "港岛线"], ["08:10", "转乘", "观塘线"], ["08:37", "到达", "九龙湾"]]
    : [["08:05", "步行", "前往西营盘站"], ["08:12", "港铁", "港岛线"], ["08:24", "转乘", "观塘线"], ["08:42", "到达", "九龙湾"]];
  return (
    <section className="map-card card">
      <div className="map-header">
        <div>
          <span className="section-label">路线概览</span>
          <h3>西营盘 → 九龙湾</h3>
        </div>
        <span className="map-scale">约 11.8 km</span>
      </div>
      <div className="map-canvas">
        <svg viewBox="0 0 720 315" role="img" aria-label="西营盘至九龙湾的简化路线图">
          <path className="coast" d="M-20 20c120 40 137 104 260 92 84-8 104-62 204-31 72 22 137-11 296-2v256H-20Z" />
          <path className="land-line" d="M-10 82c100 20 155 71 249 58 95-13 126-56 217-30 72 21 145-2 278 5" />
          <g className="roads">
            <path d="M30 57 198 259M103 15l98 286M285 18l-46 280M402 20l-63 282M498 13l-75 290M605 16 497 298M697 42 568 300" />
            <path d="M20 225 690 204M4 166l714-6M52 105l632 12M182 48l438 214" />
          </g>
          <path className={`route-line ${scenario}`} d="M105 231C174 206 205 205 258 177c54-28 65-56 121-62 70-8 94 42 156 24 39-11 48-35 87-38" />
          <circle className="route-halo" cx="105" cy="231" r="12" />
          <circle className="route-start" cx="105" cy="231" r="6" />
          <circle className="route-halo" cx="622" cy="101" r="12" />
          <circle className="route-end" cx="622" cy="101" r="6" />
        </svg>
        <span className="map-tag origin">西营盘</span>
        <span className="map-tag destination">九龙湾</span>
        <div className="map-legend"><span className={`legend-line ${scenario}`} /> 推荐路线</div>
      </div>
      <div className="route-timeline" aria-label="路线主要阶段">
        {stages.map(([time, title, detail], index) => (
          <div className="timeline-stage" key={`${time}-${title}`}>
            <span className={`timeline-dot ${index === stages.length - 1 ? "finish" : ""}`} />
            <small>{time}</small>
            <strong>{title}</strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfidenceScale({ level }: { level: "high" | "medium" | "low" }) {
  const activeCount = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className={`confidence-scale ${level}`} aria-hidden="true">
      {[1, 2, 3].map((item) => <i key={item} className={item <= activeCount ? "active" : ""} />)}
    </span>
  );
}

function SpecialNotice({ data }: { data: Scenario }) {
  if (!data.weather && !data.disruption) return null;
  const isWeather = Boolean(data.weather);
  const notice = data.weather ?? data.disruption!;
  return (
    <section className={`special-notice ${isWeather ? "weather" : "incident"}`}>
      <span className="notice-icon"><Icon name={isWeather ? "rain" : "alert"} /></span>
      <div>
        <span>{isWeather ? "天气情况及影响" : "交通中断说明"}</span>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
        {data.source && <small>信息来源：{data.source}</small>}
      </div>
    </section>
  );
}

function StatusOverlay({
  state,
  onRetry,
}: {
  state: Exclude<ViewState, "ready">;
  onRetry: () => void;
}) {
  const content = {
    loading: ["正在比较可靠路线", "我们正在整合最新天气与交通资料，通常只需几秒。"],
    uncertain: ["目前资料存在较大波动", "部分实时资料延迟，建议预留至少 20 分钟缓冲时间。"],
    unavailable: ["实时建议暂时不可用", "未能取得足够的交通资料。你仍可查看固定时刻表。"],
    error: ["建议未能载入", "连接出现问题，请稍后重试。你的行程资料已保留。"],
  }[state];
  return (
    <section className={`status-panel ${state}`}>
      <div className="status-visual">
        {state === "loading" ? <span className="loader" /> : <Icon name={state === "uncertain" ? "alert" : "refresh"} size={28} />}
      </div>
      <p className="section-label">{state === "loading" ? "正在分析" : "资料状态"}</p>
      <h2>{content[0]}</h2>
      <p>{content[1]}</p>
      {state !== "loading" && (
        <button className="secondary-button" onClick={onRetry}><Icon name="refresh" size={16} /> 重新获取建议</button>
      )}
    </section>
  );
}

function ResultPage({
  onHome,
  scenario,
  setScenario,
}: {
  onHome: () => void;
  scenario: ScenarioKey;
  setScenario: (scenario: ScenarioKey) => void;
}) {
  const [viewState, setViewState] = useState<ViewState>("ready");
  const data = scenarios[scenario];

  return (
    <main className="result-page">
        <div className="result-topline">
          <button className="back-link" onClick={onHome}>← 修改行程</button>
          <div className="result-scenario">
            <span>演示情景 · 固定资料</span>
            <div className="scenario-tabs" aria-label="演示情景 · 固定资料">
              {(Object.keys(scenarios) as ScenarioKey[]).map((key) => (
                <button
                  key={key}
                  className={scenario === key ? "active" : ""}
                  onClick={() => {
                    setScenario(key);
                    setViewState("ready");
                  }}
                >
                  {scenarios[key].label}
                </button>
              ))}
            </div>
          </div>
          <span className="updated">固定演示资料</span>
        </div>

        {viewState !== "ready" ? (
          <StatusOverlay state={viewState} onRetry={() => setViewState("ready")} />
        ) : (
          <>
            <section className="decision-card">
              <div className="decision-main">
                <div className="decision-title-row">
                  <div>
                    <span className="section-label">为确保 09:00 前到达</span>
                    <h1>建议 <span>{data.depart}</span> 出发</h1>
                  </div>
                  <span className={`action-badge ${data.actionTone}`}><span /> {data.action}</span>
                </div>
                <p className="decision-eyebrow">{data.eyebrow}</p>
                <div className="arrival-block">
                  <span>预计到达</span>
                  <strong>预计 {data.arrival} 到达</strong>
                  <small>已包含 8 分钟可靠性缓冲</small>
                </div>
              </div>
              <div className="decision-route">
                <span className="route-icon"><Icon name="route" size={22} /></span>
                <div className="route-primary">
                  <span>推荐路线</span>
                  <strong>{data.route}</strong>
                  <p>{data.duration}</p>
                </div>
                <div className="confidence">
                  <strong>{data.confidence}</strong>
                  <ConfidenceScale level={data.confidenceLevel} />
                  <small>演示估算 · 基于相似行程表现</small>
                </div>
              </div>
            </section>

            <SpecialNotice data={data} />

            <div className="result-grid">
              <div className="primary-column">
                <MapCard scenario={scenario} />
                <section className="alternative-card card">
                  <span className="section-label">备用路线</span>
                  <div className="alternative-heading">
                    <h3>{data.alternative}</h3>
                    <span>备选</span>
                  </div>
                  <div className="alternative-stats">
                    <div><span>预计耗时</span><strong>{data.alternativeDuration}</strong></div>
                    <div><span>演示估算</span><strong>{data.alternativeConfidence}</strong></div>
                  </div>
                  <p><Icon name="swap" size={16} /> {data.alternativeReason}</p>
                </section>
              </div>

              <aside className="side-column">
                <details className="reason-card card">
                  <summary>
                    <div className="card-title-line">
                      <span className="soft-icon"><Icon name="shield" /></span>
                      <div><span className="section-label">推荐理由</span><h3>为什么推荐这条路线？</h3></div>
                    </div>
                    <span className="details-chevron">⌄</span>
                  </summary>
                  <div className="reason-list">
                    <div><span>01</span><p><strong>波动更小</strong>过去相似时段的行程时间较稳定，尾部延误风险最低。</p></div>
                    <div><span>02</span><p><strong>缓冲充足</strong>即使出现一般延误，仍有较大机会在最迟时间前到达。</p></div>
                    <div><span>03</span><p><strong>可及时切换</strong>途中设有明确切换节点，不必临场猜测。</p></div>
                  </div>
                </details>

                <section className="risk-card card">
                  <div className="card-title-line">
                    <span className={`risk-icon ${data.actionTone}`}><Icon name="alert" /></span>
                    <div><span className="section-label">当前风险</span><h3>{data.risk}</h3></div>
                  </div>
                  <p>{data.reason}</p>
                  <div className="risk-meter"><span className={data.actionTone} /></div>
                </section>

                <section className="switch-card">
                  <span className="section-label">独立切换条件</span>
                  <h3>什么时候要改变计划？</h3>
                  <div className="switch-rule">
                    <span><Icon name="clock" /></span>
                    <p>{data.switchRule}</p>
                  </div>
                  <small>演示条件触发时会建议切换路线</small>
                </section>
              </aside>
            </div>

            <section className="source-card card">
              <div>
                <span className="section-label">资料透明度</span>
                <h3>这项建议使用了哪些资料？</h3>
              </div>
              <div className="source-items">
                <span><i className="live" /> 交通资料 <b>FIXTURE · 08:00</b></span>
                <span><i className="cached" /> 天气资料 <b>FIXTURE · 08:00</b></span>
                <span><i className="fixture" /> 历史行程 <b>FIXTURE</b></span>
              </div>
              <p>演示资料时间：08:00 HKT</p>
            </section>

            <div className="state-preview">
              <span>界面状态预览</span>
              {(["loading", "uncertain", "unavailable", "error"] as ViewState[]).map((state) => (
                <button key={state} onClick={() => setViewState(state)}>
                  {{ loading: "加载中", uncertain: "不确定", unavailable: "不可用", error: "错误" }[state]}
                </button>
              ))}
            </div>

          </>
        )}
    </main>
  );
}

export default function App() {
  const [page, setPage] = useState<"input" | "result">("input");
  const [scenario, setScenario] = useState<ScenarioKey>("normal");
  return (
    <div className="app">
      <Header onHome={() => setPage("input")} />
      {page === "input" ? (
        <TripInput
          onSubmit={() => setPage("result")}
          scenario={scenario}
          setScenario={setScenario}
        />
      ) : (
        <ResultPage onHome={() => setPage("input")} scenario={scenario} setScenario={setScenario} />
      )}
      <GlobalFooter />
    </div>
  );
}
