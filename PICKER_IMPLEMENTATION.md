# Answer: Where is the picker implemented?

## Direct Answer

The chat context picker ("Add Context..." functionality) is implemented primarily in:

**`src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts`**

This file contains the `AttachContextAction` class which is the main implementation of the picker functionality.

## Key Implementation Details

### Main Action Class
- **Class**: `AttachContextAction`
- **Action ID**: `workbench.action.chat.attachContext`
- **Menu**: `MenuId.ChatInputAttachmentToolbar`
- **Keybinding**: `Ctrl+/` (in chat input)

### Supporting Files

1. **Interface Definitions**: `src/vs/workbench/contrib/chat/browser/chatContextPickService.ts`
   - Contains `IChatContextPicker`, `IChatContextPickerItem` interfaces
   - Implements `ChatContextPickService`

2. **Built-in Context Items**: `src/vs/workbench/contrib/chat/browser/actions/chatContext.ts`
   - Registers default context picker items (tools, files, screenshots, etc.)

3. **UI Integration**: `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`
   - Contains `AddFilesButton` class that renders the "Add Context" button
   - Integrates with the chat input toolbar

### Flow
1. User clicks "Add Context..." button → triggers `AttachContextAction`
2. Action collects registered context items from `IChatContextPickService`
3. Shows VS Code quick pick with available context options
4. Handles user selection and attaches context to chat

The picker leverages VS Code's standard `IQuickInputService` for the UI, making it consistent with other VS Code pickers.