# Phase R6 — The 6 MCP tool implementations

**Estimated time:** Agent 30 min · You 2-3 hr.

## Goal

Six pure functions in `search.rs`, each returning a typed result that maps cleanly to the MCP tool schema the orchestrator already expects. Tests against the fixture graph from R3-R5. <50ms p99 over a 10K-symbol corpus.

## The six tools

| Tool | Implementation strategy |
|---|---|
| `semantic_search` | Embed the query (using `Embedder`), nearest-neighbor via HNSW, hydrate top-K with snippets from SQLite |
| `file_summary` | One SQL query: symbols + docstrings WHERE file_id = ? |
| `symbol_lookup` | SQL LIKE for prefix/contains; optionally LEVENSHTEIN for fuzzy |
| `dependency_traversal` | Recursive CTE over `edges` WHERE kind = 'Imports' |
| `impact_analysis` | Reverse recursive CTE — who imports this? |
| `find_references` | SQL on `edges` WHERE kind = 'References' AND to_node = ? |

## What you'll learn

- **Recursive CTEs in SQLite.** Graph traversal as SQL, not Rust.
- **When to push compute into SQL vs Rust.** Filters and joins → SQL. Domain transformations → Rust.
- **Output schemas.** The orchestrator already has expectations. Match them exactly; don't invent your own shapes.
- **Benchmarking with `criterion`.** Real perf numbers, not just `Instant::now()`.

## Pre-requisites

- R3 + R4 + R5 done.
- The graph has files, symbols, edges, and embeddings.

## Build it

### Step 1: Output types that match the orchestrator

Look at the orchestrator's TS types (referenced in `plan.md` at `son-of-anton-core/src/agents/BaseAgent.ts:288-320`). Mirror them in Rust:

```rust
// src/search.rs

#[derive(serde::Serialize)]
pub struct SearchHit {
    pub symbol: String,
    pub file: String,
    pub kind: String,
    pub snippet: String,
    pub score: f32,
}

#[derive(serde::Serialize)]
pub struct FileSummary {
    pub path: String,
    pub language: String,
    pub symbols: Vec<SymbolEntry>,
}

#[derive(serde::Serialize)]
pub struct SymbolEntry {
    pub name: String,
    pub kind: String,
    pub doc_string: Option<String>,
    pub range: (usize, usize),
}

// ... and so on for the other tools
```

These types implement `Serialize`. They cross the JS boundary as JSON. Match field names exactly.

### Step 2: `file_summary` (warm-up, all SQL)

```rust
pub fn file_summary(store: &SqliteStore, path: &str) -> Result<FileSummary, CodeGraphError> {
    let (id, language): (i64, String) = store.conn.query_row(
        "SELECT id, language FROM files WHERE path = ?1",
        rusqlite::params![path],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let mut stmt = store.conn.prepare(
        "SELECT name, kind, docstring, start_byte, end_byte
         FROM symbols WHERE file_id = ?1
         ORDER BY start_byte",
    )?;

    let symbols: Vec<SymbolEntry> = stmt.query_map(rusqlite::params![id], |row| {
        Ok(SymbolEntry {
            name: row.get(0)?,
            kind: row.get(1)?,
            doc_string: row.get(2)?,
            range: (row.get::<_, i64>(3)? as usize, row.get::<_, i64>(4)? as usize),
        })
    })?
    .collect::<Result<_, _>>()?;

    Ok(FileSummary { path: path.into(), language, symbols })
}
```

Test:

```rust
#[test]
fn file_summary_returns_symbols() {
    // populate store from a fixture, call file_summary, assert
}
```

### Step 3: `dependency_traversal` (recursive CTE)

This is the most interesting SQL in the project. SQLite supports recursive CTEs:

