use crate::error::{CodeGraphError};
use crate::store::GraphStore;
use crate::types::{FileNode, FileId, SymbolNode, SymbolId, Edge};
use rusqlite::{params, Connection};
use rusqlite_migration::{Migrations, M};

pub struct SqliteStore {
    pub conn: Connection,
}

impl SqliteStore {
    pub fn new(path: &str) -> Result<Self, CodeGraphError> {
        let mut conn = Connection::open(path)?;

        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
        ")?;

        migrations().to_latest(&mut conn)?;

        Ok(SqliteStore { conn })
    }
}

impl SqliteStore {
    /// Store a single embedding for a symbol. Replaces any existing row.
    pub fn upsert_embedding(
        &mut self,
        symbol_id: SymbolId,
        vector: &[f32],
    ) -> Result<(), CodeGraphError> {
        let bytes: &[u8] = bytemuck::cast_slice(vector);
        self.conn.execute(
            "INSERT OR REPLACE INTO embeddings (symbol_id, dims, vector) VALUES (?1, ?2, ?3)",
            params![symbol_id.0, vector.len() as i64, bytes],
        )?;
        Ok(())
    }

    /// Load every embedding from the store, in symbol-id order.
    pub fn load_all_embeddings(
        &self,
    ) -> Result<Vec<(SymbolId, Vec<f32>)>, CodeGraphError> {
        let mut stmt = self
            .conn
            .prepare("SELECT symbol_id, vector FROM embeddings ORDER BY symbol_id")?;
        let rows = stmt.query_map([], |row| {
            let sid: i64 = row.get(0)?;
            let bytes: Vec<u8> = row.get(1)?;
            Ok((sid, bytes))
        })?;
        let mut out = Vec::new();
        for r in rows {
            let (sid, bytes) = r?;
            let vec: Vec<f32> = bytemuck::cast_slice::<u8, f32>(&bytes).to_vec();
            out.push((SymbolId(sid), vec));
        }
        Ok(out)
    }

    /// Insert many files inside a single transaction with a reused prepared statement.
    /// Returns the new rowids in input order.
    pub fn upsert_files_batch(
        &mut self,
        files: impl IntoIterator<Item = FileNode>,
    ) -> Result<Vec<FileId>, CodeGraphError> {
        let tx = self.conn.transaction()?;

        let mut ids = Vec::new();
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO files (path, language, content_hash, indexed_at)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;

            for file in files {
                let path_str = file.path.to_string_lossy().to_string();
                let language_str = format!("{:?}", file.language);
                stmt.execute(params![
                    path_str,
                    language_str,
                    file.content_hash as i64,
                    now_secs()
                ])?;
                ids.push(FileId(tx.last_insert_rowid()));
            }
        }

        tx.commit()?;
        Ok(ids)
    }
}

impl GraphStore for SqliteStore {
    fn upsert_file(&mut self, file: FileNode) -> Result<FileId, CodeGraphError> {
        let path_str = file.path.to_string_lossy().to_string();
        let language_str = format!("{:?}", file.language);

        self.conn.execute(
            "INSERT OR REPLACE INTO files (path, language, content_hash, indexed_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![path_str, language_str, file.content_hash as i64, now_secs()],
        )?;

        let id = self.conn.last_insert_rowid();
        Ok(FileId(id))
    }

    fn upsert_symbol(&mut self, _symbol: SymbolNode) -> Result<SymbolId, CodeGraphError> {
        let name = _symbol.name;
        let kind = format!("{:?}", _symbol.kind);
        let file_id = _symbol.file_id.0;
        let start_byte = _symbol.range.0;
        let end_byte = _symbol.range.1;
        let doc_string = _symbol.doc_string.clone();

        self.conn.execute(
            "INSERT OR REPLACE INTO symbols (file_id, name, kind, start_byte, end_byte, docstring)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![file_id, name, kind, start_byte, end_byte, doc_string],
        )?;

        let id = self.conn.last_insert_rowid();
        Ok(SymbolId(id))
    }

