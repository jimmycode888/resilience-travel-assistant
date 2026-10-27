/** Compile-checked example: B/C replace these functions; A's algorithms stay unchanged. */
import { createTeamJourneyService, resolveRoutes } from '@/lib/integration';
import type { TeamJourneyModules } from '@/lib/types/team-integration';

const modules: TeamJourneyModules = {
  resolveCandidates: async query => (await resolveRoutes({ query, providers: [] })).resolution,
  // B: replace null with a RouteDataEnvelope from actual sources and explicit per-route scope.
  // C: merge crowd / border signals into value.crowd / value.border when available.
  resolveRouteData: async () => null,
  // C: replace this conservative example with its engine, departure model and evidence.
  decide: async core => ({
    action: core.recommendedRouteId ? 'go' : 'unavailable',
    primaryRouteId: core.recommendedRouteId,
    backupRouteIds: [], departureWindow: null, explanations: [],
    notices: ['接入範例：尚無 C 的正式模型；沒有自動生成出發窗口。'],
  }),
};

export const evaluateTeamJourney = createTeamJourneyService(modules);
// In a server API handler, pass validated request and a single injected clock value:
// const result = await evaluateTeamJourney(request, toHkIso(Date.now()));
// D: render result.routes[].candidate.journey.geometry/segments plus assessment.
// This example is not automatically registered in /api/journey, which remains the offline demo.
