# Son of Anton — Code Graph (bundled)

A self-contained docker compose stack that powers the IDE's code-graph
features (semantic search, symbol lookup, impact analysis, etc.). Bundled
inside the IDE repo so users can enable rich-context AI without cloning a
separate `son-of-anton-graph` repository.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Son of Anton IDE                                                     │
│                                                                      │
│  ┌──────────────────────┐     spawn (stdio JSON-RPC)                 │
│  │ CodeGraphController  │────────────────────────────┐               │
│  │  (extension)         │                            ▼               │
│  └──────────────────────┘                   ┌─────────────────────┐  │
│             │                               │ mcp-server (Node)   │  │
│             │ docker compose up -d          │ stdio JSON-RPC      │  │
│             ▼                               └──────────┬──────────┘  │
│  ┌────────────────────────────────────────────────────┼──────────┐  │
│  │ services/code-graph/docker-compose.yml             │          │  │
│  │                                                    │          │  │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │          │  │
│  │  │  FalkorDB    │  │  Qdrant  │  │   indexer    │  │          │  │
│  │  │  :6379       │  │  :6333   │  │  (v1 stub)   │◀─┘          │  │
│  │  │  (graph DB)  │  │ (vectors)│  │              │             │  │
│  │  └──────────────┘  └──────────┘  └──────────────┘             │  │
│  └─────────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────┘
```

The MCP server is launched by the extension as a stdio child process. It
connects to FalkorDB (`localhost:6379`) and Qdrant (`localhost:6333`) — both
exposed by the docker compose stack. The orchestrator's
`gatherGraphContext` and `BaseAgent.queryFileGraph` / `queryDependencies` /
etc. helpers route through `McpClient.callTool('code-graph', ...)`.

## What you get today (v1)

- **FalkorDB** and **Qdrant** containers come up cleanly and persist data
  under `services/code-graph/.data/` (gitignored).
- **Indexer** is a stub — it logs `Indexer ready (v1 stub — no indexing yet)`
  and stays alive. Real tree-sitter indexing is a future phase.
- **MCP server** registers the six expected tools and returns a placeholder
  response (`(code graph available — index empty; run sota:graph:reindex to
  populate)`) for every call. The orchestrator already handles the
  index-empty case gracefully.

## Quick start (manual)

```bash
# Bring the stack up
npm run sota:graph:up

# Confirm health
npm run sota:graph:status
docker compose -f services/code-graph/docker-compose.yml exec falkordb \
  redis-cli GRAPH.QUERY son-of-anton "RETURN 1"
curl -sf http://localhost:6333/readyz

# Tear down (preserves data) or remove volumes with `down -v`
npm run sota:graph:down
```

## IDE integration

Run `Son of Anton: Enable Code Graph` from the command palette. The
extension will:

1. Verify Docker is on `PATH`.
2. Run `docker compose up -d` from `services/code-graph/`.
3. Poll FalkorDB until it answers `GRAPH.QUERY son-of-anton "RETURN 1"`
   (60s timeout).
4. Build the MCP server (`npm run build` inside `mcp-server/`) and
   register it in `sota.mcp.servers` (User scope) so the chat agents
   can call it on subsequent sessions.
5. Show a status-bar item `◇ Code Graph: Running` while the stack is up.

## Tools exposed by the MCP server

| Tool | Purpose |
|---|---|
| `semantic_search` | Vector-search code by natural-language query (Qdrant). |
| `file_summary` | Summarise a file's top-level symbols and imports (FalkorDB). |
| `symbol_lookup` | Find a symbol's definition site and metadata. |
| `dependency_traversal` | Walk a file's import graph. |
| `impact_analysis` | Predict files affected by a change. |
| `find_references` | Find every reference to a named symbol. |

All six are stubs in v1. Each returns a single text content part —
`(code graph available — index empty; ...)`.

## Future work

- Real tree-sitter parsing in the indexer (TypeScript, JavaScript, Python).
- FalkorDB schema for AST nodes / call edges / dependency edges.
- Embedding model selection + Qdrant collection management.
- Wiring `sota:graph:reindex` and incremental updates on file save.
