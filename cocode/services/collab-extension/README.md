# CoCode Collaboration Extension

VS Code web extension enabling real-time collaborative editing using Yjs CRDT synchronization.

## Overview

This extension provides live collaboration features for CoCode, including synchronized text editing, cursor presence, and selection tracking across multiple users in the same workspace.

## Architecture

### Core Components

- **Extension Activation** (`src/extension.ts`) - Manages extension lifecycle, configuration, and collaboration toggle
- **Document Binding** (`src/yjs/binding.ts`) - Synchronizes VS Code text documents with Yjs shared documents
- **Presence System** (`src/yjs/presence.ts`) - Handles user cursors, selections, and awareness
- **Color Assignment** (`src/yjs/colors.ts`) - Deterministic color generation for user identification

### Technology Stack

- **Yjs** - CRDT framework for conflict-free replicated data structures
- **y-websocket** - WebSocket provider for real-time Yjs synchronization
- **VS Code Extension API** - Text document and editor decoration APIs

## Features

- Real-time text synchronization across multiple editors
- Color-coded cursor tracking for each collaborator
- Selection highlighting with user identification
- Auto-detection of WebSocket endpoint based on origin
- Manual toggle for collaboration enable/disable
- Persistent user identity across sessions

## Configuration

### Settings

**cocodeCollab.enabled** (boolean, default: `true`)

- Enable or disable real-time collaboration
- Can be toggled via command palette

**cocodeCollab.yjsUrl** (string, default: auto-detect)

- Override Yjs WebSocket endpoint
- Leave empty to auto-detect: `ws[s]://[host]/yjs`
- Example: `ws://localhost:1234/yjs`

### Commands

#### CoCode: Toggle Collaboration

- Command ID: `cocode.toggleCollaboration`
- Enables/disables collaboration without reloading

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Build

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run watch

# Production build
npm run package

# Package as VSIX
npm run package:vsix
```

### Project Structure

```text
cocode-collab-extension/
├── src/
│   ├── extension.ts           # Entry point and lifecycle
│   └── yjs/
│       ├── binding.ts         # Document synchronization
│       ├── presence.ts        # Cursor and selection tracking
│       └── colors.ts          # User color utilities
├── dist/                      # Compiled output
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
└── webpack.config.js         # Build configuration
```

## How It Works

### Connection Flow

1. Extension activates when running in web UI (checks `vscode.env.uiKind`)
2. Determines Yjs WebSocket URL from config or auto-detects from origin
3. Connects to Yjs server at `/yjs` endpoint
4. Creates shared Yjs document for each open text document

### Synchronization Flow

1. User edits trigger `onDidChangeTextDocument` events
2. Changes are converted to Yjs operations
3. Operations are sent to Yjs server via WebSocket
4. Server broadcasts to all connected clients
5. Remote operations are applied to local VS Code document

### Presence Flow

1. Each user gets a unique ID and color on first activation
2. Cursor position and selection are tracked via `onDidChangeTextEditorSelection`
3. Awareness state is shared through Yjs provider
4. Remote cursors are rendered as decorations in the editor

## Technical Details

### Document Filtering

Only specific document schemes are synchronized:

- `file://` - Local file system
- `vscode-vfs://` - Virtual file system
- `untitled://` - Unsaved documents

System files and output channels are excluded from sync.

### Conflict Resolution

Yjs uses CRDT algorithms to ensure convergence without conflicts:

- Operations are commutative and idempotent
- No locking or coordination required
- Eventual consistency guaranteed

### Performance Considerations

- Debouncing is applied to cursor updates to reduce network traffic
- Only visible text documents are actively synchronized
- Closed documents are automatically unbound and cleaned up

## Integration with CoCode

This extension is designed to work with the CoCode architecture:

- **Gateway** - Routes authenticated requests and manages sessions
- **OpenVSCode Server** - Hosts the VS Code web instance with this extension
- **Yjs-WS Server** - WebSocket server handling CRDT synchronization
- **Builder Service** - Compiles and executes code (independent of collaboration)

The extension automatically detects the Yjs endpoint when deployed in CoCode's containerized environment.

## Troubleshooting

### Extension Not Activating

- Check that you're running in VS Code Web (not desktop)
- Verify `cocodeCollab.enabled` is set to `true`
- Check browser console for activation logs

### Connection Issues

- Verify Yjs server is running and accessible
- Check WebSocket URL in settings or console logs
- Ensure no firewall blocking WebSocket connections

### Sync Not Working

- Check that both users are editing documents in the same workspace
- Verify both clients are connected to the same Yjs room
- Look for error messages in browser developer console

## License

MIT License - Part of the CoCode project
