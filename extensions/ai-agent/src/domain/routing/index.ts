/**
 * Routing Module
 * Phase-based routing for CLI adapter selection
 *
 * Phase 3.4: Phase-based Routing
 */

export { PhaseRouter } from './phaseRouter';
export type { PhaseTransition, PhaseRouterOptions } from './phaseRouter';

export { ConfigLoader, DEFAULT_CONFIG, CONFIG_FILE_NAME } from './configLoader';
export type { ConfigLoadResult } from './configLoader';
