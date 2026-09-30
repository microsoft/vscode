# Plan: Run the Laya Decision Model in a Built-in VS Code Extension

> Status: **Plan only — not implemented.**

## 1. Goal

Run the [Laya](https://huggingface.co/convaiinnovations/laya) *System 1 decision model* (ModernBERT encoder + decision head, by Convai Innovations) locally inside VS Code, on any machine VS Code supports, without Python.

Laya does not generate text. Given a *state* (text or JSON) and typed *questions*, it returns calibrated answers in one forward pass:

- `choice` — pick one option, with a probability per option
- `score` — expected level on an ordered rubric, with the distribution
- `noul` — calibrated P(true) for a yes/no statement

### Non-goals

- Running the Laya *notification/agent engine* (`aayushch/laya`: Python, FastAPI, LiteLLM, ChromaDB, n8n). Not needed.
- A Python runtime, frozen binaries (Nuitka/PyInstaller), or an OpenAI-compatible bridge to `vscode.lm`. Not needed — the decision model *is* the model.
- Text generation. If a caller needs generation after a decision, it uses `vscode.lm` separately; that is outside this plan.

## 2. Recommended approach

Wrap [`@receptron/laya`](https://github.com/receptron/laya) (MIT) in a new built-in extension, and run inference in an isolated worker process.

| Concern | Choice |
|---|---|
| Inference runtime | `onnxruntime-node` (native N-API, CPU execution provider) |
| Fallback runtime | `onnxruntime-web` (WASM + SIMD + threads) for web and unsupported platforms |
| Tokenizer | `@huggingface/tokenizers` (JS/WASM, platform-independent) |
| Pre/post-processing | `@receptron/laya` — same request/response shape as Python `RLAgent.system_one`, output matches to 4 decimal places |
| Model artifact | Quantized ONNX bundle, downloaded on demand, hosted on VS Code infrastructure |
| Isolation | Dedicated Node child process (preferred) or `worker_thread` |

Why this over alternatives:

- **vs. Python + frozen binary**: no 150–400 MB per-platform runtime, no per-OS/arch CI build matrix, faster startup.
- **vs. Pyodide**: no Python-in-WASM overhead; ONNX Runtime is the native path for this model.
- **vs. provider-hosted model**: fully local and offline, no quota, sub-second latency.

Precedent in this repo: language detection already runs a local ML model off the main thread via `@vscode/vscode-languagedetection` (`src/vs/workbench/services/languageDetection/browser/languageDetectionWorkerServiceImpl.ts`).

## 3. "Run anywhere": what gets precompiled

There is no Python or native app to precompile. JavaScript is bundled with esbuild like other built-in extensions (e.g. `extensions/git/esbuild.mts`). The "precompile" work moves to the **model artifact**, which is identical on every OS/architecture.

1. **Export** — use the repo's `export/export_onnx.py` once to produce the ONNX bundle (`laya.onnx`, `laya.onnx.data`, `laya_config.json`, `tokenizer/tokenizer.json`, `tokenizer/tokenizer_config.json`). This is a build-time step only; Python is never shipped.
2. **Quantize** —
   - int8 dynamic quantization of the encoder: ~1.7 GB → ~0.4–0.5 GB (default variant).
   - fp16 variant: ~0.85 GB (for GPU / Apple silicon execution providers, optional).
   - Keep the decision head in fp32 if quantization shifts calibration.
   - Validate accuracy **and calibration** against fp32 on a held-out set before shipping (thresholds to be defined; e.g. max |Δp| and ECE deltas).
3. **Optimize** — optionally pre-optimize the graph offline and save as `.ort` format to reduce session creation time.
4. **Publish** — sign, checksum (SHA-256), and version the artifact; host on VS Code CDN/storage (not directly on Hugging Face) so it works behind enterprise proxies and is reproducible.

Platform coverage:

| Platform | Runtime |
|---|---|
| Windows x64 / arm64 | `onnxruntime-node` |
| macOS x64 / arm64 | `onnxruntime-node` |
| Linux x64 / arm64 (glibc) | `onnxruntime-node` |
| Linux musl (Alpine), other/unsupported | `onnxruntime-web` fallback |
| vscode.dev / web | `onnxruntime-web` in a web worker |
| Remote / WSL / Codespaces | Runs wherever the extension host runs (see §4) |

The native binding uses N-API, so it is ABI-stable across Electron versions — no rebuild per Electron bump.

## 4. Extension design

### Location & packaging

- New built-in extension, e.g. `extensions/laya-decision/`, following existing built-in extension layout (`package.json`, `esbuild.mts`, `tsconfig.json`, `.vscodeignore`).
- Mark `onnxruntime-node` as external in the esbuild config; ship its prebuilt binaries per target platform in the product build.
- Configure `onnxruntime-node` install as **CPU-only** (avoid fetching CUDA/GPU binaries on Linux).
- Do **not** bundle the model in the installer.

### Process model

- Extension host side: thin API + lifecycle manager.
- Inference side: a dedicated child process (or `worker_thread`) owning the ONNX session and tokenizer. Keeps a ~0.5–2 GB model and CPU-bound inference off the shared extension host thread.
- Communication over a message channel; requests queued, with a small concurrency limit.

### Lifecycle

- Lazy activation (no `*` activation event); start the worker on first request.
- Warm-up inference after load.
- Idle unload after N minutes (configurable) to release memory; transparent reload on next request.
- Crash detection with backoff restart; errors surfaced to callers, never crash the extension host.

### Model acquisition

- On first use: download the variant for the current setting into `context.globalStorageUri`, show progress, verify SHA-256 (and signature), then load via `Laya.load({ modelDir })` — bypassing the package's own Hugging Face download.
- Pin the model version; support upgrade by version key with cleanup of stale artifacts.
- Handle offline / proxy failures with a clear error and retry command.

### Public surface

- Exported extension API: `decide(state, questions, token?) → answers` (typed like `@receptron/laya`).
- Command(s) for manual testing / diagnostics (e.g. "Laya: Show Model Status", "Laya: Unload Model").
- Optional: register as a language model tool so agents can call it (gated per §5).

### Remote / WSL / Codespaces

- `extensionKind: ["ui", "workspace"]` — prefer the local UI side where the model is typically already cached; fall back to the remote host (downloads once per host).

### Web

- Web extension entry point using `onnxruntime-web` in a web worker; model cached via Cache API / IndexedDB. Expect higher latency; consider enabling only for small quantized variant.

## 5. Settings, gating, and policy

- Settings: enable toggle (default off initially), model variant (`int8` | `fp16` | `fp32`), max threads, idle-unload timeout.
- If surfaced as an AI feature, gate UI and tool registration on `ChatContextKeys.enabled` and respect `chat.disableAIFeatures`.
- Follow the `policy-and-managed-settings` skill so administrators can disable it or pin the variant.
- All user-facing strings localized.

## 6. Dependency and compliance

- `@receptron/laya` is 0.1.x with a single maintainer: either **vendor its core** (tokenization layout, batching, post-processing — MIT) into the extension, or pin an exact version.
- Add `onnxruntime-node`, `onnxruntime-web`, `@huggingface/tokenizers`, and the Laya weights (Apache 2.0) to `cgmanifest.json` / ThirdPartyNotices.
- Run the GitHub advisory check for all added dependencies (initial check of `@receptron/laya@0.1.2`, `onnxruntime-node@1.22.0`, `@huggingface/tokenizers@0.2.0`: no known vulnerabilities).

## 7. Performance impact

| Aspect | Expected impact | Mitigation |
|---|---|---|
| VS Code startup | None | Lazy activation |
| First use | One-time download ~0.4 GB (int8) to ~1.7 GB (fp32) | On-demand, progress UI, cached |
| Model load | ~1–3 s (int8), ~3–8 s (fp32) | Warm-up, `.ort` pre-optimization, keep loaded while active |
| Memory | ~0.6–0.8 GB (int8), ~2 GB (fp32) + a few hundred MB per batch | Separate process, idle unload |
| Latency | ~140 ms per 3-question call on Apple silicon (fp32, per upstream); int8 expected ~1.5–3× faster; older x64 ~200–500 ms | Batch questions per call; queue requests |
| WASM fallback | ~2–4× slower than native | Only where native unavailable |
| CPU contention | Inference is CPU-bound | Cap `intraOpNumThreads` (e.g. min(4, cores/2)); low process priority |
| Extension host responsiveness | None if isolated | Never run inference on the extension host thread |

Model input limits (callers must respect):

- State truncated to 512 tokens (English checkpoint) after the question header.
- Each question's options must fit in 192 tokens; keep `choice` questions under ~20 options.

### Measurement

- Telemetry (per telemetry guidelines; numbers/booleans with `isMeasurement: true`): model download duration/success, load time, inference latency, batch size, OOM/load failures, runtime used (native vs WASM).
- Perf validation using the `auto-perf-optimize` / `chat-perf` skills to confirm no extension-host or chat regressions.

## 8. Testing

- Unit tests for request construction and post-processing (probabilities, score expectation, calibration application) using fixed tokenizer fixtures.
- Golden-output tests comparing quantized vs fp32 vs Python reference on a small fixture set (run in CI where the model is available; skipped otherwise).
- Integration test with a tiny/mock ONNX model to exercise worker lifecycle (load, infer, idle unload, crash restart) and download/verify flow.
- Smoke test on each target platform to verify the native binding loads.

## 9. Delivery phases

1. **Spike** — load `@receptron/laya` (fp32) in a worker inside a dev extension; confirm output parity with the Python reference.
2. **Model prep** — quantize to int8, validate accuracy/calibration, choose default variant, optionally produce `.ort`.
3. **Hosting** — publish signed, checksummed artifact; implement download/verify/cache.
4. **Extension** — built-in extension with isolated worker, lazy load, idle unload, settings, gating, policy, API.
5. **Fallback** — `onnxruntime-web` path for web and unsupported platforms.
6. **Hardening** — tests, telemetry, perf validation, compliance (cgmanifest/notices).

## 10. Open questions

- Who are the first consumers (e.g. chat request routing, tool selection, triage)? This decides the API shape and whether an LM tool is needed.
- Acceptable accuracy/calibration loss for int8 vs fp32?
- Is the multilingual checkpoint required, or English-only initially?
- Should the model run on the UI side only (simpler caching) or also on remote hosts?
- Vendor `@receptron/laya` core vs depend on the package?
