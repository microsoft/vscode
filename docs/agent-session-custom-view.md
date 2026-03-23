# Agent Session Custom View — Extension API Reference

> **Proposed API:** `chatSessionCustomView`
> Requires `"enabledApiProposals": ["chatSessionCustomView"]` in `package.json`.
> This API also depends on `chatSessionsProvider` for registering the session content provider.

## Overview

The Agent Session Custom View is a specialized view pane in the Sessions window (ChatBar) that embeds a full Chat widget with a **custom header section** above the conversation. This allows extensions to display contextual information (e.g., worker instance metadata, connection status) alongside a standard chat conversation.

### Architecture

```
┌──────────────────────────────────────┐
│  Custom Header (rendered by VS Code) │  ← populated via setChatSessionCustomHeaderData()
│  ┌──────────────────────────────────┐│
│  │ ● Active  🖥 Worker abc-123     ││
│  │ Running on us-east-1             ││
│  │ Region: us-east-1 | Uptime: 2h  ││
│  └──────────────────────────────────┘│
├──────────────────────────────────────┤
│                                      │
│  Standard Chat Widget                │  ← full ChatWidget (input + conversation)
│  (input editor, conversation list,   │
│   follow-ups, file references, etc.) │
│                                      │
└──────────────────────────────────────┘
```

When `openChatSessionInCustomView()` is called, VS Code switches the ChatBar from the standard `ChatViewPane` to the `AgentSessionCustomViewPane`. Navigating to a regular session (e.g., via the session list) automatically switches back.

---

## API Surface

### Types

```typescript
enum ChatSessionCustomHeaderStatus {
  Active = 0,
  Idle = 1,
  Error = 2
}

interface ChatSessionCustomHeaderData {
  /** Display label, e.g. the worker instance name. */
  readonly label: string;

  /** Optional description text shown next to the label. */
  readonly description?: string;

  /** Optional ThemeIcon displayed before the label. */
  readonly icon?: ThemeIcon;

  /** Optional status indicator dot (green/gray/red). */
  readonly status?: ChatSessionCustomHeaderStatus;

  /** Optional key-value pairs displayed below the label row. */
  readonly details?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}
```

### Functions

#### `chat.setChatSessionCustomHeaderData(sessionResource, data)`

Set or update the custom header data for a chat session. This can be called at any time — before or after opening the custom view. The header updates reactively when data changes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionResource` | `Uri` | The URI of the chat session (must match the scheme used in `registerChatSessionContentProvider`). |
| `data` | `ChatSessionCustomHeaderData` | The header data to render. |

#### `chat.openChatSessionInCustomView(sessionResource)`

Open a chat session in the custom view pane. The session must already be loaded via a registered `ChatSessionContentProvider`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionResource` | `Uri` | The URI of the chat session to open. |

Returns `Thenable<void>`.

---

## Usage

### 1. Package Configuration

```jsonc
// package.json
{
  "enabledApiProposals": [
    "chatSessionsProvider",
    "chatSessionCustomView"
  ]
}
```

### 2. Register a Session Content Provider

The custom view renders a standard chat session. You must first register a content provider that supplies the session data:

```typescript
import * as vscode from 'vscode';

// Create a chat participant that handles requests
const participant = vscode.chat.createChatParticipant('myExt.agent', async (request, context, response, token) => {
  // Handle chat requests — stream responses via `response`
  response.markdown('Hello from the worker!');
});

// Register the session content provider for your URI scheme
const provider: vscode.ChatSessionContentProvider = {
  async provideChatSessionContent(sessionResource, token, context) {
    // Return session history + observable streams for live updates
    return {
      history: [],
      // ... your session data
    };
  }
};

vscode.chat.registerChatSessionContentProvider('my-worker-scheme', provider, participant);
```

### 3. Open a Session in the Custom View

```typescript
// The session URI — must use the scheme registered above
const sessionUri = vscode.Uri.parse('my-worker-scheme://worker-abc-123/session');

// Set the header data (can be called before or after opening)
vscode.chat.setChatSessionCustomHeaderData(sessionUri, {
  label: 'Worker abc-123',
  description: 'Running on us-east-1',
  icon: new vscode.ThemeIcon('server'),
  status: vscode.ChatSessionCustomHeaderStatus.Active,
  details: [
    { key: 'Region', value: 'us-east-1' },
    { key: 'CPU', value: '45%' },
    { key: 'Uptime', value: '2h 15m' },
  ]
});

// Open the session in the custom view
await vscode.chat.openChatSessionInCustomView(sessionUri);
```

