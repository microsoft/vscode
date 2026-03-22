---
description: Architecture documentation for remote agent host connections. Use when working in `src/vs/sessions/contrib/remoteAgentHost`
applyTo: src/vs/sessions/contrib/remoteAgentHost/**
---

# Remote Agent Host

The remote agent host feature connects the sessions app to agent host processes running on other machines over WebSocket.

## Key Files

- `ARCHITECTURE.md` - full architecture documentation (URI conventions, registration flow, data flow diagram)
- `REMOTE_AGENT_HOST_RECONNECTION.md` - reconnection lifecycle spec (15 numbered requirements)
- `browser/remoteAgentHost.contribution.ts` - central orchestrator
- `browser/agentHostFileSystemProvider.ts` - read-only FS provider for remote browsing

## Architecture Documentation

When making changes to this feature area, **review and update `ARCHITECTURE.md`** if your changes affect:

- Connection lifecycle (connect, disconnect, reconnect)
- Agent registration flow
- URI conventions or naming
- Session creation flow
- The data flow diagram

The doc lives at `src/vs/sessions/contrib/remoteAgentHost/ARCHITECTURE.md`.

## Related Code Outside This Folder

- `src/vs/platform/agentHost/common/remoteAgentHostService.ts` - service interface (`IRemoteAgentHostService`)
- `src/vs/platform/agentHost/electron-browser/remoteAgentHostServiceImpl.ts` - Electron implementation
- `src/vs/platform/agentHost/electron-browser/remoteAgentHostProtocolClient.ts` - WebSocket protocol client
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionListController.ts` - session list sidebar
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts` - session content provider
