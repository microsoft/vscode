# Phase R4 — Embeddings + HNSW

**Estimated time:** Agent 1 hr · You 3-4 hr.

## Goal

Every symbol's name + docstring + (optionally) source snippet gets a vector embedding. Vectors are stored in SQLite. An HNSW index supports nearest-neighbor search. Two embedding backends behind a trait: a local one (fastembed-rs) and a provider one (HTTP to OpenAI-compatible `/embeddings`).

## What you'll learn

- **Traits with associated functions, used polymorphically.** `Embedder` as a runtime-dispatched trait object (`Box<dyn Embedder>`).
- **`async` + `await`.** Your `ProviderEmbedder` will make HTTP calls. You'll see `async fn` and learn what `.await` actually does (yields to the runtime; doesn't block).
- **Zero-copy byte casting.** `bytemuck` reinterprets `Vec<f32>` as `&[u8]` for SQLite storage and back. No allocation.
- **Feature flags.** `[features]` in `Cargo.toml` lets you toggle `fastembed` on/off for users who don't want the 30MB model download.
- **HNSW basics.** Hierarchical Navigable Small Worlds — a graph-based approximate nearest neighbor index. `instant-distance` is the pure-Rust impl you'll use; you don't need to understand the algorithm to use it.

## Pre-requisites

- R3 done. You have `parse_file` returning `SymbolNode`s.
- `fastembed = { version = "5", features = ["ort-download-binaries"] }`, `instant-distance = "0.6"`, `bytemuck = "1"`, `reqwest = { version = "0.12", features = ["json"] }` in `Cargo.toml` (already present).

## Build it

### Step 1: The `Embedder` trait

```rust
// src/embed.rs

use crate::error::CodeGraphError;
use async_trait::async_trait;

#[async_trait]
pub trait Embedder: Send + Sync {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, CodeGraphError>;
    fn dimensions(&self) -> usize;
}
```

You'll need `async-trait = "0.1"` in `Cargo.toml` — `async fn` in traits is supported on stable Rust 1.75+, but `Send` bounds on returned futures are still cleanest with the macro for now.

**Why `Send + Sync`?** Once you wrap this in napi-rs (R7), Node may call you from any thread. Future-proof it now.

### Step 2: `LocalEmbedder` with fastembed

```rust
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use std::sync::Mutex;

pub struct LocalEmbedder {
    model: Mutex<TextEmbedding>,
    dims: usize,
}

impl LocalEmbedder {
    pub fn new() -> Result<Self, CodeGraphError> {
        let model = TextEmbedding::try_new(InitOptions::new(EmbeddingModel::BGESmallENV15))
            .map_err(|e| CodeGraphError::Parse(format!("fastembed init: {e}")))?;
        Ok(Self {
            model: Mutex::new(model),
            dims: 384,  // BGE-small dims; verify against fastembed docs
        })
    }
}

#[async_trait]
impl Embedder for LocalEmbedder {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, CodeGraphError> {
        let texts: Vec<String> = texts.to_vec();
        let model = self.model.clone();   // wait — Mutex isn't Clone
        // ...
    }

    fn dimensions(&self) -> usize { self.dims }
}
```

You'll notice you can't `.clone()` a `Mutex`. Two options:

1. **`Arc<Mutex<TextEmbedding>>`** — share ownership across `.await` boundaries.
2. **`tokio::task::spawn_blocking`** — move the work to a blocking thread pool. Better choice here because fastembed is CPU-bound and would otherwise block the async runtime.

Pattern with `spawn_blocking`:

```rust
async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, CodeGraphError> {
    let texts = texts.to_vec();
    let model = self.model.clone();   // requires Arc<Mutex<_>>
    tokio::task::spawn_blocking(move || {
        let guard = model.lock().unwrap();
        guard
            .embed(texts, None)
            .map_err(|e| CodeGraphError::Parse(format!("fastembed: {e}")))
    })
    .await
    .map_err(|e| CodeGraphError::Parse(format!("spawn_blocking: {e}")))?
}
```

Update the struct: `pub struct LocalEmbedder { model: Arc<Mutex<TextEmbedding>>, dims: usize }`.

**The lesson:** CPU-bound work in async runtimes needs `spawn_blocking`, otherwise one slow call starves every other future on the same runtime worker thread. This is the #1 mistake new tokio users make.

### Step 3: `ProviderEmbedder` over HTTP

```rust
pub struct ProviderEmbedder {
    client: reqwest::Client,
    endpoint: String,
    model: String,
    api_key: Option<String>,
    dims: usize,
}

#[derive(serde::Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

#[derive(serde::Deserialize)]
struct EmbedResponse {
    data: Vec<EmbedItem>,
}

#[derive(serde::Deserialize)]
struct EmbedItem {
    embedding: Vec<f32>,
}

#[async_trait]
impl Embedder for ProviderEmbedder {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, CodeGraphError> {
        let mut req = self.client
            .post(&self.endpoint)
            .json(&EmbedRequest { model: &self.model, input: texts });
        if let Some(key) = &self.api_key {
            req = req.bearer_auth(key);
        }
        let resp = req.send().await
            .map_err(|e| CodeGraphError::Parse(format!("http: {e}")))?
            .error_for_status()
            .map_err(|e| CodeGraphError::Parse(format!("http status: {e}")))?
            .json::<EmbedResponse>()
            .await
            .map_err(|e| CodeGraphError::Parse(format!("json: {e}")))?;
        Ok(resp.data.into_iter().map(|i| i.embedding).collect())
    }
    fn dimensions(&self) -> usize { self.dims }
}
```

