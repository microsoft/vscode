# Implementation Status

Snapshot of what's in the repo, what was tested, and what's gated behind
external dependencies.

## At a glance

| Phase | Status |
|---|---|
| R1 Workspace skeleton | Done |
| R2 SQLite store | Done (10K perf bench passes in release) |
| R3 Tree-sitter parsing | Done (Rust, TypeScript, JavaScript, Python) |
| R4 Embeddings + HNSW | Done |
| R5 Incremental indexer + file watcher | Done |
| R6 6 MCP tools | Done |
| R7 napi-rs binding (Rust side) | Done; npm-side packaging not done |
| R8 MCP server | Done (TypeScript, type-checks, JSON-RPC verified) |
| R9 IDE activation flow | Reference sample done; downstream extension untouched |
| R10 FalkorDB backend | Done (compiles + clippy clean); live tests gated on `FALKORDB_URL` |

## Test inventory

`cargo test --workspace` runs **34 tests, 2 ignored**. The ignored ones are
release-only or require an external service:

```
# 10K-insert perf budget — passes in release
cargo test --release --package sota-codegraph-core -- --ignored bench_10k

# FalkorDB integration — requires a running FalkorDB
FALKORDB_URL=redis://localhost:6379 \
  cargo test --package sota-codegraph-core -- --ignored falkor_round_trip
```

Per-module breakdown:

| Module | Tests | Coverage |
|---|---|---|
| `store::sqlite` | 12 | migrations (fresh + reopen), CRUD for files/symbols/edges, idempotency, FK cascade, FK pragma, distinct-edge coexistence, batch persistence, embeddings round-trip, 10K perf bench (release-only) |
| `store::falkordb` | 1 + 1 ignored | escape helper unit test; full round-trip integration gated on `FALKORDB_URL` |
| `parse` | 6 | language detection; full parse for Rust, TypeScript, JavaScript, Python; content hash |
| `embed` | 4 | cosine distance correctness, HNSW returns seed as nearest, ProviderEmbedder round-trip via wiremock |
| `index` | 4 | bulk index over a directory, skip-unchanged on rerun, re-index changed files, single-file path |
| `search` | 6 | file_summary, symbol_lookup (exact + fuzzy), dependency_traversal, impact_analysis, find_references |

`cargo clippy --workspace -- -D warnings` is clean.

## End-to-end smoke

### Rust CLI

```
cd crates
cargo run --bin sota-codegraph-cli -- --db /tmp/cg.db index ./sota-codegraph-core/src
# {"files":10, "symbols":118, "edges":173, ...}

cargo run --bin sota-codegraph-cli -- --db /tmp/cg.db refs upsert_file
# [{"from_file":".../index.rs","to_symbol":"upsert_file","to_file":".../sqlite.rs","kind":"Calls"}, ...]
```

Cross-file call edges resolve correctly.

### TypeScript MCP server

```
cd services/code-graph/mcp-server
npm install
npm run build
node dist/index.js --db=/tmp/cg.db
```

Server starts, listens on stdio for JSON-RPC. `tools/list` returns all 6
tool schemas (verified). If the napi binary isn't installed, falls back to
placeholder responses with a stderr warning.

## R7 napi packaging — what's left

`cargo build` succeeds and produces a `.dylib`. To consume from Node:

1. Add `@napi-rs/cli` and run `napi build --platform`.
2. Generate `index.js` + `index.d.ts` (the cli does this on every build).
3. Configure `package.json` `optionalDependencies` for the per-platform sub-packages.
4. Run the smoke test from `node -e "console.log(require('@son-of-anton/codegraph-napi'))"`.

The R7 phase guide at [`r7-napi-binding.md`](./r7-napi-binding.md) walks
through those steps.

## R10 FalkorDB — what's verified vs untested

**Verified in this repo**
- Module compiles, clippy clean.
- redis-rs `cmd("GRAPH.QUERY")` calls are wired correctly.
- Response decoder (`decode_rows`) handles the `[headers, rows, statistics]`
  array shape.
- `escape()` quoting helper unit-tested.

**Not verified in this repo**
- Live behaviour against a running FalkorDB instance. The integration test
  `falkor_round_trip` is `#[ignore]`d and runs only when `FALKORDB_URL` is
  set. Run it before relying on the backend in production.
