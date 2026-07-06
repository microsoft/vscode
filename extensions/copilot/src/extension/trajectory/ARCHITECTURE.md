# Trajectory Logging Architecture

This document explains the architecture of trajectory logging in VS Code Copilot Chat, 
including how it relates to the existing request logging system.

## Overview

The trajectory logging system captures agent execution traces in the **ATIF (Agent Trajectory 
Interchange Format)** for analysis, debugging, and potential benchmarking. It builds on top 
of the existing `RequestLogger` infrastructure.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Runtime Data Flow                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

  Chat Request                Tool Execution              LLM Response
       │                            │                          │
       ▼                            ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            RequestLogger                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  _entries: LoggedInfo[]  (bounded by RequestLoggerMaxEntries)           │    │
│  │  ├── LoggedRequestInfo { id, entry: LoggedRequest, token }              │    │
│  │  ├── LoggedToolCall { id, name, args, response, token }                 │    │
│  │  └── LoggedElementInfo { id, name, tokens, trace, token }               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                     │                                            │
│                          onDidChangeRequests (Event)                             │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       TrajectoryLoggerAdapter                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  TRACKING STATE (⚠️ UNBOUNDED - Memory Leak Risk)                       │    │
│  │  ├── processedEntries: Set<string>         # entry IDs already synced   │    │
│  │  ├── processedToolCalls: Set<string>       # tool call IDs processed    │    │
│  │  ├── lastUserMessageBySession: Map<sessionId, hash>                     │    │
│  │  ├── requestToStepContext: Map<requestId, StepInfo>                     │    │
│  │  └── runSubagentToolCallToSessionId: Map<toolCallId, sessionId>         │    │
│  │                                                                          │    │
│  │  TOKEN MAPPING (WeakMap - GC-friendly)                                   │    │
│  │  ├── sessionMap: WeakMap<CapturingToken, sessionId>                     │    │
│  │  └── tokenToSessionId: WeakMap<CapturingToken, sessionId>               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                     │                                            │
│                          Converts LoggedInfo → TrajectoryStep                    │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TrajectoryLogger                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  TRAJECTORY STORAGE (⚠️ UNBOUNDED)                                      │    │
│  │  ├── trajectories: Map<sessionId, TrajectoryBuilder>                    │    │
│  │  │       └── steps: ITrajectoryStep[]                                   │    │
│  │  └── subagentTrajectories: Map<sessionId, IAgentTrajectory>             │    │
│  │                                                                          │    │
│  │  currentSessionId: string | undefined                                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### 1. RequestLogger (`src/extension/prompt/vscode-node/requestLoggerImpl.ts`)

**Purpose**: Captures all LLM requests, tool calls, and prompt traces for debugging.

**Storage Pattern**: 
- **Bounded array** with configurable max size (`RequestLoggerMaxEntries`)
- Old entries are shifted out when limit is reached
- Uses `AsyncLocalStorage` to associate requests with `CapturingToken`

```typescript
// Bounded storage - old entries evicted
private readonly _entries: LoggedInfo[] = [];

private async _addEntry(entry: LoggedInfo): Promise<boolean> {
    this._entries.push(entry);
    const maxEntries = this._configService.getConfig(ConfigKey.Advanced.RequestLoggerMaxEntries);
    if (this._entries.length > maxEntries) {
        this._entries.shift();  // ✅ Bounded - evicts oldest
    }
    // ...
}
```

### 2. TrajectoryLogger (`src/platform/trajectory/node/trajectoryLogger.ts`)

**Purpose**: Builds structured trajectory objects in ATIF format.

**Storage Pattern**:
- **Unbounded Maps** - trajectories persist until explicit `clearTrajectory()` call
- Each session gets its own `TrajectoryBuilder`
- Steps accumulate within builders

```typescript
// ⚠️ Unbounded storage - never auto-cleared
private readonly trajectories = new Map<string, TrajectoryBuilder>();
private subagentTrajectories = new Map<string, IAgentTrajectory>();
```

### 3. TrajectoryLoggerAdapter (`src/platform/trajectory/node/trajectoryLoggerAdapter.ts`)

**Purpose**: Bridge between RequestLogger events and TrajectoryLogger.

**Storage Pattern**:
- **WeakMaps** for token→sessionId mapping (GC-friendly ✅)
- **Sets/Maps** for deduplication tracking (⚠️ Unbounded)

```typescript
// ✅ GC-friendly - tokens can be collected
private sessionMap = new WeakMap<CapturingToken, string>();
private tokenToSessionId = new WeakMap<CapturingToken, string>();

// ⚠️ UNBOUNDED - grows indefinitely
private processedEntries = new Set<string>();      // entry.id strings
private processedToolCalls = new Set<string>();    // tool call ID strings
private lastUserMessageBySession = new Map<string, string>();
private requestToStepContext = new Map<string, {...}>();
private runSubagentToolCallToSessionId = new Map<string, string>();
```

