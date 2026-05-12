# Phase R10 — Docker backend (optional)

**Estimated time:** Agent 1 hr · You 3-5 hr.

**Read this section once:** skip this phase unless you, or a real user, have actually hit SQLite limits. The plan calls out ~1M edges as the rough threshold. For most users, the embedded backend is forever.

## Goal

A second implementation of `GraphStore` backed by FalkorDB (Cypher over Redis protocol), plus a Qdrant-backed embedding store. The MCP server picks via `--backend=docker`. Same tool surface, same output shapes.

## What you'll learn

- **Trait-based backend swapping in earnest.** Until now, `GraphStore` has had one implementation. R10 stress-tests the trait: does it have the right methods, in the right shape, to support both backends?
- **Redis protocol via `redis-rs` or `bb8-redis`.** Connection pooling, pipelining, error handling.
- **Cypher fundamentals.** FalkorDB's query language.
- **Parameterized integration tests.** Run the same test suite against both backends.

## Pre-requisites

- The embedded backend (R1-R9) is shipped and stable.
- You've measured that SQLite is the bottleneck in real workloads — not just "I read about FalkorDB and want to try it."

## Build it

### Step 1: Connection scaffolding

```rust
// src/store/falkordb.rs

use redis::{aio::ConnectionManager, AsyncCommands, Client};

pub struct FalkorStore {
    conn: ConnectionManager,
    graph_name: String,
}

impl FalkorStore {
    pub async fn connect(url: &str, graph_name: String) -> Result<Self, CodeGraphError> {
        let client = Client::open(url)
            .map_err(|e| CodeGraphError::Parse(format!("redis: {e}")))?;
        let conn = ConnectionManager::new(client).await
            .map_err(|e| CodeGraphError::Parse(format!("redis manager: {e}")))?;
        Ok(Self { conn, graph_name })
    }
}
```

Add `redis = { version = "0.25", features = ["tokio-comp", "connection-manager"] }` to `Cargo.toml`.

### Step 2: Cypher upserts

FalkorDB's Cypher dialect:

```rust
impl GraphStore for FalkorStore {
    fn upsert_file(&mut self, file: FileNode) -> Result<FileId, CodeGraphError> {
        // Cypher MERGE for idempotency
        let q = "MERGE (f:File {path: $path})
                 SET f.language = $lang, f.content_hash = $hash
                 RETURN id(f)";
        // Execute via redis::cmd("GRAPH.QUERY")...
        todo!()
    }
    // ...
}
```

You'll notice the trait's methods take `&mut self` but Redis I/O is async. That mismatch is the design tension. Options:

1. **Block on `futures::executor::block_on`** inside the sync trait method. Works, ugly, can deadlock under nested runtimes.
2. **Convert the trait to async.** `async fn upsert_file(...)` with `#[async_trait]`. Cleaner; ripples through `index.rs` and the napi binding.
3. **Two-tier traits.** Keep `GraphStore` sync (for SQLite); add `AsyncGraphStore` (for FalkorDB). Picks one at compile time via feature flags.

Option 2 is the right long-term move. Do it now if you're committing to R10; deferring means a painful retrofit later.

### Step 3: Reuse the test suite

The CRUD/idempotency tests you wrote for SQLite should run against both backends. Parameterize:

```rust
async fn round_trip<S: GraphStore>(mut store: S) {
    let id = store.upsert_file(/* ... */).await.unwrap();
    // ... assertions
}

#[tokio::test]
async fn sqlite_round_trip() {
    let (_dir, store) = fresh_sqlite_store();
    round_trip(store).await;
}

#[tokio::test]
async fn falkor_round_trip() {
    let store = FalkorStore::connect("redis://localhost:6379", "test".into()).await.unwrap();
    round_trip(store).await;
}
```

`#[tokio::test]` requires `tokio` with the `macros` feature.

For the Falkor test you need a real FalkorDB container. `testcontainers = "0.16"` lets you start one in the test setup; or gate it behind `#[ignore]` and a CI job that has FalkorDB available.

### Step 4: Same tool surface in `search.rs`

The six tools in R6 should be generic over the backend:

```rust
pub async fn file_summary<S: GraphStore>(store: &S, path: &str) -> Result<FileSummary, CodeGraphError> {
    // ...
}
```

This is the payoff for the trait design from R1. If you find yourself unable to express a query through the trait — that's a sign the trait needs a new method, not that you need a downcast.

### Step 5: Picking the backend at startup

In the napi crate (or in the MCP server's CLI args):

```rust
#[napi]
pub async fn init(db_path: String, backend: String) -> napi::Result<()> {
    let engine = match backend.as_str() {
        "embedded" => Engine::sqlite(&db_path).await?,
        "docker" => Engine::falkor("redis://localhost:6379").await?,
        _ => return Err(napi::Error::from_reason("unknown backend")),
    };
    // ...
}
```

`Engine` becomes an enum with two variants (or a `Box<dyn AsyncGraphStore>`). Whichever you prefer.

## Acceptance criteria

- [ ] Same tool surface, same output schema as the embedded backend
- [ ] All embedded-backend tests pass against the FalkorDB backend (parameterized harness)
- [ ] 100K-symbol graph queries return in <50ms p99

## Common errors

- **Connection refused** — FalkorDB container not running, wrong port, firewall.
- **Cypher parse errors** — FalkorDB's Cypher is a subset of Neo4j's; check their docs before assuming a feature works.
- **Async-trait coherence errors** — when migrating sync→async traits, you may need to box returned futures explicitly until `async fn in trait` is fully stable for `dyn` use.

## You're done.

If you've reached the end of R10, you've built a real Rust+Node FFI product with two interchangeable backends, learned tree-sitter's query language, fought the borrow checker for a few weekends, and now have a project that ships in a real product.

Send the agent your reflection notes. Onwards.
