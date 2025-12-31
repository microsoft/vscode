/**
 * Mode Handlers Module
 *
 * Exports all mode-specific handlers for the Aria chat system.
 */

export { BaseModeHandler, type ModeProcessingResult } from './BaseModeHandler';
export { AgentModeHandler } from './AgentModeHandler';
export { PlanModeHandler } from './PlanModeHandler';
export { DebugModeHandler } from './DebugModeHandler';
export { AskModeHandler } from './AskModeHandler';
export { ResearchModeHandler } from './ResearchModeHandler';
export { CodeReviewModeHandler } from './CodeReviewModeHandler';

import type { AriaModeId, AriaModeConfig } from '../types';
import { BaseModeHandler } from './BaseModeHandler';
import { AgentModeHandler } from './AgentModeHandler';
import { PlanModeHandler } from './PlanModeHandler';
import { DebugModeHandler } from './DebugModeHandler';
import { AskModeHandler } from './AskModeHandler';
import { ResearchModeHandler } from './ResearchModeHandler';
import { CodeReviewModeHandler } from './CodeReviewModeHandler';

/**
 * Create a handler for a specific mode
 */
export function createModeHandler(config: AriaModeConfig): BaseModeHandler {
  switch (config.id) {
    case 'agent':
      return new AgentModeHandler(config);
    case 'plan':
      return new PlanModeHandler(config);
    case 'debug':
      return new DebugModeHandler(config);
    case 'ask':
      return new AskModeHandler(config);
    case 'research':
      return new ResearchModeHandler(config);
    case 'code-review':
      return new CodeReviewModeHandler(config);
    default:
      // Default to agent handler for unknown modes
      return new AgentModeHandler(config);
  }
}

/**
 * Handler registry for caching handlers
 */
const handlerCache = new Map<AriaModeId, BaseModeHandler>();

/**
 * Get or create a handler for a mode
 */
export function getModeHandler(config: AriaModeConfig): BaseModeHandler {
  let handler = handlerCache.get(config.id);
  if (!handler) {
    handler = createModeHandler(config);
    handlerCache.set(config.id, handler);
  }
  return handler;
}

/**
 * Clear the handler cache
 */
export function clearHandlerCache(): void {
  handlerCache.clear();
}


