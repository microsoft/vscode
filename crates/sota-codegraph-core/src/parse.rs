use std::path::Path;
use streaming_iterator::StreamingIterator;
use tree_sitter::{Language, Parser, Query, QueryCursor};

use crate::error::CodeGraphError;
use crate::types::{
    EdgeKind, FileId, FileNode, Language as Lang, SymbolKind, SymbolNode,
};

/// Result of parsing a single source file.
#[derive(Debug, Clone)]
pub struct ParsedFile {
    pub file: FileNode,
    pub symbols: Vec<SymbolNode>,
    pub edges: Vec<RawEdge>,
}

/// An edge produced by the parser. Targets are recorded as name strings because
/// the parser doesn't yet know which database id (if any) the target maps to.
/// The indexer resolves these into concrete `Edge` rows after the whole
/// workspace has been indexed.
#[derive(Debug, Clone)]
pub struct RawEdge {
    pub from_byte: usize,
    pub target_name: String,
    pub kind: EdgeKind,
}

pub fn detect_language(path: &Path) -> Option<Lang> {
    let ext = path.extension()?.to_str()?;
    Some(match ext {
        "ts" | "tsx" => Lang::TypeScript,
        "js" | "jsx" | "mjs" | "cjs" => Lang::JavaScript,
        "py" => Lang::Python,
        "rs" => Lang::Rust,
        _ => return None,
    })
}

fn ts_language(lang: &Lang) -> Language {
    match lang {
        Lang::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        Lang::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
        Lang::Python => tree_sitter_python::LANGUAGE.into(),
        Lang::Rust => tree_sitter_rust::LANGUAGE.into(),
    }
}

pub fn parse_file(path: &Path) -> Result<ParsedFile, CodeGraphError> {
    let lang = detect_language(path).ok_or_else(|| {
        CodeGraphError::Parse(format!("unsupported extension: {}", path.display()))
    })?;
    let source = std::fs::read_to_string(path)?;
    parse_source(&lang, path, &source)
}

pub fn parse_source(
    lang: &Lang,
    path: &Path,
    source: &str,
) -> Result<ParsedFile, CodeGraphError> {
    let language = ts_language(lang);
    let mut parser = Parser::new();
    parser
        .set_language(&language)
        .map_err(|e| CodeGraphError::Parse(format!("set_language: {e}")))?;
    let tree = parser
        .parse(source, None)
        .ok_or_else(|| CodeGraphError::Parse("parser returned None".into()))?;

    let (symbols, edges) = extract(&language, &tree, lang, source.as_bytes())?;

    let file = FileNode {
        path: path.to_path_buf(),
        language: lang.clone(),
        content_hash: xxhash_rust::xxh3::xxh3_64(source.as_bytes()),
    };

    Ok(ParsedFile {
        file,
        symbols,
        edges,
    })
}

fn extract(
    language: &Language,
    tree: &tree_sitter::Tree,
    lang: &Lang,
    source: &[u8],
) -> Result<(Vec<SymbolNode>, Vec<RawEdge>), CodeGraphError> {
    let (symbol_queries, call_query) = queries_for(lang);

    let mut symbols = Vec::new();
    let mut edges = Vec::new();

    for (query_src, kind) in symbol_queries {
        run_symbol_query(language, tree, source, query_src, kind, &mut symbols)?;
    }

    if let Some(query_src) = call_query {
        run_call_query(language, tree, source, query_src, &mut edges)?;
    }

    Ok((symbols, edges))
}