## Data Flow Sequence

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         Sequence: Agent Request Flow                            │
└────────────────────────────────────────────────────────────────────────────────┘

User Input ────┐
               │
               ▼
┌──────────────────────────┐
│   captureInvocation()    │  CapturingToken created with:
│   with CapturingToken    │  - chatSessionId (if main chat)
└──────────────────────────┘  - subAgentInvocationId (if subagent)
               │
               ▼
┌──────────────────────────┐
│   LLM Request Sent       │
│ logChatRequest() called  │
└──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  RequestLogger._addEntry │  LoggedRequestInfo stored
│  fires onDidChangeReqs   │  (bounded, oldest evicted)
└──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  Adapter.syncTrajectories│  Iterates all RequestLogger entries
│                          │  Skips if entry.id in processedEntries
└──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  TrajectoryLogger        │
│  .startTrajectory()      │  Creates/updates TrajectoryBuilder
│  .beginAgentStep()       │  Adds step to builder
└──────────────────────────┘
               │
               ▼
┌──────────────────────────┐   If LLM response includes tool calls:
│  Tool Execution          │   - logToolCall() → RequestLogger
│                          │   - Adapter processes as observation
└──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  Trajectory Complete     │  getAllTrajectories() returns
│  (on export)             │  Map<sessionId, IAgentTrajectory>
└──────────────────────────┘
```

## Session ID Resolution

The adapter determines session IDs with the following priority:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Session ID Priority                          │
├─────────────────────────────────────────────────────────────────┤
│  1. token.subAgentInvocationId  │  Explicit subagent linking   │
│  2. token.chatSessionId         │  VS Code chat session ID     │
│  3. generateSessionId(label)    │  Fallback: hash + timestamp  │
└─────────────────────────────────────────────────────────────────┘
```

This enables:
- **Main trajectories**: Use VS Code's chat session ID for 1:1 mapping
- **Subagent trajectories**: Use pre-assigned invocation ID for parent↔child linking
- **Parent references child**: Tool call observation includes `subagent_trajectory_ref`

## Memory Lifecycle Comparison

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                    Memory Growth Over Extension Lifetime                        │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  RequestLogger._entries                                                         │
│  ┌────────────────────────────────────────────┐                                │
│  │████████████████████████████████████████████│ ← Bounded (shifts oldest)      │
│  └────────────────────────────────────────────┘                                │
│       Max = RequestLoggerMaxEntries                                             │
│                                                                                 │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                 │
│  TrajectoryLoggerAdapter.processedEntries                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │████████████████████████████████████████████████████████████████████████████││
│  └────────────────────────────────────────────────────────────────────────────┘│
│       ⚠️ UNBOUNDED - keeps all entry IDs ever seen                             │
│                                                                                 │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                 │
│  TrajectoryLogger.trajectories                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │████████████████████████████████████████████████████████████████████████████││
│  └────────────────────────────────────────────────────────────────────────────┘│
│       ⚠️ UNBOUNDED - accumulates all sessions until clearTrajectory()          │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
                                                                    Time →
```

## The Memory Leak Problem

### Root Cause

When RequestLogger evicts old entries (bounded), the adapter's tracking sets still retain:
- Entry IDs in `processedEntries`
- Tool call IDs in `processedToolCalls`  
- Session data in `lastUserMessageBySession`, `requestToStepContext`, etc.

This creates **orphaned references** that can never be cleaned up.

### Problematic Scenario

```
Time T1: Entry "abc123" logged → adapter tracks in processedEntries
Time T2: RequestLogger evicts "abc123" (hit max entries)
Time T3: processedEntries still contains "abc123" forever ❌

Result: Set grows unboundedly with orphaned string IDs
```

## Proposed Fix: Session-Scoped Cleanup

Add lifecycle management to clear adapter state when trajectories are cleared:

```typescript
// In TrajectoryLoggerAdapter
public clearSessionState(sessionId?: string): void {
    if (sessionId) {
        // Clear session-specific data
        this.lastUserMessageBySession.delete(sessionId);
        this.pendingStepContexts.delete(sessionId);
        // Clear requestToStepContext entries for this session
        for (const [key, info] of this.requestToStepContext) {
            if (info.sessionId === sessionId) {
                this.requestToStepContext.delete(key);
            }
        }
    } else {
        // Clear all state
        this.processedEntries.clear();
        this.processedToolCalls.clear();
        this.lastUserMessageBySession.clear();
        this.pendingStepContexts.clear();
        this.requestToStepContext.clear();
        this.runSubagentToolCallToSessionId.clear();
    }
}
```

Additionally, add a bounded safety valve (similar to RequestLogger):

```typescript
const MAX_PROCESSED_ENTRIES = 10000;  // Reasonable upper bound

