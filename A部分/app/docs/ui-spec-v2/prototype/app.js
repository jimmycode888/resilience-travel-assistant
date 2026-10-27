import {
  JOURNEYS, SCENARIOS, PORTS, QUEUES, PLACES, REPLAY_FRAMES,
  SERVICE_DATE, DEPART_HHMM, RETRIEVED_AT,
} from './data.js';

/* ============================ 常數與工具 ============================ */

const SYMBOL = { low: '●', medium: '▲', high: '■', critical: '◆', unavailable: '×' };
const LEVEL_TEXT = { low: '低', medium: '中', high: '高', critical: '極高' };
/* 路線整體風險只有三檔（low/medium/high）。
   critical 屬於「人流信號」，其可見文案固定為「人流極高」——不得寫成「極高風險」。 */
const RISK_TEXT = { low: '低風險', medium: '中風險', high: '高風險', critical: '人流極高' };
const CONF_TEXT = { high: '高', medium: '中', low: '低' };
/** 可信度：契約只有 high/medium/low；缺失、null、無法識別一律顯示「未確認」，**不得**預設為「低」。 */
function confidenceOf(value) {
  const key = typeof value === 'string' ? value.toLowerCase() : null;
  if (key && Object.prototype.hasOwnProperty.call(CONF_TEXT, key)) return { text: CONF_TEXT[key], cls: `conf-${key}` };
  return { text: '未確認', cls: 'conf-unknown' };
}
const confSpan = (value, prefix = '可信度') => {
  const c = confidenceOf(value);
  return `<span class="conf ${c.cls}">${prefix}：${c.text}</span>`;
};
const MODE_TEXT = { walk: '步行', mtr: '港鐵', bus: '巴士', xbus: '跨境巴士' };

/** 口岸排隊可信度：讀真實欄位；僅在 ?demo=1 可用測試值覆寫，用來檢視四種狀態（非真實資料）。 */
function queueConfidence(portId) {
  if (state.demo && state.queueDemo) {
    if (state.queueDemo === 'missing') return null;
    if (state.queueDemo === 'invalid') return 'not-a-confidence';
    return state.queueDemo;
  }
  return QUEUES[portId] ? QUEUES[portId].confidence : null;
}
const queueIsDemoValue = () => Boolean(state.demo && state.queueDemo);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = (n) => String(n).padStart(2, '0');

