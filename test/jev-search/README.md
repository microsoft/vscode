# Jev Search PoC

A **development-only Search panel experiment**, kept outside the built-in extensions so it is not shipped with VS Code. It uses the existing proposed `AITextSearchProvider` API, not a new panel or a replacement for text/regex search.

**The Search-panel backend is a clearly labeled, local token-overlap demo. It does not call Jev, produce embeddings, or establish that Jev can rank code well. No credentials are needed.** The optional real adapter is separate; only the explicitly invoked synthetic probe makes model requests.

## Quick local run

From the repository root:

```sh
npm --prefix test/jev-search ci
npm --prefix test/jev-search run demo -- "where do we retry requests"
```

This runs the collection and ranking pipeline on the three bundled synthetic source files and prints JSON explicitly marked `modelCalled: false`.

Example queries and expected first results:

| Query | First result |
| --- | --- |
| `where do we retry requests` | `retry.ts` |
| `expire cached entries` | `cache.ts` |
| `validate settings` | `settings.ts` |

These examples exercise deterministic token overlap, not semantic-search quality.

## Run in the Search panel

Use a built Code OSS checkout matching this repository's proposed API declarations. The PoC does not compile the main VS Code application. An installed build must satisfy the extension's engine version and support the same API proposals.

After installing the PoC's dependencies, open **this folder** (`test/jev-search`) in VS Code and run the **Run Jev Search PoC** debug configuration. It compiles the extension and launches the bundled workspace in an isolated development profile with other extensions disabled.

Alternatively, from the repository root with Code OSS already built:

```sh
npm --prefix test/jev-search run compile
./scripts/code.sh \
  --user-data-dir="$PWD/test/jev-search/.vscode-test/user-data" \
  --extensions-dir="$PWD/test/jev-search/.vscode-test/extensions" \
  --disable-extensions \
  --extensionDevelopmentPath="$PWD/test/jev-search" \
  --enable-proposed-api=vscode.jev-search-poc \
  "$PWD/test/jev-search/demo.code-workspace"
```

In the development window:

1. Trust the bundled synthetic workspace and run **Jev Search PoC: Start Local Demo** from the Command Palette.
2. Enter a query in Search, then run **Search: Search with AI**. The existing Search-input shortcut is Ctrl+I on Windows/Linux or Cmd+I on macOS.
3. Inspect **Jev PoC (Local Demo) Results** and open a match. The normal text search remains independent.

The command refuses non-development use. Only one AI Search provider can register for `file`, so use the isolated profile rather than competing with Copilot's provider. `search.searchView.semanticSearchBehavior` must remain `manual`; changing it or disabling AI features cancels the active search and unregisters the provider. Starting again is explicit.

This standalone demo does not require a chat participant or account. Its command visibility and runtime checks honor `chat.disableAIFeatures` directly instead of requiring the participant-specific `chatIsEnabled` context. It does not modify that setting or any account/policy state.

The UI reuses Search's existing keyboard navigation, accessible result tree, focus behavior, and accessibility help. Tab to the results, use the arrow keys to navigate, and Enter to open a result. The **Jev Search PoC** output channel records local counts, elapsed time, and failures, not query text or snippet contents.

## Jev API contract investigation