    fn upsert_edge(&mut self, _edge: Edge) -> Result<(), CodeGraphError> {
        let from_node = _edge.from_node.0;
        let to_node = _edge.to_node.0;
        let kind = format!("{:?}", _edge.kind);

        self.conn.execute(
            "INSERT OR REPLACE INTO edges (from_node, to_node, kind)
             VALUES (?1, ?2, ?3)",
            params![from_node, to_node, kind],
        )?;

        Ok(())
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up("
            CREATE TABLE files (
                id INTEGER PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                language TEXT NOT NULL,
                content_hash INTEGER NOT NULL,
                indexed_at INTEGER NOT NULL
            );
        "),
        M::up("
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
        "),
        M::up("
            CREATE TABLE edges (
                from_node INTEGER NOT NULL,
                to_node INTEGER NOT NULL,
                kind TEXT NOT NULL,
                PRIMARY KEY(from_node, to_node, kind)
            );
            CREATE INDEX idx_edges_from ON edges(from_node);
            CREATE INDEX idx_edges_to ON edges(to_node);
        "),
        M::up("
            CREATE TABLE embeddings (
                symbol_id INTEGER PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
                dims INTEGER NOT NULL,
                vector BLOB NOT NULL
            );
        "),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeKind, Language, NodeId, SymbolKind};
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn fresh_store() -> (TempDir, SqliteStore) {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("test.db");
        let store = SqliteStore::new(path.to_str().unwrap()).expect("open store");
        (dir, store)
    }

    fn sample_file(path: &str) -> FileNode {
        FileNode {
            path: PathBuf::from(path),
            language: Language::Rust,
            content_hash: 0xdeadbeef,
        }
    }

    #[test]
    fn migrations_create_expected_tables() {
        let (_dir, store) = fresh_store();
        let mut stmt = store
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        for expected in ["edges", "files", "symbols"] {
            assert!(
                tables.iter().any(|t| t == expected),
                "missing table {expected}; got {tables:?}"
            );
        }
    }

    #[test]
    fn migrations_idempotent_on_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test.db");
        let p = path.to_str().unwrap();
        let first = SqliteStore::new(p).expect("first open");
        drop(first);
        let _second = SqliteStore::new(p).expect("re-opening existing db should be a no-op");
    }

    #[test]
    fn upsert_file_round_trip() {
        let (_dir, mut store) = fresh_store();
        let id = store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();
        assert!(id.0 > 0);

        let (path, language, hash): (String, String, i64) = store
            .conn
            .query_row(
                "SELECT path, language, content_hash FROM files WHERE id = ?1",
                params![id.0],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(path, "/tmp/foo.rs");
        assert_eq!(language, "Rust");
        assert_eq!(hash as u64, 0xdeadbeef);
    }

    #[test]
    fn upsert_file_is_idempotent_on_path() {
        let (_dir, mut store) = fresh_store();
        store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();
        store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();

        let n: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE path = '/tmp/foo.rs'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn upsert_symbol_round_trip() {
        let (_dir, mut store) = fresh_store();
        let file_id = store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();
        let sid = store
            .upsert_symbol(SymbolNode {
                name: "do_thing".into(),
                kind: SymbolKind::Function,
                file_id,
                range: (10, 42),
                parent_id: None,
                doc_string: Some("docs".into()),
            })
            .unwrap();

        let (name, kind, start, end, doc): (String, String, i64, i64, Option<String>) = store
            .conn
            .query_row(
                "SELECT name, kind, start_byte, end_byte, docstring FROM symbols WHERE id = ?1",
                params![sid.0],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(name, "do_thing");
        assert_eq!(kind, "Function");
        assert_eq!(start, 10);
        assert_eq!(end, 42);
        assert_eq!(doc.as_deref(), Some("docs"));
    }

    #[test]
    fn upsert_symbol_is_idempotent_on_unique_key() {
        let (_dir, mut store) = fresh_store();
        let file_id = store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();
        let symbol = SymbolNode {
            name: "do_thing".into(),
            kind: SymbolKind::Function,
            file_id,
            range: (10, 42),
            parent_id: None,
            doc_string: None,
        };
        store.upsert_symbol(symbol.clone()).unwrap();
        store.upsert_symbol(symbol).unwrap();

        let n: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM symbols", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn upsert_edge_round_trip() {
        let (_dir, mut store) = fresh_store();
        store
            .upsert_edge(Edge {
                from_node: NodeId(1),
                to_node: NodeId(2),
                kind: EdgeKind::Calls,
            })
            .unwrap();

        let (from, to, kind): (i64, i64, String) = store
            .conn
            .query_row(
                "SELECT from_node, to_node, kind FROM edges",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(from, 1);
        assert_eq!(to, 2);
        assert_eq!(kind, "Calls");
    }

    #[test]
    fn upsert_edge_is_idempotent_on_composite_key() {
        let (_dir, mut store) = fresh_store();
        let edge = Edge {
            from_node: NodeId(1),
            to_node: NodeId(2),
            kind: EdgeKind::Calls,
        };
        store.upsert_edge(edge.clone()).unwrap();
        store.upsert_edge(edge).unwrap();

        let n: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM edges", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn deleting_file_cascades_to_symbols() {
        let (_dir, mut store) = fresh_store();
        let file_id = store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();
        store
            .upsert_symbol(SymbolNode {
                name: "do_thing".into(),
                kind: SymbolKind::Function,
                file_id,
                range: (0, 10),
                parent_id: None,
                doc_string: None,
            })
            .unwrap();

        store
            .conn
            .execute("DELETE FROM files WHERE id = ?1", params![file_id.0])
            .unwrap();

        let n: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM symbols", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "symbols should cascade-delete with their file");
    }

    #[test]
    fn foreign_keys_pragma_is_on() {
        let (_dir, store) = fresh_store();
        let fk: i64 = store
            .conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn distinct_edges_coexist() {
        let (_dir, mut store) = fresh_store();
        store
            .upsert_edge(Edge {
                from_node: NodeId(1),
                to_node: NodeId(2),
                kind: EdgeKind::Calls,
            })
            .unwrap();
        store
            .upsert_edge(Edge {
                from_node: NodeId(1),
                to_node: NodeId(2),
                kind: EdgeKind::References,
            })
            .unwrap();

        let n: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM edges", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn embeddings_round_trip() {
        let (_dir, mut store) = fresh_store();
        let file_id = store.upsert_file(sample_file("/tmp/foo.rs")).unwrap();
        let sid = store
            .upsert_symbol(SymbolNode {
                name: "x".into(),
                kind: SymbolKind::Function,
                file_id,
                range: (0, 1),
                parent_id: None,
                doc_string: None,
            })
            .unwrap();
        let v = vec![0.1_f32, 0.2, 0.3, 0.4];
        store.upsert_embedding(sid, &v).unwrap();

        let all = store.load_all_embeddings().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].0, sid);
        assert_eq!(all[0].1, v);
    }

    #[test]
    fn upsert_files_batch_persists_all_rows() {
        let (_dir, mut store) = fresh_store();
        let files: Vec<_> = (0..1_000)
            .map(|i| FileNode {
                path: PathBuf::from(format!("/tmp/foo_{i}.rs")),
                language: Language::Rust,
                content_hash: i as u64,
            })
            .collect();

        let ids = store.upsert_files_batch(files).unwrap();
        assert_eq!(ids.len(), 1_000);

        let n: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1_000);
    }

    // R2 acceptance criterion: 10K nodes < 500ms on a 2024 MacBook.
    // Debug mode is roughly 5-10x slower than release, so this test is gated on
    // release builds via `#[ignore]` to avoid CI flakes.
    // Run with: `cargo test --release -- --ignored bench_10k`
    #[test]
    #[ignore]
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
}
