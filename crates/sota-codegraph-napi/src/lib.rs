#![deny(clippy::all)]

use std::path::PathBuf;
use std::sync::Arc;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use once_cell::sync::OnceCell;
use parking_lot::Mutex;

use sota_codegraph_core::embed::{Embedder, LocalEmbedder, ProviderEmbedder, VectorIndex};
use sota_codegraph_core::index::{bulk_index, embed_pending, index_one_file, IndexStats};
use sota_codegraph_core::search;
use sota_codegraph_core::store::sqlite::SqliteStore;

/// Process-wide singleton holding the store, optional embedder, and optional
/// vector index. Initialised by `init()`; later calls fail if not initialised.
struct Engine {
    store: Arc<Mutex<SqliteStore>>,
    embedder: Mutex<Option<Arc<dyn Embedder>>>,
    index: Mutex<Option<Arc<VectorIndex>>>,
}

static ENGINE: OnceCell<Engine> = OnceCell::new();

fn engine() -> Result<&'static Engine> {
    ENGINE
        .get()
        .ok_or_else(|| Error::from_reason("codegraph not initialised; call init() first"))
}

fn map_err<E: std::fmt::Display>(e: E) -> Error {
    Error::from_reason(e.to_string())
}

// ─────────────────────────────────── Init ───────────────────────────────────────

#[napi]
pub fn init(db_path: String) -> Result<()> {
    let store = SqliteStore::new(&db_path).map_err(map_err)?;
    let engine = Engine {
        store: Arc::new(Mutex::new(store)),
        embedder: Mutex::new(None),
        index: Mutex::new(None),
    };
    ENGINE
        .set(engine)
        .map_err(|_| Error::from_reason("codegraph already initialised"))?;
    Ok(())
}

#[napi]
pub fn configure_local_embedder() -> Result<()> {
    let eng = engine()?;
    let emb = LocalEmbedder::new().map_err(map_err)?;
    *eng.embedder.lock() = Some(Arc::new(emb));
    Ok(())
}

#[napi]
pub fn configure_provider_embedder(
    endpoint: String,
    model: String,
    dims: u32,
    api_key: Option<String>,
) -> Result<()> {
    let eng = engine()?;
    let emb = ProviderEmbedder::new(endpoint, model, dims as usize, api_key);
    *eng.embedder.lock() = Some(Arc::new(emb));
    Ok(())
}

// ─────────────────────────────── Indexing API ──────────────────────────────────

#[napi(object)]
pub struct IndexStatsJs {
    pub files: u32,
    pub symbols: u32,
    pub edges: u32,
    pub skipped_unchanged: u32,
}

impl From<IndexStats> for IndexStatsJs {
    fn from(s: IndexStats) -> Self {
        Self {
            files: s.files as u32,
            symbols: s.symbols as u32,
            edges: s.edges as u32,
            skipped_unchanged: s.skipped_unchanged as u32,
        }
    }
}

#[napi]
pub async fn index_workspace(root: String) -> Result<IndexStatsJs> {
    let eng = engine()?;
    let store = eng.store.clone();
    let stats = tokio::task::spawn_blocking(move || {
        let mut guard = store.lock();
        bulk_index(&mut guard, &PathBuf::from(root))
    })
    .await
    .map_err(map_err)?
    .map_err(map_err)?;
    Ok(stats.into())
}

#[napi]
pub async fn reindex_file(path: String) -> Result<bool> {
    let eng = engine()?;
    let store = eng.store.clone();
    let r = tokio::task::spawn_blocking(move || {
        let mut guard = store.lock();
        index_one_file(&mut guard, &PathBuf::from(path))
    })
    .await
    .map_err(map_err)?
    .map_err(map_err)?;
    Ok(r.is_some())
}

#[napi]
pub async fn embed_all(batch_size: u32) -> Result<u32> {
    let eng = engine()?;
    let store = eng.store.clone();
    let embedder = eng
        .embedder
        .lock()
        .clone()
        .ok_or_else(|| Error::from_reason("no embedder configured"))?;
    let written = embed_pending(&store, embedder.as_ref(), batch_size as usize)
        .await
        .map_err(map_err)?;
    Ok(written as u32)
}

#[napi]
pub fn build_vector_index() -> Result<u32> {
    let eng = engine()?;
    let items = {
        let guard = eng.store.lock();
        guard.load_all_embeddings().map_err(map_err)?
    };
    let count = items.len();
    let index = VectorIndex::build(items);
    *eng.index.lock() = Some(Arc::new(index));
    Ok(count as u32)
}

