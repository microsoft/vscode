# Agent Host Tools — CLI (backend-native) vs Client (VS Code)

"Default" = state in an agent-host session's tool picker.

## CLI / backend-native tools (always provided by the backend)

These aren't in our picker — the Copilot SDK / Claude / Codex backend always exposes
them. Listed here to show what each client tool would duplicate.

| CLI tool | Default | Capability / why |
|---|---|---|
| `powershell` | On (native) | Run shell commands — the backend's execution primitive |
| `read_powershell` | On (native) | Read output of a running shell command |
| `stop_powershell` | On (native) | Kill a running shell command |
| `list_powershell` | On (native) | List active shell processes |
| `view` | On (native) | Read a file (or directory listing) |
| `create` | On (native) | Create a file |
| `edit` | On (native) | Edit a file |
| `viewImage` | On (native) | View an image file |
| `grep` | On (native) | Literal/regex text search |
| `glob` | On (native) | Filename/glob search |
| `web_fetch` / `fetch` | On (native) | Fetch a web page/URL |
| `report_intent` | On (native) | Agent-loop progress reporting |
| `todo` | On (native) | Task/todo tracking |
| `memory` / `resolveMemoryFileUri` | On (native) | Persistent agent memory |
| `ask_user` | On (native) | Ask the user a question |
| `task` / `runSubagent` | On (native) | Delegate to a sub-agent |
| `read_agent` / `list_agents` / `write_agent` | On (native) | Sub-agent management |
| `skill` | On (native) | Load/run a skill |

## Client (VS Code) tools exposed to the picker

### Default OFF — capability already covered by a backend tool above

| Client tool | Default | Duplicates (CLI) — why off |
|---|---|---|
| `readFile` | Off | `view` |
| `listDirectory` | Off | `view` / `glob` |
| `applyPatch`, `insertEdit`, `replaceString`, `multiReplaceString`, `editFiles` | Off | `edit` |
| `createFile` | Off | `create` |
| `createDirectory` | Off | shell `mkdir` via `powershell` |
| `fileSearch` | Off | `glob` |
| `textSearch` | Off | `grep` |
| `runInTerminal` | Off | `powershell` |
| `getTerminalOutput` | Off | `read_powershell` |
| `killTerminal` | Off | `stop_powershell` |
| `sendToTerminal` | Off | `powershell` |
| `fetch` | Off | `web_fetch` / `fetch` |

### Default ON — no backend equivalent, so it adds unique value

| Client tool | Default | Why on (no CLI equivalent) |
|---|---|---|
| `codebase` | On | Semantic/embeddings search — backend only has literal `grep`/`glob` |
| `terminalLastCommand` | On | Reads the user's last integrated-terminal command (context, not execution) |
| `terminalSelection` | On | Reads the user's terminal selection (context, not execution) |
| `runTask` / `getTaskOutput` | On | VS Code task runner — no CLI counterpart |
| `runTests` | On | VS Code test runner / Test Explorer — no CLI counterpart |
| `problems` | On | Language-server diagnostics — no CLI counterpart |
| `usages`, `findTestFiles`, etc. | On | Editor/language features — no CLI counterpart |
| MCP server tools & user tool sets | On | User-configured; unrelated to backend built-ins |

**Dividing rule:** a client tool defaults **off** only when a CLI tool delivers the
*same* capability; everything VS Code-specific (semantic search, terminal/editor
context, tasks, tests, diagnostics, language features, MCP) stays **on**.
