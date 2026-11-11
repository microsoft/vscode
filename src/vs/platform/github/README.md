<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# GitHub service

The GitHub service provides typed clients backed by shared request scheduling, rate-limit handling, credentials, caching, and cancellation. New integrations should use these clients instead of constructing their own HTTP or Octokit stack.

Consolidation is incremental. Some workbench, extension, and SDK callers still use separate networking; this service does not intercept all GitHub traffic. Git transport, GitHub MCP tool traffic, and build tooling are outside its scope.

## Runtime ownership

Portable clients share contracts and execution policies, but engine state belongs to the process hosting it.

| Consumer | Execution |
| --- | --- |
| Desktop workbench and internal extension module | The [workbench binding](../../workbench/services/github/electron-browser/githubService.ts) routes portable clients to the [shared-process service](electron-utility/githubService.ts). |
| Web workbench and internal extension module | The [browser binding](../../workbench/services/github/browser/githubService.ts) executes locally with browser fetch. |
| Standalone Agent Host | The [Agent Host binding](../agentHost/node/agentHostGitHubService.ts) uses host-owned credentials and networking, without requiring an attached workbench. |

Legacy renderer clients can still execute locally. Independent engines and browser tabs do not share application-wide request state. Within the shared process, connections share admission and verified-account cooldowns, but private caches and credential callbacks remain connection- and grant-scoped.

The main implementation layers are:

- [GitHubService](common/githubService.ts): client pooling and ownership of shared queue, cooldown, and telemetry state.
- [Account](common/account/account.ts) and [anonymous](common/anonymous/anonymous.ts) facades: disposable, typed domain clients.
- [Request providers](common/client/request.ts): serialization, response parsing, and cancellation shared by local and remote execution.
- [IPC client](common/remote/ipcClient.ts), [server](common/remote/ipcServer.ts), and [credential provider](common/remote/credentialProvider.ts): connection-scoped leases and credential callbacks.

## Authorization clients

Account selection and sign-in UX belong to the caller or host binding, not the engine. The [workbench service](../../workbench/services/github/common/githubService.ts) offers:

- `acquireAccountApiClient(authorization, signal)`: bind an explicit provider/session/account/scopes/issuer grant.
- `acquireDefaultAccountApiClient(signal)`: use the selected default account's existing repository grant.
- `acquireAnonymousApiClient(signal)`: read GitHub.com data without selecting an account or obtaining credentials.

```ts
const client = await gitHubService.acquireAccountApiClient(authorization, signal);
try {
	const repository = await client.repositories.get(
		{ owner: 'microsoft', repo: 'vscode' },
		signal,
		{ caller: 'repositoryPicker' },
	);
	// Use repository.
} finally {
	client.dispose();
}
```

These portable clients are directly disposable. The older `IGitHubService.acquireClient` and `acquireDefaultAccountClient` return references whose clients are accessed through `.object`; do not mix the two ownership models.

Important lifetime rules:

- The acquisition signal controls acquisition, not the acquired client's lifetime. Dispose the client when its owning operation or feature ends.
- Grant changes invalidate affected clients. Consumers retaining clients must discard account-bound state when invalidated.
- Same-session token renewal retains the lease while replacing credentials; it does not replay interrupted writes.
- Different grants and endpoints have separate private state. Releasing a client does not reset live server cooldowns.
- Authenticated failures do not automatically fall back to anonymous access or another account.

The [credential broker](../../workbench/services/github/browser/githubCredentialProvider.ts) silently resolves the exact selected grant and derives approved endpoints. Credentials stay in the broker and execution engine, not in domain-client results or ordinary request messages. IPC leases belong to a physical connection; disconnect, disposal, and cancelled acquisitions release them, including when acquisition replies arrive late.

Anonymous clients expose only content reads, `gist.get`, and `search.issues`. They omit authorization, cookies, and referrers, and cannot perform mutations or GraphQL operations. Internal bootstrap clients are reserved for trusted host authentication flows; checking a supplied credential does not make it an accepted host credential.

