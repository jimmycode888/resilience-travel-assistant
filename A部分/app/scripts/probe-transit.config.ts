import { defineConfig } from 'vitest/config';
import base from '../vitest.config';
export default defineConfig({ ...base, test: { ...base.test, include: ['scripts/probe-transit.test.ts', 'scripts/probe-shenzhen.test.ts'], fileParallelism: false, testTimeout: 300000 } });
