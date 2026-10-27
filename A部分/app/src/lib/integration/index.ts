/** A's public integration entry. Import this in B/C server orchestration. */
export { createTeamJourneyService } from './service';
export { resolveRoutes, createMemoryRouteCache } from '@/lib/route/adapter';
export { parseRawJourney } from '@/lib/route/parse';
export { assessRouteRisk } from '@/lib/risk/engine';
export { assessReliability } from '@/lib/reliability/engine';
export { rankCandidates, rankRoutes } from '@/lib/reliability/ranking';
export { journeyGeometry, borderSegments } from '@/lib/types/journey';
export type * from '@/lib/types/team-integration';
export { REFERENCE_JOURNEY_VISUALS } from './ui-contract';
export type { JourneyVisualSpec, RiskVisualToken } from './ui-contract';
