# codegraph extension sample

Reference VS Code extension showing how to wire the codegraph MCP server into
an IDE host. Use it as a copy-paste source for the real Son of Anton
extension.

## What's in here

- `package.json` — minimal manifest. Contributes 4 commands and a config schema.
- `src/extension.ts` — the activation flow:
  - Detects pre-existing Docker setups and skips out so it doesn't trample them.
  - Spawns `services/code-graph/mcp-server/dist/index.js --backend=embedded`.
  - Maintains a status bar item that reflects index state.
  - Registers Reindex / Show Logs / Switch to Docker commands.
  - Cleans up the child process on deactivate.
- `tsconfig.json` — strict TypeScript.

## Running

This sample is not packaged as a `.vsix`. To try it locally:

```
cd services/code-graph/extension-sample
npm install
npm run build
```

Then `code --extensionDevelopmentPath=$(pwd)` from this directory (with the
MCP server already built at `../mcp-server/dist/index.js`).

## Porting into the real extension

The bits worth lifting verbatim:

1. **`detectExistingDockerSetup()`** — the backwards-compat check.
2. **`startMcpServer()`** — argument construction + status reflection.
3. **The four palette commands** — copy directly.
4. **The configuration contribution** — paste under `contributes.configuration`.

The bits to adapt:

- `serverEntry` is a sibling path in this sample. In the real extension the
  MCP server is probably bundled differently — use `context.asAbsolutePath`
  pointing at wherever your build places it.
- The status bar text parsing reads stderr for "indexed N files" lines. If
  your MCP server logs differently, adjust the regex.
- The orchestrator owns the JSON-RPC stdout channel in production. This
  sample swallows stdout into the log; the real extension should pipe it
  through to the MCP client.
