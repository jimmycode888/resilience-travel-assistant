'use client';
import dynamic from 'next/dynamic';
import { AddressSearch } from './AddressSearch';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { findPlace, PLACES, type PlaceEntry } from '@/lib/geo/places';
import { createLocator, metersBetween, type UserPosition } from '@/lib/geo/geolocation';
import { formatHkTime, addMinutes } from '@/lib/time';
import type { JourneyAnalysis, JourneyAnalysisRequest, JourneyScenario } from '@/lib/types/journey-analysis';
import type { RouteMode } from '@/lib/types/risk';

const JourneyMap = dynamic(() => import('./JourneyMap'), { ssr: false, loading: () => <div className="journey-map-skeleton" role="status">正在載入地圖…</div> });
const MODE_LABELS: Record<RouteMode, string> = { balanced: '綜合推薦', fastest: '最快', reliable: '最穩', less_crowded: '較少人' };
const LEVELS: Record<string, string> = { low: '低', medium: '中', high: '高', critical: '極高' };
const FACTORS: Record<string, string> = { weather: '天氣', crowd: '人流', disruption: '交通中斷', transfer: '轉乘', border: '通關' };
const INITIAL: JourneyAnalysisRequest = { origin: 'central-exchange-square', destination: 'futian-station-sz', departAt: '2026-10-13T08:00', arriveBy: '2026-10-13T11:00', mode: 'balanced', scenario: 'normal' };
const REPLAY: { label: string; scenario: JourneyScenario; offset: number }[] = [
  { label: '正常', scenario: 'normal', offset: 0 }, { label: '暴雨', scenario: 'heavy_rain', offset: 20 }, { label: '東鐵中斷', scenario: 'disruption', offset: 40 },
];

