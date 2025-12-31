# Logos Telemetry Guide

This document describes the telemetry system for tracking Aria mode usage, tool invocations, and planning system interactions.

## Overview

The AriaTelemetry service provides privacy-preserving analytics for understanding how users interact with Aria modes, tools, and the planning system. All data is anonymized before transmission.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Event Sources                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐         │
│  │ModeRegistry │  │ToolRegistry│  │ PlanningService  │         │
│  └──────┬──────┘  └──────┬─────┘  └────────┬─────────┘         │
│         │                │                  │                   │
│         └───────────┬────┴──────────────────┘                   │
│                     │                                            │
│              ┌──────▼──────┐                                    │
│              │AriaTelemetry│                                    │
│              └──────┬──────┘                                    │
│                     │                                            │
│              ┌──────▼──────┐                                    │
│              │ Event Queue │                                    │
│              └──────┬──────┘                                    │
│                     │                                            │
│         ┌───────────┼───────────┐                               │
│         │           │           │                               │
│   ┌─────▼─────┐ ┌───▼───┐ ┌────▼────┐                          │
│   │VS Code    │ │ D3N   │ │ Local   │                          │
│   │Telemetry  │ │ API   │ │ Logger  │                          │
│   └───────────┘ └───────┘ └─────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

### Enabling/Disabling Telemetry

Telemetry respects VS Code's telemetry settings:

```json
{
  "telemetry.telemetryLevel": "all"  // all, error, crash, off
}
```

### Logos-specific Settings

```json
{
  "logos.telemetry.enabled": true,
  "logos.telemetry.batchSize": 10,
  "logos.telemetry.flushInterval": 30000,
  "logos.telemetry.d3nEndpoint": "https://d3n.bravozero.ai/v1/analytics",
  "logos.telemetry.debug": false,
  "logos.telemetry.samplingRate": 1.0
}
```

### Configuration Interface

```typescript
interface TelemetryConfig {
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
```

## Event Types

### Mode Switch Event

Tracks when users change Aria modes.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'mode_switch'` | Event type identifier |
| `fromMode` | `AriaModeId` | Mode switched from |
| `toMode` | `AriaModeId` | Mode switched to |
| `trigger` | `'user' \| 'auto' \| 'system'` | How the switch was triggered |
| `previousModeDuration` | `number` | Time in previous mode (ms) |
| `autoDetectContext` | `string?` | Context for auto-detection |
| `autoDetectConfidence` | `number?` | Confidence score (0-1) |

**Example:**

```typescript
ariaTelemetry.trackModeSwitch('agent', 'debug', 'auto', {
  autoDetectContext: 'User query contains error keywords',
  autoDetectConfidence: 0.85,
});
```

### Mode Session Event

Tracks mode usage duration and activity.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'mode_session'` | Event type identifier |
| `mode` | `AriaModeId` | The mode that was active |
| `duration` | `number` | How long the mode was active (ms) |
| `messageCount` | `number` | Messages sent in this session |
| `toolInvocationCount` | `number` | Tools invoked in this session |
| `planCreated` | `boolean` | Whether a plan was created |

### Tool Invocation Event

Tracks tool usage and performance.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'tool_invocation'` | Event type identifier |
| `toolId` | `string` | Tool identifier |
| `category` | `string` | Tool category |
| `mode` | `AriaModeId` | Current Aria mode |
| `success` | `boolean` | Whether invocation succeeded |
| `errorType` | `string?` | Error type if failed |
| `executionTimeMs` | `number` | Execution time (ms) |
| `requiredConfirmation` | `boolean` | Whether confirmation was required |
| `userApproved` | `boolean?` | Whether user approved |

**Example:**

```typescript
ariaTelemetry.trackToolInvocation(
  'write_file',
  'file',
  'agent',
  true,
  150,
  {
    requiredConfirmation: true,
    userApproved: true,
  }
);
```

### Plan Lifecycle Event

Tracks plan creation and completion.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'plan_lifecycle'` | Event type identifier |
| `planId` | `string` | Plan identifier (hashed) |
| `action` | `string` | created, completed, cancelled, deleted, imported, exported |
| `createdByMode` | `AriaModeId` | Mode that created the plan |
| `itemCount` | `number` | Number of items in plan |
| `completedItemCount` | `number?` | Number of completed items |
| `durationMs` | `number?` | Time from creation to completion |