// ───────────────────────────── Output types (JS-facing) ─────────────────────────

#[napi(object)]
pub struct SearchHitJs {
    pub symbol: String,
    pub file: String,
    pub kind: String,
    pub snippet: String,
    pub score: f64,
}

#[napi(object)]
pub struct FileSummaryJs {
    pub path: String,
    pub language: String,
    pub symbols: Vec<SymbolEntryJs>,
}

#[napi(object)]
pub struct SymbolEntryJs {
    pub name: String,
    pub kind: String,
    pub doc_string: Option<String>,
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct SymbolMatchJs {
    pub name: String,
    pub kind: String,
    pub file: String,
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct ReferenceJs {
    pub from_file: String,
    pub to_symbol: String,
    pub to_file: String,
    pub kind: String,
}

// ──────────────────────────────── Tool APIs ────────────────────────────────────

#[napi]
pub async fn semantic_search(
    query: String,
    limit: u32,
    scope: Option<Vec<String>>,
) -> Result<Vec<SearchHitJs>> {
    let eng = engine()?;
    let embedder = eng
        .embedder
        .lock()
        .clone()
        .ok_or_else(|| Error::from_reason("no embedder configured"))?;
    let index = eng
        .index
        .lock()
        .clone()
        .ok_or_else(|| Error::from_reason("vector index not built; call build_vector_index()"))?;
    let store = eng.store.clone();

    // Phase 1 — embed the query. No store lock held across this await.
    let qv = search::embed_query(embedder.as_ref(), &query)
        .await
        .map_err(map_err)?;

    // Phase 2 — synchronous HNSW + SQL hydrate. Hop to a blocking task so the
    // SQLite work doesn't sit on a tokio worker thread.
    let hits = tokio::task::spawn_blocking(move || {
        let guard = store.lock();
        search::nearest(&guard, &index, &qv, limit as usize, scope.as_deref())
    })
    .await
    .map_err(map_err)?
    .map_err(map_err)?;

    Ok(hits
        .into_iter()
        .map(|h| SearchHitJs {
            symbol: h.symbol,
            file: h.file,
            kind: h.kind,
            snippet: h.snippet,
            score: h.score as f64,
        })
        .collect())
}

#[napi]
pub fn file_summary(path: String) -> Result<FileSummaryJs> {
    let eng = engine()?;
    let guard = eng.store.lock();
    let summary = search::file_summary(&guard, &path).map_err(map_err)?;
    Ok(FileSummaryJs {
        path: summary.path,
        language: summary.language,
        symbols: summary
            .symbols
            .into_iter()
            .map(|s| SymbolEntryJs {
                name: s.name,
                kind: s.kind,
                doc_string: s.doc_string,
                start: s.range.0 as u32,
                end: s.range.1 as u32,
            })
            .collect(),
    })
}

#[napi]
pub fn symbol_lookup(query: String, limit: u32) -> Result<Vec<SymbolMatchJs>> {
    let eng = engine()?;
    let guard = eng.store.lock();
    let matches = search::symbol_lookup(&guard, &query, limit as usize).map_err(map_err)?;
    Ok(matches
        .into_iter()
        .map(|m| SymbolMatchJs {
            name: m.name,
            kind: m.kind,
            file: m.file,
            start: m.range.0 as u32,
            end: m.range.1 as u32,
        })
        .collect())
}

#[napi]
pub fn dependency_traversal(start_file: String, max_depth: u32) -> Result<Vec<String>> {
    let eng = engine()?;
    let guard = eng.store.lock();
    search::dependency_traversal(&guard, &start_file, max_depth).map_err(map_err)
}

#[napi]
pub fn impact_analysis(target_file: String, max_depth: u32) -> Result<Vec<String>> {
    let eng = engine()?;
    let guard = eng.store.lock();
    search::impact_analysis(&guard, &target_file, max_depth).map_err(map_err)
}

#[napi]
pub fn find_references(symbol_name: String) -> Result<Vec<ReferenceJs>> {
    let eng = engine()?;
    let guard = eng.store.lock();
    let refs = search::find_references(&guard, &symbol_name).map_err(map_err)?;
    Ok(refs
        .into_iter()
        .map(|r| ReferenceJs {
            from_file: r.from_file,
            to_symbol: r.to_symbol,
            to_file: r.to_file,
            kind: r.kind,
        })
        .collect())
}
