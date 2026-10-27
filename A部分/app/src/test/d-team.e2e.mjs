import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const base=process.env.D_QA_URL||'http://localhost:5191';
const out=fileURLToPath(new URL('../../docs/d-phase2-2026-10-10/',import.meta.url));mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:1000},timezoneId:'America/New_York'});
const page=await context.newPage();page.setDefaultTimeout(12000);
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
const test=async(name,fn)=>{try{const detail=await fn();results.push({name,status:'passed',detail});console.log('PASS',name);}catch(e){results.push({name,status:'failed',detail:e.message});console.log('FAIL',name,e.message);}};
const text=()=>page.locator('.dt-shell').innerText();
const ready=async()=>{await page.locator('.dt-result-heading').filter({hasText:'已完成比較'}).waitFor();await page.waitForFunction(()=>document.activeElement?.classList.contains('dt-result-heading'));};
const submit=async()=>{await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await ready();};
const scenario=async value=>{await page.locator('#dt-scenario').selectOption(value);await submit();};
await page.goto(base+'/journey-team');
await test('正常 HTTP fixture，與演示/正式界線、香港時區',async()=>{
 await submit();assert.match(await text(),/C 正式決策未接入/);assert.match(await text(),/fixture/);assert.equal(await page.locator('#dt-departAt').inputValue(),'2026-10-13T08:00');
 const body=await context.request.post(base+'/api/d-team-fixture',{data:{request:{origin:'central-exchange-square',destination:'futian-station-sz',departAt:'2026-10-13T08:00:00+08:00',mode:'balanced'},scenario:'normal'}});
 assert.equal(body.status(),200);assert.equal(body.headers()['cache-control'],'no-store');
 const value=await body.json();assert.equal(value.kind,'d-team-fixture-v1');writeFileSync(out+'fixture-http.json',JSON.stringify(value,null,2));
 return {routes:value.result.routes.length,timezone:'browser New York, inputs/rendering Hong Kong'};
});
for(const [value,pattern] of [['go',/D mock 決策/],['hold',/暫緩出行/],['unavailable',/暫無可執行方案/],['missing',/缺少情境資料/],['stale',/已過期/],['timeout',/模擬上游逾時/],['disruption',/不可行/],['severe',/嚴重天氣/],['empty',/沒有候選路線/],['no-backup',/沒有備選方案/],['deadline',/到達超時/],['critical',/極高風險/]])await test('情景 '+value,async()=>{await scenario(value);assert.match(await text(),pattern);});
await test('不同口岸及關閉時間',async()=>{
 await page.locator('#dt-scenario').selectOption('normal');
 for(const port of ['lok-ma-chau','lo-wu','shenzhen-bay']){await page.locator('#dt-preferPortId').selectOption(port);await submit();assert.equal(await page.locator('.dt-route').count(),1);}
 await page.locator('#dt-preferPortId').selectOption('');await page.locator('#dt-departAt').fill('2026-10-13T23:00');await page.locator('#dt-arriveBy').fill('');await page.locator('#dt-scenario').selectOption('go');await submit();assert.match(await text(),/暫無可執行方案/);
 await page.locator('#dt-departAt').fill('2026-10-13T08:00');await page.locator('#dt-arriveBy').fill('2026-10-13T11:00');
});
await test('卡片 ↔ 地圖路段與鍵盤聯動',async()=>{
 await scenario('normal');await page.locator('.dt-map svg path').first().waitFor();
 const card=page.getByTestId('route-xb-2-lo-wu');await card.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-testid=route-xb-2-lo-wu]')?.getAttribute('aria-pressed')==='true');assert.equal(await card.getAttribute('aria-pressed'),'true');assert.equal(await page.getByTestId('team-map').getAttribute('data-selected-id'),'xb-2-lo-wu');
 await page.locator('.dt-line-xb-3-shenzhen-bay').first().dispatchEvent('click');await page.waitForFunction(()=>document.querySelector('[data-testid=route-xb-3-shenzhen-bay]')?.getAttribute('aria-pressed')==='true');assert.equal(await page.getByTestId('route-xb-3-shenzhen-bay').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:/地圖查看：.*落馬洲/}).focus();await page.keyboard.press('Space');assert.equal(await page.getByTestId('team-map').getAttribute('data-selected-id'),'xb-1-lok-ma-chau');
 await page.getByRole('heading',{name:'五因子風險',exact:false}).scrollIntoViewIfNeeded();const summary=page.locator('.dt-factors summary').first();await summary.focus();await page.keyboard.press('Enter');assert.equal(await summary.locator('..').getAttribute('open'),'');
});
await test('非法輸入與首錯焦點、輸入保留',async()=>{
 await page.locator('#dt-departAt').fill('');await page.getByRole('button',{name:'比較行程 →',exact:true}).click();assert.equal(await page.locator('#dt-departAt').getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'dt-departAt');assert.equal(await page.locator('#dt-origin').inputValue(),'central-exchange-square');
 await page.locator('#dt-departAt').fill('2026-10-13T08:00');await page.locator('#dt-arriveBy').fill('2026-10-13T07:00');await page.getByRole('button',{name:'比較行程 →',exact:true}).click();assert.equal(await page.locator('#dt-arriveBy').getAttribute('aria-invalid'),'true');await page.locator('#dt-arriveBy').fill('2026-10-13T11:00');
});
await test('重複提交、加载、輸入切換與舊響應競爭',async()=>{
 let count=0;await page.route('**/api/d-team-fixture',async route=>{count++;const response=await route.fetch();await new Promise(r=>setTimeout(r,count===1?1800:100));try{await route.fulfill({response});}catch{}});
 await page.locator('#dt-scenario').selectOption('normal');await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await page.evaluate(()=>{for(let i=0;i<5;i++)document.querySelector('.dt-shell form').requestSubmit();});assert.equal(count,1);assert.equal(await page.locator('.dt-primary').isDisabled(),true);
 await page.locator('#dt-scenario').selectOption('hold');assert.equal(await page.locator('.dt-route').count(),0);await submit();await page.waitForTimeout(2000);assert.match(await text(),/暫緩出行/);assert.equal(count,2);await page.unroute('**/api/d-team-fixture');
});
for(const [name,status,body] of [['500',500,'private secret trace'],['非法 JSON',200,'not-json'],['非法契約',200,'{"kind":"d-team-fixture-v1","result":{}}']])await test('請求失敗 '+name+' 與重試',async()=>{
 await page.locator('#dt-scenario').selectOption('normal');await page.route('**/api/d-team-fixture',route=>route.fulfill({status,body,contentType:'application/json'}));await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await page.locator('.dt-error').waitFor();assert.doesNotMatch(await text(),/private secret trace/);assert.equal(await page.locator('.dt-route').count(),0);await page.unroute('**/api/d-team-fixture');await page.getByRole('button',{name:'重試',exact:true}).click();await ready();
});
await test('15 秒請求逾時可重試',async()=>{
 await page.route('**/api/d-team-fixture',async route=>{await new Promise(r=>setTimeout(r,17000));try{await route.abort();}catch{}});await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await page.locator('.dt-error').waitFor({timeout:18000});assert.match(await text(),/等候逾時/);await page.unroute('**/api/d-team-fixture');await page.getByRole('button',{name:'重試',exact:true}).click();await ready();
});
await test('正式 HTTP 未接入，無自動演示回退',async()=>{await page.locator('#dt-source').selectOption('formal');await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await page.locator('.dt-error').waitFor();assert.match(await text(),/尚未接線/);assert.equal(await page.locator('.dt-route').count(),0);await page.locator('#dt-source').selectOption('fixture');await submit();});
await test('瀏覽器網絡中斷清舊結果、恢復後重試',async()=>{
 await context.setOffline(true);await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await page.locator('.dt-error').waitFor();assert.match(await text(),/網絡/);assert.equal(await page.locator('.dt-route').count(),0);await context.setOffline(false);await page.getByRole('button',{name:'重試',exact:true}).click();await ready();
});
for(const [width,height] of [[360,844],[390,844],[768,1024],[1280,1000]])await test('響應式 '+width,async()=>{
 await page.setViewportSize({width,height});await scenario('go');const measure=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,smallTargets:[...document.querySelectorAll('.dt-shell button,.dt-shell input,.dt-shell select')].filter(e=>e.getBoundingClientRect().height<44).map(e=>e.textContent)}));assert.ok(measure.scroll<=width,JSON.stringify(measure));assert.deepEqual(measure.smallTargets,[]);await page.screenshot({path:out+`viewport-${width}.png`,fullPage:true});return measure;
});
await test('自動 axe 檢查（不替代真人）',async()=>{
 await page.addScriptTag({content:readFileSync(process.env.D_QA_AXE_PATH||'/tmp/d-qa-tools/node_modules/axe-core/axe.min.js','utf8')});
 const audits=[];for(const s of ['normal','go','hold','unavailable']){await scenario(s);const report=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));audits.push({scenario:s,violations:report.violations,incomplete:report.incomplete});}
 writeFileSync(out+'accessibility.json',JSON.stringify(audits,null,2));assert.equal(audits.reduce((n,a)=>n+a.violations.length,0),0);return audits.map(a=>({scenario:a.scenario,violations:a.violations.length,incomplete:a.incomplete.length}));
});
await test('A 演示中斷主路/備選及第一階段 HTTP 復核',async()=>{
 const request={origin:'central-exchange-square',destination:'futian-station-sz',departAt:'2026-10-13T08:00:00+08:00',arriveBy:'2026-10-13T11:00:00+08:00',mode:'balanced',scenario:'disruption'};
 const response=await context.request.post(base+'/api/journey',{data:request});assert.equal(response.status(),200);const result=await response.json();writeFileSync(out+'demo-disruption-http.json',JSON.stringify(result,null,2));assert.equal(result.recommendedRouteId,'xb-3-shenzhen-bay');assert.equal(result.planB,null);
 const old=await context.request.post(base+'/api/decision',{data:{origin:'hang-hau-estate',destination:'central-exchange-square',arriveBy:'2026-10-13T09:00:00+08:00',constraints:{maxExtraCost:0,maxTransfers:2},scenario:'disruption'}});writeFileSync(out+'phase1-disruption-http.json',JSON.stringify(await old.json(),null,2));return {demoStatus:response.status(),phase1Status:old.status()};
});
await test('A 演示頁改輸入取消舊響應',async()=>{
 await page.goto(base+'/journey');await page.route('**/api/journey',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,1500));try{await route.fulfill({response});}catch{}});
 await page.getByRole('button',{name:'比較行程 →',exact:true}).click();await page.locator('#journey-depart').fill('2026-10-14T08:00');await page.waitForTimeout(1900);assert.equal(await page.locator('.journey-route-card').count(),0);await page.unroute('**/api/journey');
});
await test('第一階段空白數字、非法日期、零費用與鍵盤情景复核',async()=>{
 await page.goto(base+'/');
 for(const [id,value] of [['maxExtraCost',''],['maxExtraCost','-1'],['maxExtraCost','1.5'],['maxTransfers',''],['maxTransfers','6'],['arriveBy','']]){
  await page.locator('#maxExtraCost').fill('10');await page.locator('#maxTransfers').fill('2');await page.locator('#arriveBy').fill('2026-10-13T09:00');await page.locator('#'+id).fill(value);await page.getByRole('button',{name:'取得出行建議',exact:true}).click();assert.equal(await page.locator('#'+id).getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),id);
 }
 await page.locator('#arriveBy').fill('2026-10-13T09:00');await page.locator('#maxExtraCost').fill('0');await page.locator('#maxTransfers').fill('2');await page.getByRole('button',{name:'取得出行建議',exact:true}).click();await page.waitForURL('**/result?**');await page.locator('.text-4xl').waitFor();
 assert.match(page.url(),/maxExtraCost=0/);
 const radios=page.getByRole('radio');await radios.first().focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('role')),'radio');
});
await browser.close();writeFileSync(out+'browser-results.json',JSON.stringify({at:new Date().toISOString(),browser:'Chromium',base,results,errors},null,2));
assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(results.filter(r=>r.status==='failed').length,0,'Browser failures');
