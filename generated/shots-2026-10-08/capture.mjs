import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });

const APP = 'http://localhost:5173';
const REPORT = 'http://localhost:8090';
const PROTOTYPE = 'http://localhost:8443';
const FIGMA = 'http://localhost:4173';

const request = {
  origin: 'hang-hau-estate',
  destination: 'central-exchange-square',
  arriveBy: '2026-10-13T09:00',
  maxExtraCost: '10',
  maxTransfers: '2',
};
const resultUrl = (scenario) =>
  APP + '/result?' + new URLSearchParams({ ...request, scenario }).toString();

const browser = await chromium.launch({ headless: true });
const log = [];

async function shot(name, url, { width, height, fullPage = true, wait = 2500 } = {}) {
  const context = await browser.newContext({
    viewport: { width: width ?? 1280, height: height ?? 900 },
    timezoneId: 'Asia/Hong_Kong',
    locale: 'zh-HK',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(wait);
    const file = resolve(OUT, name + '.png');
    await page.screenshot({ path: file, fullPage });
    const title = await page.title();
    log.push({ name, url, ok: true, title });
    console.log('OK  ', name, '|', title);
  } catch (e) {
    log.push({ name, url, ok: false, error: String(e.message).slice(0, 200) });
    console.log('FAIL', name, '|', String(e.message).slice(0, 200));
  } finally {
    await context.close();
  }
}

// 1) 进度汇报
await shot('01-report-desktop', REPORT + '/', { width: 1280, height: 900 });
await shot('02-report-mobile', REPORT + '/', { width: 390, height: 844 });

// 2) 正式应用
await shot('10-app-input-desktop', APP + '/', { width: 1280, height: 900, fullPage: false });
await shot('11-app-normal-desktop', resultUrl('normal'), { width: 1280, height: 900 });
await shot('12-app-normal-mobile', resultUrl('normal'), { width: 390, height: 844 });
await shot('13-app-heavy-rain-mobile', resultUrl('heavy_rain'), { width: 390, height: 844 });
await shot('14-app-disruption-mobile', resultUrl('disruption'), { width: 390, height: 844 });
await shot('15-app-health', APP + '/api/health', { width: 1280, height: 900, fullPage: false, wait: 1200 });

// 3) E 的 UI 原型
await shot('20-prototype-desktop', PROTOTYPE + '/', { width: 1280, height: 900, wait: 6000 });
await shot('21-prototype-mobile', PROTOTYPE + '/', { width: 390, height: 844, wait: 6000 });

// 4) Figma 评审报告
await shot('30-figma-review-desktop', FIGMA + '/index.html', { width: 1280, height: 900 });

await browser.close();
console.log('\nRESULT_JSON ' + JSON.stringify(log));
