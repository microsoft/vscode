/**
 * Aria Telemetry Events
 *
 * Defines all telemetry events for tracking Aria mode usage,
 * tool invocations, and planning system interactions.
 */

import type { AriaModeId, PlanItemStatus } from '../modes/types';

// =============================================================================
// Event Types
// =============================================================================

/**
 * Base interface for all telemetry events
 */
export interface TelemetryEventBase {
  /** Event timestamp */
  timestamp: number;

  /** Unique session identifier */
  sessionId: string;

  /** Workspace identifier (hashed) */
  workspaceId?: string;
}

/**
 * Mode switch event - tracks when users change Aria modes
 */
export interface ModeSwitchEvent extends TelemetryEventBase {
  type: 'mode_switch';

  /** Mode switched from */
  fromMode: AriaModeId;

  /** Mode switched to */
  toMode: AriaModeId;

  /** How the switch was triggered */
  trigger: 'user' | 'auto' | 'system';

  /** For auto-switches, the detected context */
  autoDetectContext?: string;

  /** Confidence score for auto-detection (0-1) */
  autoDetectConfidence?: number;

  /** Duration in previous mode (ms) */
  previousModeDuration: number;
}

/**
 * Mode session event - tracks mode usage duration
 */
export interface ModeSessionEvent extends TelemetryEventBase {
  type: 'mode_session';

  /** The mode that was active */
  mode: AriaModeId;

  /** How long the mode was active (ms) */
  duration: number;

  /** Number of messages sent in this mode session */
  messageCount: number;

  /** Number of tool invocations in this mode session */
  toolInvocationCount: number;

  /** Whether a plan was created in this session */
  planCreated: boolean;
}

/**
 * Tool invocation event - tracks tool usage
 */
export interface ToolInvocationEvent extends TelemetryEventBase {
  type: 'tool_invocation';

  /** Tool identifier */
  toolId: string;

  /** Tool category */
  category: string;

  /** Current Aria mode */
  mode: AriaModeId;

  /** Whether the invocation succeeded */
  success: boolean;

  /** Error type if failed */
  errorType?: string;

  /** Execution time (ms) */
  executionTimeMs: number;

  /** Whether user confirmation was required */
  requiredConfirmation: boolean;

  /** Whether user approved (if confirmation required) */
  userApproved?: boolean;
}

/**
 * Plan lifecycle event - tracks plan creation and completion
 */
export interface PlanLifecycleEvent extends TelemetryEventBase {
  type: 'plan_lifecycle';

  /** Plan identifier (hashed) */
  planId: string;

  /** Lifecycle action */
  action: 'created' | 'completed' | 'cancelled' | 'deleted' | 'imported' | 'exported';

  /** Mode that created the plan */
  createdByMode: AriaModeId;

  /** Number of items in the plan */
  itemCount: number;

  /** Number of completed items (for completed/cancelled) */
  completedItemCount?: number;

  /** Duration from creation to completion (ms) */
  durationMs?: number;
}

/**
 * Plan item event - tracks individual plan item progress
 */
export interface PlanItemEvent extends TelemetryEventBase {
  type: 'plan_item';

  /** Plan identifier (hashed) */
  planId: string;

  /** Item identifier (hashed) */
  itemId: string;

  /** Status change */
  fromStatus: PlanItemStatus;
  toStatus: PlanItemStatus;

  /** Time spent on this item (ms) */
  timeSpentMs?: number;

  /** Tools used for this item */
  toolsUsed?: string[];
}

/**
 * Plan execution event - tracks automated plan execution
 */
export interface PlanExecutionEvent extends TelemetryEventBase {
  type: 'plan_execution';

  /** Plan identifier (hashed) */
  planId: string;

  /** Execution action */
  action: 'started' | 'paused' | 'resumed' | 'completed' | 'failed' | 'cancelled';

  /** Number of items executed */
  itemsExecuted?: number;

  /** Number of items that failed */
  itemsFailed?: number;

  /** Total execution time (ms) */
  totalDurationMs?: number;

  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Auto mode detection event - tracks accuracy of auto-detection
 */
export interface AutoModeDetectEvent extends TelemetryEventBase {
  type: 'auto_mode_detect';

  /** Query that triggered detection (hashed/anonymized) */
  queryLength: number;

  /** Detected mode */
  detectedMode: AriaModeId;

  /** Confidence score (0-1) */
  confidence: number;

  /** Keywords that matched */
  matchedKeywordCount: number;

  /** Whether user accepted the suggestion */
  accepted: boolean;

