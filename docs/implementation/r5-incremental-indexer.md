# Phase R5 — Incremental indexer + file watcher

**Estimated time:** Agent 1 hr · You 4-6 hr.

## Goal

Save a file → graph updates within a second. No full re-index. Crash-safe shutdown.

## What you'll learn

- **`tokio` channels (`mpsc::channel`).** Send work between async tasks with bounded buffers for backpressure.
- **`tokio::spawn` vs `tokio::task::spawn_blocking`.** When to schedule on the async runtime vs the blocking thread pool. Tree-sitter parsing is CPU-bound — `spawn_blocking`.
- **`rayon` for parallel CPU work.** The blocking-pool worker can fan out parsing across cores with `par_iter`.
- **Graceful shutdown via `Drop`.** When the `Indexer` is dropped, its worker tasks need to wind down cleanly. Pattern: send a shutdown signal, `join` the worker handle.
- **Content hashing as a cache key.** Skip work for unchanged files.

## Pre-requisites

- R3 done — `parse_file` works.
- R4 done — `Embedder` trait + at least one impl.
- `notify = "6"`, `xxhash-rust`, `rayon` already in `Cargo.toml`.

## Build it

### Step 1: Initial bulk indexer (no watcher yet)

Just walk a directory and index everything. No incremental logic. No async. Pure rayon.

```rust
// src/index.rs

use std::path::{Path, PathBuf};
use rayon::prelude::*;
use walkdir::WalkDir;     // add walkdir = "2" to Cargo.toml

use crate::error::CodeGraphError;
use crate::parse::{parse_file, ParsedFile, detect_language};
use crate::store::{GraphStore, sqlite::SqliteStore};

pub fn bulk_index(store: &mut SqliteStore, root: &Path) -> Result<usize, CodeGraphError> {
    let paths: Vec<PathBuf> = WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .filter(|p| detect_language(p).is_some())
        .collect();

    let parsed: Vec<ParsedFile> = paths
        .par_iter()
        .filter_map(|p| parse_file(p).ok())
        .collect();

    for pf in &parsed {
        let file_id = store.upsert_file(pf.file.clone())?;
        for sym in &pf.symbols {
            let mut sym = sym.clone();
            sym.file_id = file_id;
            store.upsert_symbol(sym)?;
        }
        // edges later (R6 resolution pass)
    }

    Ok(parsed.len())
}
```

Notice: parsing parallel with rayon, persistence sequential. That's because `&mut SqliteStore` is a single-writer borrow. We don't need to parallelize SQLite writes; WAL+batched transactions are fast enough.

Test it against `tests/fixtures/`:

```rust
#[test]
fn bulk_indexes_fixture_dir() {
    let dir = tempfile::TempDir::new().unwrap();
    let db = dir.path().join("graph.db");
    let mut store = SqliteStore::new(db.to_str().unwrap()).unwrap();
    let n = bulk_index(&mut store, Path::new("tests/fixtures")).unwrap();
    assert!(n > 0);
}
```

### Step 2: Content-hash gate

Skip files whose content hash matches what's already in the DB:

```rust
fn needs_reindex(store: &SqliteStore, path: &Path, source: &str) -> bool {
    let hash = xxhash_rust::xxh3::xxh3_64(source.as_bytes());
    let path_str = path.to_string_lossy().to_string();
    let existing: Option<i64> = store.conn
        .query_row(
            "SELECT content_hash FROM files WHERE path = ?1",
            rusqlite::params![path_str],
            |row| row.get(0),
        )
        .ok();
    match existing {
        Some(h) if h as u64 == hash => false,
        _ => true,
    }
}
```

Add a quick test that runs `bulk_index` twice and asserts the second run does the same thing without re-parsing (you'd instrument with a counter or a tracing span).

### Step 3: File watcher

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};
use tokio::sync::mpsc;

pub fn watch(root: PathBuf, tx: mpsc::Sender<PathBuf>) -> Result<RecommendedWatcher, CodeGraphError> {
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            for path in event.paths {
                let _ = tx.blocking_send(path);
            }
        }
    })
    .map_err(|e| CodeGraphError::Parse(format!("watcher: {e}")))?;

    watcher.watch(&root, RecursiveMode::Recursive)
        .map_err(|e| CodeGraphError::Parse(format!("watch: {e}")))?;

    Ok(watcher)
}
```

The watcher's callback runs on `notify`'s own thread, not your tokio runtime. `tx.blocking_send` is correct here. The watcher itself must be *held alive* — if you drop the `RecommendedWatcher`, watching stops. So the caller owns it.

### Step 4: Debounce

File save events often arrive in bursts (editor writes a temp file, renames it, touches mtime). Collect changes for 200ms, then flush.

```rust
use std::collections::HashSet;
use std::time::Duration;
use tokio::time::{sleep_until, Instant};