Direct retrieval of [jevmodel.org](https://jevmodel.org/) and the suggested TypeSafe documentation failed DNS resolution. Instead, the implementation is grounded in the published [`@typesafe-ai/sdk@0.6.0`](https://registry.npmjs.org/@typesafe-ai%2Fsdk/0.6.0) and its matching [source commit](https://github.com/typesafe-ai/typesafe-sdk-js/tree/66880ccded6cb642dc1809620c2b108c33730214). The npm package's repository/homepage metadata and [publishing provenance](https://registry.npmjs.org/-/npm/v1/attestations/@typesafe-ai%2fsdk@0.6.0) attribute it to TypeSafe. The provenance statement was inspected, not independently cryptographically verified.

The source-backed contract is:

| Field | SDK behavior |
| --- | --- |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone` |
| Authentication | API key handled by the SDK |
| Model | SDK default `jev-latest`; this is a moving alias, not a pinned model version |
| Request | `{ model, state, questions }`, with questions keyed by caller-chosen IDs |
| Score question | `{ type: "score", instructions, criteria: string[] }`; criteria are ordered rubric levels |
| Response | `{ model, answers, usage }`; each named Score answer has `type`, fractional `score`, `confidence`, `legend`, and `probabilities` |
| Score scale | Zero-based rubric indices: three criteria imply an expected score in `[0, 2]` |
| Multiple candidates | Independent named questions over shared state, not a separate document-batch endpoint |

References: [client transport](https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/client.ts#L311-L362), [question and answer types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/types.ts), and [provider-authored multi-question guidance](https://github.com/typesafe-ai/skills/blob/65a39f393687675ce170e6094757de20370365b9/skills/typesafe-ai/SKILL.md#L99-L148). The guidance says question IDs themselves are not shown to the model, so each question must explicitly reference its candidate in the state.

**Live service availability, account access, server/context/rate limits, pricing, retention, and code-search quality remain unverified.** The SDK's timeout and retry defaults are client behavior, not service guarantees. No model request was made while implementing this PoC. Test response fixtures are synthetic, not captured Jev responses.

## Where a real call belongs

[`src/jevClient.ts`](src/jevClient.ts) contains a real adapter backed by the pinned TypeSafe SDK. It is **not wired into the Search-panel demo**. It creates one explicitly indexed Score question per candidate, submits sequential batches of at most eight, divides three-level rubric scores by two, and validates answer IDs, types, and score ranges. There are no automatic retries, SDK logging is off, and each request has a 10-second timeout plus caller cancellation. Queries are capped at 2,000 characters. These are PoC budgets, not claimed Jev service limits.

[`src/scorer.ts`](src/scorer.ts) defines the **PoC's own adapter interface**, not Jev's wire API:

```ts
type ChunkScorer = (
	query: string,
	candidates: readonly { id: string; text: string }[],
	signal: AbortSignal,
) => Promise<readonly { id: string; score: number }[]>;
```

The provider passes only the query and opaque candidate IDs with snippet text. File URIs and source ranges stay local. Return exactly one finite score in `[0, 1]` per candidate; these normalized relevance scores are **not calibrated probabilities**. Unknown, missing, duplicate, and invalid scores fail the search rather than silently falling back to demo results.

To investigate a real call, configure `JEV_API_KEY` in your local environment, optionally set `JEV_MODEL` to override `jev-latest`, then explicitly run:

```sh
npm --prefix test/jev-search run probe:jev
```

**This command makes a live, potentially billable request.** [`src/probeJev.ts`](src/probeJev.ts) sends only two embedded synthetic snippets and a fixed query. It does not read workspace files or accept arbitrary query input. Without a key it fails before making a request. The **Probe Jev (Synthetic Data, Live API)** debug configuration runs the same code and inherits your environment; set a breakpoint in `jevClient.ts` to inspect the call.

After validating a live request and reviewing the provider's terms, a Search-panel integration can supply `createJevScorer(...)` through a separately named, explicitly opt-in `SearchBackend` in [`src/extension.ts`](src/extension.ts). That interface carries the backend's name, disclosure notice, and scoring function, so result rendering need not know the vendor's JSON shape. Do not silently replace the backend behind **Start Local Demo**.

Before enabling remote calls:

- Confirm live endpoint/account access and SDK compatibility, and establish context limits, quotas, costs, and data handling terms. Source verification is not live-service verification.
- Keep credentials in extension `SecretStorage` or an explicitly configured local environment, never in source, workspace settings, logs, or chat.
- Restrict the first experiment to the bundled synthetic corpus or another explicitly approved public corpus. Ordinary search exclusions are not a secret-detection or organization content-exclusion system.
- Obtain explicit consent for sending query/snippet contents, retain AI-disable and workspace-trust checks, and apply relevant organizational policy before any request.
- Retain the adapter's `AbortSignal`, timeout, sequential batching, and explicit errors. Never turn a failed real request into local-demo results.

## Scope and limits

The initial retrieval strategy is deliberately **bounded exhaustive chunk scoring**, not lexical prefiltering. This lets a future model judge snippets even when the query uses different vocabulary. The local demo itself cannot provide that semantic behavior.

[`src/search.ts`](src/search.ts) bounds each search to 80 files, 200 chunks, 128 KiB per file, 40 lines / 6,000 UTF-16 code units per chunk, and 20 returned chunks. Search's smaller file/result limits also apply. Long lines are truncated with an incomplete-results warning; the character cap is not a model token budget.

Collection uses `findFiles2` with the Search request's include/exclude globs, ignore-file options, and symlink preference. Open documents supply current text, including unsaved changes. Binary/non-file/oversized entries are counted as skipped. File-read and scoring errors are surfaced; cancellation discards late results.

Results are emitted in descending score order. The existing Search tree groups chunks by file and workspace root; it is not a custom, globally flat ranked list. There is no vector index, persistence, generated answer, or notebook-specific extraction. Virtual folders are rejected; remote workspaces are outside the scope of this experiment. At the file/chunk limits, only a subset of the workspace is assessed; narrow **Files to Include** for predictable experiments.

For larger repositories, add candidate retrieval separately and measure recall as well as ranking. The next real-model experiment should compare expected code locations for a small labeled query set, latency, and cost; this demo makes no Jev performance claims.

## Development

```sh
npm --prefix test/jev-search test
```

This compiles against this checkout's real proposed API declarations and runs the collection/ranking and SDK-adapter tests. SDK tests inject a synthetic `fetch`; they verify the actual SDK's serialized endpoint, headers, and request shape without contacting Jev. They do not require Electron or a Jev credential. The Search-panel launch and live probe are separate, explicit checks.
