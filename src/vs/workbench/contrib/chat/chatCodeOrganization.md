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
