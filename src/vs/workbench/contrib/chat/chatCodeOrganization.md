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

## Agents-Only Omni Session Routing

The floating Omni chat input is owned exclusively by the standalone Agents window. Normal editor workbenches do not load its contribution, register its commands or service, or expose editor menus and accessibility help for opening it. The Sessions sidebar header is the canonical entry point and remains gated by `chat.omni.enabled`.

`vs/workbench` defines a narrow provider-neutral routing contract, while `vs/sessions` registers the Agents implementation. The boundary includes routable sessions plus a new-session workspace catalog (groups, recent workspaces, browse actions, restored selection, and stable provider identity) without importing Sessions types into workbench. The adapter builds that catalog from the same shared picker model, `ISessionsRecentWorkspacesService`, and `ISessionsProvidersService` used by the Sessions welcome picker. The Omni popup renders the provider-neutral data in its own action-widget auxiliary window, so Local/GitHub/Remote/custom tabs and provider browse UI stay scoped to the floating input.

Existing-session requests resolve the current owning `ISession` and chat and send through `ISessionsManagementService.sendRequest` in the background. New folder sessions pass the selected folder and provider ID to `createAndSendNewChatRequest`; workspace-less quick chats use the corresponding quick-chat API. A selected provider that disappears is rejected rather than silently falling through to another provider. This keeps provider-owned authentication, policy, Workspace Trust, remote-host behavior, attachment handling, model/mode configuration, and cancellation authoritative. Delivery **Open** uses `ISessionsService.openSession`, so the Agents window renders the selected session locally.
