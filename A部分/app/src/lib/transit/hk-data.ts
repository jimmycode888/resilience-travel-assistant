import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import type { HkNetwork } from './types';
// Immutable public network snapshot shared by requests, never per-user form state.
let snapshot: Promise<HkNetwork> | undefined;
export function loadHkNetwork(): Promise<HkNetwork> {
  snapshot ??= readFile(path.join(process.cwd(), 'data/transit/hk-network.json.gz')).then(buffer => JSON.parse(gunzipSync(buffer).toString('utf8')) as HkNetwork).catch(error => { snapshot = undefined; throw error; });
  return snapshot;
}
