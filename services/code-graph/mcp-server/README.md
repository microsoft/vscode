# codegraph-mcp-server

Node MCP server that exposes the embedded Rust code-graph backend
(`@son-of-anton/codegraph-napi`) over the Model Context Protocol stdio
transport.

## Build

```
npm install
npm run build
```

## Run

```
node dist/index.js \
  --db=./codegraph.db \
  --index-root=/path/to/repo \
  --local-embedder
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--db=PATH` | `./codegraph.db` (or `$CODE_GRAPH_DB`) | SQLite database location. |
| `--backend=embedded\|docker` | `embedded` | `docker` is reserved for the FalkorDB path (R10). |
| `--index-root=DIR` | unset | If set, run `indexWorkspace(DIR)` on startup. |
| `--local-embedder` | off | Configure the fastembed-rs local embedder (downloads a ~30MB model on first call). |
| `--provider-embedder=URL\|MODEL\|DIMS[\|API_KEY]` | unset | OpenAI-compatible HTTP embedder. |

### Environment variables

| Var | Description |
|---|---|
| `CODE_GRAPH_DB` | Default for `--db` if no flag is passed. |
| `CODEGRAPH_NAPI_PATH` | Override the napi module location (useful in dev when the binary isn't published to npm). |

## Behaviour

If the napi binary can't be loaded (unsupported platform, no build), the server
stays alive and every tool call returns a placeholder JSON object with
`"placeholder": true`. The stderr log explains why.

## Tools

| Tool | Notes |
|---|---|
| `semantic_search` | Requires an embedder + built vector index. |
| `file_summary` | Synchronous; no embedder needed. |
| `symbol_lookup` | Synchronous. |
| `dependency_traversal` | Walks Calls edges (file → symbol). |
| `impact_analysis` | Reverse traversal. |
| `find_references` | All edges into a symbol by name. |
