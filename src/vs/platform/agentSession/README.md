# Agent Session Native Menu Bar Icon

This feature provides native OS integration for displaying agent session status in the menu bar (macOS), dock (macOS), or system tray (Windows/Linux).

## Overview

The native menu bar icon displays real-time information about agent sessions, including:
- Active sessions count
- Unread sessions count  
- Sessions needing attention count
- Current session title (when in session mode)

## Architecture

### Main Components

1. **AgentSessionStatusMainService** (`src/vs/platform/agentSession/electron-main/agentSessionStatusMainService.ts`)
   - Runs in the Electron main process
   - Manages native OS UI elements (Dock menu, system tray)
   - Updates based on status information from the renderer process

2. **AgentSessionNativeStatusContribution** (`src/vs/workbench/contrib/chat/browser/agentSessions/experiments/agentSessionNativeStatusContribution.ts`)
   - Runs in the workbench renderer process
   - Bridges agentTitleBarStatusService to the main process service
   - Respects AI feature gating via IChatEntitlementService

3. **IPC Communication** (`src/vs/platform/agentSession/common/agentSessionIpc.ts`)
   - Provides communication channel between renderer and main process
   - Uses standard VS Code IPC patterns

### Platform-Specific Behavior

#### macOS
- Updates Dock badge with unread/attention count
- Updates Dock menu with session information
- Can show overlay icon for active sessions

#### Windows/Linux
- Creates system tray icon
- Shows tooltip with session information
- Context menu displays session details

## AI Feature Gating

The feature respects the `chat.disableAIFeatures` setting by:
- Checking `IChatEntitlementService.sentiment.hidden` before displaying status
- Clearing native status when AI features are disabled
- Listening for entitlement changes to update dynamically

## Telemetry

The feature emits telemetry events when native status is updated:
- Event: `agentSessionNativeStatusUpdate`
- Includes: platform, mode, session counts
- Used to track feature adoption and usage patterns

## Future Enhancements

- Custom icons for different session states
- Clickable tray icon to focus specific sessions
- Rich notifications for sessions needing attention
- Platform-specific features (e.g., macOS Notification Center integration)
