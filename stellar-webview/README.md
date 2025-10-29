# Stellar Chat Webview

This directory contains the React-based webview UI for the Stellar AI chat panel.

## Structure

```
webview/
├── types.ts                    # TypeScript interfaces for Message and Conversation
├── conversationStore.ts        # Zustand store for state management
├── components/
│   ├── ChatPanel.tsx          # Main chat UI component
│   └── ChatPanel.css          # Styling for chat panel
├── index.tsx                  # Entry point for React app
├── index.html                 # HTML template for webview
├── package.json               # Dependencies (React, Zustand)
├── webpack.config.js          # Webpack bundler configuration
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## Setup

1. Install dependencies:
   ```bash
   cd src/vs/workbench/contrib/stellarRightBar/browser/webview
   npm install
   ```

2. Build the webview:
   ```bash
   npm run build
   ```

3. For development (watch mode):
   ```bash
   npm run watch
   ```

## Current Implementation (STEP 1)

### Features
- ✅ Basic conversation data model with support for multiple conversations
- ✅ Zustand-based state management
- ✅ User and assistant message differentiation
- ✅ Mock message flow (2-second delay simulation)
- ✅ Fixed input area at bottom
- ✅ Scrollable message area
- ✅ Clear conversation functionality
- ✅ VS Code theme integration

### Message Flow
1. User types message and clicks "Send"
2. User message is added to conversation
3. Placeholder "Stellar is thinking…" message appears
4. After 2 seconds, placeholder is replaced with mock response
5. Messages auto-scroll to bottom

### NOT Implemented Yet (Future Steps)
- ❌ Extension host messaging
- ❌ LM Studio or API integration
- ❌ Streaming responses
- ❌ Markdown rendering
- ❌ Code syntax highlighting
- ❌ Context management
- ❌ Multiple conversation switching

## Integration with VS Code Extension

The built webview (`dist/index.js`) will be loaded by the VS Code extension host through the `StellarRightView` ViewPane component.

## Development Notes

- Uses VS Code CSS variables for theming (`--vscode-*`)
- All state is managed locally in the webview (no extension communication yet)
- Modular structure allows easy addition of features in future steps
- TypeScript strict mode enabled for type safety

