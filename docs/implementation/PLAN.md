# Rust Embedded Code-Graph — Plan

A multi-phase plan to replace Son of Anton's Docker-dependent code-graph backend (FalkorDB + Qdrant + Node MCP server returning placeholders) with an embedded Rust backend that ships as a Node native module via `napi-rs`. After this work, the IDE installs cleanly without Docker, and the code-graph queries return real results from a local SQLite + HNSW index.

## Goals

1. **Turnkey UX.** No Docker, no manual setup. Install the IDE → first chat → code graph context resolves to real, indexed data.
2. **Performance budget.** Native Rust for parsing + indexing. Tree-sitter on a file watcher should not heat your laptop.
3. **CLI parity.** `son-of-anton-cli` consumes the same Rust backend. No duplicate implementation between IDE and CLI.
4. **Docker stays.** The Docker-backed FalkorDB/Qdrant stack becomes the *opt-in* production-grade upgrade for very large monorepos (>500K files), not the default.
5. **Learnable in phases.** Each phase ships an independently testable artifact, so the project is digestible weekend-by-weekend rather than a multi-month bet.

## Why Rust + napi-rs

| Pattern | Verdict | Reason |
|---|---|---|
| **napi-rs (chosen)** | ✅ | Pattern used by `better-sqlite3`, `swc`, `lightningcss`. Pre-built platform binaries on npm. Rust ergonomics, Node distribution. |
| Standalone Rust binary in .vsix | ❌ | VS Code per-platform extension publishing has more friction than the npm path. |
| WASM via wasm32-wasi | ❌ | 2-5× slower; SQLite/HNSW WASM support is patchy; no real threading. |

## Architecture overview

```
crates/                                        ← new Rust workspace at repo root
├── Cargo.toml                                 ← workspace root
├── sota-codegraph-core/                       ← pure Rust, no Node coupling
│   ├── parse.rs                               ← tree-sitter wrapper
│   ├── store/                                 ← trait + 2 impls
│   │   ├── mod.rs                             ← `trait GraphStore`
│   │   ├── sqlite.rs                          ← embedded backend (default)
│   │   └── falkordb.rs                        ← Docker backend (Phase R10)
│   ├── embed.rs                               ← fastembed-rs OR provider proxy
│   ├── index.rs                               ← incremental indexer
│   └── search.rs                              ← the 6 MCP tool impls
├── sota-codegraph-napi/                       ← napi-rs binding crate
│   └── lib.rs                                 ← #[napi] async fns
└── sota-codegraph-cli/                        ← optional standalone CLI for ops
    └── main.rs

services/code-graph/mcp-server/                ← TS shell stays
└── src/index.ts                               ← `require('@son-of-anton/codegraph-napi')`
                                                  and bind 6 MCP tools to napi calls
```

The TypeScript MCP server stays unchanged at the integration boundary — it speaks JSON-RPC stdio, which the orchestrator already calls. The napi module replaces the placeholder logic underneath.

## What each phase teaches you

