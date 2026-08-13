# workbench/contrib/chat Code Organization

This contrib is, as of the end of 2025, the largest workbench contrib in VS Code by a substantial margin. Let's try to keep it organized! Here's a rough description of some of the key folders.

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

## Global Omni Session Routing

The floating Omni chat input remains a deterministic single-owner surface. Opening it from another renderer broadcasts a newer ownership claim and closes the previous instance.

Every renderer with `chat.omni.enabled` publishes a lightweight catalog of its routable agent sessions through a `BroadcastDataChannel` scoped to the current user data profile. Catalog entries contain the stable session resource and display/routing metadata (label, status, timestamps, repository, working directory, and description), but never conversation transcripts or request/response content. The Omni-owning renderer merges those catalogs with its local sessions, preferring local entries and deterministically selecting one source renderer when multiple windows publish the same resource. Heartbeats, expiry, and goodbye messages remove stale sources.

Remote candidate ids encode the source renderer separately from the raw session resource. When such a candidate is selected, only that request and its marshalled request options are sent to the source renderer. The source revalidates the session and uses its own `IChatService`, provider, trust, and policy context to send or queue the request, then returns an explicit sent, queued, or rejected result. VS Code marshalling and attachment export preserve URI and binary attachment values. Command intent continues to execute only in the renderer that owns Omni; the broker routes sessions, not local window commands.
