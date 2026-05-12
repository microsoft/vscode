use crate::types::{Edge, FileId, FileNode, SymbolId, SymbolNode};
use crate::error::{CodeGraphError};
pub mod sqlite;
pub mod falkordb;

pub trait GraphStore {
    fn upsert_file(&mut self, file: FileNode) -> Result<FileId, CodeGraphError>;

    fn upsert_symbol(&mut self, symbol: SymbolNode) -> Result<SymbolId, CodeGraphError>;

    fn upsert_edge(&mut self, edge: Edge) -> Result<(), CodeGraphError>;
}
