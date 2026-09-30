# workbench/contrib/chat Code Organization

This contrib is, as of the end of 2025, the largest workbench contrib in VS Code by a substantial margin. Let's try to keep it organized! Here's a rough description of some of the key folders.

## Agents titlebar experiments

The desktop editor titlebar action reads the string treatment `chatOpenInAgentsTitleBarLabel` for users who have not created a session in the Agents Window. It replaces the expanding hover/focus label, tooltip, and accessible name; without a valid non-empty string, the existing localized copy is retained. Other commands and menus keep their existing labels.

Eligibility reads `AgentsWindowUsage.createdSessionCount`. The helper wraps the existing application-scoped `AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY` counter (`agentSessions.telemetry.totalSessions`), defaults missing values to zero, and provides change notifications without callers needing the storage key or scope. No additional usage state is stored. When the count becomes positive, the action restores its default copy.

Onboarding tours, new-session composer tips and first-run notices, Agents Window launch handling, and lifecycle telemetry also read this count through the helper. The lifecycle tracker remains responsible for incrementing the existing counter when a new session starts.

For local testing, set `"experiments.override.chatOpenInAgentsTitleBarLabel": "Try Agents"` in user settings with a fresh profile/data directory. Assignments are refreshed through the assignment service. A triggered scorecard can use `monacoworkbench/experimentTrigger` with `treatmentName == "chatOpenInAgentsTitleBarLabel"`; eligible rendered actions log the trigger in both control and treatment.

The boolean treatment `chatOpenInAgentsTitleBarExpandOnHover` applies to all users, independently of the copy experiment. It defaults to `true`; `false` keeps the action icon-only on pointer hover, while keyboard focus still reveals the label. Tooltips, accessible names, and action behavior remain available. Set `"experiments.override.chatOpenInAgentsTitleBarExpandOnHover": false` to test locally. Its `experimentTrigger` fires on pointer hover in both arms after the assignment resolves.

## Key Folders

### `browser/`

- `accessibility/` - Screen reader support and accessible views.
- `actions/` - All chat action registrations.
- `attachments/` - Context attachment model, pickers, context widgets.
- `chatContentParts/` - Rendering components for different response content types (markdown, code blocks, tool output, etc.).
- `chatEditing/` - The edit session model, edit diff UI, edit snapshots.
- `chatSetup/` - Placeholder registrations before the chat extentension is set up. Running the chat auth/install flow.
- `contextContrib/` - The contribution point for chat context providers - note the difference from `attachments/`.
- `widget/` - The core files related to rendering parts of the ChatWidget, including the list, the input, the model/agent pickers, and other main UI parts. Must have direct references from ChatWidget itself.
- `widgetHosts/` - Hosts that embed chat widgets in other places (view pane, editor, quick chat).

### `common/`

- `chatService/` - IChatService interface, implementation, and related code.
- `model/` - Chat data model, view model, and session storage.
- `participants/` - Chat participant management (sometimes called "agents" in code).
- `tools/` - Language model tools infrastructure and services.
	- `builtinTools/` - Implementations of some built-in tools.
