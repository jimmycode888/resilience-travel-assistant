/** E provides this specification; D maps it to CSS/map layers. No risk algorithm belongs here. */
export interface RiskVisualToken { label: string; color: string; symbol: string }
export interface JourneyVisualSpec {
  risk: Record<'low' | 'medium' | 'high' | 'critical', RiskVisualToken>;
  border: { color: string; dashPattern: string; label: string };
  unavailable: RiskVisualToken;
}
/** Reference values for E to replace, not a claim of a finalized design system. */
export const REFERENCE_JOURNEY_VISUALS: JourneyVisualSpec = {
  risk: {
    low: { label: '低風險', color: '#16736b', symbol: '●' },
    medium: { label: '中風險', color: '#b46b0c', symbol: '▲' },
    high: { label: '高風險', color: '#ba4144', symbol: '!' },
    critical: { label: '極高風險', color: '#84282c', symbol: '!!' },
  },
  border: { color: '#8653ad', dashPattern: '7 7', label: '通關段' },
  unavailable: { label: '不可行', color: '#8b99a1', symbol: '×' },
};
