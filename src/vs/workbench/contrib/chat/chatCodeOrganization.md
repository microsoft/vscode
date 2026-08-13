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

Every renderer with `chat.omni.enabled` publishes a lightweight catalog of its routable agent sessions through a `BroadcastDataChannel` scoped to the current user data profile and the canonical `IWorkbenchEnvironmentService.remoteAuthority` (`null` for local windows). Every protocol message repeats that authority identity, and both the client and model reject messages from a different profile or authority even if they arrive on the same underlying channel. Catalog entries contain only the stable session resource, a generic localized label optionally qualified by repository metadata, coarse status, timestamps, and a minimized repository identifier. Provider display labels, descriptions/activity text, full working-directory paths, conversation transcripts, request/response content, and Workspace Trust state are never broadcast. Sessions remain discoverable regardless of trust: Workspace Trust is an execution boundary, not catalog confidentiality. The Omni-owning renderer merges compatible catalogs with its local sessions, preferring local entries and deterministically selecting one source renderer when multiple windows publish the same resource. Heartbeats, expiry, and goodbye messages remove stale sources; when a heartbeat rediscovers an expired source, a targeted resync request restores its snapshot without adding snapshot payloads to heartbeats.

Remote candidate ids encode the source renderer separately from the raw session resource. When such a candidate is selected, only that request and its marshalled request options are sent to the source renderer. The source revalidates the live session identity and eligibility, resolves the session's current target working directory from source-owned state, and requests trust immediately before calling its local `IChatService`. Targets inside the open workspace use workspace trust; standalone per-session folders use resource trust for the exact URI, including remote or agent-host resources. A declined request returns `workspaceNotTrusted` and never reaches `sendRequest`; any downstream Agent Host trust check remains as defense in depth. The source never trusts broker catalog metadata, a snapshot trust flag, or the Omni-owning renderer's workspace state. VS Code marshalling and attachment export preserve URI and binary attachment values.

This infrastructure draft implements remote sends only. Remote delivery results are source-qualified so the Omni renderer does not offer a local **Open** action for a resource owned by another renderer. Broker-routed remote reveal/open, attention aggregation, approvals, CI actions, and voice action routing remain follow-ups before Global Omni satisfies the full feature scope. Command intent also continues to execute only in the renderer that owns Omni; the broker routes sessions, not local window commands.
