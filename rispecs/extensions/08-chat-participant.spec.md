# Chat Participant

> VS Code Chat API three-universe participant.

## Desired Outcome
Developers interact with three-universe intelligence through VS Code's native Chat interface — typing `@mia` in the chat panel to invoke Engineer, Ceremony, or Story analysis using the standard Chat API that integrates with GitHub Copilot Chat and other chat providers.

## Current Reality
VS Code Chat API exists but no three-universe chat participant is registered.

## Structural Tension
The Chat API is VS Code's native conversational surface. Registering a participant there makes three-universe intelligence accessible alongside Copilot without a separate panel.

---

## Components

### MiaChatParticipant
Chat participant registered via `vscode.chat.createChatParticipant`.
- **Behavior:** Registered with ID `mia` and display name "Mia". Handles chat turns by:
  1. Parsing user message for universe hints (`@mia /engineer`, `@mia /story`, etc.)
  2. Gathering context: active file, selection, workspace info, recent beats
  3. Sending to mia-code-server `/api/agent/chat` with universe targeting
  4. Streaming response back with universe attribution markers
  5. Providing follow-up suggestions based on response content

### ChatSlashCommands
Slash commands within `@mia` participant.
- **Behavior:** Register slash commands on the chat participant:
  | Command | Description |
  |---------|-------------|
  | `/analyze` | Three-universe analysis of current file or selection |
  | `/chart` | Create or review STC chart |
  | `/beat` | Create a story beat |
  | `/explain` | Explain code through three-universe lenses |
  | `/review` | Review changes through three-universe lenses |

### ChatContextProvider
Context gathering for chat requests.
- **Behavior:** Provide rich context to the chat participant:
  - Active editor file and selection
  - Recent story beats from current session
  - Active STC chart status
  - Recent three-universe analysis results
  - Git diff if reviewing changes
  
  Context summarized to fit within token limits, prioritized by relevance to the query.

### ChatResponseRendering
Custom rendering for three-universe responses.
- **Behavior:** Responses formatted with:
  - Universe headers: `## 🔧 Engineer`, `## 🌿 Ceremony`, `## 📖 Story`
  - Inline code blocks with language detection
  - Markdown links to files and symbols
  - Action buttons: "Create Chart", "Log Beat", "Apply to Editor"
  - Follow-up suggestions: contextual next questions based on the response

---

## Supporting Structures
- Extension directory: `extensions/mia-chat-participant/`
- Activation: `onChatParticipant:mia`
- Depends on: `mia.three-universe` (shared API, server connection)
- Requires `chatParticipant` proposed API access (granted via product.json `extensionAllowedProposedApi`)
- Fulfills: `mia-code-server/rispecs/agentic-ide/07-chat-participant`