  /** Mode user switched to (if different) */
  userSelectedMode?: AriaModeId;
}

/**
 * Feature usage event - tracks general feature usage
 */
export interface FeatureUsageEvent extends TelemetryEventBase {
  type: 'feature_usage';

  /** Feature identifier */
  feature:
    | 'mode_selector'
    | 'plan_viewer'
    | 'plan_export'
    | 'plan_import'
    | 'auto_mode_toggle'
    | 'keyboard_shortcut'
    | 'tool_confirmation_dialog';

  /** Additional context */
  context?: Record<string, string | number | boolean>;
}

/**
 * Union type of all telemetry events
 */
export type TelemetryEvent =
  | ModeSwitchEvent
  | ModeSessionEvent
  | ToolInvocationEvent
  | PlanLifecycleEvent
  | PlanItemEvent
  | PlanExecutionEvent
  | AutoModeDetectEvent
  | FeatureUsageEvent;

// =============================================================================
// Event Creation Helpers
// =============================================================================

/**
 * Create base event properties
 */
export function createBaseEvent(sessionId: string, workspaceId?: string): TelemetryEventBase {
  return {
    timestamp: Date.now(),
    sessionId,
    workspaceId,
  };
}

/**
 * Create a mode switch event
 */
export function createModeSwitchEvent(
  sessionId: string,
  fromMode: AriaModeId,
  toMode: AriaModeId,
  trigger: 'user' | 'auto' | 'system',
  previousModeDuration: number,
  options?: {
    workspaceId?: string;
    autoDetectContext?: string;
    autoDetectConfidence?: number;
  }
): ModeSwitchEvent {
  return {
    ...createBaseEvent(sessionId, options?.workspaceId),
    type: 'mode_switch',
    fromMode,
    toMode,
    trigger,
    previousModeDuration,
    autoDetectContext: options?.autoDetectContext,
    autoDetectConfidence: options?.autoDetectConfidence,
  };
}

/**
 * Create a tool invocation event
 */
export function createToolInvocationEvent(
  sessionId: string,
  toolId: string,
  category: string,
  mode: AriaModeId,
  success: boolean,
  executionTimeMs: number,
  options?: {
    workspaceId?: string;
    errorType?: string;
    requiredConfirmation?: boolean;
    userApproved?: boolean;
  }
): ToolInvocationEvent {
  return {
    ...createBaseEvent(sessionId, options?.workspaceId),
    type: 'tool_invocation',
    toolId,
    category,
    mode,
    success,
    executionTimeMs,
    requiredConfirmation: options?.requiredConfirmation ?? false,
    errorType: options?.errorType,
    userApproved: options?.userApproved,
  };
}

/**
 * Create a plan lifecycle event
 */
export function createPlanLifecycleEvent(
  sessionId: string,
  planId: string,
  action: PlanLifecycleEvent['action'],
  createdByMode: AriaModeId,
  itemCount: number,
  options?: {
    workspaceId?: string;
    completedItemCount?: number;
    durationMs?: number;
  }
): PlanLifecycleEvent {
  return {
    ...createBaseEvent(sessionId, options?.workspaceId),
    type: 'plan_lifecycle',
    planId: hashId(planId),
    action,
    createdByMode,
    itemCount,
    completedItemCount: options?.completedItemCount,
    durationMs: options?.durationMs,
  };
}

/**
 * Create an auto mode detect event
 */
export function createAutoModeDetectEvent(
  sessionId: string,
  queryLength: number,
  detectedMode: AriaModeId,
  confidence: number,
  matchedKeywordCount: number,
  accepted: boolean,
  options?: {
    workspaceId?: string;
    userSelectedMode?: AriaModeId;
  }
): AutoModeDetectEvent {
  return {
    ...createBaseEvent(sessionId, options?.workspaceId),
    type: 'auto_mode_detect',
    queryLength,
    detectedMode,
    confidence,
    matchedKeywordCount,
    accepted,
    userSelectedMode: options?.userSelectedMode,
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Hash an ID for privacy
 */
function hashId(id: string): string {
  // Simple hash for privacy - in production, use proper hashing
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Sanitize event data for transmission
 */
export function sanitizeEvent(event: TelemetryEvent): TelemetryEvent {
  // Remove any potentially sensitive data
  const sanitized = { ...event };

  // Hash IDs
  if ('planId' in sanitized && sanitized.planId) {
    sanitized.planId = hashId(sanitized.planId);
  }
  if ('itemId' in sanitized && sanitized.itemId) {
    sanitized.itemId = hashId(sanitized.itemId);
  }

  return sanitized;
}