**Example:**

```typescript
ariaTelemetry.trackPlanEvent(
  'plan-123',
  'completed',
  'plan',
  5,
  {
    completedItemCount: 5,
    durationMs: 3600000,
  }
);
```

### Plan Item Event

Tracks individual plan item progress.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'plan_item'` | Event type identifier |
| `planId` | `string` | Plan identifier (hashed) |
| `itemId` | `string` | Item identifier (hashed) |
| `fromStatus` | `PlanItemStatus` | Previous status |
| `toStatus` | `PlanItemStatus` | New status |
| `timeSpentMs` | `number?` | Time spent on item |
| `toolsUsed` | `string[]?` | Tools used for item |

### Plan Execution Event

Tracks automated plan execution.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'plan_execution'` | Event type identifier |
| `planId` | `string` | Plan identifier (hashed) |
| `action` | `string` | started, paused, resumed, completed, failed, cancelled |
| `itemsExecuted` | `number?` | Number of items executed |
| `itemsFailed` | `number?` | Number of items that failed |
| `totalDurationMs` | `number?` | Total execution time |
| `errorMessage` | `string?` | Error message if failed |

### Auto Mode Detect Event

Tracks accuracy of auto-detection.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'auto_mode_detect'` | Event type identifier |
| `queryLength` | `number` | Length of user query |
| `detectedMode` | `AriaModeId` | Detected mode |
| `confidence` | `number` | Confidence score (0-1) |
| `matchedKeywordCount` | `number` | Keywords that matched |
| `accepted` | `boolean` | Whether user accepted suggestion |
| `userSelectedMode` | `AriaModeId?` | Mode user selected instead |

### Feature Usage Event

Tracks general feature usage.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'feature_usage'` | Event type identifier |
| `feature` | `string` | Feature identifier |
| `context` | `object?` | Additional context |

**Features tracked:**
- `mode_selector`
- `plan_viewer`
- `plan_export`
- `plan_import`
- `auto_mode_toggle`
- `keyboard_shortcut`
- `tool_confirmation_dialog`

## API Reference

### AriaTelemetry Class

```typescript
class AriaTelemetry {
  // Get singleton instance
  static getInstance(config?: Partial<TelemetryConfig>): AriaTelemetry;

  // Configuration
  updateConfig(config: Partial<TelemetryConfig>): void;
  setWorkspaceId(workspaceId: string): void;

  // Event Tracking
  trackModeSwitch(
    fromMode: AriaModeId,
    toMode: AriaModeId,
    trigger: 'user' | 'auto' | 'system',
    options?: { autoDetectContext?: string; autoDetectConfidence?: number }
  ): void;

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
  ): void;

  trackPlanEvent(
    planId: string,
    action: 'created' | 'completed' | 'cancelled' | 'deleted' | 'imported' | 'exported',
    createdByMode: AriaModeId,
    itemCount: number,
    options?: { completedItemCount?: number; durationMs?: number }
  ): void;

  trackPlanItemChange(
    planId: string,
    itemId: string,
    fromStatus: PlanItemStatus,
    toStatus: PlanItemStatus,
    options?: { timeSpentMs?: number; toolsUsed?: string[] }
  ): void;

  trackPlanExecution(
    planId: string,
    action: 'started' | 'paused' | 'resumed' | 'completed' | 'failed' | 'cancelled',
    options?: {
      itemsExecuted?: number;
      itemsFailed?: number;
      totalDurationMs?: number;
      errorMessage?: string;
    }
  ): void;

  trackAutoModeDetect(
    queryLength: number,
    detectedMode: AriaModeId,
    confidence: number,
    matchedKeywordCount: number,
    accepted: boolean,
    userSelectedMode?: AriaModeId
  ): void;

  trackFeatureUsage(
    feature: string,
    context?: Record<string, string | number | boolean>
  ): void;

  trackMessage(mode: AriaModeId): void;

  // Lifecycle
  flush(): Promise<void>;
  getStats(): { enabled: boolean; queueSize: number; sessionId: string };
  dispose(): void;
}
```

