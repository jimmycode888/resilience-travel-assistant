/** A owns the boundary; B=data, C=decisions, D=frontend, E=visual specification. */
import type { Confidence } from './decision';
import type { CandidateRoute, RouteQuality, RouteQuery, RouteResolution } from './route';
import type { RiskContext, RouteMode } from './risk';
import type { RankedRoute } from './reliability';

export interface DataEnvelope<T> {
  value: T;
  source: string;
  sourceUrl: string | null;
  updatedAt: string;
  expiresAt: string;
  confidence: Confidence;
  quality: RouteQuality;
}
export interface TeamJourneyRequest extends RouteQuery {
  mode: RouteMode;
  arriveBy?: string;
}
/** Service must scope every status to the exact candidate, never copy R1 to XB-1. */
export interface RouteDataEnvelope extends DataEnvelope<RiskContext> { routeId: string }
export interface TeamRouteResult {
  candidate: CandidateRoute;
  assessment: RankedRoute;
  eligible: boolean;
  exclusions: string[];
  meetsDeadline: boolean | null;
  data: RouteDataEnvelope | null;
}
export interface TeamCoreResult {
  request: TeamJourneyRequest;
  evaluatedAt: string;
  routes: TeamRouteResult[];
  recommendedRouteId: string | null;
  notices: string[];
}
export interface TeamDecisionResult {
  action: 'go' | 'hold' | 'unavailable';
  primaryRouteId: string | null;
  backupRouteIds: string[];
  departureWindow: { start: string; end: string; confidence: Confidence; evidence: string } | null;
  explanations: { routeId: string; text: string; evidence: string[] }[];
  notices: string[];
}
export interface TeamJourneyResult extends TeamCoreResult { decision: TeamDecisionResult | null }
export interface TeamJourneyModules {
  /** B implements this by calling A's resolveRoutes with its providers and cache. */
  resolveCandidates(query: RouteQuery): Promise<RouteResolution>;
  /** B supplies normalized weather/service/incidents; C's crowd/border may be merged here. */
  resolveRouteData(route: CandidateRoute, request: TeamJourneyRequest): Promise<RouteDataEnvelope | null>;
  /** C consumes completed core scores; it cannot promote a route excluded by A. */
  decide?(core: TeamCoreResult): Promise<TeamDecisionResult>;
}
