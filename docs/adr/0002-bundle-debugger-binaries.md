# Bundle debugger binaries in the repository

The `netcoredbg` debug adapter binaries (win-x64, linux-x64, linux-arm64, osx-arm64 — the four platforms upstream publishes; no osx-x64 asset exists) are committed inside the built-in `dotnet` extension rather than downloaded on first use. We decided this because debugging must work out of the box and offline — the same promise the product makes for its bundled language grammars — and because a first-run download adds a network dependency, a trust anchor, and a failure mode to the single most visible feature.

## Considered Options

- **Download on first debug** from the Samsung/netcoredbg release URL with a pinned version — keeps the repo lean (~60 MB lighter) but makes the flagship feature fail without network access and adds a supply-chain step.
- **User-provided debugger path setting** — pushed toolchain setup onto the user; rejected for the same reason (kept as `dotnet.netcoredbgPath` override).
- **Bundle (chosen)** — large repo, zero setup.

## Consequences

- The repository and every JustRide build grow by roughly 60 MB.
- Updating netcoredbg is a deliberate version-bump commit, which keeps debugger changes reviewable.
- Platforms without an upstream asset (currently osx-x64) fall back to the `dotnet.netcoredbgPath` setting or the fetch script, which errors clearly.
- The on-demand download flow remains the documented fallback for anything we do not bundle.