### Event Creation Helpers

```typescript
// Create mode switch event
function createModeSwitchEvent(
  sessionId: string,
  fromMode: AriaModeId,
  toMode: AriaModeId,
  trigger: 'user' | 'auto' | 'system',
  previousModeDuration: number,
  options?: { workspaceId?: string; autoDetectContext?: string; autoDetectConfidence?: number }
): ModeSwitchEvent;

// Create tool invocation event
function createToolInvocationEvent(
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
): ToolInvocationEvent;

// Sanitize event data
function sanitizeEvent(event: TelemetryEvent): TelemetryEvent;
```

## Privacy

### Data Anonymization

All identifiers are hashed before transmission:

```typescript
private hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
```

### Data Not Collected

- File contents
- User queries (only length)
- Specific code
- Personal information
- Authentication tokens
- API keys

### Opt-Out

Users can opt out via VS Code settings:

```json
{
  "telemetry.telemetryLevel": "off"
}
```

Or Logos-specific:

```json
{
  "logos.telemetry.enabled": false
}
```

## Sampling

High-frequency events are sampled to reduce data volume:

```typescript
if (event.type === 'tool_invocation' || event.type === 'plan_item') {
  if (Math.random() > this.config.samplingRate) {
    return; // Skip this event
  }
}
```

Configure sampling rate:

```json
{
  "logos.telemetry.samplingRate": 0.1  // 10% sampling
}
```

## Batching

Events are batched before transmission:

- **Batch Size**: 10 events (configurable)
- **Flush Interval**: 30 seconds (configurable)
- **Immediate Flush**: On application close

```typescript
if (this.eventQueue.length >= this.config.batchSize) {
  this.flush();
}
```

## Error Handling

Telemetry failures never break application functionality:

```typescript
try {
  ariaTelemetry.trackModeSwitch(fromMode, toMode, 'user');
} catch (error) {
  // Silently fail - telemetry should not break features
  console.warn('[Telemetry] Tracking failed:', error);
}
```

## Development Mode

Enable debug logging for development:

```json
{
  "logos.telemetry.debug": true
}
```

This logs all events to the console:

```
[AriaTelemetry] mode_switch { fromMode: 'agent', toMode: 'debug', ... }
[AriaTelemetry] tool_invocation { toolId: 'read_file', success: true, ... }
[AriaTelemetry] Flushed 10 events
```

## Metrics Dashboard

### Key Metrics

| Metric | Description | Use Case |
|--------|-------------|----------|
| Mode Switch Rate | Switches per session | UX friction indicator |
| Mode Session Duration | Time in each mode | Feature engagement |
| Tool Success Rate | % successful invocations | Reliability tracking |
| Auto-Detect Accuracy | % accepted suggestions | ML model quality |
| Plan Completion Rate | % plans completed | Feature effectiveness |

### Sample Queries

**Mode usage distribution:**
```sql
SELECT toMode, COUNT(*) as count
FROM mode_switch_events
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY toMode
ORDER BY count DESC
```

**Tool reliability:**
```sql
SELECT toolId,
       COUNT(*) as total,
       SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
       AVG(executionTimeMs) as avgTime
FROM tool_invocation_events
GROUP BY toolId
ORDER BY total DESC
```

**Auto-detect accuracy:**
```sql
SELECT detectedMode,
       COUNT(*) as suggestions,
       SUM(CASE WHEN accepted THEN 1 ELSE 0 END) as accepted,
       AVG(confidence) as avgConfidence
FROM auto_mode_detect_events
GROUP BY detectedMode
```

## Integration with D3N

Telemetry events are transmitted to D3N analytics:

```typescript
if (this.config.d3nEndpoint) {
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
}
```

D3N uses this data for:
- Model improvement
- Tier optimization
- Latency analysis
- Usage patterns

