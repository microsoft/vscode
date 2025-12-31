/**
 * AriaTelemetry - Telemetry service for Aria mode and tool usage
 *
 * Provides:
 * - Event tracking for mode switches, tool invocations, and plans
 * - Batched event transmission
 * - Integration with VS Code telemetry and D3N analytics
 * - Privacy-preserving data collection
 */

import { EventEmitter } from 'events';
import type {
  TelemetryEvent,
  ModeSwitchEvent,
  ModeSessionEvent,
  ToolInvocationEvent,
  PlanLifecycleEvent,
  PlanItemEvent,
  PlanExecutionEvent,
  AutoModeDetectEvent,
  FeatureUsageEvent,
} from './events';
import {
  createModeSwitchEvent,
  createToolInvocationEvent,
  createPlanLifecycleEvent,
  createAutoModeDetectEvent,
  sanitizeEvent,
} from './events';
import type { AriaModeId, PlanItemStatus } from '../modes/types';

// =============================================================================
// Configuration
// =============================================================================

export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;

  /** Minimum batch size before sending */
  batchSize: number;

  /** Maximum time to wait before sending batch (ms) */
  flushInterval: number;

  /** D3N analytics endpoint */
  d3nEndpoint?: string;

  /** Whether to log events to console (development) */
  debug: boolean;

  /** Sampling rate (0-1) for high-frequency events */
  samplingRate: number;
}

const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  batchSize: 10,
  flushInterval: 30000, // 30 seconds
  debug: false,
  samplingRate: 1.0,
};

// =============================================================================
// Telemetry Service
// =============================================================================

/**
 * AriaTelemetry manages all telemetry collection and transmission
 */
export class AriaTelemetry extends EventEmitter {
  private static instance: AriaTelemetry;
  private config: TelemetryConfig;
  private eventQueue: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionId: string;
  private workspaceId?: string;

  // Mode session tracking
  private modeSessionStart: Map<AriaModeId, number> = new Map();
  private modeMessageCount: Map<AriaModeId, number> = new Map();
  private modeToolCount: Map<AriaModeId, number> = new Map();

  private constructor(config?: Partial<TelemetryConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();

    if (this.config.enabled && this.config.flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<TelemetryConfig>): AriaTelemetry {
    if (!AriaTelemetry.instance) {
      AriaTelemetry.instance = new AriaTelemetry(config);
    }
    return AriaTelemetry.instance;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };

    if (!this.config.enabled) {
      this.stopFlushTimer();
      this.eventQueue = [];
    } else if (!this.flushTimer) {
      this.startFlushTimer();
    }
  }

  /**
   * Set workspace ID for event attribution
   */
  setWorkspaceId(workspaceId: string): void {
    // Hash for privacy
    this.workspaceId = this.hashString(workspaceId);
  }

  // ===========================================================================
  // Event Tracking Methods
  // ===========================================================================

  /**
   * Track a mode switch
   */
  trackModeSwitch(
    fromMode: AriaModeId,
    toMode: AriaModeId,
    trigger: 'user' | 'auto' | 'system',
    options?: {
      autoDetectContext?: string;
      autoDetectConfidence?: number;
    }
  ): void {
    // End previous mode session
    this.endModeSession(fromMode);

    // Calculate duration in previous mode
    const previousModeDuration = this.modeSessionStart.has(fromMode)
      ? Date.now() - (this.modeSessionStart.get(fromMode) || Date.now())
      : 0;

    // Start new mode session
    this.startModeSession(toMode);

    const event = createModeSwitchEvent(
      this.sessionId,
      fromMode,
      toMode,
      trigger,
      previousModeDuration,
      {
        workspaceId: this.workspaceId,
        ...options,
      }
    );

    this.queueEvent(event);
  }

  /**
   * Track a tool invocation
   */
  trackToolInvocation(
    toolId: string,
    category: string,
    mode: AriaModeId,
    success: boolean,
    executionTimeMs: number,
    options?: {
      errorType?: string;
      requiredConfirmation?: boolean;
      userApproved?: boolean;
    }
  ): void {
    // Increment mode tool count
    this.modeToolCount.set(
      mode,
      (this.modeToolCount.get(mode) || 0) + 1
    );

    const event = createToolInvocationEvent(
      this.sessionId,
      toolId,
      category,
      mode,
      success,
      executionTimeMs,
      {
        workspaceId: this.workspaceId,
        ...options,
      }
    );

    this.queueEvent(event);
  }

  /**
   * Track plan lifecycle events
   */
  trackPlanEvent(
    planId: string,
    action: PlanLifecycleEvent['action'],
    createdByMode: AriaModeId,
    itemCount: number,
    options?: {
      completedItemCount?: number;
      durationMs?: number;
    }
  ): void {
    const event = createPlanLifecycleEvent(
      this.sessionId,
      planId,
      action,
      createdByMode,
      itemCount,
      {
        workspaceId: this.workspaceId,
        ...options,
      }
    );

    this.queueEvent(event);
  }

