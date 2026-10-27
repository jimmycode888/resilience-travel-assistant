// Check the rendered document AND its assets: HTML 200 alone misses a broken UI.
const origin = process.argv[2];
if (!origin) throw new Error('Usage: node scripts/check-preview.mjs <preview-origin>');
for (const path of ['/', '/journey', '/journey-team']) {
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"\s]+)"/g)].map(match => match[1]))];
  if (!assets.length) throw new Error(`${path}: no Next.js assets found`);
  for (const asset of assets) {
    const result = await fetch(new URL(asset, origin));
    const type = result.headers.get('content-type') ?? '';
    const expected = asset.endsWith('.css') ? /text\/css/ : /javascript/;
    if (!result.ok || !expected.test(type)) {
      throw new Error(`${asset}: HTTP ${result.status}, ${type}`);
    }
    await result.arrayBuffer();
  }
  console.log(`${path}: HTTP 200, ${assets.length} CSS/JS assets OK`);
}