## Typed domains

The [account interface](common/account/account.ts) is the authoritative list of available domains.

| Domain | Contract |
| --- | --- |
| Repositories, PRs, issues, reviews, search, users, organizations, notifications, Actions, checks | [Core domains](common/core/) |
| Repository files, refs, trees, and blobs | [Content](common/content/content.ts) |
| Gist retrieval and creation | [Gists](common/gists/gists.ts) |
| Mission Control | [Automations](common/missionControl/automations.ts), [tasks](common/missionControl/tasks.ts), [environments](common/missionControl/environments.ts) |
| Copilot Connector catalog and connection management | [Connectors](common/connectors/connectors.ts) |

Repository operations use `RepositoryRef` (`{ owner, repo }`). Typed request methods take an `AbortSignal` and optional trailing request options. They normally return parsed domain data or `void`, not transport objects, ETags, or header collections. Domain-specific counts, cursors, nullable values, and acceptance states remain meaningful; HTTP success does not necessarily mean an asynchronous operation has completed.

### Domain-specific boundaries

- **Mission Control:** bindings approve service endpoints; individual calls cannot choose a host or supply authentication. Environment connection and task-feed credentials are not cached or coalesced. Feed negotiation uses a separately approved GitHub gateway. Feed renewal prefers server-relative lifetimes to avoid client-clock skew, retaining the timestamp fallback for older servers. Dispatched mutations with uncertain outcomes require reconciliation, not blind retries. See the [execution provider](common/client/localMissionControlRequestProvider.ts).
- **Connectors:** the [workbench consumer](../../workbench/contrib/chat/browser/aiCustomization/copilotConnectorsService.ts) owns account selection, consent, and polling. Catalog status does not grant runtime MCP access. The [provider](common/client/localConnectorsRequestProvider.ts) enforces its response-size bound, no redirects, and no automatic replay.
- **Raw repository content:** reads are anonymous and confined to the configured raw origin and pinned repository/commit path. The text-download limit is 1 MiB; mutable refs must first be resolved to a full SHA-1 or SHA-256 commit. Raw files are not fetched through arbitrary response-provided URLs. See the [content client](common/content/contentClient.ts).
- **Legacy resources and guarded mutations:** existing [subscriptions](common/githubQueryService.ts) and [compound mutations](common/githubPullRequestMutationService.ts) retain their own polling, reconciliation, and authorization rules. A raw endpoint call is not a replacement for guarded merging or reply-and-resolve behavior; an unpublished review reply must not be treated as a published comment.
- **Issue reporter:** classic web and desktop issue creation uses the existing selected GitHub session through the [form-service bridge](../../workbench/contrib/issue/browser/issueFormService.ts), without selecting the default account or requesting additional scopes. The reporter captures the selected session ID, account, scopes, and issuer alongside its credential, so token renewal retains the same authorization. Unavailable or changed grants fail rather than substituting credentials. Similar-issue search uses the anonymous client. Browser previews and the separate attachment-upload pipeline retain their existing behavior and authentication.

The workbench's [session feed](../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxSessionFeed.ts) uses exponential reconnect backoff with jitter (one-second base, 60-second cap), resetting only after a connection stays healthy for 60 seconds. A failed HTTP negotiation still stops feed retries for that lifetime; discovery polling remains available.

## Request execution

The [transport](common/githubTransport.ts), [queue](common/requestQueue.ts), and [rate-limit coordinator](common/githubRateLimitCoordinator.ts) provide shared execution policy:

