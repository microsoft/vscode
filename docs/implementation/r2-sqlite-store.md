# Phase R2 — SQLite-backed `GraphStore`

**Status:** Functionally done. Perf bench (`bench_10k_file_inserts_under_500ms`) is `#[ignore]`d until you add batched writes — that's the warm-up at the bottom of this page.

## Goal

`SqliteStore` implements `GraphStore` with real persistent CRUD for files, symbols, and edges. Migrations run on first open and are no-ops on subsequent opens. WAL + foreign keys enabled.

## What you learned

- **`rusqlite::Connection` lifetimes.** A `Connection` owns the DB handle. You can't have two mutable borrows at once. `INSERT`/`UPDATE`/`DELETE` go through `&mut self`.
- **The `params!` macro.** Type-safe parameter binding into `?1, ?2, ...` placeholders. Use it; never string-interpolate SQL.
- **`?` for error propagation across error types.** Your function returns `Result<_, CodeGraphError>`, but `conn.execute()` returns `Result<_, rusqlite::Error>`. `?` works because `CodeGraphError` has `#[from] rusqlite::Error` on its `Database` variant, which auto-generates the `From` impl.
- **SQLite pragmas matter.** WAL mode for concurrency, foreign keys to enforce relational integrity, synchronous=NORMAL for the right perf/safety trade-off.
- **`INSERT OR REPLACE` for idempotent upserts.** The schema's `UNIQUE` constraints define the upsert key.
- **`tempfile` for tests.** Real filesystem, isolated per-test, auto-cleaned on drop. `:memory:` would be faster but you can't reopen it across two `SqliteStore::new` calls, so it's no good for migration-idempotency tests.

## What's in the repo now

- `store/sqlite.rs` — `SqliteStore`, `migrations()`, the three `upsert_*` impls, and 11 tests covering migrations, CRUD round-trips, idempotency, cascade delete, and the FK pragma.
- Pragmas: `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`.
- `tempfile` is a dev-dependency.

## Patterns worth re-reading

### The `&mut self` borrow checker dance

```rust
fn upsert_file(&mut self, file: FileNode) -> Result<FileId, CodeGraphError> {
    self.conn.execute(/* ... */)?;
    let id = self.conn.last_insert_rowid();
    Ok(FileId(id))
}
```

Two sequential calls to `self.conn` are fine because each borrow ends before the next one starts. But this won't compile:

```rust
let stmt = self.conn.prepare("...")?;  // immutable borrow of self.conn
self.conn.execute("...")?;             // ERROR: mutable borrow while immutable borrow exists
```

When the borrow checker bites, the fix is almost always: scope the first borrow tighter (drop it before the next call), or restructure so you don't need both at once.

### Lossy conversion: `u64` content_hash to SQLite `INTEGER`

SQLite stores integers as `i64`. `rusqlite` lets you bind a `u64` but errors if the value > `i64::MAX`. Your content hashes from `xxhash` will be in that range half the time. Two options:
- Cast: store `i64` everywhere (lose half the hash space, fine in practice — collisions are still astronomically rare).
- Reinterpret bits: `i64::from_ne_bytes(hash.to_ne_bytes())`. No loss. Slightly weird-looking.

The current code passes the `u64` directly. If you hit overflow errors later, switch to bit-reinterpret.

## R2 perf warm-up: make `bench_10k_file_inserts_under_500ms` pass

This is the smallest possible piece of "real" Rust work left in R2 and it teaches you two specific things: `Transaction` lifetimes and `prepare_cached`.

### Why it currently fails

```rust
fn upsert_file(&mut self, file: FileNode) -> Result<FileId, CodeGraphError> {
    self.conn.execute(/* ... */)?;
    // ...
}
```

Every `execute()` call commits its own implicit transaction. With WAL, that's a fast append — but it's still 10,000 commits to do 10,000 inserts. On a 2024 MacBook, you'll measure 1-3 seconds, not <500ms.

### The fix

Wrap N inserts in one transaction. The pattern:

```rust
pub fn upsert_files_batch(
    &mut self,
    files: impl IntoIterator<Item = FileNode>,
) -> Result<Vec<FileId>, CodeGraphError> {
    let tx = self.conn.transaction()?;  // BorrowMut<Connection> — exclusive

    let mut ids = Vec::new();
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO files (path, language, content_hash, indexed_at) \
             VALUES (?1, ?2, ?3, ?4)",
        )?;

        for file in files {
            let path_str = file.path.to_string_lossy().to_string();
            let language_str = format!("{:?}", file.language);
            let timestamp = now_secs();
            stmt.execute(params![path_str, language_str, file.content_hash, timestamp])?;
            ids.push(FileId(tx.last_insert_rowid()));
        }
    }

    tx.commit()?;
    Ok(ids)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
```

### The Rust lessons hiding in there

1. **`self.conn.transaction()` returns a `Transaction<'_>` that borrows `&mut self.conn`.** While `tx` is alive, you can't touch `self.conn`. The block scoping with `{ ... }` around the `prepare` + `execute` loop ensures `stmt` (which borrows `&tx`) drops before you call `tx.commit()`. If you remove the braces, the compiler will yell — because `commit` consumes `tx`, but `stmt` is still borrowing it.

2. **`prepare` once, `execute` many.** SQLite parses your SQL into a statement object. Inside the inner loop, you reuse that statement with new params. This is the bulk of the perf win.

3. **`impl IntoIterator<Item = FileNode>` instead of `Vec<FileNode>`.** Lets callers pass `Vec`, slices, iterators, anything — without forcing them to allocate a `Vec` just to call you. Small ergonomic detail; very Rusty.

### Once it's written

Update the test:

```rust
#[test]  // remove #[ignore]
fn bench_10k_file_inserts_under_500ms() {
    let (_dir, mut store) = fresh_store();
    let files: Vec<_> = (0..10_000)
        .map(|i| FileNode {
            path: PathBuf::from(format!("/tmp/foo_{i}.rs")),
            language: Language::Rust,
            content_hash: i as u64,
        })
        .collect();

    let start = std::time::Instant::now();
    store.upsert_files_batch(files).unwrap();
    let elapsed = start.elapsed();
    assert!(elapsed.as_millis() < 500, "10k inserts took {elapsed:?}");
}
```

Run with `cargo test --release` for a realistic measurement (debug mode is ~10× slower).

### Trait or inherent method?

`upsert_files_batch` could go on the `GraphStore` trait, or stay as an inherent method on `SqliteStore`. My recommendation: keep it inherent for now. The trait stays small; you can lift it later when the FalkorDB backend needs the same shape. Premature trait expansion is a real anti-pattern.

## Acceptance criteria (from `plan.md`)

- [x] `cargo test sqlite_store` passes with all CRUD coverage
- [ ] 10K nodes inserted in <500ms (gated on the warm-up above)
- [x] Schema migration runs cleanly on a fresh DB
- [x] Re-running migrations on an existing DB is a no-op

## Next

[Phase R3 — Tree-sitter integration](./r3-tree-sitter.md). This is the meatiest learning phase in the project.
