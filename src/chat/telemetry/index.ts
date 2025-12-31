/**
 * Telemetry Module
 *
 * Exports telemetry service and event types for Aria mode tracking.
 */

export { AriaTelemetry, ariaTelemetry, type TelemetryConfig } from './AriaTelemetry';
export {
  type TelemetryEvent,
  type TelemetryEventBase,
  type ModeSwitchEvent,
  type ModeSessionEvent,
  type ToolInvocationEvent,
  type PlanLifecycleEvent,
  type PlanItemEvent,
  type PlanExecutionEvent,
  type AutoModeDetectEvent,
  type FeatureUsageEvent,
  createModeSwitchEvent,
  createToolInvocationEvent,
  createPlanLifecycleEvent,
  createAutoModeDetectEvent,
  sanitizeEvent,
} from './events';