### 4. Update the Header Dynamically

Call `setChatSessionCustomHeaderData` again at any time to update the displayed information. The header re-renders automatically:

```typescript
// Example: update status on error
vscode.chat.setChatSessionCustomHeaderData(sessionUri, {
  label: 'Worker abc-123',
  description: 'Connection lost — retrying...',
  icon: new vscode.ThemeIcon('warning'),
  status: vscode.ChatSessionCustomHeaderStatus.Error,
  details: [
    { key: 'Region', value: 'us-east-1' },
    { key: 'Last seen', value: '30s ago' },
  ]
});
```

### 5. Full Example — Streaming Remote Worker

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

  // 1. Chat participant
  const participant = vscode.chat.createChatParticipant('myExt.remoteWorker', async (request, ctx, response, token) => {
    // Forward the request to the remote worker and stream the response
    const stream = await myRemoteWorker.sendRequest(request.prompt);
    for await (const chunk of stream) {
      if (token.isCancellationRequested) { break; }
      response.markdown(chunk);
    }
  });

  // 2. Session content provider
  const provider: vscode.ChatSessionContentProvider = {
    async provideChatSessionContent(resource, token) {
      const session = await myRemoteWorker.getSession(resource);
      return session;
    }
  };
  context.subscriptions.push(
    vscode.chat.registerChatSessionContentProvider('remote-worker', provider, participant)
  );

  // 3. Command to connect and open a worker session
  context.subscriptions.push(
    vscode.commands.registerCommand('myExt.openWorkerSession', async (workerId: string) => {
      const sessionUri = vscode.Uri.parse(`remote-worker://${workerId}/session`);

      // Set initial header with connecting status
      vscode.chat.setChatSessionCustomHeaderData(sessionUri, {
        label: `Worker ${workerId}`,
        description: 'Connecting...',
        icon: new vscode.ThemeIcon('loading~spin'),
        status: vscode.ChatSessionCustomHeaderStatus.Idle,
      });

      // Open the custom view immediately (shows header while connecting)
      await vscode.chat.openChatSessionInCustomView(sessionUri);

      // Once connected, update the header
      const info = await myRemoteWorker.connect(workerId);
      vscode.chat.setChatSessionCustomHeaderData(sessionUri, {
        label: `Worker ${workerId}`,
        description: info.hostname,
        icon: new vscode.ThemeIcon('server'),
        status: vscode.ChatSessionCustomHeaderStatus.Active,
        details: [
          { key: 'Region', value: info.region },
          { key: 'Instance', value: info.instanceType },
        ]
      });
    })
  );
}
```

---

## Behavior Notes

- **View switching:** The custom view occupies the same ChatBar slot as the standard `ChatViewPane`. Only one is visible at a time, controlled by the `isCustomSessionView` context key.
- **Navigation back:** When the user navigates to a regular session (via the session list, `Ctrl+N`, etc.), the custom view closes automatically and the regular `ChatViewPane` takes over.
- **Header rendering:** A built-in default renderer is provided. It renders:
  - A colored status dot (green = Active, gray = Idle, red = Error)
  - An optional icon (any `ThemeIcon` / Codicon)
  - The label text (bold)
  - The description text (secondary color)
  - Key-value detail pairs in a horizontal layout
- **No header data = no header:** If `setChatSessionCustomHeaderData` has not been called for the session, the header section is hidden and the chat widget fills the entire view.
- **Chat features:** The embedded ChatWidget supports all standard features: auto-scroll, follow-ups, file references, working set, mode switching, inline context, etc.

## Header Data Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | `string` | **Yes** | Primary text, rendered bold. |
| `description` | `string` | No | Secondary text, rendered in muted color. |
| `icon` | `ThemeIcon` | No | Icon rendered before the label (any Codicon). |
| `status` | `ChatSessionCustomHeaderStatus` | No | Status dot color: `Active` (green), `Idle` (gray), `Error` (red). |
| `details` | `Array<{key, value}>` | No | Key-value pairs rendered below the label row. |