Test against a stub HTTP server — `wiremock = "0.6"` as a dev-dep is the standard tool.

### Step 4: Storing vectors in SQLite

Add a column to your `symbols` table via a new migration (don't edit the old migration string — append a new one):

```sql
ALTER TABLE symbols ADD COLUMN embedding BLOB;
```

In code:

```rust
fn store_embedding(&mut self, symbol_id: SymbolId, vec: &[f32]) -> Result<(), CodeGraphError> {
    let bytes: &[u8] = bytemuck::cast_slice(vec);
    self.conn.execute(
        "UPDATE symbols SET embedding = ?1 WHERE id = ?2",
        params![bytes, symbol_id.0],
    )?;
    Ok(())
}

fn load_embedding(&self, symbol_id: SymbolId) -> Result<Option<Vec<f32>>, CodeGraphError> {
    let bytes: Option<Vec<u8>> = self.conn.query_row(
        "SELECT embedding FROM symbols WHERE id = ?1",
        params![symbol_id.0],
        |row| row.get(0),
    )?;
    Ok(bytes.map(|b| bytemuck::cast_slice::<u8, f32>(&b).to_vec()))
}
```

`bytemuck::cast_slice` is safe because `f32` is plain old data with no padding. Read [the bytemuck docs](https://docs.rs/bytemuck) once; you'll come back to this trick repeatedly.

**Endianness note:** `cast_slice` uses native byte order. If you ever copy the DB across architectures (you won't), they'd need to agree. For a local-only file this is fine.

### Step 5: HNSW index with `instant-distance`

```rust
use instant_distance::{Builder, HnswMap, Point, Search};

#[derive(Clone, Copy)]
struct Vec384([f32; 384]);

impl Point for Vec384 {
    fn distance(&self, other: &Self) -> f32 {
        // cosine distance
        let dot: f32 = self.0.iter().zip(other.0.iter()).map(|(a, b)| a * b).sum();
        let na: f32 = self.0.iter().map(|x| x * x).sum::<f32>().sqrt();
        let nb: f32 = other.0.iter().map(|x| x * x).sum::<f32>().sqrt();
        1.0 - dot / (na * nb)
    }
}

pub struct VectorIndex {
    map: HnswMap<Vec384, SymbolId>,
}

impl VectorIndex {
    pub fn build(items: Vec<(Vec384, SymbolId)>) -> Self {
        let (points, values): (Vec<_>, Vec<_>) = items.into_iter().unzip();
        Self {
            map: Builder::default().build(points, values),
        }
    }

    pub fn search(&self, query: &Vec384, k: usize) -> Vec<(SymbolId, f32)> {
        let mut search = Search::default();
        self.map
            .search(query, &mut search)
            .take(k)
            .map(|item| (*item.value, item.distance))
            .collect()
    }
}
```

The fixed-size `[f32; 384]` is a small wart — if you ever change embedding models you'd need to change the array size. A more flexible design uses `Vec<f32>` and implements `Point` over `&[f32]`. Pick whichever you prefer; the array version is faster.

### Step 6: Persisting the HNSW index

Two options:

1. **Rebuild on startup.** Open SQLite, stream all `(symbol_id, embedding)` rows, call `VectorIndex::build`. Simple, slow for big graphs (~1s per 10k vectors).
2. **Serialize the HNSW.** `instant-distance::HnswMap` is `Serialize`/`Deserialize`. Store it as a blob in a single-row table.

Start with option 1. Switch to option 2 only if rebuild time becomes a UX problem.

## Acceptance criteria

- [ ] Embedding 10K symbols with the local backend completes in <30s
- [ ] Cosine search returns the seed symbol as the top result with similarity >0.99
- [ ] Provider backend round-trips against a `wiremock` stub

## Common errors

- **fastembed downloads the model on first call.** Slow CI, slow tests. Pre-download in a one-time setup step or gate fastembed tests behind `#[ignore]`.
- **`async fn` in trait without `async-trait`** — works on Rust 1.75+ but the trait won't be `dyn`-compatible (no trait objects). For now, use the `async-trait` crate.
- **`Send` errors when crossing `.await`** — usually means you're holding a `MutexGuard` across an await. Use `parking_lot::Mutex` (synchronous, no async support) inside `spawn_blocking`, or `tokio::sync::Mutex` (async).

## Next

[Phase R5 — Incremental indexer + file watcher](./r5-incremental-indexer.md).
