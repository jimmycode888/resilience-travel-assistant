import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_BASE || 'http://localhost:5190';

const base = {
  origin: 'hang-hau-estate',
  destination: 'central-exchange-square',
  arriveBy: '2026-10-13T09:00',
  maxExtraCost: '10',
  maxTransfers: '2',
};
const resultUrl = (scenario) =>
  APP + '/result?' + new URLSearchParams({ ...base, scenario }).toString();

const browser = await chromium.launch({ headless: true });
const log = [];

async function capture(name, url, { width, height, fullPage = true, expect }) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Asia/Hong_Kong',
    locale: 'zh-HK',
  });
  const page = await context.newPage();
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(r.status() + ' ' + r.url());
  });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    if (expect) await page.getByText(expect, { exact: false }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT, name + '.png'), fullPage });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    log.push({ name, ok: true, badRequests: bad, excerpt: body.slice(0, 160) });
    console.log('OK  ', name, '| bad=' + bad.length, '|', body.slice(0, 90));
  } catch (e) {
    log.push({ name, ok: false, error: String(e.message).slice(0, 160), badRequests: bad });
    console.log('FAIL', name, '|', String(e.message).slice(0, 160));
  } finally {
    await context.close();
  }
}

await capture('31-app-input-desktop', APP + '/', { width: 1280, height: 900, fullPage: false, expect: '取得出行建議' });
await capture('32-app-normal-desktop', resultUrl('normal'), { width: 1280, height: 900, expect: '出發' });
await capture('33-app-normal-mobile', resultUrl('normal'), { width: 390, height: 844, expect: '出發' });
await capture('34-app-heavy-rain-mobile', resultUrl('heavy_rain'), { width: 390, height: 844, expect: '出發' });
await capture('35-app-disruption-mobile', resultUrl('disruption'), { width: 390, height: 844, expect: '出發' });
await capture('36-app-disruption-desktop', resultUrl('disruption'), { width: 1280, height: 900, expect: '出發' });
await capture('37-app-health', APP + '/api/health', { width: 900, height: 700, fullPage: false, expect: 'status' });

await browser.close();
console.log('\nRESULT_JSON ' + JSON.stringify(log, null, 1));