function mapsLink(analysis: JourneyAnalysis, routeId: string) {
  const route = analysis.routes.find(item => item.candidate.id === routeId)?.candidate.journey;
  if (!route) return '#';
  const from = route.segments[0]!.from;
  const to = route.segments[route.segments.length - 1]!.to;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: `${from.lat},${from.lon}`, destination: `${to.lat},${to.lon}`, travelmode: 'transit' })}`;
}

export function JourneyPlanner() {
  const [transitStatus, setTransitStatus] = useState('正在確認公開交通資料…');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/transit-status', { signal: controller.signal }).then(r => r.json()).then(status => {
      if (!controller.signal.aborted) setTransitStatus(status.hk?.available ? `香港 ${status.hk.stops.toLocaleString()} 個站點 · 深圳公交${status.shenzhen?.configured ? '已配置，需逐次核驗' : '尚未啟用，暫無完整跨境方案'}` : '香港交通資料暫時不可用');
    }).catch(() => { if (!controller.signal.aborted) setTransitStatus('交通資料狀態暫時無法確認'); });
    return () => controller.abort();
  }, []);
  const [request, setRequest] = useState<JourneyAnalysisRequest>({ ...INITIAL, routing: 'transit' });
  useEffect(() => {
    const localInput = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 16);
    const departure = Date.now() + 30 * 60000;
    setRequest(value => ({ ...value, departAt: localInput(departure), arriveBy: undefined }));
  }, []);
  const [analysis, setAnalysis] = useState<JourneyAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState({ origin: false, destination: false });
  const [pickTarget, setPickTarget] = useState<'origin' | 'destination'>('destination');
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [replay, setReplay] = useState(-1);
  const generation = useRef(0);
  const running = useRef(false);
  const activeController = useRef<AbortController | null>(null);
  const selected = analysis?.routes.find(route => route.candidate.id === selectedId) ?? analysis?.routes[0];
  const dirty = analysis && (request.origin !== analysis.request.origin || request.destination !== analysis.request.destination || request.mode !== analysis.request.mode || request.scenario !== analysis.request.scenario || request.departAt.slice(0, 16) !== analysis.request.departAt.slice(0, 16) || (request.arriveBy ?? '').slice(0, 16) !== (analysis.request.arriveBy ?? '').slice(0, 16));

  useEffect(() => () => { generation.current++; activeController.current?.abort(); }, []);
  function change(patch: Partial<JourneyAnalysisRequest>) {
    if (patch.origin || patch.destination) patch = { ...patch, routing: 'transit' };
    generation.current++; activeController.current?.abort(); running.current = false;
    setLoading(false); setAnalysis(null); setSelectedId(null); setError('');
    setRequest(current => ({ ...current, ...patch })); setReplay(-1);
  }
  async function run(input = request) {
    if (running.current || editing.origin || editing.destination) return;
    running.current = true;
    const id = ++generation.current;
    activeController.current?.abort();
    const controller = new AbortController(); activeController.current = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    setLoading(true); setAnalysis(null); setSelectedId(null); setError(''); setOffline(false);
    try {
      let result: JourneyAnalysis;
      try {
        const response = await fetch('/api/journey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? '無法分析行程');
        result = body;
      } catch (failure) {
        if (generation.current !== id) return;
        if (failure instanceof Error && failure.name !== 'AbortError' && !(failure instanceof TypeError)) throw failure;
        if (input.routing === 'transit') throw new Error('公共交通查詢逾時或網絡不可用，請重試；沒有轉用演示路線。');
        // The same validated handler runs locally, so server downtime does not remove the demo.
        const { handleJourneyRequest } = await import('@/lib/api/journey-handler');
        const local = await handleJourneyRequest(input);
        if (local.status !== 200 || 'error' in local.body) throw new Error('離線計算無法完成，請檢查地點與時間。');
        result = local.body; setOffline(true);
      }
      if (generation.current !== id) return;
      setAnalysis(result); setSelectedId(result.recommendedRouteId ?? result.routes[0]?.candidate.id ?? null);
    } catch (failure) { if (generation.current === id) setError(failure instanceof Error ? failure.message : '分析失敗，請重試。'); }
    finally { clearTimeout(timer); if (generation.current === id) { running.current = false; setLoading(false); } }
  }
  async function locate() {
    setLocating(true);
    const outcome = await createLocator().locate();
    setLocating(false);
    if (!outcome.ok) { setLocationMessage(outcome.message); return; }
    setPosition(outcome.position);
    const nearest = [...PLACES].sort((a, b) => metersBetween(outcome.position, a) - metersBetween(outcome.position, b))[0]!;
    const distance = metersBetween(outcome.position, nearest);
    if (distance <= 2000) { change({ origin: nearest.id, originPlace: undefined }); setLocationMessage(`定位成功；起點採用附近的${nearest.name}（${distance} 米），不是精確定位點。`); }
    else setLocationMessage('已顯示目前位置；附近未有收錄地點，請自行搜尋起點。');
  }
  function pick(place: PlaceEntry) { change(pickTarget === 'origin' ? { origin: place.id, originPlace: place } : { destination: place.id, destinationPlace: place }); }
  function play(index: number) {
    setReplay(index);
    const frame = REPLAY[index]!;
    const input = { ...request, departAt: addMinutes(INITIAL.departAt + ':00+08:00', frame.offset).slice(0, 16), scenario: frame.scenario };
    change(input); setReplay(index); void run(input);
  }
  return <div className="journey-shell">
    <div className="journey-heading"><div><p className="journey-eyebrow">港深跨境 · 第二階段演示</p><h1>走哪條，何時走，心裡有數。</h1><p>比較口岸、人流與天氣風險，提前準備另一條路。</p></div><Link href={process.env.NEXT_PUBLIC_PHASE1_URL ?? '/'} className="btn-secondary">第一階段通勤演示 ↗</Link></div>
    <div className="journey-workspace">
      <aside className="journey-input-panel">
        <h2>規劃行程</h2><p className="text-sm text-slate-500">演示日期：2026 年 10 月 13 日 · 香港時間</p>
        <form onSubmit={e => { e.preventDefault(); void run(); }}>
          <AddressSearch label="起點" value={request.origin} place={request.originPlace} onEditing={value => setEditing(s => ({ ...s, origin: value }))} onChange={place => change({ origin: place.id, originPlace: place })} />
          <AddressSearch label="終點" value={request.destination} place={request.destinationPlace} onEditing={value => setEditing(s => ({ ...s, destination: value }))} onChange={place => change({ destination: place.id, destinationPlace: place })} />
          <button type="button" className="btn-secondary" onClick={() => change({ origin: request.destination, destination: request.origin, originPlace: request.destinationPlace, destinationPlace: request.originPlace })}>交換起終點 ⇅</button>
          {editing.origin || editing.destination ? <p role="status">請從搜尋候選中確認地址，再比較行程。</p> : null}
          <button type="button" className="journey-text-button" disabled={locating} onClick={() => void locate()}>{locating ? '正在定位…' : '◎ 使用目前位置'}</button>
          {locationMessage ? <p role="status" className="text-sm text-slate-600">{locationMessage}</p> : null}
          <label className="field-label" htmlFor="journey-routing">路線資料</label><select className="field-input" id="journey-routing" value={request.routing ?? 'demo'} onChange={e => change({ routing: e.target.value === 'transit' ? 'transit' : 'demo' })}><option value="transit">公開公交規劃 · 香港／深圳</option><option value="demo">固定示例 · 演示走廊</option></select><p className="text-xs text-slate-500">公開規劃使用實際線路與服務日曆；耗時及風險仍需核實。</p><p role="status" className="text-xs text-slate-500">{transitStatus}</p>
          <label className="field-label" htmlFor="journey-depart">出發時間</label><input id="journey-depart" className="field-input" type="datetime-local" required value={request.departAt} onChange={e => change({ departAt: e.target.value })} />
          <label className="field-label" htmlFor="journey-arrive">希望在此之前到達（選填）</label><input id="journey-arrive" className="field-input" type="datetime-local" value={request.arriveBy ?? ''} onChange={e => change({ arriveBy: e.target.value || undefined })} />
          <fieldset><legend className="field-label">比較偏好</legend><div className="journey-mode-grid">{(Object.keys(MODE_LABELS) as RouteMode[]).map(mode => <button type="button" key={mode} aria-pressed={request.mode === mode} onClick={() => change({ mode })}>{MODE_LABELS[mode]}</button>)}</div></fieldset>
          <label className="field-label" htmlFor="journey-scenario">演示情景</label><select className="field-input" id="journey-scenario" value={request.scenario} onChange={e => change({ scenario: e.target.value as JourneyScenario })}><option value="normal">正常服務</option><option value="heavy_rain">黑色暴雨（演示）</option><option value="disruption">東鐵線中斷（演示）</option></select>
          <button className="btn-primary" disabled={loading || editing.origin || editing.destination}>{loading ? '正在比較路線…' : '比較行程 →'}</button>
          {error ? <p role="alert" className="journey-alert">{error}</p> : null}
        </form>
        <div className="journey-presets"><strong>快速試用</strong><button type="button" onClick={() => { setRequest(INITIAL); setReplay(-1); void run(INITIAL); }}>中環 → 福田 · 3 條跨境路線</button><button type="button" onClick={() => { const input = { ...INITIAL, origin: 'hang-hau-estate', destination: 'central-exchange-square' }; setRequest(input); setReplay(-1); void run(input); }}>坑口 → 中環 · 境內走廊</button></div>
      </aside>
      <div className="journey-main">
        <div className="journey-pick"><span>在地圖選取：</span><button type="button" aria-pressed={pickTarget === 'origin'} onClick={() => setPickTarget('origin')}>起點</button><button type="button" aria-pressed={pickTarget === 'destination'} onClick={() => setPickTarget('destination')}>終點</button></div>
        <JourneyMap routes={analysis?.routes ?? []} selectedId={selectedId} origin={request.origin} destination={request.destination} originPlace={request.originPlace} destinationPlace={request.destinationPlace} position={position} onPick={pick} onSelect={setSelectedId} />
        <div className="journey-replay"><label htmlFor="journey-replay">情景回放 · {replay < 0 ? '拖動時間軸試看推薦變化' : REPLAY[replay]!.label}</label><input id="journey-replay" type="range" min="0" max="2" step="1" value={Math.max(0, replay)} onChange={e => play(Number(e.target.value))} /><div><span>08:00 正常</span><span>08:20 黑雨</span><span>08:40 東鐵中斷</span></div></div>
        {loading ? <p role="status" className="journey-status">正在查詢公交及核驗步行接駁，首次查詢可能需要約一分鐘。</p> : null}
        {dirty && !loading ? <p className="journey-status">選項已更改。按「比較行程」更新結果；下方仍是上次分析。</p> : null}
        {offline ? <p role="status" className="journey-status">伺服器或網絡不可用，已在本機使用相同演示規則計算。</p> : null}
        {!analysis ? <div className="journey-empty"><h2>先選一段旅程。</h2><p>按「比較行程」，或使用左側「中環 → 福田」查看三個口岸方案。</p></div> : <>
          <div className="journey-results-heading"><h2>{analysis.action === 'hold' ? '暫緩非必要行程' : analysis.action === 'unavailable' ? '暫無可行方案' : '候選路線'}</h2><span className="journey-quality">{analysis.routing === 'transit' ? '公開交通參考 · 非即時 ETA' : '演示估算 · fixture'}</span></div>
          {analysis.routes.length === 0 ? <div className="journey-empty"><p>{analysis.routing === 'transit' ? '目前沒有可確認的完整行程，請查看下方原因或使用外部地圖規劃。' : '地點已確認，但這組地址尚未接入演示走廊。可以使用地圖服務繼續規劃。'}</p><a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: request.originPlace ? `${request.originPlace.lat},${request.originPlace.lon}` : findPlace(request.origin) ? `${findPlace(request.origin)!.lat},${findPlace(request.origin)!.lon}` : request.origin, destination: request.destinationPlace ? `${request.destinationPlace.lat},${request.destinationPlace.lon}` : findPlace(request.destination) ? `${findPlace(request.destination)!.lat},${findPlace(request.destination)!.lon}` : request.destination, travelmode: 'transit' })}`}>在 Google Maps 規劃此行程 ↗</a></div> : null}
          {analysis.coverage ? <section className="journey-details" aria-label="公交覆蓋狀態"><h2>本次查詢的資料覆蓋</h2><p>香港已匯入 {analysis.coverage.hkStops.toLocaleString()} 個站點、{analysis.coverage.hkRoutes.toLocaleString()} 條線路 · 深圳公交{analysis.coverage.shenzhenConfigured ? '已配置' : '尚未啟用'}</p><p>跨境組合：深圳灣、香園圍／蓮塘 · 暫不含港鐵重鐵。</p>{analysis.coverage.failures.map((failure, i) => <p role="status" key={`${failure.port}-${i}`}>{failure.port}：{failure.message}</p>)}{analysis.coverage.partialPlans?.map(plan => <details key={plan.port}><summary>{plan.port} · 約 {plan.minutes} 分鐘</summary><p>以下僅為單側路段，不是完整跨境方案。</p><ol>{plan.legs.map((leg, i) => <li key={i}>{leg.line ?? '步行'} · {leg.from.name} → {leg.to.name} · 約 {leg.minutes} 分鐘{leg.waitMinutes ? `（含候車預留 ${leg.waitMinutes} 分）` : ''}</li>)}</ol></details>)}</section> : null}
          <div className="journey-route-grid">{analysis.routes.map(route => <button type="button" key={route.candidate.id} className={`journey-route-card ${selectedId === route.candidate.id ? 'is-selected' : ''}`} aria-pressed={selectedId === route.candidate.id} onClick={() => setSelectedId(route.candidate.id)}>
            <span className="journey-route-tag">{!route.eligible ? '不可行' : analysis.recommendedRouteId === route.candidate.id ? '當前推薦' : '比較方案'}</span><h3>{route.candidate.label}</h3><strong>{route.candidate.journey.totalMinutes}<small>{analysis.routing === 'transit' ? ' 分鐘（含候車／通關預留）' : ' 分鐘＋排隊及緩衝'}</small></strong><p>預計到達 {route.assessment.reliability.etaRange.map(formatHkTime).join('–')}</p><p>整體風險：{LEVELS[route.assessment.risk.level]} · 信心：{LEVELS[route.assessment.reliability.onTimeConfidence]}</p>{route.meetsDeadline === false ? <p className="text-red-700">保守 ETA 超過到達期限</p> : null}{route.exclusions.map(text => <p className="text-red-700" key={text}>{text}</p>)}
          </button>)}</div>
          {selected ? <div className="journey-details"><div className="journey-detail-heading"><h2>{selected.candidate.label}</h2><a href={mapsLink(analysis, selected.candidate.id)} target="_blank" rel="noreferrer" className="btn-secondary">在 Google Maps 重新規劃 ↗</a></div><p className="text-sm text-slate-500">導航平台會重新計算起終點路線，可能不經所選口岸。</p><p>{selected.explanation}</p><p className="text-sm text-slate-500">{selected.assessment.reliability.confidenceNote}</p>
            <div className="journey-factors">{selected.assessment.risk.breakdown.factors.map(factor => <details key={factor.id}><summary>{FACTORS[factor.id]} <strong>{LEVELS[factor.level]}</strong></summary><p>{factor.claim}</p><p>{factor.evidence}</p><small>來源：{factor.source}</small></details>)}</div>
            <ol className="journey-segments">{selected.candidate.journey.segments.map(segment => <li key={segment.id}><span>{formatHkTime(segment.departAt)}</span><div><strong>{segment.line ?? '步行'}{segment.kind === 'border_crossing' ? ' · 通關段' : ''}</strong><p>{segment.from.name} → {segment.to.name}</p>{segment.border ? <p>排隊估算 {segment.border.queueMinutesRange.join('–')} 分鐘 · 低信心</p> : null}</div></li>)}</ol>
          </div> : null}
          <div className="journey-advice-grid"><section className="journey-details"><h2>何時出發</h2><p>{analysis.routing === 'transit' ? '公開交通模式按所選出發時間查詢；尚未提供兩小時出發窗口預測。' : analysis.bestDeparture ? `${formatHkTime(analysis.bestDeparture.departAt)} 為兩小時比較窗內風險最低的可行時點（同分取較早）。` : '此情景沒有可建議的出發時點；請調整時間或待情況核實。'}</p><details><summary>查看每 10 分鐘的比較</summary><div className="journey-table-wrap"><table><thead><tr><th>出發</th><th>風險規則分</th><th>保守到達</th></tr></thead><tbody>{analysis.departureOptions.map(option => <tr key={option.departAt}><td>{formatHkTime(option.departAt)}</td><td>{option.riskScore ?? '—'}</td><td>{option.etaRange ? formatHkTime(option.etaRange[1]) : '暫緩／不可行'}{option.meetsDeadline === false ? ' · 逾期' : ''}</td></tr>)}</tbody></table></div></details></section>
          <section className="journey-details"><h2>Plan B · 預先準備</h2>{analysis.planB ? <><p>{analysis.planB.reason}</p><p className="text-sm text-slate-500">{analysis.planB.trigger}</p><button className="btn-secondary" onClick={() => setSelectedId(analysis.planB!.routeId)}>查看備選路線</button></> : <p>{analysis.action === 'hold' ? '暴雨情景先暫緩行程。' : '暫無避開主路線口岸的可行備選。'}</p>}</section></div>
          <section className="journey-source"><h2>資料與限制</h2>{analysis.notices.map(note => <p key={note}>{note}</p>)}{analysis.sources.map(source => <p key={source.label}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> : <strong>{source.label}</strong>}：{source.note}</p>)}</section>
        </>}
      </div>
    </div>
  </div>;
}
