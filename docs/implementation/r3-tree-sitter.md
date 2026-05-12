# Phase R3 — Tree-sitter integration

**Estimated time:** Agent 1 hr · You 4-6 hr spread across a weekend.

This is the phase that teaches more about real Rust than any other. Lifetimes, borrowing, the difference between `&str` and `String`, FFI — all show up. Go slow.

## Goal

`parse.rs` exposes:

```rust
pub fn parse_file(path: &Path) -> Result<ParsedFile, CodeGraphError>;

pub struct ParsedFile {
    pub file: FileNode,
    pub symbols: Vec<SymbolNode>,
    pub edges: Vec<Edge>,
}
```

For TypeScript, JavaScript, Python, and Rust files it returns: function definitions, class definitions, imports, and function-call edges.

## What you'll learn

- **`&str` vs `String`.** `String` owns its bytes. `&str` is a borrowed view into bytes someone else owns. Tree-sitter's API hands you `&str` views into the original source — you have to copy to `String` if you want to outlive the source.
- **Lifetimes (`'a`).** Tree-sitter's `Node<'a>` carries a lifetime parameter tied to the `Tree` it came from. You'll see error messages mentioning lifetimes for the first time. Don't panic; read them carefully.
- **FFI via tree-sitter C bindings.** The `tree-sitter` crate wraps a C library. You won't see the C, but the API design is C-ish (out-params, opaque pointers).
- **S-expression query language.** Tree-sitter's pattern language. Looks Lispy. Surprisingly powerful.
- **Eager extraction.** The escape hatch for the lifetime puzzles: don't try to *return* borrowed data, extract what you need into owned types and drop the tree.

## Pre-requisites

- R1 + R2 done.
- `tree-sitter`, `tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-rust` are already in `Cargo.toml`. If not: add them at versions matching `plan.md`.

## The big rule you must follow

**Never store a `tree_sitter::Tree` or `tree_sitter::Node` in `SymbolNode`, `FileNode`, or any other type you return from `parse_file`.**

Why: `Node<'a>` borrows from `Tree`, which borrows from the source bytes. If you keep a `Node` around after `parse_file` returns, the borrow checker will demand the source bytes outlive your `SymbolNode`s — and they don't, because they're a local `String` inside `parse_file`. The solution every time is **extract owned data, drop the tree**.

`SymbolNode` already has the right shape: owned `String` for `name`, plain `usize` for byte ranges, no borrows.

## Build it (one step at a time)

### Step 1: Language detection

Add to `parse.rs`:

```rust
use std::path::Path;
use tree_sitter::Language;

use crate::types::Language as Lang;

pub(crate) fn detect_language(path: &Path) -> Option<Lang> {
    let ext = path.extension()?.to_str()?;
    Some(match ext {
        "ts" | "tsx" => Lang::TypeScript,
        "js" | "jsx" | "mjs" | "cjs" => Lang::JavaScript,
        "py" => Lang::Python,
        "rs" => Lang::Rust,
        _ => return None,
    })
}

pub(crate) fn ts_language(lang: &Lang) -> Language {
    match lang {
        Lang::TypeScript => tree_sitter_typescript::language_typescript(),
        Lang::JavaScript => tree_sitter_javascript::language(),
        Lang::Python => tree_sitter_python::language(),
        Lang::Rust => tree_sitter_rust::language(),
    }
}
```

Two functions: your domain `Language` enum stays in `types.rs`; the conversion to `tree_sitter::Language` happens here. This is **mapping at the boundary** — a very common Rust pattern.

Test it:

```rust
#[test]
fn detects_extensions() {
    assert_eq!(detect_language(Path::new("foo.rs")), Some(Lang::Rust));
    assert_eq!(detect_language(Path::new("foo.tsx")), Some(Lang::TypeScript));
    assert_eq!(detect_language(Path::new("foo.txt")), None);
}
```

### Step 2: Parse one file into a `Tree`

```rust
use tree_sitter::Parser;

fn parse_source(source: &str, lang: &Lang) -> Result<tree_sitter::Tree, CodeGraphError> {
    let mut parser = Parser::new();
    parser.set_language(&ts_language(lang))
        .map_err(|e| CodeGraphError::Parse(format!("set_language: {e}")))?;
    parser
        .parse(source, None)
        .ok_or_else(|| CodeGraphError::Parse("parser returned None".into()))
}
```

Don't extract anything yet. Just prove it parses.

