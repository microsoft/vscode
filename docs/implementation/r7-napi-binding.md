# Phase R7 — napi-rs binding

**Estimated time:** Agent 1 hr · You 3-4 hr.

## Goal

`require('@son-of-anton/codegraph-napi')` from a Node.js process returns an object whose methods call into your Rust code. CI builds pre-compiled binaries for darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.

## What you'll learn

- **FFI between Node and Rust.** napi-rs hides 90% of the unsafe pointer juggling. You'll write a thin facade.
- **`Send + Sync` requirements.** Anything exposed to Node must be safe to call from any thread. The Rust types you wrote in `core` need to satisfy this.
- **Conversion at the boundary.** Rust `String` → JS string. Rust `Vec<T>` → JS array. napi-rs derives most of this for you with `#[napi]`.
- **Pre-built binary distribution.** napi-rs CLI emits per-platform npm sub-packages with a top-level package that picks the right one.

## Pre-requisites

- R6 done — all 6 tool functions in `search.rs` work end-to-end.
- `sota-codegraph-napi/Cargo.toml` already has `napi`, `napi-derive`, `napi-build`.

## Build it

### Step 1: napi-rs project init

In `crates/sota-codegraph-napi/`:

```bash
npx @napi-rs/cli new --name codegraph-napi --skip-prompt
```

This emits:
- `package.json` with build/publish scripts
- `build.rs` invoking `napi_build::setup()`
- `index.js` and `index.d.ts` stubs that get regenerated on every build
- A `napi` block in `Cargo.toml`

Verify what it generated doesn't clobber your existing `Cargo.toml`. You may need to merge by hand.

### Step 2: First `#[napi]` function

```rust
// src/lib.rs

use napi_derive::napi;
use sota_codegraph_core::store::sqlite::SqliteStore;
use sota_codegraph_core::search;

#[napi]
pub fn ping() -> String {
    "pong".into()
}
```

Build:

```bash
cd crates/sota-codegraph-napi
yarn install        # or pnpm/npm
yarn build          # produces a .node file + regenerates index.js/d.ts
```

Smoke test:

```bash
node -e "console.log(require('./index.js').ping())"
# pong
```

If you see `pong`, congratulations — Rust is talking to Node.

### Step 3: Real tool exposure

```rust
#[napi(object)]
pub struct SearchHitJs {
    pub symbol: String,
    pub file: String,
    pub kind: String,
    pub snippet: String,
    pub score: f64,    // napi prefers f64 at the boundary
}

#[napi]
pub async fn semantic_search(
    db_path: String,
    query: String,
    limit: u32,
) -> napi::Result<Vec<SearchHitJs>> {
    let store = SqliteStore::new(&db_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    // ... call search::semantic_search, convert results
    todo!()
}
```

Three things to notice:

1. **`#[napi(object)]` on the struct.** Tells napi-rs to generate a plain JS object representation (not a class). For simple data, this is what you want.
2. **`async fn`.** napi-rs handles the future, schedules it on tokio, returns a JS Promise.
3. **`napi::Result` and `napi::Error::from_reason`.** Your `CodeGraphError` doesn't implement `Into<napi::Error>` — convert at the boundary. Don't bleed `CodeGraphError` into the napi crate; it'll force a circular dep dance.

### Step 4: Statics that live across calls

You don't want to re-open SQLite on every Node call. Pattern:

```rust
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use std::sync::Arc;

struct Engine {
    store: SqliteStore,
    // index, embedder, etc.
}

static ENGINE: OnceCell<Arc<Mutex<Engine>>> = OnceCell::new();

#[napi]
pub async fn init(db_path: String) -> napi::Result<()> {
    let engine = Engine {
        store: SqliteStore::new(&db_path)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?,
    };
    ENGINE.set(Arc::new(Mutex::new(engine)))
        .map_err(|_| napi::Error::from_reason("already initialised"))?;
    Ok(())
}

#[napi]
pub async fn semantic_search(query: String, limit: u32) -> napi::Result<Vec<SearchHitJs>> {
    let engine = ENGINE.get()
        .ok_or_else(|| napi::Error::from_reason("not initialised"))?
        .clone();
    let _guard = engine.lock();
    // ...
    todo!()
}
```

Add `once_cell = "1"`, `parking_lot = "0.12"` to `sota-codegraph-napi/Cargo.toml`.

**The gotcha:** holding a `parking_lot::Mutex` guard across an `.await` is unsound (it doesn't release on yield). Use a synchronous critical section, or switch to `tokio::sync::Mutex` (whose guard *is* `Send` across await but is slower).

For most tool calls, you'll grab the guard, do a quick SQL query, drop the guard — no await inside. That's fine.

### Step 5: CI matrix

`@napi-rs/cli` generates a `.github/workflows/CI.yml` you can crib from. The key shape:

```yaml
strategy:
  matrix:
    settings:
      - host: macos-latest
        target: x86_64-apple-darwin
      - host: macos-latest
        target: aarch64-apple-darwin
      - host: ubuntu-latest
        target: x86_64-unknown-linux-gnu
      - host: ubuntu-latest
        target: aarch64-unknown-linux-gnu
      - host: windows-latest
        target: x86_64-pc-windows-msvc
```

Skip the matrix for the first cut. Get it building locally, then add CI when you're ready to publish.

### Step 6: Publishing strategy (later)

napi-rs publishes one package per platform plus a top-level package whose `optionalDependencies` includes all of them. At install time, npm picks the right platform package via its `os`/`cpu` fields. You don't have to do anything special — `yarn build && yarn napi prepublish` handles it.

For now, you'll consume the napi module locally via a relative `file:` dependency in the MCP server's `package.json`.

## Common errors

- **"the trait `napi::bindgen_prelude::ToNapiValue` is not implemented"** — you tried to return a type napi-rs doesn't know. Use `#[napi(object)]` on the struct, or implement the trait, or convert at the boundary.
- **Build fails with "unable to find tool 'dlltool'"** — Windows MSVC vs MinGW mismatch. Use the MSVC toolchain (`x86_64-pc-windows-msvc`).
- **Node says "module not found"** — you built but didn't regenerate `index.js`. Run `yarn build` not `cargo build`.
- **Async function deadlocks** — you're awaiting on a `Mutex` you also hold synchronously, or you've nested two tokio runtimes.

## Acceptance criteria

- [ ] At least one platform builds locally and `node -e "..."` smoke test passes
- [ ] All 6 tools exposed with `#[napi]`
- [ ] Concurrent calls from Node don't deadlock or panic

## Next

[Phase R8 — Wire into MCP server](./r8-mcp-server-wiring.md).
