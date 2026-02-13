# Agent Session Input Needed Notification

## Overview

This feature provides a notification badge in the VS Code command center when agent sessions require user input. It extracts and simplifies the "input needed" notification logic from the experimental unified agents bar, making it production-ready and enabled by default.

## Architecture

### Core Components

1. **agentSessionInputNeededNotification.ts**
   - `AgentSessionInputNeededNotificationWidget`: BaseActionViewItem that renders the notification badge
   - `AgentSessionInputNeededNotificationRendering`: IWorkbenchContribution that manages context keys and lifecycle

2. **agentSessionInputNeededNotificationActions.ts**
   - `OpenInputNeededSessionAction`: Action2 that opens the most urgent session needing input

3. **agentSessionInputNeededNotification.contribution.ts**
   - Registers the contribution and menu items
   - Wires up the command center integration

### Detection Logic

Sessions needing input are detected by filtering for:
- `status === AgentSessionStatus.NeedsInput`
- Not archived (`!s.isArchived()`)
- No open chat widget (`!chatWidgetService.getWidgetBySessionResource(s.resource)`)

The most urgent session is determined by sorting by most recently started request:
```typescript
const timeA = a.timing.lastRequestStarted ?? a.timing.created;
const timeB = b.timing.lastRequestStarted ?? b.timing.created;
return timeB - timeA; // Most recent first
```

### UI Rendering

The notification badge displays:
- **Report icon** (`Codicon.report`) - Indicates warning/attention needed
- **Count** - Number of sessions needing input  
- **Description text** (optional) - Session description or label

Styling uses command center theming:
- Background: `var(--vscode-commandCenter-background)`
- Hover: `var(--vscode-commandCenter-activeBackground)`
- Icon color: `var(--vscode-notificationsWarningIcon-foreground)`

### Context Key Integration

The `chatHasAgentSessionsNeedingInput` context key controls visibility:
- Updated whenever sessions change
- Updated when widgets are added/backgrounded
- Used in `when` clause for menu item visibility

### AI Feature Gating

The feature respects AI feature disabling:
- Checks `ChatContextKeys.enabled` in menu `when` clause
- Checks `IChatEntitlementService.sentiment.hidden` in contribution constructor
- Updates context key to `false` when AI features are disabled

## Configuration

**Setting**: `chat.agentSessions.inputNeeded.notification`

**Default**: `true` (enabled by default)

**Description**: Controls whether a notification badge is shown in the command center when agent sessions need user input. Click the notification to open the session requiring attention.

## Usage

1. When an agent session needs input, a badge appears in the command center
2. The badge shows a report icon and count of sessions needing input
3. Hovering shows a tooltip with session description
4. Clicking opens the most urgent session

## Differences from Experimental Implementation

The original implementation in `agentTitleBarStatusWidget.ts` (unified agents bar experiment) includes:
- Full pill UI with workspace name
- Session type filtering
- Badge filter management
- Complex state management for multiple modes

This extracted implementation:
- **Simpler**: Only shows notification when needed
- **Cleaner**: Focused on single responsibility
- **Production-ready**: No experimental dependencies
- **Enabled by default**: Immediately useful to users
- **Minimal**: Only the essential "input needed" notification logic

## Integration Points

- **Command Center**: Menu item registered to `MenuId.CommandCenter`
- **Order**: 10003 (to the right of agents control at 10002)
- **Condition**: Requires command center to be enabled (`window.commandCenter`)

## Testing

To test manually:
1. Enable agent sessions feature
2. Create a session that transitions to `NeedsInput` status
3. Verify badge appears in command center
4. Click badge to open the session
5. Verify badge disappears when session is opened
6. Disable `chat.agentSessions.inputNeeded.notification` setting
7. Verify badge no longer appears

## Future Improvements

Potential enhancements:
- Show description text inline in badge (currently only in tooltip)
- Add animation when badge appears
- Support for filtering by session type
- Integration with notification center for persistent notifications
