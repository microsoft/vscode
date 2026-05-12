# Phase R8 — Wire into MCP server

**Estimated time:** Agent 30 min · You 1-2 hr.

This phase is mostly TypeScript, not Rust. Light on new Rust concepts, heavy on integration.

## Goal

The TS MCP server at `services/code-graph/mcp-server/` calls your napi module instead of returning placeholder text.

## What you'll learn

- **The JS-side facade.** How a CommonJS `require` of your napi package resolves at runtime.
- **Lazy initialization.** Pay the index-load cost on first tool call, not at process startup.
- **Graceful degradation.** If the napi binary can't load (wrong platform, missing libstdc++), fall back to placeholders rather than crashing.

## Pre-requisites

- R7 done — at least one platform build of `@son-of-anton/codegraph-napi` works.
- `services/code-graph/mcp-server/` has an existing skeleton. (If it's empty, you'll need to consult the upstream Son of Anton MCP server template.)

## Build it

### Step 1: Add napi as a dependency

In `services/code-graph/mcp-server/package.json`:

```json
{
  "dependencies": {
    "@son-of-anton/codegraph-napi": "file:../../../crates/sota-codegraph-napi"
  }
}
```

`file:` deps work for local dev; you'll switch to a real version when you publish.

### Step 2: Lazy init helper

```ts
// src/engine.ts
let initialised = false;
let napi: typeof import('@son-of-anton/codegraph-napi') | null = null;

export async function getEngine() {
  if (initialised) return napi;
  try {
    napi = require('@son-of-anton/codegraph-napi');
    await napi.init(process.env.CODE_GRAPH_DB ?? './codegraph.db');
    initialised = true;
    return napi;
  } catch (err) {
    console.warn('codegraph-napi unavailable, falling back to placeholders:', err);
    initialised = true;     // don't retry every call
    return null;
  }
}
```

This pattern: try once, cache the failure, fall back. The MCP server stays alive; the user sees a clear log message; tool calls return placeholders rather than throwing.

### Step 3: Tool handlers

```ts
import { getEngine } from './engine.js';

export async function semanticSearch(args: { query: string; limit?: number }) {
  const engine = await getEngine();
  if (!engine) {
    return { hits: [], note: 'codegraph backend not loaded (placeholder)' };
  }
  return { hits: await engine.semanticSearch(args.query, args.limit ?? 10) };
}
```

Repeat for the other five tools.

### Step 4: Backend flag

```ts
const args = process.argv.slice(2);
const backend = args.find(a => a.startsWith('--backend='))?.split('=')[1] ?? 'embedded';

if (backend === 'docker') {
  // existing FalkorDB path
} else {
  // embedded napi path (above)
}
```

The plan calls for `--backend=embedded|docker`. The Docker path stays as placeholders until R10.

### Step 5: Smoke test from the orchestrator

Start the MCP server manually:

```bash
cd services/code-graph/mcp-server
node dist/index.js --backend=embedded
```

Issue a `tools/call` JSON-RPC request over stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"semantic_search","arguments":{"query":"hello"}}}
```

You should see real hits (or an empty array if no graph is indexed yet), not the old placeholder.

## Acceptance criteria

- [ ] All 6 tools return real data from the embedded backend
- [ ] A missing/broken napi binary does not crash the MCP server (falls back to placeholders with a warning)
- [ ] `--backend=docker` still works (as placeholders for now)

## Next

[Phase R9 — Replace the activation flow](./r9-activation-flow.md).
