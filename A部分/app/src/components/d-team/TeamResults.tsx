import {findPort} from '@/lib/geo/ports';
import type {TeamJourneyResult,TeamRouteResult} from '@/lib/types/team-integration';
import {VISUALS,CONFIDENCE,FACTORS,MODES,QUALITY,hk,displayQueue,actionable} from './presentation';
function Badge({level}:{level:'low'|'medium'|'high'|'critical'}){const token=VISUALS.risk[level];return <span className={`dt-badge dt-risk-${level}`}><span aria-hidden="true">{token.symbol} </span>{token.label}</span>;}
function LinkSource({url,source}:{url:string|null;source:string}){return url?<a href={url} target="_blank" rel="noreferrer">{source}</a>:<span>{source}</span>;}
export function RouteCards({result,selectedId,onSelect}:{result:TeamJourneyResult;selectedId:string|null;onSelect:(id:string)=>void}){
 return <div className="dt-cards">{result.routes.map(r=><button type="button" className="dt-route" data-testid={`route-${r.candidate.id}`} key={r.candidate.id} aria-pressed={selectedId===r.candidate.id} aria-controls="dt-route-details" onClick={()=>onSelect(r.candidate.id)}>
  <span className="dt-route-title">{r.candidate.label}</span><Badge level={r.assessment.risk.level}/>
  <span className="dt-metric">{r.assessment.durationMinutes} <small>分鐘 · 基礎路程</small></span>
  <span>ETA {hk(r.assessment.reliability.etaRange[0])} – {hk(r.assessment.reliability.etaRange[1])}</span>
  <span>準時信心：{CONFIDENCE[r.assessment.reliability.onTimeConfidence]}</span>
  <span className="dt-quality">{QUALITY[r.candidate.quality]}</span>
  {!r.eligible&&<strong className="dt-unavailable">× 不可行 · 僅供檢視</strong>}
  {r.meetsDeadline===false&&<strong className="dt-danger">到達超時 · 不宜按期限執行</strong>}
  {r.meetsDeadline===null&&<span>未設定到達期限</span>}
  {result.recommendedRouteId===r.candidate.id&&<span>{actionable(r)?'A 基礎推薦（非 C 行動建議）':'A 基礎排序首位（無法滿足期限）'}</span>}
  {result.decision?.primaryRouteId===r.candidate.id&&<span>C 決策主路{actionable(r)?'':' · 到達超時'}</span>}
  {!!r.exclusions.length&&<span>{r.exclusions.join(' ')}</span>}
 </button>)}</div>;
}
export function DecisionPanel({result,onSelect,fixture}:{result:TeamJourneyResult;onSelect:(id:string)=>void;fixture:boolean}){
 const d=result.decision;
 const label=(id:string)=>result.routes.find(r=>r.candidate.id===id)?.candidate.label??id;
 return <section className="dt-panel dt-decision" aria-label="行動建議">
  <h2>{!d?'C 正式決策未接入':d.action==='go'?'行動建議 · go':d.action==='hold'?'暫緩出行 · hold':'暫無可執行方案 · unavailable'}</h2>
  {fixture&&d&&<p className="dt-quality">D mock 決策 · 非 C 正式模型</p>}
  {!d?<p>A 基礎推薦只提供候選排序，未提供 C 行動建議、出發窗口或切換期限。</p>:<>
   {d.action!=='go'&&<p>{d.action==='hold'?'請先留意暫緩原因及官方資訊。':'目前沒有可執行的行動建議。'}下列路線僅供查看，並非出發指令。</p>}
   {d.primaryRouteId&&<button type="button" onClick={()=>onSelect(d.primaryRouteId!)}>查看主路：{label(d.primaryRouteId)}</button>}
   {d.departureWindow?<p>出發窗口（{fixture?'測試值':'C 提供'}）：{hk(d.departureWindow.start)} – {hk(d.departureWindow.end)} · 信心：{CONFIDENCE[d.departureWindow.confidence]}<br/>{d.departureWindow.evidence}</p>:<p>未提供出發窗口。</p>}
   {d.primaryRouteId&&result.routes.find(r=>r.candidate.id===d.primaryRouteId)?.meetsDeadline===false&&<p className="dt-danger">C 回傳 go 主路但 ETA 超過到達期限；請勿理解為可準時執行，需 C 核查。</p>}
   <h3>備選方案</h3>{d.backupRouteIds.length?d.backupRouteIds.map(id=><button type="button" key={id} onClick={()=>onSelect(id)}>查看備選：{label(id)}{result.routes.find(r=>r.candidate.id===id)?.meetsDeadline===false?'（到達超時）':''}</button>):<p>沒有備選方案；不代表其他路線可安全替代。</p>}
   {d.explanations.map((e,i)=><div key={i}><strong>{label(e.routeId)}：{e.text}</strong><ul>{e.evidence.map((v,j)=><li key={j}>{v}</li>)}</ul></div>)}
   <ul>{d.notices.map((v,i)=><li key={i}>{v}</li>)}</ul>
  </>}
 </section>;
}
export function RouteDetails({route,evaluatedAt}:{route:TeamRouteResult;evaluatedAt:string}){
 const risk=route.assessment.risk,reliability=route.assessment.reliability,data=route.data;
 const stale=data&&Date.parse(data.expiresAt)<=Date.parse(evaluatedAt);
 const future=data&&Date.parse(data.updatedAt)>Date.parse(evaluatedAt);
 return <section className="dt-panel" id="dt-route-details" aria-label="選中路線詳情">
  <h2>{route.candidate.label}</h2>
  {!route.eligible&&<p className="dt-danger">× 不可行：{route.exclusions.join(' ')}</p>}
  {route.meetsDeadline===false&&<p className="dt-danger">保守 ETA 趕不上到達期限；即使 A 排序列首位也不可當成準時推薦。</p>}
  <p><strong>ETA 區間：</strong>{hk(reliability.etaRange[0])} – {hk(reliability.etaRange[1])}（香港時間）<br/><strong>準時信心：{CONFIDENCE[reliability.onTimeConfidence]}</strong></p>
  <p>{reliability.confidenceNote}</p>
  <h3>路線分段與換乘</h3><ol className="dt-segments">{route.candidate.journey.segments.map((s,i)=>{
   const q=displayQueue(route,s),port=q?findPort(q.portId):undefined;
   return <li key={s.id}><strong>{s.from.name} → {s.to.name}</strong><p>{MODES[s.mode]} · {s.line??'無指定線路'} · {s.durationMinutes} 分鐘 · {hk(s.departAt)} – {hk(s.arriveAt)}<br/>{s.kind==='border_crossing'?'⋯ 跨境通關段':s.kind==='in_hk'?'香港境內段':'深圳境內段'}{i>0&&s.mode!==route.candidate.journey.segments[i-1]?.mode?' · 交通方式轉換':''}</p>
   {s.kind==='border_crossing'&&(q?<p>口岸：{port?.name??q.portId}<br/>排隊估算 {q.queueMinutesRange[0]}–{q.queueMinutesRange[1]} 分鐘 · 信心：{CONFIDENCE[q.confidence]}<br/>{q.note??'未提供排隊依據'}{port&&<><br/>參考開放時間 {port.openFrom}–{port.openTo} · 不代表有接駁班次 · 座標未核實</>}</p>:<p>口岸排隊資料不足；未提供區間或信心。</p>)}</li>;
  })}</ol>
  <h3>五因子風險 <Badge level={risk.level}/></h3><p>風險評估信心：{CONFIDENCE[risk.breakdown.confidence]}</p>
  <div className="dt-factors">{risk.breakdown.factors.map(f=><details key={f.id}><summary>{FACTORS[f.id]} <Badge level={f.level}/></summary><p>{f.claim}</p><p>證據：{f.evidence}</p><p>來源：<LinkSource url={f.sourceUrl} source={f.source}/></p></details>)}</div>
  {data?.value.crowd&&<p>人流信號：<Badge level={data.value.crowd.level}/> · 信心：{CONFIDENCE[data.value.crowd.confidence]}<br/>{data.value.crowd.evidence}（人流等級不是新增路線風險等級）</p>}
  <details><summary>可靠性依據</summary>{reliability.factors.map((f,i)=><p key={i}>{f.claim}<br/>證據：{f.evidence}<br/><LinkSource url={f.sourceUrl} source={f.source}/></p>)}</details>
  <h3>資料與限制</h3><p>路線：{QUALITY[route.candidate.quality]} · 風險：{QUALITY[risk.quality]} · ETA：{QUALITY[reliability.quality]}</p>
  {data?<><p>情境：{QUALITY[data.quality]} · 信心：{CONFIDENCE[data.confidence]}<br/>來源：<LinkSource url={data.sourceUrl} source={data.source}/><br/>資料更新：{hk(data.updatedAt)}<br/>有效至：{hk(data.expiresAt)}（香港時間）</p>{(stale||future)&&<p className="dt-warning">{stale?'資料在評估時已過期':'資料更新時間晚於評估時鐘'}；已降級，不能視為即時。</p>}</>:<p className="dt-warning">缺少情境資料，採保守估算與低信心。</p>}
  <ul>{[...risk.notices,...reliability.notices].map((v,i)=><li key={i}>{v}</li>)}</ul>
 </section>;
}