```rust
pub fn dependency_traversal(
    store: &SqliteStore,
    start_file: &str,
    max_depth: u32,
) -> Result<Vec<String>, CodeGraphError> {
    let mut stmt = store.conn.prepare(
        "WITH RECURSIVE deps(node, depth) AS (
            SELECT id, 0 FROM files WHERE path = ?1
            UNION
            SELECT e.to_node, d.depth + 1
            FROM edges e
            JOIN deps d ON e.from_node = d.node
            WHERE e.kind = 'Imports' AND d.depth < ?2
         )
         SELECT DISTINCT f.path
         FROM deps d JOIN files f ON f.id = d.node
         WHERE d.depth > 0",
    )?;

    let paths: Vec<String> = stmt.query_map(
        rusqlite::params![start_file, max_depth],
        |row| row.get(0),
    )?
    .collect::<Result<_, _>>()?;

    Ok(paths)
}
```

The recursion: start with the seed file (depth 0), then keep adding files reachable by `Imports` edges until the depth limit. `UNION` (not `UNION ALL`) gives you de-duplication for free.

Walk through it once on paper before writing it. CTEs are surprisingly readable but the first one always feels like magic.

### Step 4: `semantic_search` (HNSW + SQL hydrate)

```rust
pub async fn semantic_search(
    store: &SqliteStore,
    index: &VectorIndex,
    embedder: &dyn Embedder,
    query: &str,
    k: usize,
) -> Result<Vec<SearchHit>, CodeGraphError> {
    let query_vec = embedder.embed(&[query.to_string()]).await?
        .into_iter().next()
        .ok_or_else(|| CodeGraphError::Parse("no embedding".into()))?;

    // Wrap as Vec384 (or whatever your dim wrapper is)
    let qp = vec_to_point(&query_vec)?;
    let hits = index.search(&qp, k);

    let ids: Vec<i64> = hits.iter().map(|(id, _)| id.0).collect();

    // Hydrate from SQLite — one query with an IN clause
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT s.name, s.kind, f.path, s.start_byte, s.end_byte
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE s.id IN ({})",
        placeholders
    );

    let mut stmt = store.conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(ids.iter()),
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)? as usize,
            row.get::<_, i64>(4)? as usize,
        )),
    )?
    .collect::<Result<Vec<_>, _>>()?;

    let mut by_id: std::collections::HashMap<i64, _> = std::collections::HashMap::new();
    for (i, r) in rows.into_iter().enumerate() {
        by_id.insert(ids[i], r);
    }

    let mut out = Vec::new();
    for (id, distance) in hits {
        if let Some((name, kind, path, start, end)) = by_id.get(&id.0) {
            out.push(SearchHit {
                symbol: name.clone(),
                file: path.clone(),
                kind: kind.clone(),
                snippet: read_snippet(path, *start, *end).unwrap_or_default(),
                score: 1.0 - distance,
            });
        }
    }
    Ok(out)
}

fn read_snippet(path: &str, start: usize, end: usize) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(String::from_utf8_lossy(&bytes[start..end.min(bytes.len())]).into_owned())
}
```

The hot path: embed → HNSW → SQL hydrate → snippet read. All fast.

### Step 5: Benchmarks

```bash
cargo add --dev criterion
```

`benches/search.rs`:

```rust
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_file_summary(c: &mut Criterion) {
    // Set up a 10K-symbol store once (pre-populated tempdir)
    c.bench_function("file_summary", |b| {
        b.iter(|| {
            // call file_summary on a known path
        });
    });
}

criterion_group!(benches, bench_file_summary);
criterion_main!(benches);
```

Add to `Cargo.toml`:

```toml
[[bench]]
name = "search"
harness = false
```

Run with `cargo bench`.

## Acceptance criteria

- [ ] Tool surface matches the orchestrator's expectations exactly
- [ ] Each tool's JSON output matches the expected schema
- [ ] p99 latency <50ms over a 10K-symbol graph

## Next

[Phase R7 — napi-rs binding](./r7-napi-binding.md).