  /**
   * Track plan item status change
   */
  trackPlanItemChange(
    planId: string,
    itemId: string,
    fromStatus: PlanItemStatus,
    toStatus: PlanItemStatus,
    options?: {
      timeSpentMs?: number;
      toolsUsed?: string[];
    }
  ): void {
    const event: PlanItemEvent = {
      type: 'plan_item',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      planId: this.hashString(planId),
      itemId: this.hashString(itemId),
      fromStatus,
      toStatus,
      timeSpentMs: options?.timeSpentMs,
      toolsUsed: options?.toolsUsed,
    };

    this.queueEvent(event);
  }

  /**
   * Track plan execution
   */
  trackPlanExecution(
    planId: string,
    action: PlanExecutionEvent['action'],
    options?: {
      itemsExecuted?: number;
      itemsFailed?: number;
      totalDurationMs?: number;
      errorMessage?: string;
    }
  ): void {
    const event: PlanExecutionEvent = {
      type: 'plan_execution',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      planId: this.hashString(planId),
      action,
      ...options,
    };

    this.queueEvent(event);
  }

  /**
   * Track auto mode detection
   */
  trackAutoModeDetect(
    queryLength: number,
    detectedMode: AriaModeId,
    confidence: number,
    matchedKeywordCount: number,
    accepted: boolean,
    userSelectedMode?: AriaModeId
  ): void {
    const event = createAutoModeDetectEvent(
      this.sessionId,
      queryLength,
      detectedMode,
      confidence,
      matchedKeywordCount,
      accepted,
      {
        workspaceId: this.workspaceId,
        userSelectedMode,
      }
    );

    this.queueEvent(event);
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(
    feature: FeatureUsageEvent['feature'],
    context?: Record<string, string | number | boolean>
  ): void {
    const event: FeatureUsageEvent = {
      type: 'feature_usage',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      feature,
      context,
    };

    this.queueEvent(event);
  }

  /**
   * Track a message being sent in current mode
   */
  trackMessage(mode: AriaModeId): void {
    this.modeMessageCount.set(
      mode,
      (this.modeMessageCount.get(mode) || 0) + 1
    );
  }

  // ===========================================================================
  // Mode Session Management
  // ===========================================================================

  private startModeSession(mode: AriaModeId): void {
    this.modeSessionStart.set(mode, Date.now());
    this.modeMessageCount.set(mode, 0);
    this.modeToolCount.set(mode, 0);
  }

  private endModeSession(mode: AriaModeId): void {
    const startTime = this.modeSessionStart.get(mode);
    if (!startTime) return;

    const duration = Date.now() - startTime;
    const messageCount = this.modeMessageCount.get(mode) || 0;
    const toolCount = this.modeToolCount.get(mode) || 0;

    const event: ModeSessionEvent = {
      type: 'mode_session',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      mode,
      duration,
      messageCount,
      toolInvocationCount: toolCount,
      planCreated: false, // TODO: Track this properly
    };

    this.queueEvent(event);

    // Clear session data
    this.modeSessionStart.delete(mode);
    this.modeMessageCount.delete(mode);
    this.modeToolCount.delete(mode);
  }

  // ===========================================================================
  // Event Queue Management
  // ===========================================================================

  private queueEvent(event: TelemetryEvent): void {
    if (!this.config.enabled) return;

    // Apply sampling for high-frequency events
    if (event.type === 'tool_invocation' || event.type === 'plan_item') {
      if (Math.random() > this.config.samplingRate) {
        return;
      }
    }

    // Sanitize and queue
    const sanitized = sanitizeEvent(event);
    this.eventQueue.push(sanitized);

    if (this.config.debug) {
      console.log('[AriaTelemetry]', sanitized.type, sanitized);
    }

    // Emit for local listeners
    this.emit('event', sanitized);

    // Flush if batch size reached
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush queued events
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.transmitEvents(events);
    } catch (error) {
      console.error('[AriaTelemetry] Failed to transmit events:', error);
      // Re-queue events on failure (with limit to prevent memory issues)
      if (this.eventQueue.length < 100) {
        this.eventQueue.unshift(...events);
      }
    }
  }

  /**
   * Transmit events to backends
   */
  private async transmitEvents(events: TelemetryEvent[]): Promise<void> {
    // Emit for VS Code telemetry integration
    this.emit('batch', events);

    // Send to D3N analytics if configured
    if (this.config.d3nEndpoint) {
      try {
        await fetch(this.config.d3nEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source: 'logos-aria',
            events,
          }),
        });
      } catch (error) {
        if (this.config.debug) {
          console.warn('[AriaTelemetry] D3N transmission failed:', error);
        }
      }
    }

    if (this.config.debug) {
      console.log(`[AriaTelemetry] Flushed ${events.length} events`);
    }
  }

  // ===========================================================================
  // Timer Management
  // ===========================================================================

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private generateSessionId(): string {
    return `aria-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get current telemetry stats
   */
  getStats(): {
    enabled: boolean;
    queueSize: number;
    sessionId: string;
  } {
    return {
      enabled: this.config.enabled,
      queueSize: this.eventQueue.length,
      sessionId: this.sessionId,
    };
  }

  /**
   * Dispose of the telemetry service
   */
  dispose(): void {
    this.stopFlushTimer();
    this.flush();
    this.removeAllListeners();
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const ariaTelemetry = AriaTelemetry.getInstance();

export default AriaTelemetry;