- Cypher queries against the real FalkorDB dialect may need adjustment —
  FalkorDB supports a Cypher subset; if a query uses an unsupported clause
  it will return an error at runtime. The queries used here stick to
  `MATCH`/`MERGE`/`SET`/`RETURN`/`WITH`/`WHERE`/`ORDER BY`/`LIMIT` and
  variable-length patterns (`-[:CALLS*1..N]->`), all of which are common
  Cypher and should work.
- Embedding storage. FalkorDB doesn't store vectors in this implementation;
  the HNSW index runs in-process from SQLite-stored vectors. If you flip
  to FalkorDB-only with no SQLite at all, embeddings need a separate store
  (Qdrant is the original plan for that — not implemented).

**FalkorDB does not currently support `Vec<u8>` parameterised queries via
plain `cmd("GRAPH.QUERY")`**, so query construction inlines string and
numeric values directly with `escape()` quoting. This is fine for the
controlled input here (paths, symbol names from your own source files) but
would need parameterised queries before exposing it to untrusted input.

## R9 IDE activation — what's runnable

`services/code-graph/extension-sample/` is a complete, type-checked VS Code
extension. It:

- Detects pre-existing Docker setups (`sota.mcp.servers` with `falkordb` in
  the command) and skips activation so it doesn't override them.
- Spawns the MCP server with `--backend=embedded --index-root=<workspace>`.
- Reflects index state in a status bar item.
- Registers Reindex / Show Logs / Switch to Docker / Quick Actions commands.
- Cleans up the child process on deactivate.

This is a **reference** — the real Son of Anton extension lives in a
different repo. Lift `detectExistingDockerSetup()`, `startMcpServer()`, the
4 commands, and the configuration schema into the production extension.

## Files added or modified

### Rust

- `crates/sota-codegraph-core/Cargo.toml` — added `walkdir`, `streaming-iterator`, `async-trait`, `once_cell`, `parking_lot`, `redis`, dev-deps `wiremock` + tokio test-util
- `crates/sota-codegraph-core/src/`
  - `lib.rs` — exposes 7 modules
  - `parse.rs` — R3
  - `embed.rs` — R4
  - `index.rs` — R5
  - `search.rs` — R6 (split `embed_query` / `nearest` for napi `Send` compat)
  - `store/mod.rs` — exposes `falkordb` sub-module
  - `store/sqlite.rs` — R2 + embedding helpers + FK pragma
  - `store/falkordb.rs` — R10
- `crates/sota-codegraph-napi/`
  - `Cargo.toml` — added tokio, once_cell, parking_lot
  - `build.rs` — calls `napi_build::setup()`
  - `src/lib.rs` — R7
- `crates/sota-codegraph-cli/`
  - `Cargo.toml` — added clap, anyhow, serde_json
  - `src/main.rs` — clap CLI exposing all 6 tools + index

### TypeScript

- `services/code-graph/mcp-server/`
  - `package.json`, `tsconfig.json`, `README.md`
  - `src/index.ts` — main MCP server entry
  - `src/engine.ts` — lazy napi loader with placeholder fallback
  - `src/tools.ts` — 6 tool schemas
- `services/code-graph/extension-sample/`
  - `package.json`, `tsconfig.json`, `README.md`
  - `src/extension.ts` — activation flow reference

### Docs

- `docs/implementation/README.md` — index updated
- `docs/implementation/STATUS.md` — this file
- `docs/implementation/r1`..`r10.md` — phase walkthroughs

## Open issues worth flagging

1. **Call-edge resolution is name-based.** Two symbols with the same name in
   different files both become edge targets. Real disambiguation needs
   scope-aware analysis.
2. **Imports are not parsed.** `dependency_traversal` operates on Calls edges
   instead. Imports would need per-language module resolution.
3. **`Indexer` watcher isn't unit-tested.** The debounce loop logic is
   straightforward; the watcher's timing is platform-specific.
4. **Vector index isn't persisted.** Rebuilds from SQLite on startup.
5. **`LocalEmbedder` is untested** (requires a 30MB model download).
6. **FalkorDB Cypher untested live** (see R10 section above).
