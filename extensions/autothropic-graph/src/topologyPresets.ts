export interface TopologyPresetInfo {
  id: string;
  label: string;
  description: string;
}

// Preset info is fetched from the agents extension via command
// This module just provides the display data as fallback
export const PRESET_FALLBACK: TopologyPresetInfo[] = [
  { id: 'pipeline', label: 'Pipeline', description: 'Sequential: A → B → C' },
  { id: 'star', label: 'Star (Leader + Workers)', description: 'Leader delegates to N workers' },
  { id: 'fan-out-fan-in', label: 'Fan-out / Fan-in', description: 'Source → parallel Workers → Aggregator' },
  { id: 'review-loop', label: 'Review Loop', description: 'Builder ↔ Reviewer with iteration cap' },
];