pub async fn debounce_loop(
    mut rx: mpsc::Receiver<PathBuf>,
    mut on_batch: impl FnMut(Vec<PathBuf>),
) {
    let mut pending: HashSet<PathBuf> = HashSet::new();
    let mut deadline: Option<Instant> = None;

    loop {
        tokio::select! {
            maybe = rx.recv() => {
                match maybe {
                    Some(p) => {
                        pending.insert(p);
                        deadline = Some(Instant::now() + Duration::from_millis(200));
                    }
                    None => break,   // sender dropped
                }
            }
            _ = async { sleep_until(deadline.unwrap_or_else(Instant::now)).await }, if deadline.is_some() => {
                if !pending.is_empty() {
                    on_batch(pending.drain().collect());
                }
                deadline = None;
            }
        }
    }
    if !pending.is_empty() {
        on_batch(pending.into_iter().collect());
    }
}
```

`tokio::select!` is the multi-event waiter. The `if deadline.is_some()` is a guard: don't even consider the timer branch if there's no deadline set. This pattern shows up everywhere in async Rust — worth understanding well.

### Step 5: Wire it all together

```rust
pub struct Indexer {
    _watcher: RecommendedWatcher,
    _handle: tokio::task::JoinHandle<()>,
    shutdown: mpsc::Sender<()>,
}

impl Indexer {
    pub async fn start(root: PathBuf, mut store: SqliteStore) -> Result<Self, CodeGraphError> {
        let (path_tx, path_rx) = mpsc::channel(1024);
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        let watcher = watch(root, path_tx)?;

        let handle = tokio::spawn(async move {
            tokio::select! {
                _ = debounce_loop(path_rx, |batch| {
                    // CPU work: hop to blocking pool
                    let parsed: Vec<_> = batch
                        .par_iter()
                        .filter_map(|p| parse_file(p).ok())
                        .collect();
                    for pf in parsed {
                        let _ = persist(&mut store, pf);
                    }
                }) => {}
                _ = shutdown_rx.recv() => {}
            }
        });

        Ok(Self {
            _watcher: watcher,
            _handle: handle,
            shutdown: shutdown_tx,
        })
    }
}

impl Drop for Indexer {
    fn drop(&mut self) {
        let _ = self.shutdown.try_send(());
        // Note: we can't .await in Drop. The runtime will reap the task.
    }
}

fn persist(store: &mut SqliteStore, pf: ParsedFile) -> Result<(), CodeGraphError> {
    let file_id = store.upsert_file(pf.file)?;
    for mut sym in pf.symbols {
        sym.file_id = file_id;
        store.upsert_symbol(sym)?;
    }
    Ok(())
}
```

There are a few rough edges in that skeleton — passing `&mut store` into a closure that's `Send` requires `Arc<Mutex<SqliteStore>>` or a dedicated writer task. The cleaner pattern: a single owned `SqliteStore` lives in the spawned task; UI/CLI code sends commands through a channel.

I'm flagging the messiness on purpose — designing the ownership shape for the indexer is the *interesting* Rust problem in this phase. Don't accept the first thing that compiles; sit with the design for a bit.

### Step 6: Graceful shutdown test

```rust
#[tokio::test]
async fn indexer_shuts_down_cleanly() {
    let dir = tempfile::TempDir::new().unwrap();
    let db = dir.path().join("graph.db");
    let store = SqliteStore::new(db.to_str().unwrap()).unwrap();
    let indexer = Indexer::start(dir.path().to_path_buf(), store).await.unwrap();
    drop(indexer);
    // If shutdown leaks, the test process will hang. CI will catch it.
}
```

## Common errors

- **"future cannot be sent between threads safely"** — something inside your async block isn't `Send`. Usually `Rc` (use `Arc`) or `RefCell` (use `Mutex`).
- **Watcher stops watching unexpectedly** — you dropped the `RecommendedWatcher`. Keep it alive in your struct.
- **Tests hang** — usually a channel-receiver still waiting for a sender that's been moved into a long-lived task. `drop(sender)` before joining.

## Acceptance criteria

- [ ] Editing a file triggers re-parse within 500ms
- [ ] Editing a file with unchanged content is a no-op
- [ ] Indexing a ~6K-file repo completes in <60s
- [ ] No goroutine-style leaks — `Drop` joins worker tasks

## Next

[Phase R6 — The 6 MCP tool implementations](./r6-mcp-tools.md).