private async syncTrajectories(): Promise<void> {
    // Safety valve: prevent unbounded growth
    if (this.processedEntries.size > MAX_PROCESSED_ENTRIES) {
        // Clear oldest entries (convert to array, slice, rebuild set)
        const entries = [...this.processedEntries];
        this.processedEntries = new Set(entries.slice(-MAX_PROCESSED_ENTRIES / 2));
    }
    // ... rest of sync logic
}
```

## File Structure

```
src/
├── platform/
│   ├── requestLogger/
│   │   ├── common/
│   │   │   └── capturingToken.ts       # Token for grouping requests
│   │   └── node/
│   │       └── requestLogger.ts        # Abstract + interfaces
│   │
│   └── trajectory/
│       ├── common/
│       │   ├── trajectoryLogger.ts     # Interface definition
│       │   └── trajectoryTypes.ts      # ATIF schema types
│       ├── node/
│       │   ├── trajectoryLogger.ts     # Concrete implementation
│       │   └── trajectoryLoggerAdapter.ts  # Bridge to RequestLogger
│       └── test/
│           └── node/
│               └── trajectoryLoggerAdapter.spec.ts
│
└── extension/
    ├── prompt/
    │   └── vscode-node/
    │       └── requestLoggerImpl.ts    # Concrete RequestLogger
    │
    └── trajectory/
        └── vscode-node/
            └── trajectoryExportCommands.ts  # Export commands
```

## Export Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Export Trajectory Command                               │
└─────────────────────────────────────────────────────────────────────────────────┘

    User clicks "Export Trajectory" on tree item
                        │
                        ▼
    ┌───────────────────────────────────┐
    │  Get CapturingToken from treeItem │
    └───────────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────┐
    │  adapter.getSessionIdForToken()   │  WeakMap lookup
    └───────────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────┐
    │  trajectoryLogger.getAllTrajectories() │
    │  → Map<sessionId, IAgentTrajectory>    │
    └───────────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────┐
    │  collectTrajectoryWithSubagents() │  Recursively collect
    │  (follows subagent_trajectory_ref)│  linked subagent trajectories
    └───────────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────┐
    │  Write .trajectory.json files     │
    │  to user-selected folder          │
    └───────────────────────────────────┘
```

## Output Format (ATIF v1.5)

```json
{
  "schema_version": "ATIF-v1.5",
  "session_id": "chat-session-abc123",
  "agent": {
    "name": "GitHub Copilot Chat",
    "version": "1.0.0",
    "tool_definitions": [...]
  },
  "steps": [
    {
      "step_id": 1,
      "timestamp": "2026-01-28T10:00:00.000Z",
      "source": "user",
      "message": "Create a hello world function"
    },
    {
      "step_id": 2,
      "timestamp": "2026-01-28T10:00:01.000Z",
      "source": "agent",
      "model_name": "gpt-4o",
      "message": "I'll create a hello world function.",
      "tool_calls": [
        {
          "tool_call_id": "call_123",
          "function_name": "create_file",
          "arguments": { "filePath": "/hello.ts", "content": "..." }
        }
      ],
      "observation": {
        "results": [
          { "source_call_id": "call_123", "content": "File created successfully" }
        ]
      },
      "metrics": {
        "prompt_tokens": 1500,
        "completion_tokens": 200,
        "duration_ms": 2340
      }
    }
  ],
  "final_metrics": {
    "total_prompt_tokens": 1500,
    "total_completion_tokens": 200,
    "total_steps": 2,
    "total_tool_calls": 1
  }
}
```

## Summary

| Component | Storage Pattern | Bounded? | Cleanup Mechanism |
|-----------|----------------|----------|-------------------|
| RequestLogger._entries | Array | ✅ Yes | Auto-shift oldest |
| TrajectoryLogger.trajectories | Map | ❌ No | Manual clearTrajectory() |
| Adapter.processedEntries | Set | ❌ No | **None (memory leak)** |
| Adapter.processedToolCalls | Set | ❌ No | **None (memory leak)** |
| Adapter.sessionMap | WeakMap | ✅ Yes | GC when token collected |

**Key Insight**: The adapter serves as a "translation layer" that watches RequestLogger events 
and populates TrajectoryLogger. However, its deduplication tracking (Sets/Maps) grows unboundedly, 
creating a memory leak in long-running sessions.
