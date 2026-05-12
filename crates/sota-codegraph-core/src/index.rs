use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use rayon::prelude::*;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::embed::Embedder;
use crate::error::CodeGraphError;
use crate::parse::{detect_language, parse_file, ParsedFile, RawEdge};
use crate::store::sqlite::SqliteStore;
use crate::store::GraphStore;
use crate::types::{Edge, FileId, NodeId, SymbolId};

/// Summary statistics returned by `bulk_index`.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct IndexStats {
    pub files: usize,
    pub symbols: usize,
    pub edges: usize,
    pub skipped_unchanged: usize,
}

/// Index every supported source file under `root` into `store`.
///
/// Files whose `content_hash` already matches what's in the database are
/// skipped. Parsing fans out across rayon's thread pool; persistence runs on
/// the caller's thread because `SqliteStore` is single-writer.
pub fn bulk_index(
    store: &mut SqliteStore,
    root: &Path,
) -> Result<IndexStats, CodeGraphError> {
    let paths = collect_source_files(root);
    let existing_hashes = load_existing_hashes(store)?;

    let to_parse: Vec<PathBuf> = paths
        .iter()
        .filter(|p| {
            let source = match std::fs::read_to_string(p) {
                Ok(s) => s,
                Err(_) => return false,
            };
            let hash = xxhash_rust::xxh3::xxh3_64(source.as_bytes());
            existing_hashes
                .get(&p.to_string_lossy().to_string())
                .map(|existing| *existing != hash)
                .unwrap_or(true)
        })
        .cloned()
        .collect();

    let skipped_unchanged = paths.len() - to_parse.len();

    let parsed: Vec<ParsedFile> = to_parse
        .par_iter()
        .filter_map(|p| parse_file(p).ok())
        .collect();

    let mut stats = IndexStats {
        skipped_unchanged,
        ..Default::default()
    };

    // Persist files + symbols, building a name → symbol_id index for edge resolution.
    let mut symbol_by_name: HashMap<String, Vec<SymbolId>> = HashMap::new();
    let mut file_by_path: HashMap<String, FileId> = HashMap::new();
    let mut deferred_edges: Vec<(FileId, RawEdge)> = Vec::new();

    for pf in parsed {
        let file_id = store.upsert_file(pf.file.clone())?;
        file_by_path.insert(pf.file.path.to_string_lossy().to_string(), file_id);
        stats.files += 1;

        for mut sym in pf.symbols {
            let name = sym.name.clone();
            sym.file_id = file_id;
            let sid = store.upsert_symbol(sym)?;
            symbol_by_name.entry(name).or_default().push(sid);
            stats.symbols += 1;
        }

        for raw in pf.edges {
            deferred_edges.push((file_id, raw));
        }
    }

    // Also pull every symbol in the database into the lookup map, so call edges
    // can resolve against symbols indexed in previous runs.
    extend_symbol_lookup(store, &mut symbol_by_name)?;

    for (file_id, raw) in deferred_edges {
        let from_node = NodeId(file_id.0);
        if let Some(targets) = symbol_by_name.get(&raw.target_name) {
            for sid in targets {
                store.upsert_edge(Edge {
                    from_node,
                    to_node: NodeId(sid.0),
                    kind: raw.kind.clone(),
                })?;
                stats.edges += 1;
            }
        }
    }

    Ok(stats)
}

/// Index a single file. Used by the watcher when a file change event arrives.
pub fn index_one_file(
    store: &mut SqliteStore,
    path: &Path,
) -> Result<Option<FileId>, CodeGraphError> {
    if detect_language(path).is_none() {
        return Ok(None);
    }
    let parsed = match parse_file(path) {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };

    let file_id = store.upsert_file(parsed.file.clone())?;
    let mut symbol_by_name: HashMap<String, Vec<SymbolId>> = HashMap::new();

    for mut sym in parsed.symbols {
        let name = sym.name.clone();
        sym.file_id = file_id;
        let sid = store.upsert_symbol(sym)?;
        symbol_by_name.entry(name).or_default().push(sid);
    }

    extend_symbol_lookup(store, &mut symbol_by_name)?;

    for raw in parsed.edges {
        if let Some(targets) = symbol_by_name.get(&raw.target_name) {
            for sid in targets {
                store.upsert_edge(Edge {
                    from_node: NodeId(file_id.0),
                    to_node: NodeId(sid.0),
                    kind: raw.kind.clone(),
                })?;
            }
        }
    }
    Ok(Some(file_id))
}

