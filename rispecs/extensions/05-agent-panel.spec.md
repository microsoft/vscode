# Agent Panel

> Three-universe agentic chat webview panel.

## Desired Outcome
Developers converse with a three-universe agentic presence directly in the IDE — asking questions, requesting analysis, creating charts — through a chat interface that responds with Engineer precision, Ceremony accountability, and Story coherence.

## Current Reality
No agentic chat panel exists in the VS Code fork. The miadi-code agent operates only via terminal.

## Structural Tension
Chat is the most natural interface for agentic interaction. A dedicated panel makes three-universe intelligence conversational and accessible.

---

## Components

### AgentChatWebview
Main chat webview panel.
- **Behavior:** Opens via `mia.showPanel` command or activity bar. Webview panel with:
  - **Message Input** — Text area with markdown support, `/` slash commands, `@` universe mentions
  - **Message History** — Scrollable chat history with:
    - User messages (right-aligned, subtle background)
    - Agent responses (left-aligned, universe-colored border based on responding universe)
    - System messages (centered, muted)
  - **Universe Indicator** — Shows which universe(s) are responding. Three small circles light up (blue/green/purple) for each active universe.
  - **Action Buttons** — Inline action buttons in responses: "Create Chart from this", "Apply suggestion", "Show in editor"

### SlashCommands
Chat slash commands.
- **Behavior:** `/` prefix triggers command palette in chat:
  | Command | Action |
  |---------|--------|
  | `/analyze` | Analyze current file through three universes |
  | `/chart` | Create or review an STC chart |
  | `/beat` | Log a story beat |
  | `/decompose` | PDE decompose selected text |
  | `/universe [eng\|cer\|story]` | Focus response through single universe |
  | `/session` | Show current session summary |
  | `/help` | Show available commands |

### UniverseMentions
`@` mention to target specific universe.
- **Behavior:** `@engineer`, `@ceremony`, `@story` in chat messages focus the response through that universe's lens. Multiple mentions combine perspectives. No mention defaults to `mia.primaryUniverse` setting.

### MessageProtocol
Communication protocol with mia-code-server.
- **Behavior:** Messages sent via HTTP POST to `/api/agent/chat`:
  ```json
  {
    "message": "user text",
    "universe": "balanced|engineer|ceremony|story",
    "context": {
      "activeFile": "path",
      "selection": "selected text",
      "sessionId": "uuid"
    }
  }
  ```
  Response streamed via Server-Sent Events for real-time token display. Each response chunk includes universe attribution.

---

## Supporting Structures
- Extension directory: `extensions/mia-agent-panel/`
- Activation: `onCommand:mia.showPanel`
- Depends on: `mia.three-universe` (shared API, server connection)
- Webview uses VS Code's webview toolkit (`@vscode/webview-ui-toolkit`) for consistent styling
- Fulfills: `mia-code-server/rispecs/agentic-ide/01-agent-panel`
