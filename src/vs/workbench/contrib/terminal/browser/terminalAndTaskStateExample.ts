/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Example usage of the new terminal and task state tracking

/*

This demonstrates how the new terminalAndTaskState tracking works:

## Before this change:
- Only Copilot-created terminals were tracked in some system
- Other terminals (user-created, task, extension) were not properly tracked

## After this change:
- ALL terminals are tracked in terminalAndTaskState regardless of source
- Each terminal entry includes:
  - id: Terminal instance ID
  - source: Creator/source ('user', 'github.copilot.terminalPanel', 'task', 'extension', 'feature')
  - type: Terminal type ('Task' or 'Local')
  - isFeatureTerminal: Boolean indicating if it's a VS Code feature terminal
  - isExtensionOwnedTerminal: Boolean indicating if owned by an extension
  - name: Terminal display name
  - createdAt: Timestamp when tracked

## Example terminal sources tracked:

1. **User terminals**: source = 'user'
   - Created via Terminal menu -> New Terminal
   - Created via keyboard shortcuts
   - Created via command palette

2. **Copilot agent terminals**: source = 'github.copilot.terminalPanel'
   - Created by the Copilot terminal panel agent
   - These were the only ones tracked before this change

3. **Task terminals**: source = 'task'
   - Created when running VS Code tasks
   - Build tasks, test tasks, custom tasks, etc.

4. **Extension terminals**: source = 'extension'
   - Created by VS Code extensions via the terminal API
   - Custom debugger terminals, language server terminals, etc.

5. **Feature terminals**: source = 'feature'
   - Created by VS Code internal features
   - Git operations, integrated shell features, etc.

## API Usage Examples:

```typescript
// Get all tracked terminals
const allTerminals = terminalService.getTerminalAndTaskState();

// Get only Copilot terminals
const copilotTerminals = terminalService.getTerminalsBySource('github.copilot.terminalPanel');

// Get only task terminals
const taskTerminals = terminalService.getTerminalsBySource('task');

// Get summary by source
const summary = terminalService.getTerminalSourceSummary();
// Returns: { 'user': 3, 'task': 2, 'github.copilot.terminalPanel': 1, 'extension': 1 }
```

## Implementation Details:

1. **Source Assignment**: Terminals get their source assigned during creation:
   - TerminalService.createTerminal() - determines source based on options and config
   - MainThreadTerminalService.$createTerminal() - extension terminals get 'extension' source
   - TerminalTaskSystem - task terminals get 'task' source

2. **State Persistence**: State is saved to workspace storage and synchronized across:
   - Local terminal backend (electron)
   - Remote terminal backend (remote development)
   - Server-side storage (for remote scenarios)

3. **Backward Compatibility**: The existing ITerminalsLayoutInfoById continues to work
   for layout restoration, while ITerminalAndTaskState adds the source tracking layer.

*/