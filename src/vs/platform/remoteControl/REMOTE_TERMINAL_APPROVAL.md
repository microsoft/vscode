# Remote Control: Terminal Command Approval from Phone

Approve or deny agent terminal commands from your phone while VS Code runs on your computer.

## Problem

When VS Code's chat agent wants to run a terminal command, it asks for confirmation. If you're away from your computer (e.g., during a long agent session), you can't approve commands and the agent stalls.

## Solution

A local HTTP server that serves a mobile-friendly web page. Open the URL on your phone (same Wi-Fi network), and pending terminal confirmations appear as cards you can approve or deny in real time.

## Architecture

VS Code has two processes on your computer — the **main process** (Node.js, can open network ports) and the **renderer process** (Chromium, runs the UI and chat). These communicate via IPC (Inter-Process Communication), which is same-machine only.

The phone connects over HTTP on the local network. IPC is **not** involved in phone communication — it only bridges VS Code's own two processes.

```
┌──────────────────────────────────────────────────────────────┐
│  Your Computer                                               │
│                                                              │
│  ┌─────────────────────┐   IPC    ┌────────────────────────┐ │
│  │ Main Process        │ ←──────→ │ Renderer Process       │ │
│  │ (Node.js)           │          │ (Chromium)             │ │
│  │                     │          │                        │ │
│  │ • HTTP server       │          │ • Chat model           │ │
│  │ • SSE broadcasting  │          │ • Tool invocations     │ │
│  │ • Serves web client │          │ • Confirmation bridge  │ │
│  └──────────┬──────────┘          └────────────────────────┘ │
│             │                                                │
└─────────────┼────────────────────────────────────────────────┘
              │ HTTP over Wi-Fi (LAN)
              ▼
        ┌───────────┐
        │   Phone   │
        │ (Browser) │
        └───────────┘
```

## How It Works — Step by Step

1. User runs **"Start Remote Control Server"** command (F1 menu)
2. Main process starts an HTTP server on `0.0.0.0:<random-port>`
3. VS Code shows a notification with a URL like `http://192.168.1.42:54321`
4. User opens that URL on their phone browser (must be same Wi-Fi network)
5. Phone connects to the SSE (Server-Sent Events) endpoint for real-time updates
6. When the chat agent wants to run a terminal command:
   - The agent creates a tool invocation with state `WaitingForConfirmation`
   - The renderer-side contribution detects this via observable watchers
   - It sends the confirmation details to the main process **over IPC**
   - The main process broadcasts it to the phone **over SSE/HTTP**
7. Phone shows an approval card with the command details
8. User taps Approve or Deny
9. Phone sends the decision back **over HTTP** to the main process
10. Main process fires an event, received by the renderer **over IPC**
11. Renderer calls `confirm()` or denies the tool invocation
12. Agent proceeds (or stops)

## Files

### Layer 1: Interface & Types
**`src/vs/platform/remoteControl/common/remoteControl.ts`**

Defines the service interface (`IRemoteControlMainService`) and shared types:
- `IRemoteControlConfirmation` — a pending confirmation (toolCallId, command, sessionId)
- `IRemoteControlConfirmationResponse` — a decision (toolCallId, approved)
- `IRemoteControlServerInfo` — server URL and status

### Layer 2: HTTP Server (Main Process)
**`src/vs/platform/remoteControl/electron-main/remoteControlMainService.ts`**

Runs in the main process because only Node.js can open TCP ports. Routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Serves the phone web client HTML |
| `/api/pending` | GET | Returns current pending confirmations as JSON |
| `/api/events` | GET | SSE stream — pushes new confirmations to phone in real time |
| `/api/confirm` | POST | Receives approve/deny decisions from phone |
| `/api/status` | GET | Health check |

Uses `os.networkInterfaces()` to find the machine's LAN IP so the phone can connect (localhost wouldn't work from another device).

### Layer 3: Phone Web Client
**`src/vs/platform/remoteControl/electron-main/webClient.ts`**

A single exported string containing a complete HTML/CSS/JS page optimized for mobile. Features:
- Connects to SSE via `EventSource` with auto-reconnect
- Shows cards for each pending command with Approve/Deny buttons
- Keeps a local history of past decisions

### Layer 4: IPC Bridge (Renderer ↔ Main)
**`src/vs/workbench/services/remoteControl/electron-browser/remoteControlService.ts`**

One line: `registerMainProcessRemoteService(IRemoteControlMainService, 'remoteControl')`

This makes the main process service callable from the renderer. Under the hood, VS Code serializes method calls over an IPC channel (Electron's `ipcMain`/`ipcRenderer`).

### Layer 5: Chat Integration (Renderer Process)
**`src/vs/workbench/contrib/chat/electron-browser/remoteControl/remoteControl.contribution.ts`**

The most complex file — watches the chat model for tool invocations:

1. **Watch chat models** — subscribes to `chatService.chatModels` to track all sessions
2. **Watch requests** — on `model.onDidChange` with `kind: 'addRequest'`, grabs `request.response`
3. **Watch response parts** — subscribes to `response.onDidChange` to catch new parts as they stream in
4. **Watch tool state** — for each `IChatToolInvocation`, sets up `autorun()` on its `state` observable
5. **Detect confirmation needed** — when state becomes `WaitingForConfirmation` and it's a terminal tool, pushes the confirmation to the main process
6. **Handle phone response** — listens for `onDidReceiveConfirmation` from main process, calls `state.confirm()` or denies

Also registers two F1 commands: "Start Remote Control Server" and "Stop Remote Control Server".

### Registration (Modified Existing Files)

- **`src/vs/code/electron-main/app.ts`** — registers the service with `SyncDescriptor` and sets up the IPC channel via `ProxyChannel.fromService()`
- **`src/vs/workbench/workbench.desktop.main.ts`** — imports the IPC bridge and contribution

## Key Technical Decisions

### Why IPC is needed
The renderer process has access to the chat model but can't open network ports. The main process can open ports but doesn't know about chat. IPC connects them — it's an internal bridge, not the phone communication channel.

### Why SSE instead of WebSocket
SSE (Server-Sent Events) is simpler — one-directional push from server to client over a standard HTTP connection. The phone only needs to send data back via POST requests. No WebSocket upgrade handshake needed, works through more proxies, and auto-reconnects natively via `EventSource`.

### Why `autorun()` on observables
Tool invocation state (`WaitingForConfirmation`, `Executing`, etc.) is stored as an `IObservable`, not surfaced via events. Standard event listeners on the chat model don't fire when a tool's state changes. `autorun()` from the observable library re-runs whenever the observed value changes.

### Why bind to `0.0.0.0`
Binding to `localhost` or `127.0.0.1` only accepts connections from the same machine. Binding to `0.0.0.0` accepts connections from any device on the network, which is required for phone access.

## Bugs Encountered During Development

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Phone shows page but no confirmations | Tool state is an `IObservable` — changes don't fire through model events | Used `autorun()` on each invocation's state observable |
| Still no confirmations | Listened for `addResponse` model event which never fires — response is created inline during `addRequest` | Switched to `addRequest` and accessed `request.response` directly |
| Confirmations appear late | Response parts are added incrementally during LLM streaming | Added `response.onDidChange` listener to discover new tool parts as they arrive |
| Phone can't connect | URL showed `localhost` | Used `os.networkInterfaces()` to find LAN IP address |

## Usage

1. Open VS Code with a chat agent session
2. Press F1 → "Start Remote Control Server"
3. Scan/type the URL shown in the notification on your phone
4. Leave the agent running — approve commands from your phone
5. Press F1 → "Stop Remote Control Server" when done