/// Compute embeddings for every symbol in the store that doesn't already have one.
/// The embedding text is `"{kind} {name}\n{docstring?}"`.
pub async fn embed_pending(
    store: &Arc<Mutex<SqliteStore>>,
    embedder: &dyn Embedder,
    batch_size: usize,
) -> Result<usize, CodeGraphError> {
    // Snapshot rows that need embedding.
    let pending: Vec<(SymbolId, String)> = {
        let guard = store.lock();
        let mut stmt = guard.conn.prepare(
            "SELECT s.id, s.kind, s.name, s.docstring
             FROM symbols s
             LEFT JOIN embeddings e ON e.symbol_id = s.id
             WHERE e.symbol_id IS NULL",
        )?;
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let kind: String = row.get(1)?;
            let name: String = row.get(2)?;
            let doc: Option<String> = row.get(3)?;
            let text = match doc {
                Some(d) => format!("{kind} {name}\n{d}"),
                None => format!("{kind} {name}"),
            };
            Ok((SymbolId(id), text))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    let mut written = 0;
    for chunk in pending.chunks(batch_size.max(1)) {
        let texts: Vec<String> = chunk.iter().map(|(_, t)| t.clone()).collect();
        let vectors = embedder.embed(&texts).await?;

        let mut guard = store.lock();
        for ((sid, _), vec) in chunk.iter().zip(vectors.into_iter()) {
            guard.upsert_embedding(*sid, &vec)?;
            written += 1;
        }
    }
    Ok(written)
}

fn collect_source_files(root: &Path) -> Vec<PathBuf> {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .filter(|p| detect_language(p).is_some())
        .collect()
}

fn load_existing_hashes(
    store: &SqliteStore,
) -> Result<HashMap<String, u64>, CodeGraphError> {
    let mut stmt = store
        .conn
        .prepare("SELECT path, content_hash FROM files")?;
    let rows = stmt.query_map([], |row| {
        let path: String = row.get(0)?;
        let hash: i64 = row.get(1)?;
        Ok((path, hash as u64))
    })?;
    let mut out = HashMap::new();
    for r in rows {
        let (p, h) = r?;
        out.insert(p, h);
    }
    Ok(out)
}

fn extend_symbol_lookup(
    store: &SqliteStore,
    map: &mut HashMap<String, Vec<SymbolId>>,
) -> Result<(), CodeGraphError> {
    let mut stmt = store.conn.prepare("SELECT id, name FROM symbols")?;
    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        Ok((SymbolId(id), name))
    })?;
    for r in rows {
        let (sid, name) = r?;
        let entry = map.entry(name).or_default();
        if !entry.contains(&sid) {
            entry.push(sid);
        }
    }
    Ok(())
}

// ──────────────────────────────── File watcher ────────────────────────────────

/// Live indexer: holds a `notify` watcher and a debounce task that re-indexes
/// changed files. Dropping the indexer shuts the watcher down cleanly.
pub struct Indexer {
    _watcher: RecommendedWatcher,
    handle: Option<JoinHandle<()>>,
    shutdown_tx: mpsc::Sender<()>,
}

impl Indexer {
    pub async fn start(
        root: PathBuf,
        store: Arc<Mutex<SqliteStore>>,
    ) -> Result<Self, CodeGraphError> {
        let (path_tx, path_rx) = mpsc::channel::<PathBuf>(1024);
        let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>(1);

        let watcher = spawn_watcher(&root, path_tx)?;
        let handle = tokio::spawn(debounce_loop(path_rx, shutdown_rx, store));

        Ok(Self {
            _watcher: watcher,
            handle: Some(handle),
            shutdown_tx,
        })
    }

    pub async fn shutdown(mut self) {
        let _ = self.shutdown_tx.send(()).await;
        if let Some(h) = self.handle.take() {
            let _ = h.await;
        }
    }
}

impl Drop for Indexer {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.try_send(());
    }
}