| Phase | Rust concept introduced |
|---|---|
| R1 | Cargo workspaces, module structure, `Result`/`Option`, basic traits |
| R2 | `rusqlite` lifetimes (you'll fight the borrow checker here for the first time) |
| R3 | tree-sitter's S-expression query language, `&str` vs `String`, FFI |
| R4 | `async`/`await` with `tokio`, zero-copy slices, `bytemuck` for raw byte casts |
| R5 | Channels (`tokio::sync::mpsc`), `spawn` vs `spawn_blocking`, graceful shutdown |
| R6 | SQL CTEs as graph queries, when to push compute to SQL vs Rust |
| R7 | FFI rules, how Node's GC + Rust ownership coexist, `Send + Sync` for napi |
| R8 | Lazy init, graceful fallback patterns |
| R9 | Activation orchestration, observability |
| R10 | Trait-based backend swapping, Redis pipelines |

## Phase plan

Each phase is independently testable. Estimated agent compute time + your hands-on time is given as a guideline.

---

### Phase R1 — Cargo workspace skeleton + core types

**Outcome:** `cargo build && cargo test` passes. No real logic yet.

**Agent ships:**
- `crates/Cargo.toml` workspace root
- `crates/sota-codegraph-core/Cargo.toml` with deps: `serde`, `serde_json`, `thiserror`, `anyhow`, `tracing`, `rusqlite` (with `bundled` feature so it builds without system SQLite)
- Empty module structure with type stubs:
  ```rust
  pub struct FileNode { pub path: PathBuf, pub language: Language, pub content_hash: u64 }
  pub struct SymbolNode { pub name: String, pub kind: SymbolKind, pub file: FileId, /* ... */ }
  pub struct Edge { pub from: NodeId, pub to: NodeId, pub kind: EdgeKind }
  pub trait GraphStore {
      fn upsert_file(&mut self, file: FileNode) -> Result<FileId>;
      fn upsert_symbol(&mut self, symbol: SymbolNode) -> Result<SymbolId>;
      fn upsert_edge(&mut self, edge: Edge) -> Result<()>;
      // ...
  }
  ```
- A trivial round-trip integration test scaffold (compiles + runs, no assertions yet)
- README explaining the workspace layout

**Estimated time:** Agent 30 min · You 1-2 hr (reading, exploring)

**Acceptance criteria:**
- `cargo build` succeeds on darwin-arm64 with `cargo` 1.75+
- `cargo test --workspace` runs with zero failures (no real tests yet)
- `cargo clippy --workspace -- -D warnings` is clean

---

### Phase R2 — SQLite-backed `GraphStore` impl

**Outcome:** Real CRUD for files, symbols, edges. Persistent. Idempotent upserts.

**Agent ships:**
- Schema migrations using `rusqlite_migration`:
  ```sql
  CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      language TEXT NOT NULL,
      content_hash INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
  );
  CREATE TABLE symbols (
      id INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      start_byte INTEGER NOT NULL,
      end_byte INTEGER NOT NULL,
      docstring TEXT,
      UNIQUE(file_id, name, kind, start_byte)
  );
  CREATE TABLE edges (
      from_node INTEGER NOT NULL,
      to_node INTEGER NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY(from_node, to_node, kind)
  );
  CREATE INDEX idx_edges_from ON edges(from_node);
  CREATE INDEX idx_edges_to ON edges(to_node);
  ```
- `GraphStore` impl with `INSERT OR REPLACE` for idempotent upserts
- WAL mode + tuned pragmas (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL`)
- Round-trip integration tests (write a node, read it back, batch insert 10K nodes, query)

**Estimated time:** Agent 1 hr · You 3-5 hr

**Acceptance criteria:**
- `cargo test sqlite_store` passes with all CRUD coverage
- 10K nodes inserted in < 500ms on a 2024 MacBook
- Schema migration runs cleanly on a fresh DB
- Re-running migrations on an existing DB is a no-op

---

### Phase R3 — Tree-sitter integration

**Outcome:** `parse_file(path)` returns symbols, imports, and call edges for TS/JS/Python/Rust.

**Agent ships:**
- Parser registry per language (start with `tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-rust`)
- `parse_file(path) -> Result<(FileNode, Vec<SymbolNode>, Vec<Edge>)>`
- S-expression queries to capture:
    - Function definitions (regular + arrow + generator + async)
    - Class definitions
    - Import statements
    - Function call expressions
- Graceful handling of parse errors — partial trees still produce usable output
- Per-language test fixtures (small files where the expected symbol set is hand-validated)

**Estimated time:** Agent 1 hr · You 4-6 hr

This phase teaches more about real Rust than any other. Tree-sitter's API is reference-heavy; you'll learn lifetimes the hard way.

**Acceptance criteria:**
- All four languages parse without panicking on a representative file
- Symbol counts match hand-validated expectations on test fixtures
- `cargo bench` (or a manual timer) shows < 10ms per 1000-line file

---

### Phase R4 — Embedding pipeline

**Outcome:** Every symbol has a vector embedding. Two backends behind a feature flag.

**Two paths shipped together:**
- **Local (default):** `fastembed-rs` (BGE-small, ~30MB model). Pure Rust, no network. Fast.
- **Provider:** HTTP call to user's already-configured Anthropic/OpenAI/Foundry/Ollama endpoint via the existing `LlmClient`. Embedding API uses the OpenAI-compatible `/embeddings` endpoint where available.

**Embedded vector index:** `instant-distance` (pure Rust HNSW, no native deps). Stored as a serialized blob in SQLite alongside the graph data so the "single file on disk" property holds.

**Agent ships:**
- `embed::Embedder` trait
- `LocalEmbedder` impl wrapping fastembed-rs
- `ProviderEmbedder` impl that POSTs to a config-driven URL
- HNSW index build + load functions
- `bytemuck` for casting `Vec<f32>` to `&[u8]` for SQLite storage
- Tests covering both backends

**Estimated time:** Agent 1 hr · You 3-4 hr

**Acceptance criteria:**
- Embedding 10K symbols with the local backend completes in < 30s
- Cosine search returns the seed symbol as the top result with similarity > 0.99
- Provider backend round-trips against a stub HTTP server

---

### Phase R5 — Incremental indexer + file watcher

**Outcome:** Save a file → graph updates within a second. No full re-index.

**Agent ships:**
- `notify` crate for cross-platform file watching
- Debounced batch processing: collect changes for 200ms, then flush
- Content-hash check (`xxhash-rust` or `blake3`) to skip unchanged files
- Worker pool — `rayon` for CPU-bound parsing, `tokio` for I/O
- Backpressure handling: bounded mpsc channel between watcher and worker pool
- Graceful shutdown on `Drop`
- Integration test: write file → wait for watcher → assert graph contains expected nodes

**Estimated time:** Agent 1 hr · You 4-6 hr

**Acceptance criteria:**
- Editing a file triggers re-parse within 500ms
- Editing a file with unchanged content is a no-op (hash check)
- Indexing the entire `vscode` repo (~6K files) completes in < 60s on a 2024 MacBook
- No goroutine-style leak: worker tasks join cleanly on shutdown

---

### Phase R6 — The 6 MCP tool implementations

**Outcome:** All six tools the orchestrator calls return real data.

| Tool | Implementation |
|---|---|
| `semantic_search` | HNSW similarity search over query embedding, filtered by optional file scope. Returns top-K with snippets. |
| `file_summary` | Pull symbols + their docstrings from the graph for one file. |
| `symbol_lookup` | SQL query on `symbols` table by name (with fuzzy match via `LIKE` + `LEVENSHTEIN` for close matches). |
| `dependency_traversal` | Recursive CTE over `imports` edges. Configurable max depth. |
| `impact_analysis` | Reverse traversal — who imports this file? Plus rev-deps of touched symbols (within N hops). |
| `find_references` | SQL query on `references` edges by target symbol. |

**Agent ships:**
- `search.rs` module with one fn per tool
- Comprehensive unit tests against fixtures
- Performance benchmarks — each tool should return results in < 50ms on a 10K-symbol graph

**Estimated time:** Agent 30 min · You 2-3 hr

**Acceptance criteria:**
- Tool surface matches `son-of-anton-core/src/agents/BaseAgent.ts:288-320` exactly
- Each tool's output schema is identical to what the orchestrator expects today
- Performance bench passes (sub-50ms p99 over 10K symbols)

---

### Phase R7 — napi-rs binding

**Outcome:** `npm install @son-of-anton/codegraph` works on macOS, Linux, Windows.

**Agent ships:**
- `crates/sota-codegraph-napi/Cargo.toml` with `napi`, `napi-derive` deps
- `#[napi]` async fns wrapping the core API:
  ```rust
  #[napi]
  pub async fn index_workspace(root: String) -> Result<IndexStats> { ... }
  
  #[napi]
  pub async fn semantic_search(query: String, limit: u32, scope: Option<Vec<String>>) -> Result<Vec<SearchHit>> { ... }
  
  #[napi]
  pub async fn file_summary(path: String) -> Result<FileSummary> { ... }
  
  // ... 4 more for the remaining tools
  ```
- `package.json` for the npm package using napi-rs's CLI scripts
- GitHub Actions workflow building binaries for darwin-arm64 / darwin-x64 / linux-x64 / linux-arm64 / win32-x64
- Per-platform npm sub-packages (`@son-of-anton/codegraph-darwin-arm64`, etc.) that the main package picks at install time
- Smoke test in CI: `node -e "console.log(require('@son-of-anton/codegraph'))"`

**Estimated time:** Agent 1 hr · You 3-4 hr

**Acceptance criteria:**
- All five platform builds succeed in CI
- Local `npm pack` produces a working tarball
- Smoke test passes on a fresh Node 22 install
- `napi-rs` async fns don't deadlock when called from Node concurrently (a real risk if `Send + Sync` is wrong)

---

### Phase R8 — Wire into MCP server

**Outcome:** The MCP server's 6 tools call the napi module instead of returning placeholder text.

**Agent ships:**
- `services/code-graph/mcp-server/src/index.ts` swaps placeholder responses for napi calls
- Lazy initialization: load the index on first tool call, not at startup. Reduces cold-start cost.
- Graceful fallback to placeholders if the napi binary failed to load (e.g. unsupported platform)
- Mode flag: `--backend=embedded|docker` (Docker path is still placeholders for now; R10 fills that in)
- Updated `services/code-graph/README.md`

**Estimated time:** Agent 30 min · You 1-2 hr

**Acceptance criteria:**
- All 6 tools return real data from the embedded backend when invoked
- A missing/broken napi binary does NOT crash the MCP server — falls back to placeholders with a warning log
- `--backend=docker` still works (placeholders) and registers as before

---

### Phase R9 — Replace the activation flow

**Outcome:** First-run UX is genuinely turnkey. No Docker prompt, no manual enable.

**Agent ships:**
- Extension activation auto-spawns the MCP server with `--backend=embedded`
- The "Enable Code Graph" palette command is renamed to **"Switch to Docker Code Graph (advanced)"** — opt-in upgrade
- First-run prompt removed: code graph is on by default
- Status bar shows `◇ Code Graph: Indexed (N files)` after first index completes
- New status bar quick-pick: Reindex / Show Logs / Switch Backend
- Migration: if user has the old `sota.mcp.servers` entry pointing at the Docker stack, leave it alone (they explicitly enabled Docker)

**Estimated time:** Agent 30 min · You 1-2 hr

**Acceptance criteria:**
- A fresh extension install (no settings, no Docker) produces a working code graph after first activation
- Indexing a 1K-file workspace shows the count in the status bar within 30s
- The "Switch to Docker Code Graph" command still works

---

### Phase R10 — Docker backend, swappable (OPTIONAL)

**Outcome:** Power users with very large monorepos can flip to FalkorDB+Qdrant for production-grade scale.

**Agent ships:**
- `crates/sota-codegraph-core/src/store/falkordb.rs` — `GraphStore` impl over `redis-rs` with FalkorDB Cypher queries
- `crates/sota-codegraph-core/src/embed.rs` — Qdrant client backend (existing logic stays)
- The MCP server picks based on `--backend=docker` flag
- The existing Docker stack at `services/code-graph/` populates from the same indexer (the indexer pushes to whichever store is configured)

**Estimated time:** Agent 1 hr · You 3-5 hr

**When to do this:** when you (or a user) actually hit SQLite limits — typically around 1M edges. Most users will be on the embedded backend forever.

**Acceptance criteria:**
- Same tool surface, same output schema as the embedded backend
- All embedded-backend tests pass against the FalkorDB backend (parameterized test harness)
- Performance scales: 100K-symbol graph queries return in < 50ms p99

---

## Estimated total

- **Sub-agent time:** ~7-9 hours of compute across all phases
- **Your time** (the learning + integration part): ~25-35 hours, spread however you want
- **Result:** a real, useful Rust crate ecosystem that ships in a real product, plus a deep working knowledge of Rust + Node FFI

## Suggested cadence

Don't try to do all of this in one weekend. Each phase produces a testable artifact, so you can stop after any one and have something useful.

| Sprint | Phases | What you'll have at the end |
|---|---|---|
| Weekend 1 | R1, R2 | Rust workspace + working SQLite-backed graph store |
| Weekend 2 | R3 | tree-sitter parses 4 languages into the graph |
| Weekend 3 | R4, R5 | Embeddings + incremental indexing on a file watcher |
| Weekend 4 | R6, R7, R8 | 6 tools + napi + MCP wiring → first end-to-end working version |
| Weekend 5 | R9 | Activation flow swap → real turnkey shipped to main |
| Later | R10 | Docker backend as opt-in upgrade (only if you need it) |

## Working pattern per phase

For each phase:

1. **Agent runs first** — generates the scaffolding, dependency lists, basic structure, smoke tests. Saves you mechanical work.
2. **Hand-off briefing** — a "what to look at, what to try, what's the trick" briefing for that phase.
3. **You build the substance** — bring questions back. Pair on debugging compiler errors, idiomatic patterns, design trade-offs.
4. **Agent runs again** to land polish (tests, CI, docs) once you're happy with the substance.

## Crate dependency manifest

Pinning likely versions for the Cargo.toml workspace. Update at start of each phase if newer versions are available.

```toml
# crates/sota-codegraph-core/Cargo.toml dependencies
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
anyhow = "1"
tracing = "0.1"
tokio = { version = "1", features = ["rt-multi-thread", "sync", "macros", "time"] }

# Phase R2
rusqlite = { version = "0.31", features = ["bundled"] }
rusqlite_migration = "1.2"

# Phase R3
tree-sitter = "0.22"
tree-sitter-typescript = "0.21"
tree-sitter-javascript = "0.21"
tree-sitter-python = "0.21"
tree-sitter-rust = "0.21"

# Phase R4
fastembed = "3"          # local embeddings
instant-distance = "0.6" # HNSW
bytemuck = "1"           # raw byte casts
reqwest = { version = "0.12", features = ["json"] }

# Phase R5
notify = "6"
xxhash-rust = { version = "0.8", features = ["xxh3"] }
rayon = "1"

# Phase R7
[dependencies.napi]
version = "2"
features = ["async", "napi6"]

[dependencies.napi-derive]
version = "2"
```

## Open questions to resolve as you go

- **Embedding model choice.** BGE-small (default in fastembed) is 384-dim, good general purpose. Alternatives: `all-MiniLM-L6-v2` (smaller), `bge-m3` (larger, better but heavy). Decide in R4.
- **HNSW parameters.** `instant-distance` defaults are reasonable. Tune `M` and `ef_construction` only if recall is poor at scale. Bench in R6.
- **Cross-platform CI matrix.** napi-rs covers darwin-arm64/x64, linux-x64/arm64, win32-x64. Decide in R7 whether to also cover linux-arm-musl, freebsd, etc. Probably not.
- **Backwards compat with the existing Docker users.** Phase R9 has to detect "user already enabled Docker" and not silently switch them. Audit the migration logic in that phase.
- **CLI consumption.** `son-of-anton-cli/package.json` should add `@son-of-anton/codegraph` as a dep too. Wire it in alongside R8.

## Why not write the MCP server itself in Rust?

We could. The savings are minimal (the MCP server is ~200 LOC, mostly JSON-RPC plumbing), and we'd lose:

- The TypeScript types we already share with the rest of the codebase
- Easy debugging from the existing JS toolchain
- The ability to keep the TypeScript shell as the integration boundary if we ever need to do Node-side things (logging, env handling)

The boundary is "Rust does the heavy lifting, Node orchestrates." That's the napi pattern's whole pitch.

---

**Status:** Plan only. Spawn Phase R1 when ready.