/// `(query_source, symbol_kind)` pairs for the language's named-symbol constructs,
/// plus an optional query producing function-call edges.
fn queries_for(lang: &Lang) -> (Vec<(&'static str, SymbolKind)>, Option<&'static str>) {
    match lang {
        Lang::Rust => (
            vec![
                (
                    "(function_item name: (identifier) @name) @sym",
                    SymbolKind::Function,
                ),
                (
                    "(struct_item name: (type_identifier) @name) @sym",
                    SymbolKind::Class,
                ),
                (
                    "(enum_item name: (type_identifier) @name) @sym",
                    SymbolKind::Enum,
                ),
                (
                    "(type_item name: (type_identifier) @name) @sym",
                    SymbolKind::TypeAlias,
                ),
                (
                    "(trait_item name: (type_identifier) @name) @sym",
                    SymbolKind::Interface,
                ),
            ],
            Some(
                "(call_expression function: (identifier) @callee) @call \
                 (call_expression function: (field_expression field: (field_identifier) @callee)) @call",
            ),
        ),
        Lang::TypeScript => (
            vec![
                (
                    "(function_declaration name: (identifier) @name) @sym",
                    SymbolKind::Function,
                ),
                (
                    "(class_declaration name: (type_identifier) @name) @sym",
                    SymbolKind::Class,
                ),
                (
                    "(interface_declaration name: (type_identifier) @name) @sym",
                    SymbolKind::Interface,
                ),
                (
                    "(type_alias_declaration name: (type_identifier) @name) @sym",
                    SymbolKind::TypeAlias,
                ),
                (
                    "(enum_declaration name: (identifier) @name) @sym",
                    SymbolKind::Enum,
                ),
            ],
            Some(
                "(call_expression function: (identifier) @callee) @call \
                 (call_expression function: (member_expression property: (property_identifier) @callee)) @call",
            ),
        ),
        Lang::JavaScript => (
            vec![
                (
                    "(function_declaration name: (identifier) @name) @sym",
                    SymbolKind::Function,
                ),
                (
                    "(class_declaration name: (identifier) @name) @sym",
                    SymbolKind::Class,
                ),
            ],
            Some(
                "(call_expression function: (identifier) @callee) @call \
                 (call_expression function: (member_expression property: (property_identifier) @callee)) @call",
            ),
        ),
        Lang::Python => (
            vec![
                (
                    "(function_definition name: (identifier) @name) @sym",
                    SymbolKind::Function,
                ),
                (
                    "(class_definition name: (identifier) @name) @sym",
                    SymbolKind::Class,
                ),
            ],
            Some(
                "(call function: (identifier) @callee) @call \
                 (call function: (attribute attribute: (identifier) @callee)) @call",
            ),
        ),
    }
}

fn run_symbol_query(
    language: &Language,
    tree: &tree_sitter::Tree,
    source: &[u8],
    query_src: &str,
    kind: SymbolKind,
    out: &mut Vec<SymbolNode>,
) -> Result<(), CodeGraphError> {
    let query = Query::new(language, query_src)
        .map_err(|e| CodeGraphError::Parse(format!("query `{query_src}`: {e}")))?;
    let name_idx = query
        .capture_index_for_name("name")
        .ok_or_else(|| CodeGraphError::Parse("query missing @name capture".into()))?;
    let sym_idx = query
        .capture_index_for_name("sym")
        .ok_or_else(|| CodeGraphError::Parse("query missing @sym capture".into()))?;

    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(&query, tree.root_node(), source);

    while let Some(m) = matches.next() {
        let mut name: Option<String> = None;
        let mut range: Option<(usize, usize)> = None;
        for cap in m.captures {
            if cap.index == name_idx {
                name = Some(
                    cap.node
                        .utf8_text(source)
                        .map_err(|e| CodeGraphError::Parse(e.to_string()))?
                        .to_string(),
                );
            } else if cap.index == sym_idx {
                range = Some((cap.node.start_byte(), cap.node.end_byte()));
            }
        }
        if let (Some(name), Some(range)) = (name, range) {
            out.push(SymbolNode {
                name,
                kind: kind.clone(),
                file_id: FileId(0),
                range,
                parent_id: None,
                doc_string: None,
            });
        }
    }
    Ok(())
}

fn run_call_query(
    language: &Language,
    tree: &tree_sitter::Tree,
    source: &[u8],
    query_src: &str,
    out: &mut Vec<RawEdge>,
) -> Result<(), CodeGraphError> {
    let query = Query::new(language, query_src)
        .map_err(|e| CodeGraphError::Parse(format!("query `{query_src}`: {e}")))?;
    let callee_idx = query
        .capture_index_for_name("callee")
        .ok_or_else(|| CodeGraphError::Parse("query missing @callee capture".into()))?;
    let call_idx = query
        .capture_index_for_name("call")
        .ok_or_else(|| CodeGraphError::Parse("query missing @call capture".into()))?;

    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(&query, tree.root_node(), source);

    while let Some(m) = matches.next() {
        let mut callee: Option<String> = None;
        let mut from_byte: Option<usize> = None;
        for cap in m.captures {
            if cap.index == callee_idx {
                callee = Some(
                    cap.node
                        .utf8_text(source)
                        .map_err(|e| CodeGraphError::Parse(e.to_string()))?
                        .to_string(),
                );
            } else if cap.index == call_idx {
                from_byte = Some(cap.node.start_byte());
            }
        }
        if let (Some(target_name), Some(from_byte)) = (callee, from_byte) {
            out.push(RawEdge {
                from_byte,
                target_name,
                kind: EdgeKind::Calls,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn detects_extensions() {
        assert_eq!(detect_language(&PathBuf::from("foo.rs")), Some(Lang::Rust));
        assert_eq!(
            detect_language(&PathBuf::from("foo.tsx")),
            Some(Lang::TypeScript)
        );
        assert_eq!(
            detect_language(&PathBuf::from("foo.ts")),
            Some(Lang::TypeScript)
        );
        assert_eq!(
            detect_language(&PathBuf::from("foo.js")),
            Some(Lang::JavaScript)
        );
        assert_eq!(detect_language(&PathBuf::from("foo.py")), Some(Lang::Python));
        assert_eq!(detect_language(&PathBuf::from("foo.txt")), None);
        assert_eq!(detect_language(&PathBuf::from("noext")), None);
    }

    fn names_of_kind<'a>(parsed: &'a ParsedFile, kind: SymbolKind) -> Vec<&'a str> {
        parsed
            .symbols
            .iter()
            .filter(|s| s.kind == kind)
            .map(|s| s.name.as_str())
            .collect()
    }

    #[test]
    fn parses_rust_source() {
        let source = "fn alpha() {}\nstruct Beta;\nfn gamma() { alpha(); }\n";
        let parsed = parse_source(&Lang::Rust, &PathBuf::from("a.rs"), source).unwrap();

        let fns = names_of_kind(&parsed, SymbolKind::Function);
        assert!(fns.contains(&"alpha"));
        assert!(fns.contains(&"gamma"));

        let classes = names_of_kind(&parsed, SymbolKind::Class);
        assert!(classes.contains(&"Beta"));

        let callees: Vec<&str> = parsed.edges.iter().map(|e| e.target_name.as_str()).collect();
        assert!(callees.contains(&"alpha"));
    }

    #[test]
    fn parses_typescript_source() {
        let source = "
            function alpha() {}
            class Beta {}
            interface Gamma { x: number }
            type Delta = string;
            alpha();
        ";
        let parsed = parse_source(&Lang::TypeScript, &PathBuf::from("a.ts"), source).unwrap();

        let fns = names_of_kind(&parsed, SymbolKind::Function);
        assert!(fns.contains(&"alpha"));

        let classes = names_of_kind(&parsed, SymbolKind::Class);
        assert!(classes.contains(&"Beta"));

        let ifaces = names_of_kind(&parsed, SymbolKind::Interface);
        assert!(ifaces.contains(&"Gamma"));

        let aliases = names_of_kind(&parsed, SymbolKind::TypeAlias);
        assert!(aliases.contains(&"Delta"));

        let callees: Vec<&str> = parsed.edges.iter().map(|e| e.target_name.as_str()).collect();
        assert!(callees.contains(&"alpha"));
    }

    #[test]
    fn parses_javascript_source() {
        let source = "
            function alpha() {}
            class Beta {}
            alpha();
        ";
        let parsed = parse_source(&Lang::JavaScript, &PathBuf::from("a.js"), source).unwrap();

        let fns = names_of_kind(&parsed, SymbolKind::Function);
        assert!(fns.contains(&"alpha"));

        let classes = names_of_kind(&parsed, SymbolKind::Class);
        assert!(classes.contains(&"Beta"));
    }

    #[test]
    fn parses_python_source() {
        let source = "
def alpha():
    pass

class Beta:
    def method(self):
        alpha()
";
        let parsed = parse_source(&Lang::Python, &PathBuf::from("a.py"), source).unwrap();

        let fns = names_of_kind(&parsed, SymbolKind::Function);
        assert!(fns.contains(&"alpha"));
        assert!(fns.contains(&"method"));

        let classes = names_of_kind(&parsed, SymbolKind::Class);
        assert!(classes.contains(&"Beta"));

        let callees: Vec<&str> = parsed.edges.iter().map(|e| e.target_name.as_str()).collect();
        assert!(callees.contains(&"alpha"));
    }

    #[test]
    fn parse_file_computes_content_hash() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("a.rs");
        std::fs::write(&path, "fn alpha() {}").unwrap();
        let parsed = parse_file(&path).unwrap();
        assert_ne!(parsed.file.content_hash, 0);
        assert_eq!(parsed.file.language, Lang::Rust);
    }
}
