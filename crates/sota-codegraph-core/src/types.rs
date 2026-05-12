use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct FileId(pub i64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct NodeId(pub i64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct SymbolId(pub i64);

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Language {
    TypeScript,
    JavaScript,
    Python,
    Rust,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SymbolKind {
    Function,
    Class,
    Variable,
    Enum,
    Interface,
    TypeAlias,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum EdgeKind {
    Imports,
    Calls,
    References,
    Defines,
    Extends,
    Implements,
    Uses,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileNode {
    pub path: PathBuf,
    pub language: Language,
    pub content_hash: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SymbolNode {
    pub name: String,
    pub kind: SymbolKind,
    pub file_id: FileId,
    pub range: (usize, usize),
    pub parent_id: Option<SymbolId>,
    pub doc_string: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Edge {
    pub from_node: NodeId,
    pub to_node: NodeId,
    pub kind: EdgeKind,
}