fn spawn_watcher(
    root: &Path,
    tx: mpsc::Sender<PathBuf>,
) -> Result<RecommendedWatcher, CodeGraphError> {
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            for path in event.paths {
                let _ = tx.blocking_send(path);
            }
        }
    })
    .map_err(|e| CodeGraphError::Parse(format!("watcher: {e}")))?;

    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| CodeGraphError::Parse(format!("watch: {e}")))?;
    Ok(watcher)
}

async fn debounce_loop(
    mut rx: mpsc::Receiver<PathBuf>,
    mut shutdown_rx: mpsc::Receiver<()>,
    store: Arc<Mutex<SqliteStore>>,
) {
    use std::collections::HashSet;

    let mut pending: HashSet<PathBuf> = HashSet::new();
    let debounce = Duration::from_millis(200);
    let mut deadline: Option<tokio::time::Instant> = None;

    loop {
        tokio::select! {
            _ = shutdown_rx.recv() => break,
            maybe = rx.recv() => {
                match maybe {
                    Some(p) => {
                        if detect_language(&p).is_some() {
                            pending.insert(p);
                            deadline = Some(tokio::time::Instant::now() + debounce);
                        }
                    }
                    None => break,
                }
            }
            _ = tokio::time::sleep_until(deadline.unwrap_or_else(tokio::time::Instant::now)),
                if deadline.is_some() => {
                if !pending.is_empty() {
                    let batch: Vec<PathBuf> = pending.drain().collect();
                    let mut guard = store.lock();
                    for p in batch {
                        let _ = index_one_file(&mut guard, &p);
                    }
                }
                deadline = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SymbolKind;

    fn write(path: &Path, content: &str) {
        std::fs::write(path, content).unwrap();
    }

    #[test]
    fn bulk_index_indexes_a_directory() {
        let dir = tempfile::TempDir::new().unwrap();
        write(
            &dir.path().join("a.rs"),
            "fn alpha() {}\nfn beta() { alpha(); }\n",
        );
        write(
            &dir.path().join("b.py"),
            "def gamma():\n    pass\n",
        );
        write(&dir.path().join("ignored.txt"), "not source\n");

        let db = dir.path().join("graph.db");
        let mut store = SqliteStore::new(db.to_str().unwrap()).unwrap();
        let stats = bulk_index(&mut store, dir.path()).unwrap();

        assert_eq!(stats.files, 2);
        assert!(stats.symbols >= 3);
        assert!(stats.edges >= 1, "should resolve at least one call edge");
        assert_eq!(stats.skipped_unchanged, 0);

        // Symbol lookup smoke
        let n: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM symbols WHERE name = 'alpha'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn bulk_index_skips_unchanged_files_on_rerun() {
        let dir = tempfile::TempDir::new().unwrap();
        write(&dir.path().join("a.rs"), "fn alpha() {}\n");

        let db = dir.path().join("graph.db");
        let mut store = SqliteStore::new(db.to_str().unwrap()).unwrap();
        let first = bulk_index(&mut store, dir.path()).unwrap();
        assert_eq!(first.files, 1);
        assert_eq!(first.skipped_unchanged, 0);

        let second = bulk_index(&mut store, dir.path()).unwrap();
        assert_eq!(second.files, 0);
        assert_eq!(second.skipped_unchanged, 1);
    }

    #[test]
    fn bulk_index_reindexes_changed_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("a.rs");
        write(&path, "fn alpha() {}\n");

        let db = dir.path().join("graph.db");
        let mut store = SqliteStore::new(db.to_str().unwrap()).unwrap();
        let _ = bulk_index(&mut store, dir.path()).unwrap();

        write(&path, "fn alpha() {}\nfn beta() {}\n");
        let stats = bulk_index(&mut store, dir.path()).unwrap();
        assert_eq!(stats.files, 1);

        let n: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM symbols WHERE name IN ('alpha','beta')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn index_one_file_persists_a_single_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("a.rs");
        write(&path, "fn alpha() {}\n");

        let db = dir.path().join("graph.db");
        let mut store = SqliteStore::new(db.to_str().unwrap()).unwrap();
        let id = index_one_file(&mut store, &path).unwrap();
        assert!(id.is_some());

        let n: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM symbols", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[allow(dead_code)]
    fn _kind_witness() -> SymbolKind {
        SymbolKind::Function
    }
}