- **Bounded admission:** active, queued, and cooldown-waiting work is limited by engine, host, account, and caller. Priorities provide fair scheduling and preserve interactive capacity.
- **Deadlines and size limits:** operations include queueing, retries, and body reads in their deadline. Credential resolution has its own bounded wait. Oversized responses fail explicitly rather than silently becoming partial JSON.
- **Read sharing:** compatible reads can coalesce, with independent cancellation for each waiter. One cancelled caller does not cancel peers.
- **Conditional caching:** eligible REST reads use grant-scoped ETags. A revalidated response retains its original success status. `noCache` bypasses cache reads/writes; server `no-store` also removes retained bodies and validators.
- **Retries:** eligible reads may retry once for transient network/server failures. Writes are not automatically replayed. Domain policies can further restrict retries or sharing.
- **Cooldowns:** primary/secondary quota evidence and service `Retry-After` hints govern admission. Healthy observations and client recreation do not erase live waits.

Current numeric defaults are defined in the queue and transport, not promised as public API or server quotas.

[ApiRequestOptions](common/client/request.ts) carries `caller`, an absolute millisecond `deadline`, `priority`, and `noCache`. Query parameters belong under `query`; request metadata must not become URL parameters, GraphQL variables, or request-body fields. Use background/enrichment priorities for passive work rather than giving every request interactive priority.

Lists fetch one page by default. `maxPages` opts into bounded collection; reaching the bound with more results available throws `PaginationLimitError` unless `pageLimitBehavior: 'returnPartial'` was explicitly requested. Collection follows validated REST links or GraphQL cursors, preserves server order and totals, and does not implicitly collect nested connections. `returnPartial` does not add a completeness flag to plain arrays.

Request and response bodies cross IPC as buffered text; domain parsers run beside the caller. Parsers, `Headers`, and `Response` objects do not cross the boundary. Portable GraphQL clients reject error-bearing responses, including partial-data responses; legacy GraphQL consumers retain their existing fallback behavior. Streaming and general binary transfer are not portable request-provider capabilities.

## Host networking

Bindings own their fetch implementation. There is no automatic move to another machine or executor after a failed request.

- **Browser:** CORS and browser/OS proxy and certificate behavior apply. A restricted repository-read fallback can follow browser-opaque redirects; it validates the final destination but cannot guarantee that no intermediate origin was contacted.
- **Shared process:** [createFetch](electron-utility/githubFetch.ts) uses local-machine proxy/PAC, authentication, shell environment, and certificate integration. Remote-workspace settings do not select its proxy.
- **Agent Host:** the binding reuses the host's existing network implementation.

Certificate verification remains enabled by default. The shared-process helper does not turn `http.proxyStrictSSL: false` into a verification bypass and does not promise full Chromium parity for SOCKS4/4a, native NTLM, ordered PAC failover, or certificate exceptions. Identification headers follow binding-specific egress/CORS policy and are not forwarded to cross-origin download storage.

Operations needing redirect status and headers, such as Actions log-URL retrieval, are unsupported through the local browser provider because browser fetch exposes opaque redirects.

## Internal extension module

The extension-host-provided `@vscode/internal-github` module ([typings](../../../typings/internal-github.d.ts)) is not part of the `vscode` API. It is resolved through the extension host's `require` interception, only for the allowlisted built-in extensions in [extHostGitHub.ts](../../workbench/api/common/extHostGitHub.ts), and binds the importing extension's identity. Node ESM consumers use `createRequire(import.meta.url)`; native ESM imports are not supported. The consumers are [Configuration Editing](../../../../extensions/configuration-editing/src/importExportProfiles.ts) and [GitHub](../../../../extensions/github/src/auth.ts).

- `getClient(sessionId, token?)`: a disposable GitHub.com client with typed Gist, repository, user, repository-search and pull-request operations. Repository queries also cover viewer permissions, inherited rulesets, assignable users and commit authors.
- `getAnonymousClient(token?)`: a disposable client with `gists.get` only.

Ruleset reads support shared page collection through `maxPages`. The GitHub extension collects at most 1,000 pages; exceeding the limit fails rather than returning partial branch-protection rules.

