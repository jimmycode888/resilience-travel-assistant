import type { AddressPlace } from '../geo/address-search';
import type { JourneyMode, LonLat } from '../types/journey';
export type TransitPoint = Pick<AddressPlace, 'name' | 'lat' | 'lon' | 'side'>;
export interface TransitLeg {
  mode: JourneyMode;
  line: string | null;
  from: TransitPoint;
  to: TransitPoint;
  minutes: number;
  geometry: LonLat[];
  /** No road geometry is published by the HK feed. */
  approximate?: boolean;
  waitMinutes?: number;
}
export interface TransitPlan { legs: TransitLeg[]; minutes: number; notices: string[] }
export class TransitError extends Error {
  constructor(public code: 'MISSING_KEY' | 'PROVIDER_ERROR' | 'NO_ROUTE' | 'WALK_UNVERIFIED' | 'DATA_UNAVAILABLE', message: string) { super(message); }
}
export interface HkStop { id: string; name: string; lat: number; lon: number }
export interface HkPattern {
  id: string; line: string; mode: JourneyMode; stops: number[]; offsets: number[];
  pickup: boolean[]; dropoff: boolean[]; approximate: boolean;
  runs: [string, number, number, number][];
}
export interface HkNetwork {
  meta: { sourceUrl: string; datasetUrl: string; importedAt: string; feedDate: string; stopCount: number; routeCount: number; patternCount: number; limitations: string[] };
  stops: HkStop[]; patterns: HkPattern[];
  calendar: Record<string, { days: number[]; start: string; end: string }>;
  exceptions: Record<string, Record<string, number>>;
}