/** 08:00 + N 分鐘 → HH:MM */
function addMinutes(baseHHMM, minutes) {
  const [h, m] = baseHHMM.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** 一條路線的完整演示評估（純算術：時間取自 fixture；風險為演示值） */
function evaluate(journey, scenario) {
  const cfg = scenario.routes[journey.id];
  const baseMin = journey.steps.reduce((s, x) => s + x.min, 0);
  const queue = QUEUES[journey.portId];
  const etaFrom = baseMin + queue.range[0];
  const etaTo = baseMin + queue.range[1];
  return {
    ...journey,
    cfg,
    baseMin,
    queue,
    queueConf: queueConfidence(journey.portId),
    etaFrom,
    etaTo,
    departAt: DEPART_HHMM,
    arriveFrom: addMinutes(DEPART_HHMM, etaFrom),
    arriveTo: addMinutes(DEPART_HHMM, etaTo),
    riskLabel: cfg.feasible ? RISK_TEXT[cfg.risk] : '不可行',
  };
}

function planFor(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  const routes = JOURNEYS.map((j) => evaluate(j, scenario));
  const recommended = routes.find((r) => r.cfg.recommended && r.cfg.feasible) ?? null;
  const planB = routes.find((r) => r.cfg.feasible && r.id !== (recommended && recommended.id)) ?? null;
  return { scenario, routes, recommended, planB };
}

/* ============================ 狀態 ============================ */

const params = new URLSearchParams(location.search);
const DEMO_MODE = params.get('demo') === '1';
/* Demo 專用：允許以網址直接指定初始狀態，方便驗收與截圖。
   只有在 ?demo=1 時才生效 —— 普通模式不接受任何開發參數。 */
const demoParam = (key) => (DEMO_MODE ? params.get(key) : null);
const SCENARIO_KEYS = ['normal', 'heavy_rain', 'disruption'];
const VIEW_STATES = ['ready', 'loading', 'empty', 'error', 'degraded'];
const CONFIDENCE_MODES = ['high', 'medium', 'low', 'missing', 'invalid'];
const initialScenario = SCENARIO_KEYS.includes(demoParam('scenario')) ? demoParam('scenario') : 'normal';
const initialReplay = Math.max(0, REPLAY_FRAMES.findIndex((f) => f.scenario === initialScenario));

const state = {
  demo: DEMO_MODE,
  scenarioKey: initialScenario,
  viewState: VIEW_STATES.includes(demoParam('state')) ? demoParam('state') : 'ready',   // ready | loading | empty | error | degraded
  selectedId: 'xb-1-lok-ma-chau',
  pickTarget: 'destination',
  origin: 'central-exchange-square',
  destination: 'futian-station-sz',
  departAt: `${SERVICE_DATE}T${DEPART_HHMM}`,
  arriveAt: `${SERVICE_DATE}T11:00`,
  mode: 'balanced',
  riskLayer: true,
  portLayer: true,
  replayIndex: initialReplay,
  queueDemo: CONFIDENCE_MODES.includes(demoParam('confidence')) ? demoParam('confidence') : null,  // demo 專用：口岸排隊可信度測試值（null = 不覆寫）
  previous: null,            // 上一次的 plan（供對比）
  formError: '',
  locationMessage: '',
};

/* ============================ 地圖（SVG 示意） ============================ */

function projectAll() {
  const pts = [];
  for (const j of JOURNEYS) for (const s of j.steps) pts.push(...s.geo);
  for (const p of PORTS) pts.push([p.lon, p.lat]);
  const lons = pts.map((p) => p[0]); const lats = pts.map((p) => p[1]);
  return { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
}
const BOUNDS = projectAll();
const W = 1000, H = 560, PAD = 56;
function xy([lon, lat]) {
  const x = PAD + ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon || 1)) * (W - PAD * 2);
  const y = PAD + (1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat || 1)) * (H - PAD * 2);
  return [x, y];
}
const toPath = (geo) => geo.map((p, i) => `${i ? 'L' : 'M'}${xy(p).map((v) => v.toFixed(1)).join(' ')}`).join(' ');