The extension chooses its session through `vscode.authentication.getSession('github', ...)`. Client acquisition never prompts, substitutes another account, or grants access to an extension. The module does not accept GitHub Enterprise sessions, raw credentials, arbitrary HTTP requests or caller-provided GraphQL. A retained authenticated client reports an unusable authorization or lease through `onDidInvalidate` when a request fails; callers release it and acquire a fresh client rather than automatically replaying mutations.

The [main-thread bridge](../../workbench/api/browser/mainThreadGitHub.ts) enforces extension account access, rechecks it after acquisition and before requests, and invalidates pending/active authenticated clients when the provider is removed. The [extension-host facade](../../workbench/api/common/extHostGitHub.ts) provides cancellation and disposable handles. Desktop calls reach the shared-process service; web calls use the local service, and remote extension hosts reach the same main-thread bridge through RPC. Caller attribution is `extension.<extensionId>`.

Gist results contain only the ID, browser URL, and inline file content with binary/truncation flags. Configuration Editing rejects a truncated or binary first file; raw Gist downloads are not part of this module. Creation accepts visibility and named text files; secret gists are unlisted, not private to their creator. Errors use `GitHubError` and cancellation uses `CancellationError`; the internal typings define their shape.

## Extending the service

1. Add the smallest required contract and implementation to the relevant domain. Keep account choice, consent, feature gates, polling cadence, and workflow reconciliation in the consumer.
2. Reuse request providers, routing helpers, and execution policy. Do not add another fetch stack, credential path, or arbitrary authenticated URL escape hatch.
3. Verify response fields against the service contract. Preserve meaningful omission and null values; do not replace unavailable data with success-shaped defaults.
4. Choose [schema parsers](common/client/schema.ts) deliberately: `parse.object` retains extra fields and reuses unchanged inputs; `parse.copyObject` projects declared fields, with nested filtering composed explicitly. `parse.optional(parser, defaultValue)` defaults only `undefined`, not `null`.
5. Supply the fixed API domain for telemetry, forward caller/signal/options, and add focused contract tests. Exercise serialized IPC when changing the execution boundary.

## Telemetry

[Request telemetry](common/githubRequestTelemetry.ts) uses the existing product consent controls:

- `githubRequestSummary`: engine-level request, cache, cancellation, rejection, and queue counters.
- `githubRequestTiming`: bounded, sampled queue/cooldown/execution timings.
- `githubRequestDomainSummary`: unsampled completed-operation and rejection counts by fixed API domain.

Categories are allowlisted. Events do not contain credentials, raw caller IDs, account/repository identifiers, hosts, URLs, headers, request/response content, GraphQL text, or raw errors.

Domain outcomes describe transport completion, not subsequent schema validation or application-level success. Coalesced followers and wire retries are not additional admitted operations. Divide domain time totals by `admittedCompleted`, not by reporting windows; use timing samples' population weights when estimating distributions.

## Testing

Reuse current compiled output. If it is stale, refresh the client output from the repository root before running focused tests:

```powershell
pnpm run build-fast --client-only
.\scripts\test.bat --run src\vs\platform\github\test\common\githubChannel.test.ts
```

On macOS/Linux, use `./scripts/test.sh` with forward-slash paths. Select tests nearest the change: [schemas](test/common/schema.test.ts), [API compatibility](test/common/apiCompatibility.test.ts), [IPC](test/common/githubChannel.test.ts), or [transport](test/node/githubTransport.test.ts). Changes to the internal module also have [main-thread](../../workbench/api/test/browser/mainThreadGitHub.test.ts), [extension-host](../../workbench/api/test/common/extHostGitHub.test.ts), and [profile integration](../../../../extensions/configuration-editing/src/test/importExportProfiles.test.ts) tests.

Use targeted lint/type checks appropriate to the change; see the [contributor instructions](../../../../.github/copilot-instructions.md) for the repository's validation workflow.
