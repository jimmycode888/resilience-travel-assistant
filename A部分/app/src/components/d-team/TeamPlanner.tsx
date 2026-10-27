'use client';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import type {TeamJourneyResult} from '@/lib/types/team-integration';
import {PLACES} from '@/lib/geo/places';
import {BORDER_PORTS} from '@/lib/geo/ports';
import {parseArriveBy} from '@/lib/time';
import {requestSchema} from './contract';
import {loadTeam,RequestGate,type DataSource} from './client';
import {SCENARIOS,SCENARIO_LABELS,type FixtureScenario} from './scenarios';
import {RouteCards,RouteDetails,DecisionPanel} from './TeamResults';
import {hk} from './presentation';
const TeamMap=dynamic(()=>import('./TeamMap'),{ssr:false,loading:()=> <p role="status">正在載入地圖…</p>});
interface FormValues{origin:string;destination:string;departAt:string;arriveBy:string;mode:'balanced'|'fastest'|'reliable'|'less_crowded';preferPortId:string}
export default function TeamPlanner(){
 const [form,setForm]=useState<FormValues>({origin:'central-exchange-square',destination:'futian-station-sz',departAt:'2026-10-13T08:00',arriveBy:'2026-10-13T11:00',mode:'balanced',preferPortId:''});
 const [scenario,setScenario]=useState<FixtureScenario>('normal'),[source,setSource]=useState<DataSource>('fixture');
 const [result,setResult]=useState<TeamJourneyResult|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const gate=useRef(new RequestGate()),locked=useRef(false),formElement=useRef<HTMLFormElement>(null),status=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{const current=gate.current;return()=>current.cancel();},[]);
 function invalidate(){gate.current.cancel();locked.current=false;setBusy(false);setResult(null);setSelected(null);setError('');setErrors({});}
 function edit(key:keyof FormValues,value:string){invalidate();setForm(v=>({...v,[key]:value}));}
 async function submit(){
  if(locked.current)return;
  const departure=parseArriveBy(form.departAt),arrival=form.arriveBy.trim()?parseArriveBy(form.arriveBy):null;
  const raw={origin:form.origin,destination:form.destination,departAt:departure.ok?departure.iso:form.departAt,arriveBy:arrival?.ok?arrival.iso:arrival?form.arriveBy:undefined,mode:form.mode,preferPortId:form.preferPortId||undefined};
  const parsed=requestSchema.safeParse(raw);
  if(!parsed.success){const e:Record<string,string>={};parsed.error.issues.forEach(i=>{e[String(i.path[0])]=i.message;});setErrors(e);setError('請先修正標示的欄位。');const first=Object.keys(e)[0];formElement.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();return;}
  locked.current=true;setBusy(true);setError('');setErrors({});setResult(null);setSelected(null);
  const token=gate.current.begin();
  const timer=setTimeout(()=>{
   if(gate.current.current(token.epoch)){gate.current.cancel();locked.current=false;setBusy(false);setError('請求等候逾時，請重試。');}
  },15000);
  try{
   const value=await loadTeam(parsed.data,scenario,source,token.signal);
   if(!gate.current.current(token.epoch))return;
   setResult(value);setSelected(value.recommendedRouteId??value.routes[0]?.candidate.id??null);
   setTimeout(()=>{if(gate.current.current(token.epoch))status.current?.focus();},0);
  }catch(e){if(gate.current.current(token.epoch))setError(e instanceof Error&&e.message!=='Failed to fetch'?e.message:'網絡暫時無法連線，請重試。');}
  finally{clearTimeout(timer);if(gate.current.current(token.epoch)){locked.current=false;setBusy(false);}}
 }
 const detail=result?.routes.find(r=>r.candidate.id===selected);
 const field=(key:keyof FormValues)=>({id:`dt-${key}`,name:key,'aria-invalid':!!errors[key],'aria-describedby':errors[key]?`dt-error-${key}`:undefined});
 return <div className="dt-shell">
  <div className="dt-heading"><div><p className="dt-eyebrow">D 第二階段 · v2.0 · 2026-10-10</p><h1>看清路線，再決定出發。</h1><p>港深跨境 · 路線、風險與到達信心</p></div><a href="/journey">A 演示參考入口</a></div>
  <p className="dt-banner" role="note">{source==='fixture'?'測試模式 · fixture / mock · B/C 正式模組未接入 · 不是實時資料':'正式 HTTP 接入測試 · 需要 A 提供 /api/team-journey · 不會自動轉成演示資料'}</p>
  <div className="dt-workspace"><aside className="dt-panel">
   <h2>設定行程</h2><p className="dt-note">所有日期時間使用香港時區（UTC+08:00）。測試日期可調整；fixture 不代表該日實際服務。</p>
   <form ref={formElement} noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
    <label htmlFor="dt-source">資料接入</label><select id="dt-source" value={source} onChange={e=>{invalidate();setSource(e.target.value==='formal'?'formal':'fixture');}}><option value="fixture">D 測試 fixture</option><option value="formal">正式團隊 HTTP（待 A）</option></select>
    {(['origin','destination'] as const).map(key=><div key={key}><label htmlFor={`dt-${key}`}>{key==='origin'?'起點':'終點'}</label><select {...field(key)} value={form[key]} onChange={e=>edit(key,e.target.value)}>{PLACES.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select>{errors[key]&&<p id={`dt-error-${key}`} className="dt-danger">{errors[key]}</p>}</div>)}
    {(['departAt','arriveBy'] as const).map(key=><div key={key}><label htmlFor={`dt-${key}`}>{key==='departAt'?'出發日期時間':'到達期限（可留空）'}</label><input {...field(key)} type="datetime-local" value={form[key]} onChange={e=>edit(key,e.target.value)}/>{errors[key]&&<p id={`dt-error-${key}`} className="dt-danger">{errors[key]}</p>}</div>)}
    <label htmlFor="dt-mode">行程偏好</label><select {...field('mode')} value={form.mode} onChange={e=>edit('mode',e.target.value)}><option value="balanced">平衡</option><option value="fastest">最快</option><option value="reliable">較穩妥</option><option value="less_crowded">較少人流</option></select>
    <label htmlFor="dt-preferPortId">口岸篩選</label><select {...field('preferPortId')} value={form.preferPortId} onChange={e=>edit('preferPortId',e.target.value)}><option value="">所有已覆蓋口岸</option>{BORDER_PORTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    {source==='fixture'&&<><label htmlFor="dt-scenario">界面測試情景（非實時）</label><select id="dt-scenario" value={scenario} onChange={e=>{invalidate();const value=SCENARIOS.find(s=>s===e.target.value);if(value)setScenario(value);}}>{SCENARIOS.map(s=><option value={s} key={s}>{SCENARIO_LABELS[s]}</option>)}</select></>}
    <button type="submit" className="dt-primary" disabled={busy}>{busy?'正在比較…':'比較行程 →'}</button>
   </form>
   <p className="dt-note">正式契約沒有費用上限或換乘上限欄位，本頁不推算費用，也不把空白當作零。</p>
  </aside><div className="dt-main" aria-busy={busy}>
   <h2 ref={status} tabIndex={-1} className="dt-result-heading" aria-live="polite">{busy?'正在分析行程…':result?`已完成比較 · ${result.routes.length} 條候選`:'先設定一段旅程'}</h2>
   {error&&<div className="dt-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={()=>void submit()}>重試</button></div>}
   {!result&&!busy&&!error&&<div className="dt-empty">輸入起終點與香港出發時間，再比較路線。演示資料會明確標記。</div>}
   {result&&<>
    <p className="dt-note">評估時鐘：{hk(result.evaluatedAt)}（香港時間）{source==='fixture'?' · 回放時鐘，非目前資料更新時間':''}</p>
    <DecisionPanel result={result} fixture={source==='fixture'} onSelect={setSelected}/>
    {!result.routes.length?<p className="dt-empty" role="status">沒有候選路線；請修改起終點、口岸或時間再試。</p>:<>
     <TeamMap routes={result.routes} selectedId={selected} onSelect={setSelected}/>
     <h2>候選路線 · 點選查看詳情</h2><RouteCards result={result} selectedId={selected} onSelect={setSelected}/>
     <p role="status" className="dt-note">{detail?`已選中：${detail.candidate.label}`:''}</p>
     {detail&&<RouteDetails route={detail} evaluatedAt={result.evaluatedAt}/>}</>}
    <section className="dt-panel"><h2>整體資料提示</h2><ul>{result.notices.map((v,i)=><li key={i}>{v}</li>)}</ul></section>
   </>}
  </div></div>
 </div>;
}
