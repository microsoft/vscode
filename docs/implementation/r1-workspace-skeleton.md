# Phase R1 — Cargo workspace skeleton + core types

**Status:** Done. This page is a recap so you understand what you built and why, and so you have a reference if you need to redo it later.

## Goal

A Cargo workspace at `crates/` containing three crates:

- `sota-codegraph-core` — pure Rust, no Node coupling. All the logic lives here.
- `sota-codegraph-napi` — the Node binding crate. Empty for now; filled in R7.
- `sota-codegraph-cli` — a small CLI for ops/debugging. Empty for now; useful in R5/R6.

`cargo build --workspace` succeeds. `cargo clippy --workspace -- -D warnings` is clean.

## What you learned

- **Cargo workspaces.** One `Cargo.toml` at the root with `[workspace]`, member crates as subdirectories. Shared `Cargo.lock`. You build all of them with one command. This is how every multi-crate Rust project is structured.
- **Module structure.** `lib.rs` is the entry point; `pub mod foo;` exposes `foo.rs`. A folder with `mod.rs` inside is a module. (Edition 2018+ also allows `foo/` without a `mod.rs` if you use `foo.rs` next to it — but the project uses the `mod.rs` style.)
- **`Result` and `Option`.** All fallible functions return `Result<T, E>`. The `?` operator unwraps `Ok`/`Some` and propagates the error. You'll use it constantly.
- **Newtype pattern.** `pub struct FileId(pub i64);` wraps a plain `i64` in a type the compiler treats as distinct. You can't accidentally pass a `SymbolId` where a `FileId` was expected.
- **Traits as interfaces.** `GraphStore` is a trait with three required methods. Any type that implements all three counts as a `GraphStore`. This is how you'll swap the SQLite backend for FalkorDB later without changing callers.
- **`#[derive(...)]`.** Auto-generates `Debug`, `Clone`, serde implementations, etc. Don't write them by hand.

## The layout you ended up with

```
crates/
├── Cargo.toml                                # workspace root
├── sota-codegraph-core/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                            # pub mod error/types/store + later: parse/embed/index/search
│       ├── error.rs                          # CodeGraphError
│       ├── types.rs                          # FileId, SymbolId, NodeId, Language, SymbolKind, EdgeKind, FileNode, SymbolNode, Edge
│       ├── parse.rs                          # (empty — R3)
│       ├── embed.rs                          # (empty — R4)
│       ├── index.rs                          # (empty — R5)
│       ├── search.rs                         # (empty — R6)
│       └── store/
│           ├── mod.rs                        # trait GraphStore
│           ├── sqlite.rs                     # (R2)
│           └── falkordb.rs                   # (empty — R10)
├── sota-codegraph-napi/
│   ├── Cargo.toml
│   └── src/lib.rs
└── sota-codegraph-cli/
    ├── Cargo.toml
    └── src/main.rs
```

## Key design choices worth understanding

### Why a `GraphStore` *trait* and not a concrete `SqliteStore`?

You want two backends (SQLite for default, FalkorDB for power users) to be interchangeable. The trait gives you that: code in `index.rs` and `search.rs` will be generic over `S: GraphStore` and won't know or care which backend is underneath.

Trade-off you'll feel later: trait methods take `&mut self`, which means you can only have *one* mutable borrow at a time. That'll force some design choices when you wire in `rayon` parallelism in R5.

### Why newtypes for `FileId`/`SymbolId`/`NodeId`?

Two reasons:

1. **Type safety.** The signature `fn get_symbol(id: SymbolId) -> Option<SymbolNode>` can't be called with a `FileId` by mistake. The compiler enforces it. In a graph codebase with multiple integer ID flavors, this is genuinely worth its weight.
2. **Future-proofing.** If you ever need to change `SymbolId` from `i64` to `u64` or to a `(File, u32)` pair, you change one struct definition, not every call site.

### Why `enum` for `Language`, `SymbolKind`, `EdgeKind`?

Closed sets of variants. The compiler will force you to handle every variant in `match` statements. When you add `Go` in 6 months, every `match` on `Language` becomes a compile error until you handle the new variant — exactly what you want.

## Acceptance criteria (already met)

- [x] `cargo build --workspace` succeeds
- [x] `cargo clippy --workspace -- -D warnings` is clean
- [x] `cargo test --workspace` runs with zero failures

## Next

[Phase R2 — SQLite-backed `GraphStore`](./r2-sqlite-store.md).