```rust
#[test]
fn parses_rust_source() {
    let tree = parse_source("fn main() {}", &Lang::Rust).unwrap();
    let root = tree.root_node();
    assert_eq!(root.kind(), "source_file");
    assert!(!root.has_error());
}
```

### Step 3: Your first query — Rust function definitions

Tree-sitter queries are written in S-expression syntax. Here's the simplest possible one:

```scheme
(function_item name: (identifier) @name) @function
```

This matches every `function_item` node, captures the whole node as `@function`, and the `name` child (which is an `identifier`) as `@name`.

To find the right node kinds for each language, paste a sample file into the [Tree-sitter playground](https://tree-sitter.github.io/tree-sitter/playground). The node tree on the right tells you what the grammar calls things.

In Rust:

```rust
use tree_sitter::{Query, QueryCursor};

pub fn parse_file(path: &Path) -> Result<ParsedFile, CodeGraphError> {
    let lang = detect_language(path).ok_or_else(|| {
        CodeGraphError::Parse(format!("unsupported extension: {}", path.display()))
    })?;
    let source = std::fs::read_to_string(path)?;
    let tree = parse_source(&source, &lang)?;

    let file = FileNode {
        path: path.to_path_buf(),
        language: lang.clone(),
        content_hash: xxhash_rust::xxh3::xxh3_64(source.as_bytes()),
    };

    let symbols = extract_symbols(&tree, &lang, source.as_bytes())?;
    let edges = Vec::new();   // step 4

    Ok(ParsedFile { file, symbols, edges })
}

fn extract_symbols(
    tree: &tree_sitter::Tree,
    lang: &Lang,
    source: &[u8],
) -> Result<Vec<SymbolNode>, CodeGraphError> {
    let query_src = match lang {
        Lang::Rust => "(function_item name: (identifier) @name) @function",
        // ... add other languages later
        _ => return Ok(Vec::new()),
    };

    let query = Query::new(&ts_language(lang), query_src)
        .map_err(|e| CodeGraphError::Parse(format!("query: {e}")))?;
    let name_idx = query.capture_index_for_name("name").unwrap();
    let func_idx = query.capture_index_for_name("function").unwrap();

    let mut cursor = QueryCursor::new();
    let mut out = Vec::new();

    for m in cursor.matches(&query, tree.root_node(), source) {
        let mut name = None;
        let mut range = None;
        for cap in m.captures {
            if cap.index == name_idx {
                name = Some(
                    cap.node
                        .utf8_text(source)
                        .map_err(|e| CodeGraphError::Parse(e.to_string()))?
                        .to_string(),
                );
            } else if cap.index == func_idx {
                range = Some((cap.node.start_byte(), cap.node.end_byte()));
            }
        }
        if let (Some(name), Some(range)) = (name, range) {
            out.push(SymbolNode {
                name,
                kind: SymbolKind::Function,
                file_id: FileId(0),     // filled in by the indexer when persisted
                range,
                parent_id: None,
                doc_string: None,
            });
        }
    }

    Ok(out)
}
```

Important nuances:

- **`source.as_bytes()` is what you pass to `utf8_text`.** Tree-sitter works in bytes, not chars.
- **`.to_string()` on the `&str` returned by `utf8_text`.** This is the "extract owned, drop the tree" pattern in action. Without `.to_string()` you have a `&str` borrowing from `source`, and you can't put a `&str` into a `SymbolNode` field declared as `String`.
- **`file_id: FileId(0)` is a placeholder.** The parser doesn't know the file's database ID. The indexer fills it in after `upsert_file` returns the real ID. This is a small design wart you'll fix more cleanly in R5.
- **`xxhash_rust::xxh3::xxh3_64`** gives you the content hash. Already in `Cargo.toml`.

### Step 4: Add the other constructs for Rust

Once one query works, add the others. The query strings:

```scheme
; classes — Rust calls them "struct" + "impl" + "enum"; pick whichever your callers need
(struct_item name: (type_identifier) @name) @struct

; imports
(use_declaration) @import

; calls
(call_expression
  function: [
    (identifier) @callee
    (field_expression field: (field_identifier) @callee)
  ]) @call
```

Build each query the same way — capture name(s), produce `SymbolNode` or `Edge`. For imports, you don't have a callee; just record the byte range and the source text as the symbol name.

For edges, you'll record `Edge { from: NodeId(0), to: NodeId(0), kind: EdgeKind::Calls }` with the resolved-name string stored... where? You can't link to a real `SymbolId` yet because the call target may be in another file. **Park this complexity for R6** — for R3, emit edges with the resolved-name string in a side field, or skip call edges entirely on the first pass. Don't over-engineer here.

A pragmatic compromise: define a `RawEdge` that holds source byte range + target name string. Resolve to real edges in R5/R6 after the whole workspace is indexed.

### Step 5: Cycle through TS, JS, Python

Each language has its own grammar node names. Cheat sheet:

| Construct | Rust | TS | JS | Python |
|---|---|---|---|---|
| Function | `function_item` | `function_declaration`, `arrow_function`, `method_definition` | same as TS | `function_definition` |
| Class | `struct_item`/`enum_item` | `class_declaration` | `class_declaration` | `class_definition` |
| Import | `use_declaration` | `import_statement` | `import_statement` | `import_statement`, `import_from_statement` |
| Call | `call_expression` | `call_expression` | `call_expression` | `call` |

Use the playground for any node name you're not sure about. Don't guess.

For TS/JS, async + arrow functions are different node kinds. Either write multiple queries or use the alternation syntax:

```scheme
[
  (function_declaration name: (identifier) @name) @function
  (arrow_function) @function
  (method_definition name: (property_identifier) @name) @function
] @any-function
```

### Step 6: Test fixtures

Create `crates/sota-codegraph-core/tests/fixtures/` with one tiny file per language. Example:

`tests/fixtures/simple.rs`:

```rust
fn alpha() {}
struct Beta;
fn gamma() {
    alpha();
}
```

Then an integration test in `tests/parse.rs`:

```rust
use sota_codegraph_core::parse::parse_file;

#[test]
fn parses_rust_fixture() {
    let parsed = parse_file(std::path::Path::new("tests/fixtures/simple.rs")).unwrap();
    let names: Vec<_> = parsed.symbols.iter().map(|s| s.name.as_str()).collect();
    assert!(names.contains(&"alpha"));
    assert!(names.contains(&"gamma"));
    assert!(names.contains(&"Beta"));
}
```

Repeat for `simple.ts`, `simple.js`, `simple.py`. Hand-count the expected symbols. This is your safety net when you bump tree-sitter grammars later.

## Common errors and what they mean

- **"expected `String`, found `&str`"** — you forgot `.to_string()`. Owned vs borrowed.
- **"borrowed value does not live long enough"** — you tried to store a `&str` (or `Node`) in a struct that outlives the source. Extract eagerly.
- **"cannot borrow `parser` as mutable because it is also borrowed as immutable"** — you're holding a reference to the tree while trying to re-parse. Drop the tree first.
- **`Query::new` returns `Err`** — your S-expression has a typo, or your tree-sitter version disagrees with the grammar version. The error message tells you the offset; check the playground.
- **`set_language` errors with "incompatible language version"** — the `tree-sitter` crate and `tree-sitter-rust` (or whichever) are pinned to incompatible major versions. Bump both to a matched pair.

## Performance check

A casual benchmark, no `criterion` needed:

```rust
#[test]
#[ignore]
fn parse_speed_rust() {
    let big = std::fs::read_to_string("tests/fixtures/big.rs").unwrap();
    let start = std::time::Instant::now();
    for _ in 0..100 {
        let _ = parse_source(&big, &Lang::Rust).unwrap();
    }
    let avg = start.elapsed() / 100;
    println!("avg parse: {avg:?}");
    assert!(avg.as_millis() < 10, "too slow: {avg:?}");
}
```

Generate `big.rs` with `seq 1 1000 | awk '{ print "fn f" $1 "() {}" }' > tests/fixtures/big.rs`. Run with `cargo test --release -- --ignored parse_speed`.

## Acceptance criteria

- [ ] All four languages parse without panicking on a representative file
- [ ] Symbol counts match hand-validated expectations on `tests/fixtures/`
- [ ] <10ms per 1000-line file in release mode

## Stop & reflect

Once this phase is done, you should be able to articulate (without looking it up):

- Why `SymbolNode.name` is `String`, not `&str`.
- What `'a` means in `Node<'a>`.
- Why `cursor.matches(&query, tree.root_node(), source)` borrows three things, and what happens at the lifetime level.

If any of those are still fuzzy, re-read [The Rust Book, chapter 10](https://doc.rust-lang.org/book/ch10-00-generics.html) before R4.

## Next

[Phase R4 — Embeddings](./r4-embeddings.md).
