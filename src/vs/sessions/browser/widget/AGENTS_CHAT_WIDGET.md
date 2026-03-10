# Agent Sessions Chat Surface Architecture

This document describes the **current** chat architecture in the Agent Sessions window.

The earlier wrapper-based `AgentSessionsChatWidget` design no longer matches the codebase. Today, the sessions chat experience is split between a sessions-specific **new-session surface** and the standard workbench **ChatViewPane**.

## Overview

The Chat Bar uses a single container with two panes registered in `src/vs/sessions/contrib/chat/browser/chat.contribution.ts`:

- `NewChatViewPane` when `IsNewChatSessionContext` is `true`
- `ChatViewPane` (from `vs/workbench`) when a real chat session is active

This keeps the empty/new-session flow sessions-specific while reusing the regular chat view after the first request is sent.

## Core Pieces

### `NewChatViewPane` / `NewChatWidget`

**Location:** `src/vs/sessions/contrib/chat/browser/newChatViewPane.ts`

- `NewChatViewPane` is the `ViewPane` registered into the Chat Bar for the new-session state
- `NewChatWidget` is the self-contained UI used inside that pane
- It renders the mascot/welcome state, text editor, send button, attachments, model picker, and option pickers

### Picker Helpers

**Location:** `src/vs/sessions/contrib/chat/browser/`

The new-session surface composes focused helpers instead of a wrapper around `ChatWidget`:

- `sessionTargetPicker.ts` — `SessionTargetPicker`, `IsolationModePicker`
- `folderPicker.ts` — workspace folder selection
- `repoPicker.ts` — repository selection
- `branchPicker.ts` — branch selection
- `modePicker.ts` — chat mode selection
- `modelPicker.ts` — cloud model selection
- `newChatPermissionPicker.ts` — permission picker

### Deferred Session State

**Location:** `src/vs/sessions/contrib/chat/browser/newSession.ts`

- `INewSession` defines the state collected before a real session exists
- `LocalNewSession` handles background/local sessions
- `RemoteNewSession` handles remote/cloud sessions

These classes own the pending query, selected options, repository/worktree context, and other first-request state.

### Session Handoff

**Location:** `src/vs/sessions/contrib/sessions/browser/sessionsManagementService.ts`

`ISessionsManagementService` / `SessionsManagementService` is the source of truth for:

- the current active session
- switching back to the new-session view
- creating a pending `INewSession` for a selected target
- opening an existing session
- sending the first request with gathered `initialSessionOptions`

## Flow

1. `chat.contribution.ts` registers both `NewChatViewPane` and `ChatViewPane` in the Chat Bar.
2. `NewChatWidget` creates or refreshes an `INewSession` for the selected target/provider.
3. The user enters the prompt, chooses options, and attaches context in the sessions-specific UI.
4. On first send, `ISessionsManagementService.sendRequestForNewSession()` creates/opens the real session and forwards the gathered `initialSessionOptions`.
5. Once a real session exists, the standard `ChatViewPane` becomes the active pane for that session.

## Related Services

- `src/vs/sessions/contrib/chat/browser/promptsService.ts` — `AgenticPromptsService`
- `src/vs/sessions/contrib/chat/browser/aiCustomizationWorkspaceService.ts` — `SessionsAICustomizationWorkspaceService`
- `src/vs/sessions/contrib/chat/browser/newChatContextAttachments.ts` — new-session attachments
- `src/vs/sessions/contrib/chat/browser/slashCommands.ts` — new-session slash-command handling

## Working in This Area

1. Start in `chat.contribution.ts` to understand which pane is currently active.
2. Change new-session UX in `newChatViewPane.ts` and the picker/helper files next to it.
3. Keep deferred creation inside `INewSession` + `ISessionsManagementService`; do not move eager session creation back into the view layer.
4. When changing prompt/customization behavior, coordinate with `promptsService.ts` and `aiCustomizationWorkspaceService.ts`.
5. Test both first load (`NewChatViewPane`) and the handoff to `ChatViewPane` after the first request.

## File Map

```
src/vs/sessions/browser/widget/
└── AGENTS_CHAT_WIDGET.md                    # This document

src/vs/sessions/contrib/chat/browser/
├── chat.contribution.ts                     # Registers NewChatViewPane + ChatViewPane
├── newChatViewPane.ts                       # NewChatViewPane and internal NewChatWidget
├── newSession.ts                            # INewSession, LocalNewSession, RemoteNewSession
├── sessionTargetPicker.ts                   # Session target and isolation pickers
├── folderPicker.ts                          # Folder picker
├── repoPicker.ts                            # Repository picker
├── branchPicker.ts                          # Branch picker
├── modePicker.ts                            # Mode picker
├── modelPicker.ts                           # Model picker
├── newChatPermissionPicker.ts               # Permission picker
├── newChatContextAttachments.ts             # Attachment handling
├── slashCommands.ts                         # Slash command handling
├── promptsService.ts                        # Sessions prompts override
└── aiCustomizationWorkspaceService.ts       # Sessions customization workspace override

src/vs/sessions/contrib/sessions/browser/
└── sessionsManagementService.ts             # Active + pending session management
```
