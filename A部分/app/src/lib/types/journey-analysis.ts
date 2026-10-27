import type { CandidateRoute, RouteQuery } from './route';
import type { RouteMode, CrowdSignal } from './risk';
import type { RankedRoute } from './reliability';

export type JourneyScenario = 'normal' | 'heavy_rain' | 'disruption';
export interface JourneyAnalysisRequest extends RouteQuery {
  originPlace?: import('../geo/address-search').AddressPlace;
  destinationPlace?: import('../geo/address-search').AddressPlace;
  routing?: 'demo' | 'transit';
  scenario: JourneyScenario;
  mode: RouteMode;
  arriveBy?: string;
}
export interface AnalyzedJourney {
  candidate: CandidateRoute;
  assessment: RankedRoute;
  crowd: CrowdSignal;
  eligible: boolean;
  exclusions: string[];
  meetsDeadline: boolean | null;
  explanation: string;
}
export interface DepartureOption {
  departAt: string;
  routeId: string | null;
  riskScore: number | null;
  etaRange: [string, string] | null;
  meetsDeadline: boolean | null;
}
export interface JourneyAnalysis {
  request: JourneyAnalysisRequest;
  routes: AnalyzedJourney[];
  recommendedRouteId: string | null;
  action: 'go' | 'hold' | 'unavailable';
  departureOptions: DepartureOption[];
  bestDeparture: DepartureOption | null;
  planB: { routeId: string; trigger: string; reason: string } | null;
  notices: string[];
  quality: 'fixture' | 'cached' | 'live';
  routing?: 'demo' | 'transit';
  coverage?: { status: 'ready' | 'partial' | 'unavailable'; hkStops: number; hkRoutes: number; shenzhenConfigured: boolean; checkedPorts: string[]; failures: { port: string; code: string; message: string }[]; partialPlans?: { port: string; legs: import('../transit/types').TransitLeg[]; minutes: number }[] };
  sources: { label: string; url: string | null; updatedAt: string; note: string }[];
}
