# MCP Client Bridge

> MCP tool discovery and invocation from editor extensions.

## Desired Outcome
mia-vscode extensions discover and invoke MCP tools hosted by mia-code-server — enabling narrative intelligence, PDE decomposition, smcraft state machines, and other capabilities to be accessed as structured tool calls from within the IDE.

## Current Reality
MCP (Model Context Protocol) is available in external clients (Claude Desktop, Cursor) but not bridged into VS Code extensions natively.

## Structural Tension
MCP provides a standardized way to expose AI capabilities as tools. Bridging MCP into extensions means the same tools available to external clients are available inside the IDE.

---

## Components

### MCPClientService
MCP client connecting to mia-code-server's `/api/mcp` endpoint.
- **Behavior:** Implements MCP client protocol (JSON-RPC over HTTP or SSE):
  1. Connect to `{serverUrl}/api/mcp` with bearer token authentication
  2. Discover available tools via `tools/list` request
  3. Cache tool definitions for command palette integration
  4. Invoke tools via `tools/call` with structured parameters
  5. Discover resources via `resources/list` for context enrichment

### ToolRegistry
Dynamic registry of available MCP tools.
- **Behavior:** After tool discovery, register tools as VS Code commands:
  - Each MCP tool becomes `mia.mcp.{toolName}` command
  - Tools appear in command palette with "Mia MCP:" prefix
  - Tool parameters gathered via quick pick or input box prompts
  - Tool results displayed in output channel or webview depending on content type
  
  Registry refreshes on reconnection and periodically (every 5 minutes).

### ExpectedTools
MCP tools provided by mia-code-server.
- **Data:** Expected tool set (from `mia-code-server/rispecs/mia-server-core/09-mcp-server-integration`):
  | Tool | Description |
  |------|-------------|
  | `analyze_three_universe` | Three-universe analysis of content |
  | `create_stc_chart` | Create a Structural Tension Chart |
  | `update_stc_chart` | Update chart action steps |
  | `create_story_beat` | Log a narrative beat |
  | `pde_decompose` | Decompose a prompt via PDE |
  | `pde_parse_response` | Parse decomposition response |
  | `get_session` | Get current session info |
  
  Extensions use these tools through the bridge rather than making direct HTTP calls when MCP is available.

### ResourceProvider
MCP resource access for context enrichment.
- **Behavior:** Access MCP resources for chat context and analysis:
  - `narrative://session/current` — Current session state
  - `narrative://charts/active` — Active STC charts
  - `narrative://beats/recent` — Recent story beats
  - `narrative://coherence/scores` — Current coherence scores
  
  Resources fetched on-demand and cached with TTL-based invalidation.

### ChatParticipantIntegration
Bridge MCP tools into Chat API.
- **Behavior:** The `mia` chat participant (from `extensions/08-chat-participant`) uses MCP tools for structured operations:
  - Chat request mentions "create a chart" → invokes `create_stc_chart` tool
  - Chat request mentions "decompose" → invokes `pde_decompose` tool
  - Tool results formatted as rich chat responses
  - Tool invocation appears as "Mia used tool: {name}" in chat history

---

## Supporting Structures
- Implemented within `extensions/mia-three-universe/src/mcp/` directory
- Uses `@modelcontextprotocol/sdk` client library
- Graceful degradation: if MCP unavailable, falls back to direct HTTP API calls
- Fulfills: `mia-code-server/rispecs/mia-server-core/09-mcp-server-integration` (client side)
- Fulfills: `mia-code-server/rispecs/pde-engine/04-pde-mcp-server` (client side)
