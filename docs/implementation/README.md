# Implementation Guide

A phase-by-phase, beginner-friendly walkthrough for building the Rust embedded code-graph backend described in [`plan.md`](../../plan.md).

## Who this is for

You know how to read code in several languages, you've shipped real software, but Rust is new (or newish). You want to build the thing in `plan.md` *and* come out the other side actually understanding Rust — not just having pasted code from a chatbot.

Every phase guide is structured the same way:

1. **Goal** — what you'll have when this phase is done.
2. **What you'll learn** — the Rust concepts this phase forces you to confront.
3. **Pre-requisites** — what state your code should be in before starting.
4. **Build it** — numbered steps, with code you can adapt.
5. **Common errors** — the compile failures you will hit, and what they mean.
6. **Testing checklist** — how to prove the phase is done.
7. **Acceptance criteria** — the bar from `plan.md`.
8. **Next** — a link to the next phase.

## Conventions used in this guide

- All shell commands assume you're at the repo root (`/Users/danielhalwell/RustroverProjects/CodeGraph`) unless stated otherwise. When commands target the Cargo workspace, the guide says `cd crates` first.
- Code snippets are minimal but compilable. If a snippet uses `// ...`, fill in the obvious bits yourself.
- Where I say "you'll fight the borrow checker here," that's a flag — slow down, read the compiler message, don't reach for `.clone()` reflexively.
- Tests go in a `#[cfg(test)] mod tests { ... }` block at the bottom of the file under test, unless they need cross-module helpers (then `crates/sota-codegraph-core/tests/`).

## Phase index

| Phase | Topic | Status |
|---|---|---|
| [R1](./r1-workspace-skeleton.md) | Cargo workspace, core types, `GraphStore` trait | Done |
| [R2](./r2-sqlite-store.md) | SQLite-backed `GraphStore` | Done (incl. perf bench) |
| [R3](./r3-tree-sitter.md) | Tree-sitter parsing for 4 languages | Done |
| [R4](./r4-embeddings.md) | Local + provider embeddings, HNSW index | Done |
| [R5](./r5-incremental-indexer.md) | File watcher, debounced incremental re-index | Done |
| [R6](./r6-mcp-tools.md) | The 6 MCP tool implementations | Done |
| [R7](./r7-napi-binding.md) | napi-rs Node bindings | Rust side done; npm packaging deferred |
| [R8](./r8-mcp-server-wiring.md) | Swap MCP server placeholders for napi calls | Done (TS, type-checks, JSON-RPC verified) |
| [R9](./r9-activation-flow.md) | IDE turnkey activation | Reference sample done (real downstream extension untouched) |
| [R10](./r10-docker-backend.md) | Optional FalkorDB/Qdrant backend | Done (compiles + clippy clean; live behaviour gated on `FALKORDB_URL`) |

See [STATUS.md](./STATUS.md) for the detailed completion notes and any deviations
from the original plan.

## How to use this guide

- Don't skim and copy. Read the **What you'll learn** section *first*, then try the steps without looking at the code blocks. Look at the code only when stuck. You will learn ~5× more this way.
- When the compiler errors, **read the whole error** — including the help line and the "for more information about this error, try `rustc --explain Exxxx`" hint. Rust's errors are unusually good.
- Commit at the end of every step that compiles + passes tests. Small commits make it cheap to back out.
- If a phase is taking more than 2× the estimated time, stop and ask. Either the guide is wrong for your context, or you're stuck on a concept that needs a side detour.

## General Rust learning tips

- **`cargo check` is faster than `cargo build`.** When you're just trying to make the type checker happy, use it.
- **`cargo clippy --workspace -- -D warnings` once per phase.** Catches the lints that come up over and over.
- **`cargo expand`** (install with `cargo install cargo-expand`) shows you what derive macros generate. Run it on `types.rs` once. Demystifies `#[derive(Serialize)]`.
- **The Rust Book chapters that map to this project:** 4 (ownership), 10 (generics, traits, lifetimes), 13 (closures, iterators), 16 (concurrency). Re-read whichever is biting that week.

Next up: [Phase R3 — Tree-sitter integration](./r3-tree-sitter.md). If you haven't finished R2's perf warm-up yet, see the bottom of [R2](./r2-sqlite-store.md) first.
