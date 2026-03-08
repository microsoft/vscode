# Tier 2 Modification: Terminal Output Capture

## Capability

Expose a structured terminal output stream that agents can subscribe to for real-time command output. This replaces the dual `child_process`/terminal execution path with a unified approach.

## Files Modified

- `src/vs/workbench/contrib/terminal/common/terminal.ts` — Add `ITerminalOutputEvent` interface and event to `ITerminalService`
- `src/vs/workbench/contrib/terminal/browser/terminalService.ts` — Implement the output event emitter

## Changes

### In `terminal.ts` (interface addition)
```typescript
// SON-OF-ANTON: Tier 2 modification — structured terminal output events
export interface ITerminalOutputEvent {
    readonly terminalId: number;
    readonly data: string;
    readonly timestamp: number;
}
```

Add to `ITerminalService`:
```typescript
// SON-OF-ANTON: Tier 2 modification — terminal output stream for agent consumption
readonly onDidReceiveTerminalOutput: Event<ITerminalOutputEvent>;
```

### In `terminalService.ts` (implementation)
- Add an `Emitter<ITerminalOutputEvent>` that fires when terminal process data arrives
- Hook into the existing `onProcessData` handler for each terminal instance
- Filter to only emit for terminals tagged as agent-owned (via a terminal environment variable or creation option)

## Merge-cost Assessment

**Low.** Adding a new event to the terminal service interface is additive. The implementation hooks into existing data flow without changing it. Upstream changes to terminal internals rarely affect the service interface.

## Alternatives Considered

1. **Proposed API `onDidWriteTerminalData`** — Already exists but is not stable. We could enable it for our fork, but that couples us to a proposed API that may change shape. Rejected: prefer our own stable interface.
2. **PTY proxy** — Intercept the PTY layer directly. Rejected: too invasive (Tier 3), fragile across platforms.
3. **Shell integration** — Use VS Code shell integration to capture command output. Partially viable but doesn't provide real-time streaming. Rejected for real-time use cases.
