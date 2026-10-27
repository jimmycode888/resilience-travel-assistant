import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.env.D_QA_URL || 'http://localhost:5180';
const out = fileURLToPath(new URL('../../docs/d-qa-2026-10-07/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Hong_Kong' });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const results = [];
const request = { origin: 'hang-hau-estate', destination: 'central-exchange-square', arriveBy: '2026-10-13T09:00', constraints: { maxExtraCost: 10, maxTransfers: 2 }, scenario: 'normal' };
const path = (extra = {}) => '/result?' + new URLSearchParams({ origin: request.origin, destination: request.destination, arriveBy: request.arriveBy, maxExtraCost: '10', maxTransfers: '2', scenario: 'normal', ...extra });
const text = () => page.locator('body').innerText();
const waitResult = async (time = '08:09') => { await page.locator('.text-4xl').filter({ hasText: time }).waitFor(); await page.waitForFunction(() => !document.querySelector('[role="status"]')); await page.getByRole('button',{name:'重新查詢',exact:true}).waitFor(); };
const test = async (name, fn) => { try { const detail = await fn(); results.push({ name, status: 'passed', detail }); console.log('PASS', name); } catch(e) { results.push({name, status:'failed', detail:e.message}); console.log('FAIL', name, e.message); } finally { await page.unroute('**/api/decision'); await context.setOffline(false); } };
let full;
await test('实际 POST /api/decision 正常基线', async () => { const r = await page.request.post(base + '/api/decision', { data: request }); assert.equal(r.status(), 200); full = await r.json(); assert.equal(full.primaryPlan.routeId, 'R1'); assert.equal(full.dataQuality, 'fixture'); return { status: full.status, departAt: full.departAt, confidence: full.confidence }; });
await test('三情景各五次：表单提交、结果情景切换、重新查询、刷新', async () => {
  const evidence=[];
  for (const [scenario, label, time, confidence] of [['normal','正常通勤','08:09','高'],['heavy_rain','暴雨影響','07:58','中'],['disruption','交通中斷','07:22','低']]) {
    const referenceResponse = await page.request.post(base+'/api/decision',{data:{...request,scenario}});
    const reference = await referenceResponse.json();
    for(let i=0;i<5;i++) {
      if(i===0) { await page.goto(base); await page.getByRole('radio',{ name: label,exact:true }).click(); await page.getByRole('button',{name:'取得出行建議',exact:true}).click(); }
      else if(i===1) { await page.getByRole('button',{name:'重新查詢',exact:true}).click(); }
      else if(i===2) { await page.reload(); }
      else { const other = scenario === 'normal' ? '暴雨影響' : '正常通勤'; await page.getByRole('radio',{name:other,exact:true}).click(); await waitResult(other==='正常通勤'?'08:09':'07:58'); await page.getByRole('radio',{name:label,exact:true}).click(); }
      await waitResult(time); assert.match(await text(),new RegExp('到達信心 '+confidence)); assert.match(await text(),/Plan B/); assert.match(await text(),/切換條件/); assert.equal(new URL(page.url()).searchParams.get('scenario'),scenario);
      const content=await text();
      assert.ok(content.includes(reference.primaryPlan.label));
      assert.ok(content.includes(reference.planBPlan.label));
      assert.ok(content.includes(reference.etaRange.map(v=>v.slice(11,16)).join(' – ')));
      evidence.push({scenario,iteration:i+1,time,confidence,primary:reference.primaryPlan.routeId,planB:reference.planBPlan.routeId,eta:reference.etaRange});
    }
    await page.screenshot({path:out+'result-'+scenario+'-390.png',fullPage:true});
  } return evidence;
});
await test('数字/日期输入错误，焦点与保留值，边界', async()=>{
  for(const [field, value] of [['maxExtraCost',''],['maxTransfers',''],['maxExtraCost','-1'],['maxExtraCost','1.5'],['maxExtraCost','501'],['maxTransfers','6'],['arriveBy','']]) {
    await page.goto(base); await page.locator('#'+field).fill(value); await page.getByRole('button',{name:'取得出行建議'}).click(); await page.locator('main [role="alert"]').waitFor(); assert.equal(await page.evaluate(()=>document.activeElement.id),field); assert.equal(await page.locator('#'+field).getAttribute('aria-invalid'),'true'); assert.equal(new URL(page.url()).pathname,'/'); assert.equal(await page.locator('#'+field).inputValue(),value);
  }
  for(const [cost,transfers] of [['0','0'],['500','5']]){await page.goto(base); await page.locator('#maxExtraCost').fill(cost);await page.locator('#maxTransfers').fill(transfers);await page.getByRole('button',{name:'取得出行建議'}).click();await page.waitForURL('**/result?**');await page.getByRole('button',{name:'重新查詢'}).waitFor({state:'visible'});assert.equal(new URL(page.url()).searchParams.get('maxExtraCost'),cost);}
});
await test('快速重复提交和重查各五次，单一请求',async()=>{
  let count=0;
  await page.route('**/api/decision',async r=>{count++;await new Promise(resolve=>setTimeout(resolve,800));await r.fulfill({json:full});});
  await page.goto(base);await page.locator('#arriveBy').waitFor();
  await page.screenshot({path:out+'input-390.png',fullPage:true});
  await page.getByRole('button',{name:'取得出行建議'}).evaluate(b=>{for(let i=0;i<5;i++)b.click();});
  await waitResult();assert.equal(count,1);
  await page.getByRole('button',{name:'重新查詢'}).evaluate(b=>{for(let i=0;i<5;i++)b.click();});
  await page.getByRole('status').waitFor();await waitResult();assert.equal(count,2);
});
await test('unavailable 05:45 实际响应与页面', async()=>{await page.goto(base+path({arriveBy:'2026-10-13T05:45'}));await page.getByRole('heading',{name:'目前沒有可執行的建議'}).waitFor();assert.doesNotMatch(await text(),/建議出發時間（離開起點）/);await page.screenshot({path:out+'unavailable.png',fullPage:true});});
await test('合法最小回应与 null 主摘要、缺失附加数组', async()=>{
  const keys=['status','departAt','etaRange','confidence','primaryRoute','planB','switchCondition','reasons','dataUpdatedAt','dataQuality'];
  for(const extra of [{},{primaryPlan:null},{notices:[],dataSources:[],candidates:[]}]) {const minimal={...Object.fromEntries(keys.map(k=>[k,full[k]])),...extra}; await page.route('**/api/decision',r=>r.fulfill({json:minimal}));await page.goto(base+path());await waitResult();assert.match(await text(),/Plan B/);assert.match(await text(),/將軍澳線/);assert.match(await text(),/本次沒有回報資料來源資訊/);await page.unroute('**/api/decision');}
  await page.screenshot({path:out+'minimal-contract.png',fullPage:true});
});
await test('空 Plan B 最小合法回应',async()=>{await page.route('**/api/decision',r=>r.fulfill({json:{...full,planB:[],planBPlan:null,switchCondition:''}}));await page.goto(base+path());await waitResult();assert.match(await text(),/沒有可用的備用路線/);await page.unroute('**/api/decision');});
await test('2.5秒加载与禁用重复查询',async()=>{await page.route('**/api/decision',async r=>{await new Promise(resolve=>setTimeout(resolve,2500));await r.fulfill({json:full});});await page.goto(base+path());await page.getByRole('status').waitFor();assert.equal(await page.getByRole('button',{name:'重新查詢'}).isDisabled(),true);assert.equal(await page.getByRole('radio',{name:'正常通勤',exact:true}).isDisabled(),true);assert.doesNotMatch(await text(),/建議出發時間（離開起點）/);await page.screenshot({path:out+'loading.png',fullPage:true});await waitResult();await page.unroute('**/api/decision');});
await test('接口500错误及重试恢复、内部详情不外露',async()=>{await page.route('**/api/decision',r=>r.fulfill({status:500,json:{error:{code:'INTERNAL_ERROR',message:'服務暫時無法處理請求。',details:['/internal/private/stack']}}}));await page.goto(base+path());await page.locator('main [role="alert"]').waitFor();assert.match(await text(),/INTERNAL_ERROR/);assert.doesNotMatch(await text(),/private/);await page.screenshot({path:out+'api-error.png',fullPage:true});await page.unroute('**/api/decision');await page.getByRole('button',{name:'重試',exact:true}).click();await waitResult();});
await test('实际400回应 details 在错误页面显示',async()=>{const r=await page.request.post(base+'/api/decision',{data:{...request,constraints:{maxExtraCost:-1,maxTransfers:2}}});assert.equal(r.status(),400);const body=await r.json();await page.route('**/api/decision',r=>r.fulfill({status:400,json:body}));await page.goto(base+path());await page.locator('main [role="alert"]').waitFor();assert.match(await text(),/maxExtraCost/);await page.unroute('**/api/decision');});
await test('非JSON及契约结构错误',async()=>{for(const data of ['not json','{}']){await page.route('**/api/decision',r=>r.fulfill({status:200,contentType:'application/json',body:data}));await page.goto(base+path());await page.locator('main [role="alert"]').waitFor();assert.match(await text(),data==='{}'?/CONTRACT_MISMATCH/:/BAD_RESPONSE/);await page.unroute('**/api/decision');}});
await test('浏览器断网重查提示；恢复网络后重试',async()=>{await page.goto(base+path());await waitResult();await context.setOffline(true);await page.getByRole('button',{name:'重新查詢'}).click();await page.locator('main [role="alert"]').waitFor();assert.match(await text(),/NETWORK_ERROR/);await page.screenshot({path:out+'browser-offline.png',fullPage:true});await context.setOffline(false);await page.getByRole('button',{name:'重試',exact:true}).click();await waitResult();});
await test('键盘 Enter 提交、方向键选择、Home/End',async()=>{await page.goto(base);await page.getByRole('radio',{name:'正常通勤',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('radio',{name:'暴雨影響',exact:true}).getAttribute('aria-checked'),'true');await page.keyboard.press('End');assert.equal(await page.getByRole('radio',{name:'實時資料',exact:true}).getAttribute('aria-checked'),'true');await page.keyboard.press('Home');await page.getByRole('button',{name:'取得出行建議'}).focus();await page.keyboard.press('Enter');await waitResult();});
await test('非法 URL、刷新、分享URL、返回前进',async()=>{await page.goto(base+path({scenario:'invalid',maxExtraCost:'oops'}));await page.locator('main [role="alert"]').waitFor();assert.match(await text(),/網址參數有問題/);await waitResult();await page.goto(base);await page.getByRole('button',{name:'取得出行建議'}).click();await waitResult();const url=page.url();await page.goBack();await page.locator('#arriveBy').waitFor();await page.goForward();await waitResult();const other=await context.newPage();await other.goto(url);await other.getByText('建議出發時間（離開起點）',{exact:true}).waitFor();assert.match(await other.locator('body').innerText(),/08:09/);await other.close();});
await test('360/390/768/1280三情景布局、核心第一屏、44px触控',async()=>{
  const measurements=[];
  for(const [scenario,time] of [['normal','08:09'],['heavy_rain','07:58'],['disruption','07:22']]) {
    for(const width of [360,390,768,1280]) {
      await page.setViewportSize({width,height:844}); await page.goto(base+path({scenario})); await waitResult(time);
      const m=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText,height:b.getBoundingClientRect().height})),time:document.querySelector('.text-4xl').getBoundingClientRect().bottom,confidence:[...document.querySelectorAll('span')].find(e=>e.innerText.startsWith('到達信心')).getBoundingClientRect().bottom,switch:[...document.querySelectorAll('h3')].find(e=>e.innerText==='切換條件').getBoundingClientRect().bottom}));
      assert.ok(m.scroll<=width); assert.ok(m.time<844 && m.confidence<844 && m.switch<844); assert.ok(m.buttons.every(b=>b.height>=44));
      await page.screenshot({path:out+'viewport-'+scenario+'-'+width+'.png',fullPage:true});measurements.push({scenario,...m});
    }
  } return measurements;
});
await test('live 长网址在360px不横向溢出',async()=>{
  await page.setViewportSize({width:360,height:844});await page.goto(base+path({scenario:'live'}));
  await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText==='重新查詢');return b && !b.disabled;});
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(size.scroll,size.width);
  await page.screenshot({path:out+'live-360.png',fullPage:true});return size;
});
await test('200% CSS缩放布局（非原生浏览器缩放）',async()=>{await page.setViewportSize({width:1280,height:900});await page.goto(base+path());await waitResult();await page.evaluate(()=>document.body.style.zoom='2');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'重新查詢'}).click();await waitResult();await page.screenshot({path:out+'zoom-200.png',fullPage:true});await page.evaluate(()=>document.body.style.zoom='1');});
await test('live 当前上游结果与品质标记（不冒充断网测试）',async()=>{await page.goto(base+path({scenario:'live'}));await page.getByRole('button',{name:'重新查詢'}).waitFor();await page.waitForFunction(()=>!document.querySelector('[role="status"]'));const t=await text();assert.match(t,/實時資料|快取資料|演示固定資料/);await page.screenshot({path:out+'live.png',fullPage:true});return t.slice(0,1400);});
await test('axe 自动可访问性与正文对比度',async()=>{
  const axePath = process.env.D_QA_AXE_PATH;
  assert.ok(axePath, '设置 D_QA_AXE_PATH 指向 axe.min.js 后执行自动审计');
  const audits=[];
  for(const pathname of ['/',path(),path({scenario:'disruption'}),path({arriveBy:'2026-10-13T05:45'})]) {
    await page.goto(base+pathname);
    if(pathname==='/') await page.locator('#arriveBy').waitFor();
    else await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText==='重新查詢');return b && !b.disabled;});
    await page.waitForTimeout(300);
    await page.addScriptTag({content:readFileSync(axePath,'utf8')});
    const audit=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    audits.push({path:pathname,violations:audit.violations,incomplete:audit.incomplete});
  }
  writeFileSync(out+'accessibility.json',JSON.stringify(audits,null,2));
  assert.deepEqual(audits.flatMap(a=>a.violations.map(v=>({path:a.path,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))),[]);
  return audits.map(a=>({path:a.path,violations:a.violations.length,incomplete:a.incomplete.length}));
});
await test('无浏览器未捕获异常',async()=>{assert.deepEqual(errors,[]);});
writeFileSync(out+'browser-results.json',JSON.stringify({date:new Date().toISOString(),base,browser:await browser.version(),results,errors},null,2));
await browser.close();
if(results.some(r=>r.status==='failed'))process.exitCode=1;
