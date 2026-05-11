# Packaging `sota` — Stage 1 (macOS arm64)

This document describes how the `sota` CLI is packaged into a single,
self-contained binary using **esbuild + Node SEA (Single Executable
Applications)**. Stage 1 ships **macOS arm64 only**. Linux and Windows
support is tracked as Stage 3.

## TL;DR

```bash
cd son-of-anton-cli
npm install                  # one-time
npm run package:macos-arm64  # produces dist-bundle/sota
./dist-bundle/sota --version
```

The output is a Mach-O 64-bit arm64 executable (~115 MiB) under
`dist-bundle/sota`. `dist-bundle/` and `sea-config.json` are
git-ignored.

## Pipeline (seven steps, matches Node's SEA docs)

1. **Bundle** — `esbuild` walks the import graph from
   `src/seaEntry.ts` and writes a single CommonJS file to
   `dist-bundle/cli.cjs`. Everything (commander, ink, react,
   marked-terminal, the AWS Bedrock SDK, `son-of-anton-core/dist/**`)
   is inlined; no `node_modules` resolution happens at runtime.
2. **`sea-config.json`** — The build script emits this file from a
   live listing of `son-of-anton-core/dist/agents/prompts/` so every
   `.prompt.md` ships as a SEA *asset* keyed by its filename. The
   `disableExperimentalSEAWarning` flag suppresses the runtime banner
   that would otherwise leak to stderr on cold start.
3. **SEA blob** — `node --experimental-sea-config sea-config.json`
   produces `dist-bundle/sota.blob`.
4. **Copy Node** — A SEA-fuse-capable Node binary is copied to
   `dist-bundle/sota`. Homebrew strips the fuse sentinel, so the
   build script falls back to an official tarball cached in
   `~/.cache/sota-sea/` when the running Node doesn't carry the fuse.
5. **Inject** — `npx postject` injects the blob into the `NODE_SEA`
   Mach-O segment.
6. **Re-sign** — `codesign --remove-signature` strips the original
   signature; `codesign --sign -` applies an ad-hoc signature so
   macOS will execute the modified binary. (Production releases will
   replace this with a Developer ID signature + notarization in a
   later stage.)
7. **Smoke** — `./dist-bundle/sota --version` must exit 0.

## What is bundled

- Everything under `son-of-anton-cli/src/**`
- The full compiled tree of `son-of-anton-core/dist/**`, including:
  - Agent role descriptions (`agents/prompts/*.prompt.md`) — shipped
    as SEA assets, read via a `fs.readFileSync` shim in
    `src/seaEntry.ts` that hands `/prompts/<file>.prompt.md` lookups
    to `sea.getAsset()` and falls back to the real disk for
    everything else.
  - `chatStream`, `headless`, `persistence`, `tools/builtin`,
    `agents/*`.
- All third-party deps from `package.json`: commander, ink, react,
  cli-highlight, marked / marked-terminal, ink-spinner, the AWS
  Bedrock SDK pair.

## What is NOT bundled (yet)

- **The `claude` CLI** (`@anthropic-ai/claude-code`) — `sota` still
  spawns `claude` from `PATH` when the user is signed in via the
  Anthropic subscription auth path. If `claude` isn't on `PATH`, fall
  back to setting `ANTHROPIC_API_KEY`.
- **The `codex` CLI** (`@openai/codex`) — same story for ChatGPT /
  OpenAI subscriptions. Stage 2 will vendor both upstream CLIs into
  the binary so the user doesn't need a separate `npm i -g`.
- **The IDE** — this binary is the CLI only. The VS Code fork still
  ships through the regular `gulp vscode-darwin-arm64-min` pipeline.

## Cross-platform status

| Platform        | Stage | Status        |
|-----------------|-------|---------------|
| macOS arm64     | 1     | ✅ supported   |
| macOS x64       | 3     | Not yet built |
| Linux x64       | 3     | Not yet built |
| Linux arm64     | 3     | Not yet built |
| Windows x64     | 3     | Not yet built |

Cross-builds need a SEA-capable Node binary for the target platform
plus the equivalent of `codesign` (no-op on Linux; `signtool` on
Windows). The build script is intentionally narrow to keep Stage 1's
surface area small.

## Known limitations

- **First-run startup**: ~250 ms slower than `node dist/cli.js` due
  to SEA blob load + ad-hoc code signature validation.
- **No `--inspect`**: the SEA flow disables the Node inspector by
  default (see `useCodeCache: true` in the generated SEA config). For
  debugging, run `node dist/cli.js` instead.
- **The binary is not portable across major Node versions**: the SEA
  blob format is keyed to the host Node major. The build pins
  `NODE_VERSION = v22.20.0` in
  `scripts/package-macos-arm64.mjs`; bump that constant in lockstep
  with the esbuild `target` field if you migrate.
- **`__dirname` inside the bundle** resolves to a synthetic path
  (`/snapshot/...` style). Any code that hard-codes `__dirname` for
  workspace resolution will need to use the explicit `--cwd` or
  `process.cwd()` instead. None of the current code paths do this;
  the only `__dirname` usage in `son-of-anton-core` was the prompt
  loader, which we handle via the SEA-asset shim.

## Troubleshooting

| Symptom                                            | Fix                                                                              |
|----------------------------------------------------|----------------------------------------------------------------------------------|
| `Could not find the sentinel NODE_SEA_FUSE_...`    | Your running Node lacks the SEA fuse (Homebrew strips it). The script will auto-download an official Node tarball into `~/.cache/sota-sea/`. |
| `code signature in ... not valid for use`          | The re-sign step was skipped — re-run `npm run package:macos-arm64`.            |
| `Failed to load agent prompt for "..."`            | A new prompt file was added to `son-of-anton-core/src/agents/prompts/` without rebuilding core. Run `npm --prefix ../son-of-anton-core run build` first. |
| Bundle size jumps by >20 MiB                       | Check what new transitive dep got pulled in — `npx esbuild --analyze src/seaEntry.ts > /tmp/analyze.txt` shows the per-import cost. |