function renderMap(plan) {
  const order = [...plan.routes].sort((a, b) => Number(a.id === state.selectedId) - Number(b.id === state.selectedId));
  const lines = [];
  for (const r of order) {
    const selected = r.id === state.selectedId;
    const width = selected ? 7 : 4;
    const opacity = selected ? 1 : 0.5;
    for (const s of r.steps) {
      let color, dash = null;
      if (!r.cfg.feasible) { color = 'var(--risk-unavailable)'; dash = '2 5'; }
      else if (s.border) { color = 'var(--route-border-crossing)'; dash = '7 7'; }
      else if (!state.riskLayer) { color = 'var(--route-neutral)'; }
      else { color = `var(--risk-${r.cfg.risk})`; }
      const d = toPath(s.geo);
      lines.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="${width + 3}" stroke-opacity=".9" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
      lines.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}><title>${r.label} · ${s.line ?? MODE_TEXT[s.mode]} · ${s.from} → ${s.to} · ${s.min} 分</title></path>`);
    }
  }
  const places = [];
  const start = JOURNEYS[0].steps[0].geo[0], end = JOURNEYS[0].steps[4].geo[1];
  for (const [p, name, terminal] of [[start, '中環（交易廣場）', true], [end, '福田站', true]]) {
    const [x, y] = xy(p);
    places.push(`<circle cx="${x}" cy="${y}" r="${terminal ? 9 : 4}" fill="var(--map-place-terminal)" stroke="#fff" stroke-width="2"/><text x="${x + 14}" y="${y + 4}" font-size="13" fill="var(--map-place-terminal)" font-weight="700">${name}</text>`);
  }
  const ports = state.portLayer ? PORTS.map((p) => {
    const [x, y] = xy([p.lon, p.lat]);
    return `<g class="port" data-port="${p.id}" role="button" tabindex="0" aria-label="${p.name}">
      <circle cx="${x}" cy="${y}" r="9" fill="var(--map-port-marker)" fill-opacity=".6" stroke="#fff" stroke-width="2"/>
      <text x="${x + 14}" y="${y + 4}" font-size="12" fill="#6b4a8a" font-weight="700">${p.name}</text></g>`;
  }).join('') : '';
  document.getElementById('mapSvg').innerHTML = `<rect width="${W}" height="${H}" fill="var(--map-canvas)"/>${lines.join('')}${places.join('')}${ports}`;
}

/* ============================ 各區塊渲染 ============================ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const riskBadge = (key, textOverride) =>
  `<span class="badge ${key}"><span class="sym" aria-hidden="true">${SYMBOL[key]}</span>${esc(textOverride ?? RISK_TEXT[key])}</span>`;

function renderHeader(plan) {
  const s = plan.scenario.systemStatus;
  document.getElementById('systemStatus').className = `system-status ${s.tone}`;
  document.getElementById('systemStatus').innerHTML = `<span class="dot"></span>${esc(s.text)}`;
}

function renderBanners(plan) {
  const el = document.getElementById('bannerArea');
  const parts = [];
  if (plan.scenario.banner) {
    const t = plan.scenario.banner.tone;
    parts.push(`<div class="status-bar ${t}"><span><strong>${esc(plan.scenario.banner.title)}</strong>　${esc(plan.scenario.banner.body)}</span></div>`);
  }
  if (state.viewState === 'degraded') {
    parts.push(`<div class="status-bar warn"><span><strong>部分資料未能取得</strong>　伺服器或網絡不可用，已在本機使用相同演示規則計算；以下來源可能不完整。</span></div>`);
  }
  if (state.viewState === 'loading') {
    parts.push(`<div class="status-bar info"><span>正在重新比較；下方保留上一次結果。</span></div>`);
  }
  if (state.viewState === 'error') {
    parts.push(`<div class="status-bar danger" role="alert"><span><strong>分析失敗</strong>　無法分析行程，請檢查地點與時間後重試。（原型不會偽造錯誤代碼）</span></div>`);
  }
  el.innerHTML = parts.join('');
}

function renderStatusArea() {
  const el = document.getElementById('statusArea');
  if (state.viewState === 'loading') {
    el.innerHTML = `<div class="card"><h2>正在分析</h2><p class="card-hint">正在讀取路線狀態與天氣資料…</p>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
        <span style="height:12px;width:82%;background:var(--c-bg-subtle);border-radius:8px"></span>
        <span style="height:12px;width:58%;background:var(--c-bg-subtle);border-radius:8px"></span>
        <span style="height:12px;width:70%;background:var(--c-bg-subtle);border-radius:8px"></span>
      </div></div>`;
    return;
  }
  if (state.viewState === 'empty') {
    el.innerHTML = `<div class="card" style="border-style:dashed;text-align:center">
      <h2>先選一段旅程。</h2>
      <p class="card-hint">按「比較行程」，或使用左側快速試用查看三個口岸方案。</p></div>`;
    return;
  }
  el.innerHTML = '';
}

function renderResults(plan) {
  const grid = document.getElementById('routeGrid');
  const feasible = plan.routes.filter((r) => r.cfg.feasible);
  const heading = plan.recommended ? '候選路線' : (feasible.length ? '候選路線' : '暫無可行方案');
  document.getElementById('resultsHeading').textContent = heading;
  document.getElementById('resultsMeta').innerHTML =
    `<span class="chip quality-fixture">演示估算 · fixture</span>`;

  grid.innerHTML = plan.routes.map((r) => {
    const tag = !r.cfg.feasible ? '不可行' : (plan.recommended && plan.recommended.id === r.id ? '當前推薦' : '比較方案');
    const riskKey = r.cfg.feasible ? r.cfg.risk : 'unavailable';
    const selected = r.id === state.selectedId;
    return `<button type="button" class="route-card ${selected ? 'is-selected' : ''} ${r.cfg.feasible ? '' : 'is-infeasible'}"
      data-route="${r.id}" aria-pressed="${selected}">
      <span class="route-tag">${tag}</span>
      <h3>${esc(r.label)}</h3>
      <span class="route-metric">${r.baseMin}<small> 分鐘＋排隊及緩衝</small></span>
      <span class="route-line">預計到達 ${r.arriveFrom}–${r.arriveTo}</span>
      <span class="risk-line">整體風險 ${riskBadge(riskKey)} · ${confSpan(r.cfg.confidence)}</span>
      <span class="route-line">通關：預計排隊約 ${esc(r.queue.range.join('–'))} 分鐘 · 估算值 · ${confSpan(r.queueConf)}${queueIsDemoValue() ? ' <span class="conf-demo">（演示測試值）</span>' : ''}</span>
      ${r.cfg.note ? `<span class="route-excl">${esc(r.cfg.note)}</span>` : ''}
    </button>`;
  }).join('');

  grid.querySelectorAll('[data-route]').forEach((b) =>
    b.addEventListener('click', () => { state.selectedId = b.dataset.route; render(); }));
}

function renderDetail(plan) {
  const el = document.getElementById('detailCard');
  const r = plan.routes.find((x) => x.id === state.selectedId) ?? plan.routes[0];
  if (!r) { el.innerHTML = ''; return; }
  const riskKey = r.cfg.feasible ? r.cfg.risk : 'unavailable';
  const factors = plan.scenario.factors.map((f) => `<details>
      <summary>${esc(f.name)} ${f.id === 'crowd' ? riskBadge(f.level, `人流${LEVEL_TEXT[f.level]}`) : riskBadge(f.level)}</summary>
      <p class="factor-claim">${esc(f.claim)}</p>
      <p class="factor-ev">${esc(f.evidence)}</p>
      <p class="factor-src">來源：${esc(f.source)}</p>
      <p class="factor-src">${confSpan(f.confidence ?? r.cfg.confidence)}</p>
    </details>`).join('');
  const crowd = plan.scenario.factors.find((f) => f.id === 'crowd');

  el.innerHTML = `
    <div class="card-head">
      <div><h2>${esc(r.label)}</h2>
        <p class="card-hint">幾何為演示參考折線，非導航路網；座標未經官方核實。</p></div>
      <span class="chip">風險評估 ${confSpan(r.cfg.confidence)}</span>
    </div>
    <p class="risk-line">整體風險 ${riskBadge(riskKey)}${r.cfg.note ? `　<span class="route-excl">${esc(r.cfg.note)}</span>` : ''}</p>
    ${crowd ? `<p class="risk-line">人流信號 ${riskBadge(crowd.level, `人流${LEVEL_TEXT[crowd.level]}`)} · ${confSpan(crowd.confidence)}　<span class="card-hint">（人流信號不是路線整體風險等級）</span></p>` : ''}
    <div class="factor-grid">${factors}</div>
    <ol class="segments">${r.steps.map((s) => {
      const border = !!s.border;
      return `<li class="${border ? 'border-step' : ''}">
        <span class="seg-time num">${addMinutes(DEPART_HHMM, cumulative(r, s))}</span>
        <div class="seg-body"><strong>${esc(s.line ?? MODE_TEXT[s.mode])}${border ? ' · 通關段' : ''}</strong>
          <p>${esc(s.from)} → ${esc(s.to)} · ${s.min} 分</p>
          ${s.via ? `<p>途經：${esc(s.via.join('、'))}</p>` : ''}
          ${border ? `<span class="queue-block">
            <span class="q-range">預計排隊：約 ${esc(r.queue.range.join('–'))} 分鐘</span>
            <span class="q-note">估算值${queueIsDemoValue() ? ' · 演示測試值' : '（依時段規律推算，非官方即時排隊）'}</span>
            ${confSpan(r.queueConf)}
          </span>` : ''}
        </div></li>`;
    }).join('')}</ol>`;
}

function cumulative(route, target) {
  let acc = 0;
  for (const s of route.steps) { if (s === target) return acc; acc += s.min; }
  return acc;
}

function renderBestDeparture(plan) {
  const el = document.getElementById('bestDepartureCard');
  const best = state.replayIndex;
  const frames = REPLAY_FRAMES.map((f, i) => {
    const p = planFor(f.scenario);
    const rec = p.recommended;
    return { ...f, i, risk: rec ? RISK_TEXT[rec.cfg.risk] : '—', eta: rec ? `${rec.arriveFrom}–${rec.arriveTo}` : '暫緩／不可行', route: rec ? rec.label : '—' };
  });
  const current = frames[best];
  el.innerHTML = `
    <div class="card-head"><h2>何時出發</h2><span class="chip">演示估算 · fixture</span></div>
    <p>${esc(current.clock)} 為演示比較窗內風險最低的可行時點（同分取較早）。</p>
    <p class="card-hint">此為三格演示情景，不是連續時間的真實重算；未預測天氣轉好或中斷恢復。</p>
    <details style="margin-top:10px"><summary style="cursor:pointer;font-size:var(--f-body-sm)">查看三個演示情景的比較</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>出發</th><th>情景</th><th>推薦路線</th><th>整體風險</th><th>保守到達</th></tr></thead>
        <tbody>${frames.map((f) => `<tr><td class="num">${f.clock}</td><td>${esc(f.label)}</td><td>${esc(f.route)}</td><td>${esc(f.risk)}</td><td class="num">${esc(f.eta)}</td></tr>`).join('')}</tbody>
      </table></div></details>`;
}

function renderPlanB(plan) {
  const el = document.getElementById('planBCard');
  if (!plan.recommended) {
    el.innerHTML = `<div class="card-head"><h2>Plan B · 預先準備</h2></div>
      <p>暫無避開主路線口岸的可行備選。</p>`;
    return;
  }
  if (!plan.planB) {
    el.innerHTML = `<div class="card-head"><h2>Plan B · 預先準備</h2></div>
      <p>暫無避開主路線口岸的可行備選。</p>`;
    return;
  }
  el.innerHTML = `
    <div class="card-head"><h2>Plan B · 預先準備</h2><span class="chip">備選</span></div>
    <p><strong>${esc(plan.planB.label)}</strong>：改用此口岸避開主路線口岸。</p>
    <p class="card-hint">觸發條件：主路線中斷、口岸關閉或排隊超出估算上限時，重新核實再切換。</p>
    <button type="button" class="chip" data-planb="${plan.planB.id}" style="margin-top:10px;min-height:44px">查看備選路線</button>`;
  el.querySelector('[data-planb]')?.addEventListener('click', (e) => {
    state.selectedId = e.currentTarget.dataset.planb; render();
  });
}

function renderReplay(plan) {
  const el = document.getElementById('replayCard');
  const f = REPLAY_FRAMES[state.replayIndex];
  el.innerHTML = `
    <div class="card-head"><h2>情景回放</h2><span class="chip">演示 · ${esc(f.clock)} ${esc(f.label)}</span></div>
    <div class="replay-slot">
      <label class="field-label" for="replaySlider">拖動時間軸試看推薦變化（三格演示情景）</label>
      <input class="slider" id="replaySlider" type="range" min="0" max="2" step="1" value="${state.replayIndex}" aria-label="演示情景回放">
      <div class="slider-ticks">${REPLAY_FRAMES.map((x) => `<span>${x.clock} ${esc(x.label)}</span>`).join('')}</div>
    </div>
    <div id="diffArea"></div>`;

  const slider = el.querySelector('#replaySlider');
  slider.addEventListener('input', () => {
    const next = Number(slider.value);
    if (next === state.replayIndex) return;
    state.previous = planFor(state.scenarioKey);
    state.replayIndex = next;
    state.scenarioKey = REPLAY_FRAMES[next].scenario;
    state.selectedId = (planFor(state.scenarioKey).recommended ?? { id: state.selectedId }).id;
    state.viewState = 'ready';
    render();
  });
}

function renderDiff(plan) {
  const el = document.getElementById('diffArea');
  if (!el) return;
  if (!state.previous) { el.innerHTML = ''; return; }
  const before = state.previous, after = plan;
  const rows = [];
  const push = (key, a, b, worseIsUp = true) => {
    if (a === b) { rows.push({ sym: '=', cls: 'same', key, val: a }); return; }
    const rank = { '低風險': 1, '中風險': 2, '高風險': 3, '不可行': 4, '—': 0 };
    const worse = worseIsUp ? (rank[b] ?? 0) > (rank[a] ?? 0) : false;
    rows.push({ sym: worse ? '▲' : '▼', cls: worse ? 'worse' : 'better', key, old: a, val: b });
  };
  push('推薦路線', before.recommended ? before.recommended.label : '無', after.recommended ? after.recommended.label : '無');
  push('整體風險', before.recommended ? RISK_TEXT[before.recommended.cfg.risk] : '—', after.recommended ? RISK_TEXT[after.recommended.cfg.risk] : '—');
  push('保守到達', before.recommended ? `${before.recommended.arriveFrom}–${before.recommended.arriveTo}` : '—', after.recommended ? `${after.recommended.arriveFrom}–${after.recommended.arriveTo}` : '—');
  push('Plan B', before.planB ? before.planB.label : '無', after.planB ? after.planB.label : '無');
  push('比較偏好', state.mode === 'balanced' ? '綜合推薦' : state.mode, state.mode === 'balanced' ? '綜合推薦' : state.mode);
  const changed = rows.some((r) => r.sym !== '=');
  el.innerHTML = `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
    <h3 style="font-size:var(--f-card-title)">由 ${esc(REPLAY_FRAMES[state.replayIndex - 1]?.clock ?? '—')} 改為 ${esc(REPLAY_FRAMES[state.replayIndex].clock)}</h3>
    ${changed ? `<ul class="diff-list">${rows.map((r) => `<li>
        <span class="diff-sym ${r.cls}" aria-hidden="true">${r.sym}</span>
        <span class="diff-key">${esc(r.key)}</span>
        ${r.old !== undefined ? `<span class="diff-val"><span class="diff-old">${esc(r.old)}</span> → ${esc(r.val)}</span>` : `<span class="diff-val">${esc(r.val)}</span>`}
      </li>`).join('')}</ul>` : `<p class="card-hint">本次調整未改變建議。</p>`}
    <p class="card-hint" style="margin-top:8px">差異只比較兩次演示結果中真實存在的欄位；欄位缺失顯示「—」，不會當作 0。</p>
  </div>`;
}

function renderSource(plan) {
  const el = document.getElementById('sourceCard');
  const unavailable = state.viewState === 'degraded';
  el.innerHTML = `
    <div class="card-head"><h2>資料與限制</h2><span class="chip quality-fixture">演示估算 · fixture</span></div>
    <ul class="notice-list">
      <li>全部服務狀態、客流及排隊為演示假設，並非即時資料；座標仍待官方核實。</li>
      <li>出發窗口只按固定情景與時段規則比較，不預測天氣轉好或中斷恢復。</li>
      <li>通關時間表不代表列車／巴士有班次；出行前需核對交通服務及臨時口岸安排。</li>
      <li>折線為演示參考，非導航路網。</li>
    </ul>
    <ul class="source-list">
      <li><strong>離線走廊與演示規則</strong>：固定模板，非資料取得時間；來源版本 2026-10-10。· 更新於 ${RETRIEVED_AT} · 信心：低</li>
      <li><strong>入境事務處：管制站開放時間</strong>：參考公開正常開放時間；座標與臨時安排未核實。· 更新於 2026-10-10 · 信心：低</li>
      ${unavailable ? `<li style="color:var(--c-warning)"><strong>部分來源未能取得</strong>：本輪未成功取得即時來源，已如實排除，不以其他來源冒充。· 更新時間未提供</li>` : ''}
    </ul>`;
}

function renderLegend() {
  const item = (i) => `<span class="legend-item"><span style="display:inline-flex;align-items:center;gap:5px">
      <span class="legend-symbol" style="color:${i.color}">${i.sym}</span>
      <span class="legend-swatch" style="background:${i.color}"></span></span>${i.text}</span>`;
  const routeRisk = [
    { sym: SYMBOL.low, text: '低風險', color: 'var(--risk-low)' },
    { sym: SYMBOL.medium, text: '中風險', color: 'var(--risk-medium)' },
    { sym: SYMBOL.high, text: '高風險', color: 'var(--risk-high)' },
  ];
  /* 圖例分區：路線整體風險（三檔）為一組；人流信號最高檔為獨立一組；
     不可行與通關段屬「線型」，再列一組。不得把四色排成單一風險序列。 */
  document.getElementById('mapLegend').innerHTML = `
    <span class="legend-group"><span class="legend-group-title">路線整體風險</span>${routeRisk.map(item).join('')}</span>
    <span class="legend-group"><span class="legend-group-title">人流信號</span>${item({ sym: SYMBOL.critical, text: '人流極高', color: 'var(--risk-crowd-critical)' })}</span>
    <span class="legend-group"><span class="legend-group-title">線型</span>${item({ sym: SYMBOL.unavailable, text: '不可行（虛線 2 5）', color: 'var(--risk-unavailable)' })}${item({ sym: '⋯⋯', text: '通關段（虛線 7 7）', color: 'var(--route-border-crossing)' })}</span>`;
}

/* ============================ Demo 面板 ============================ */

function renderDemo() {
  const panel = document.getElementById('demoPanel');
  if (!state.demo) { panel.hidden = true; return; }
  panel.hidden = false;
  const scenarios = [['normal', '正常服務'], ['heavy_rain', '黑色暴雨'], ['disruption', '東鐵中斷']];
  const states = [['ready', '依資料'], ['loading', 'Loading'], ['empty', 'Empty'], ['error', 'Error'], ['degraded', 'Degraded']];
  document.getElementById('demoInner').innerHTML = `
    <strong style="font-size:var(--f-caption)">Demo 模式（僅供演示與驗收，不屬於使用者流程）</strong>
    <div class="demo-row"><span class="demo-label">演示情景</span><div class="demo-group" id="demoScenario">
      ${scenarios.map(([k, t]) => `<button type="button" data-scenario="${k}" aria-pressed="${state.scenarioKey === k}">${t}</button>`).join('')}</div></div>
    <div class="demo-row"><span class="demo-label">頁面狀態</span><div class="demo-group" id="demoState">
      ${states.map(([k, t]) => `<button type="button" data-state="${k}" aria-pressed="${state.viewState === k}">${t}</button>`).join('')}</div></div>
    <div class="demo-row"><span class="demo-label">路線整體風險</span>
      <div class="color-ref">
        <figure><span class="sw" style="background:var(--risk-low)"></span>${SYMBOL.low} 低風險<br><small>#16736b</small></figure>
        <figure><span class="sw" style="background:var(--risk-medium)"></span>${SYMBOL.medium} 中風險<br><small>#8A6D00</small></figure>
        <figure><span class="sw" style="background:var(--risk-high)"></span>${SYMBOL.high} 高風險<br><small>#ba4144</small></figure>
      </div></div>
    <div class="demo-row"><span class="demo-label">人流信號</span>
      <div class="color-ref">
        <figure><span class="sw" style="background:var(--risk-crowd-critical)"></span>${SYMBOL.critical} 人流極高<br><small>#B95B16<br>獨立維度</small></figure>
      </div></div>
    <div class="demo-row"><span class="demo-label">口岸排隊可信度</span><div class="demo-group" id="demoConfidence">
      ${[['real', '真實欄位'], ['high', '高'], ['medium', '中'], ['low', '低'], ['missing', '缺失'], ['invalid', '無法識別']]
        .map(([k, t]) => `<button type="button" data-confidence="${k}" aria-pressed="${(state.queueDemo ?? 'real') === k}">${t}</button>`).join('')}</div></div>
    <p class="demo-note">路線整體風險只有<b>三檔</b>（低／中／高）；「${SYMBOL.critical} 人流極高」是<b>人流信號</b>
      （CrowdSignal.level = critical）的視覺表現，<b>不是</b>路線風險演算法等級，兩者不得排成單一色階。
      「口岸排隊可信度」的測試值僅供檢視四種顯示狀態，<b>不是</b>真實資料（真實欄位只有 高／中／低）。</p>`;

  document.querySelectorAll('#demoScenario button').forEach((b) => b.addEventListener('click', () => {
    state.previous = null;
    state.scenarioKey = b.dataset.scenario;
    state.replayIndex = REPLAY_FRAMES.findIndex((f) => f.scenario === state.scenarioKey);
    if (state.replayIndex < 0) state.replayIndex = 0;
    state.selectedId = (planFor(state.scenarioKey).recommended ?? { id: state.selectedId }).id;
    state.viewState = 'ready';
    render();
  }));
  document.querySelectorAll('#demoState button').forEach((b) => b.addEventListener('click', () => {
    state.viewState = b.dataset.state; render();
  }));
  document.querySelectorAll('#demoConfidence button').forEach((b) => b.addEventListener('click', () => {
    state.queueDemo = b.dataset.confidence === 'real' ? null : b.dataset.confidence;
    render();
  }));
}

/* ============================ 主渲染 ============================ */

function render() {
  const plan = planFor(state.scenarioKey);
  renderHeader(plan);
  renderDemo();
  renderBanners(plan);
  renderStatusArea();
  renderLegend();
  renderMap(plan);
  renderResults(plan);
  renderDetail(plan);
  renderBestDeparture(plan);
  renderPlanB(plan);
  renderReplay(plan);
  renderDiff(plan);
  renderSource(plan);
  const hide = state.viewState === 'empty' || state.viewState === 'error';
  for (const id of ['resultsCard', 'detailCard', 'adviceGrid', 'replayCard']) {
    const el = document.getElementById(id);
    if (el) el.style.display = hide ? 'none' : '';
  }
}

/* ============================ 表單 ============================ */

document.getElementById('originInput').innerHTML = PLACES.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
document.getElementById('destInput').innerHTML = PLACES.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
document.getElementById('originInput').value = 'central-exchange-square';
document.getElementById('destInput').value = 'futian-station-sz';
document.getElementById('departInput').value = state.departAt;
document.getElementById('arriveInput').value = state.arriveAt;

document.getElementById('locateBtn').addEventListener('click', () => {
  const el = document.getElementById('locationMessage');
  el.textContent = '定位權限被拒絕，請在系統設定中允許定位，或自行選擇起點。（原型不會真的要求權限）';
  el.className = 'status-bar warn';
});
document.querySelectorAll('#modeGrid button').forEach((b) => b.addEventListener('click', () => {
  state.mode = b.dataset.mode;
  document.querySelectorAll('#modeGrid button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
document.getElementById('planBtn').addEventListener('click', () => {
  const err = document.getElementById('formError');
  const origin = document.getElementById('originInput').value;
  const dest = document.getElementById('destInput').value;
  const issues = [];
  if (!origin) issues.push('起點不可為空。');
  if (!dest) issues.push('終點不可為空。');
  if (origin === dest) issues.push('起點與終點不可相同。');
  if (!document.getElementById('departInput').value) issues.push('請選擇出發時間。');
  err.hidden = issues.length === 0;
  err.innerHTML = issues.map((i) => `<div>${i}</div>`).join('');
  if (issues.length) return;
  state.previous = null; state.viewState = 'ready';
  render();
});
document.getElementById('riskLayerToggle').addEventListener('change', (e) => { state.riskLayer = e.target.checked; render(); });
document.getElementById('portLayerToggle').addEventListener('change', (e) => { state.portLayer = e.target.checked; render(); });
document.getElementById('mapSvg').addEventListener('click', (e) => {
  const port = e.target.closest('[data-port]');
  const cap = document.getElementById('mapCaption');
  if (port) {
    const p = PORTS.find((x) => x.id === port.dataset.port);
    const q = QUEUES[p.id];
    cap.innerHTML = `<strong>${p.name}</strong> · 香港側：${p.hk} · 參考開放時間 ${p.openFrom}–${p.openTo} · 隊列估算 ${q.range.join('–')} 分鐘（${q.note}） · 座標未核實`;
    return;
  }
  cap.textContent = '點選折線或口岸查看詳情；此為演示示意，非真實導航路網。';
});
document.querySelectorAll('.pick-row button').forEach((b) => b.addEventListener('click', () => {
  state.pickTarget = b.dataset.pick;
  document.querySelectorAll('.pick-row button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));

render();
