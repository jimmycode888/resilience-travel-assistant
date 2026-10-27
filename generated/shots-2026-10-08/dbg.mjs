import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = 'http://localhost:5173/result?origin=hang-hau-estate&destination=central-exchange-square&arriveBy=2026-10-13T09%3A00&maxExtraCost=10&maxTransfers=2&scenario=normal';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport:{width:1280,height:900}, timezoneId:'Asia/Hong_Kong', locale:'zh-HK' });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE_ERR:', m.text().slice(0,200)); });
await p.goto(url, { waitUntil:'load', timeout:60000 });
for (const t of [1000,3000,6000,10000]) {
  await p.waitForTimeout(t===1000?1000:t- (t===3000?1000:t===6000?3000:6000));
  const txt = (await p.locator('body').innerText()).replace(/\s+/g,' ').slice(0,300);
  console.log(`--- t=${t}ms ---`, txt);
}
await b.close();
