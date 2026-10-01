<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# GitHub runtime client inventory

The platform GitHub service is the consolidation foundation, but migration is broader than replacing Octokit clients. Independent callers run in the workbench, extensions, Electron main/shared process, and Agent Host. Some need JSON requests; others need bootstrap authentication, binary transfers, or streaming.

This is a **runtime client-family inventory**, grouping related call sites rather than listing every endpoint invocation. The replacement map describes proposed changes unless explicitly marked migrated. See the [README](README.md) for the target architecture.

**Caller survey snapshot:** 2026-09-29; VS Code `af5cce3c2a2af0fec4bb9c4416ca02790aeab652`, GitHub Pull Requests extension `596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345`. Owners below are logical subsystem owners, not assigned individuals. The foundation and gap summaries below also account for the [current engine hardening](README.md#request-execution).

## 1. Runtime caller inventory

### Execution legend

- **Workbench:** desktop renderer or browser workbench.
- **Node EH:** local or remote Node extension host, depending on extension placement.
- **Web EH:** browser extension host.
- **Agent Host:** its own local or remote process.

These are **current locations**, not proposed destinations. Browser workbench requests using the existing request service can also take its [remote fallback](../../workbench/services/request/browser/requestService.ts#L37).

### A. Workbench and Sessions

| Owner / representative client | Endpoint family and payload | Authentication | Polling / triggering behavior | Current execution |
|---|---|---|---|---|
| **Core GitHub presentations** - [link provider](../../workbench/contrib/github/browser/githubLinkPresentation.contribution.ts#L254) | Repository, issue, commit, PR and check data; REST/GraphQL JSON | Default-account GitHub/enterprise session; repository-capable token | On-demand hydration and shared subscriptions; pending checks can poll every 15s | Workbench, through the platform engine |
| **Legacy Sessions GitHub integration** - [service](../../sessions/contrib/github/browser/githubService.ts#L37), [review mutations](../../sessions/contrib/github/browser/fetchers/githubPRFetcher.ts#L310) | Repository search, PRs, reviews/threads/comments, issues, compare, contents, CI/reruns; JSON/GraphQL/base64 content | Default provider; existing session, preferring repository scopes; some paths can prompt | PR/check/thread models generally poll every 60s; issues every 15min; picker, review and changeset actions | Workbench, through a separate API client |
| **Sessions repository filesystem** - [filesystem provider](../../sessions/contrib/fileTreeView/browser/githubFileSystemProvider.ts#L139) | Recursive git trees and blobs; JSON/base64 to bytes | GitHub provider token; currently hardcoded public GitHub API | On-demand; tree cache and in-flight deduplication; individual blob reads | Workbench |
| **Accounts, entitlement and policy** - [account requests](../../workbench/services/accounts/browser/defaultAccount.ts#L1472), [signup](../../workbench/services/chat/common/chatEntitlementService.ts#L1238) | `/copilot_internal/user`, `/copilot_internal/v2/token`, `/copilot_internal/managed_settings`, `/copilot/mcp_registry`, limited-plan signup; JSON | Account-selected GitHub/enterprise session | Startup/auth/focus changes, hourly refresh, explicit signup; local freshness/backoff logic | Workbench |
| **Copilot Connectors** - [request adapter](../copilotConnectors/common/copilotConnectorsRequestService.ts#L73) | `/copilot-connectors/api/v1/plugins` and managed connection GET/PUT/DELETE; JSON | Selected GitHub account; management requires `write:plugin_gateway_connections`; enterprise currently disabled | Catalog refresh and user actions; connection completion polls every 2s, bounded to 5min | **Shared process on desktop**, workbench implementation on web |
| **Cloud sandbox / Mission Control** - [API service](../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxApiService.ts#L170) | CAPI tasks/events/environments/connect/reconnect; REST repository-ID lookup; JSON including connection credentials | GitHub token with configured chat-provider scopes; current endpoints are public GitHub/CAPI | Paged discovery, detail fan-out, bounded waking/connect retries, credential renewal | Workbench, including web without the Copilot extension |
| **Plugin marketplaces and plugin/MCP details** - [catalog](../../workbench/contrib/chat/common/plugins/pluginMarketplaceService.ts#L625), [MCP README](../mcp/common/mcpGalleryService.ts#L949) | Raw GitHub marketplace definitions and READMEs; JSON/text | Anonymous raw-content requests; private repository discovery can switch to clone-based handling | Catalog refresh with 8h positive cache; details fetched on opening | Workbench; gallery service also has shared-process hosting |
| **Browser plugin materialization** - [browser repository client](../../workbench/contrib/chat/browser/pluginGitCommandService.ts#L79) | Commit/ref resolution, recursive tree, blob per file; JSON/base64 to files | Existing GitHub token, then anonymous, then explicitly requested repository session | Install/update-triggered; SHA caching; blob fan-out | Web workbench |
| **Issue reporter** - [anonymous search](../../workbench/contrib/issue/browser/issueFormService.ts), [search/create](../../workbench/contrib/issue/browser/baseIssueReporterService.ts), [attachment transport](../native/electron-main/nativeHostMainService.ts#L909) | Issue search/create, repository lookup, upload policy/storage/confirmation; JSON and multipart bytes | Explicit engine-owned anonymous client for GitHub search; GitHub token for writes; policy-issued storage fields for uploads | Debounced cancellable search with a ten-second deadline; explicit submission, serial attachment uploads | Search through the platform engine in the workbench; create remains separate; **attachment transfer in Electron main**; browser upload unsupported |

Copilot Connectors already has a [shared-process request proxy](../copilotConnectors/electron-browser/copilotConnectorsRequestService.ts). It is both a migration target and useful IPC precedent.

### B. Built-in extensions other than Copilot

| Owner / client | Endpoint family and payload | Authentication | Polling / triggering behavior | Current execution |
|---|---|---|---|---|
| **GitHub Authentication** - [OAuth/device flows](../../../../extensions/github-authentication/src/flows.ts#L274), [Entra exchange](../../../../extensions/github-authentication/src/entraTokenExchange.ts#L187) | OAuth exchange/device endpoints, `/user`, identity/metadata, revocation; forms and JSON | OAuth/PAT, Microsoft Entra subject token, application Basic auth for revocation; GitHub.com/GHE.com/GHES differences | Interactive login, bounded device polling, session restoration and demand-driven renewal; multiple transport fallbacks | UI-preferred Node/Web EH, workspace fallback; transport-dependent execution |
| **Built-in GitHub/Git integration** - [client factory](../../../../extensions/github/src/auth.ts#L31) | REST/GraphQL repository search, publish/fork/PR creation, branches/rulesets, commit authors/users; JSON | GitHub session with `repo`, `workflow`, `user:email`, `read:user`; currently dotcom-oriented | Commands, picker queries, repository/auth/status changes, pagination | Node EH |
| **Profile gist sharing** - [profile handlers](../../../../extensions/configuration-editing/src/importExportProfiles.ts#L17) | Gist create/get; JSON containing profile text | Export uses GitHub `gist`/`user:email`; import deliberately anonymous | Explicit import/export; cached clients | Node or Web EH |
| **JSON schemas** - [Node client](../../../../extensions/json-language-features/client/src/node/jsonClientMain.ts#L108), [browser client](../../../../extensions/json-language-features/client/src/browser/jsonClientMain.ts#L24) | GitHub-hosted schema downloads alongside arbitrary schema hosts; text | Anonymous, subject to trust/download settings | Demand-driven downloads, ETag/304 and schema caching | Node/Web **client**, not universally the language server |

### C. Copilot extension

At this snapshot, [Copilot](../../../../extensions/copilot/package.json) has a **Node extension entry point**, not a browser entry point. These callers execute locally or remotely according to extension placement.

| Owner / client | Endpoint family and payload | Authentication | Polling / streaming behavior |
|---|---|---|---|
| **GitHub data clients** - [REST/GraphQL helpers](../../../../extensions/copilot/src/platform/github/common/githubAPI.ts#L171), [separate API fetcher](../../../../extensions/copilot/src/platform/github/common/githubApiFetcherService.ts#L275) | Repositories, PRs, search, contents/blobs; JSON/GraphQL/text/base64 | GitHub sessions with operation-dependent scopes; endpoint routing varies by client | Resolution, pagination and enrichment fan-out; separate caches/quota handling |
| **Authentication, CAPI routing and model discovery** - [CAPI adapter](../../../../extensions/copilot/src/platform/endpoint/common/capiClient.ts#L20), [token manager](../../../../extensions/copilot/src/platform/authentication/node/copilotTokenManager.ts#L266) | User/token/model APIs; JSON | GitHub token for token issuance; device ID for anonymous issuance; **minted Copilot token** for model access | Token refresh/single-flight; activity/TTL-based model refresh; discovered API/proxy/telemetry domains |
| **Chat, completions, NES and attribution** - [networking](../../../../extensions/copilot/src/platform/networking/common/networking.ts#L500), [WebSocket manager](../../../../extensions/copilot/src/platform/networking/node/chatWebSocketManager.ts#L202) | Completion/messages/responses and matching services; JSON requests, SSE/line streams, WebSockets | Normally Copilot token; endpoints owning their own authorization remain distinct | Turn/edit-driven, speculative requests, cancellation and connection reuse |
| **Cloud tasks, Mission Control and Chronicle** - [task backend](../../../../extensions/copilot/src/extension/chatSessions/vscode-node/taskApiBackend.ts#L448) | Task/session/event/control APIs; JSON pages and event batches | Primarily GitHub token; some discovery and Chronicle paths also involve Copilot tokens | Task/event polling around 2s; session lists around 5/10min; refresh fan-out. "Task streaming" is often polling |
| **Search, indexing and ingest** - [code search](../../../../extensions/copilot/src/platform/remoteCodeSearch/common/githubCodeSearchService.ts#L156), [external ingest](../../../../extensions/copilot/src/platform/workspaceChunkSearch/node/codeSearch/externalIngestClient.ts#L101) | Code search, indexing, chunks, embeddings, ingest/finalize; JSON text/vectors/base64 documents | GitHub tokens; anonymous-user embeddings use Copilot/CAPI; external ingest is currently dotcom-specific | Index polling, batched work, uploads, checkpoints; external ingest has a 64-request upload pool |
| **Content exclusion** - [remote rules](../../../../extensions/copilot/src/platform/ignore/node/remoteContentExclusion.ts#L163) | Repository exclusion rules; JSON | GitHub token | 50ms batching, repository batches, 30min TTL; explicitly installs auth/rate/server-backoff middleware |
| **Organization agents, telemetry and auxiliary requests** - [org agents](../../../../extensions/copilot/src/extension/agents/vscode-node/githubOrgChatResourcesService.ts#L211), [telemetry](../../../../extensions/copilot/src/platform/telemetry/vscode-node/githubTelemetrySender.ts#L203), [feedback writes](../../../../extensions/copilot/src/extension/inlineEdits/vscode-node/components/nesFeedbackSubmitter.ts#L530) | Agent metadata/prompts, telemetry envelopes, status/downloads, feedback repository writes | GitHub tokens, anonymous reads, or telemetry-specific identity, not one universal bearer mode | Initial metadata/detail fetches, buffered telemetry, explicit feedback; some raw-fetch and SDK-owned paths |

The important distinction is **multiple production request seams**, not one Copilot fetcher. Existing middleware is selectively installed; its presence in the repository does not mean every caller uses it.

### D. GitHub Pull Requests extension

This extension supports **Node and browser entry points**; local-versus-remote Node placement is conditional. Webview-originated commands generally cause HTTP in the extension host, while `<img>`/video resources load in the renderer.

| Owner / client | Endpoint family and payload | Authentication | Polling / triggering behavior |
|---|---|---|---|
| **Repository/PR/review/issue clients** - [client factory](https://github.com/microsoft/vscode-pull-request-github/blob/596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345/src/github/credentials.ts#L680) | Broad REST and GraphQL operations, search, reviews, projects, branches, mutations; JSON/GraphQL | Selected GitHub/enterprise account; legacy/default/expanded scopes; optional environment-token path | Commands, tree/model refreshes and pagination; overview roughly 60s visible/5min otherwise; mergeability requests every 3s while unknown |
| **Notifications and Copilot PR monitoring** - [notifications](https://github.com/microsoft/vscode-pull-request-github/blob/596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345/src/notifications/notificationsProvider.ts#L85), [CAPI client](https://github.com/microsoft/vscode-pull-request-github/blob/596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345/src/github/copilotApi.ts#L46) | Notification REST APIs, CAPI agent-session lookup, PR search/timelines; JSON | Selected hub token; CAPI currently uses a fixed public hostname | Notifications start at 60s then use server cadence; Copilot PR watching 2/5min; cancellation completion polls timeline every 2s |
| **Content, diffs and CI logs** - [repository client](https://github.com/microsoft/vscode-pull-request-github/blob/596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345/src/github/githubRepository.ts#L1091) | Actions/checks, content/blob APIs and diff media types; JSON, text and bytes | Selected hub token | Document/diff/log opens and tools; complete-response reads rather than GitHub SSE streams |
| **Media, uploads and discovery** - [uploads](https://github.com/microsoft/vscode-pull-request-github/blob/596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345/src/github/githubRepository.ts#L2244), [avatars](https://github.com/microsoft/vscode-pull-request-github/blob/596a9bbd4a36c482cbe1faa862fa8e4ec5a8a345/src/common/uri.ts#L333) | Upload policy, multipart storage POST, confirmation; avatar bytes; unauthenticated host probes | GitHub token for API legs, issued storage fields for upload, anonymous avatar/discovery requests | User actions/cache misses; direct fetches bypass ordinary wrappers; DOM media loads separately |

### E. Agent Host

| Owner / client | Endpoint family and payload | Authentication | Polling / streaming behavior | Current execution |
|---|---|---|---|---|
| **Repository and PR operations (migrated)** - [association](../agentHost/node/agentHostPullRequestAssociationResolver.ts), [creation](../agentHost/node/agentHostPullRequestOperationHandler.ts), [title context](../agentHost/node/agentHostSessionTitleController.ts) | PR lookup by branch/SHA, PR creation, issue/PR context, repository merge settings and auto-merge; REST/GraphQL JSON | Explicit client for the host-selected repository resource; existing scopes and silent background checks | Restore/turn/git-state triggers, PR creation and bounded title-generation context; shared conditional reads | Local/remote Agent Host, through the platform engine; legacy client removed |
| **PR status/lifecycle and Agent Merge** - [status subscriptions](../agentHost/node/agentHostPullRequestStatusService.ts), [lifecycle](../agentHost/node/agentHostPullRequestLifecycleOperationHandler.ts), [Agent Merge](../agentHost/node/agentMergeController.ts#L995) | PR/review/check/merge REST and GraphQL, Actions logs/reruns; JSON and text | Host credential store; repository-scoped GitHub token | Shared subscriptions, explicit mutations and background Agent Merge monitoring | Local/remote Agent Host, already through the platform engine |
| **CAPI inference, discovery and utility generation** - [CAPI service](../agentHost/node/shared/copilotApiService.ts#L405) | `/copilot_internal/user`, models, messages, responses and utility completions; JSON/SSE | **GitHub OAuth token directly**, with per-token endpoint discovery | Discovery cache; active-provider model refresh; streamed turns; title/branch/commit/PR generation | Local/remote Agent Host |
| **Telemetry and diagnostics** - [telemetry sender](../agentHost/node/agentHostRestrictedTelemetry.ts#L302), [network probes](../agentHost/node/networkDiagnosticsService.ts#L102) | Telemetry POSTs and API/CAPI reachability GETs; JSON envelopes/text | Telemetry-specific identity/entitlement gates; probes do not attach repository credentials | Event-driven telemetry; explicit diagnostics | Local/remote Agent Host |

### Boundaries that need explicit treatment

- **GitHub MCP:** server/tool traffic, including its HTTP/SSE transport, is out of scope. [GitHub MCP configuration](../agentHost/node/shared/githubMcpServer.ts#L70) does not make that traffic part of this engine. Ordinary REST/CAPI requests for MCP registry and connector management remain in scope.
- **SDK/CLI-owned traffic:** replacing HTTP clients does not capture Copilot SDK subprocesses, agent-invoked `gh`, or [tunnel forwarding](../../../../extensions/tunnel-forwarding/src/extension.ts#L267), which passes credentials to a CLI.
- **Browser-loaded media:** controlled GitHub avatars and images need a resource-delivery integration if they are to share protection; changing API clients does not capture DOM loads.
- **Product-resolved hosts:** the [chat/model manifest](../../workbench/contrib/chat/common/languageModels.ts#L2634) and [entitlement-derived experiment endpoint](../../workbench/services/assignment/common/assignmentService.ts#L382) are real runtime callers, but their deployed host/ownership must be confirmed before classifying all traffic as GitHub-specific.
- **Outside this consolidation:** git transport, arbitrary user URLs, non-GitHub BYOK providers and package registries. Dependency/SDK internals were not exhaustively inventoried.

## 2. Foundation and replacement map

### Foundation to retain and extend

Use the [platform GitHubService](common/githubService.ts#L30), **not the separate legacy Sessions service with the same name**.

It already composes:

- Credential resolution and host capability discovery.
- [Transport](common/githubTransport.ts), bounded admission/deadlines/responses, rate coordination, ETags and read coalescing.
- [Repository/issue/commit and PR queries](common/githubQueryService.ts#L221).
- [PR mutations and workflow operations](common/githubPullRequestMutationService.ts#L166).
- [Shared PR subscriptions and polling](common/pullRequestResourceService.ts#L38).

### What it replaces and what remains with callers

| Existing client family | Replace / consolidate | Retain with the feature |
|---|---|---|
| **Workbench platform binding** | Per-window engine construction to desktop shared-process proxy; full web engine on web | Consent/account-selection integration, renderer-facing state and consumer lifetimes |
| **Legacy Sessions** | Independent API client, transport/cache ownership and duplicate polling; map queries/mutations to the platform engine | Observable UI models, session association, review UX and business semantics |
| **Accounts, signup, connectors and sandbox services** | HTTP execution, admission, cooldowns and compatible request sharing | Authentication/enrollment UX, policy evaluation, connector/task state machines |
| **Filesystem, plugin/content and issue-reporting clients** | Direct GitHub reads/writes and governed transfer execution, including the current native upload path | File decoding/materialization, schema trust, attachment selection and issue formatting |
| **Built-in GitHub and gist clients** | Octokit request execution through the extension API | Git workflows, scope intent, profile serialization and returned links |
| **GitHub Authentication** | Independent transport/fallback policy through a **bootstrap-safe** request capability | Authentication provider, OAuth/device/Entra flow orchestration, consent, sessions and renewal semantics |
| **Pull Requests extension** | Octokit **fetch hook**, Apollo **HTTP link**, and separate CAPI/discovery/media/upload seams | GraphQL schemas, repository/review models, SAML/schema fallbacks, exported integrations |
| **Copilot clients** | Both GitHub fetch paths and CAPI transport policy; shared discovery where credential semantics match; dedicated streaming/bulk policies | Prompts, model protocols, indexing/checkpoints, exclusions, task semantics and telemetry consent |
| **Agent Host repository and PR operations (migrated)** | Legacy client, independent HTTP and lookup cache removed; queries and mutations use explicit platform clients | Git operations, approved PR selection, folder/session association, PR-generation orchestration and create-failure reconciliation |
| **Agent Host CAPI client** | Its independent request governance to the same engine's CAPI/streaming capability | Typed inference facade, protocol conversion and host-owned credentials |
| **GitHub MCP server/tool traffic** | **Out of scope** | Existing MCP runtimes own the protocol and connections |
| **SDK/CLI traffic** | **Not automatically replaced** by any of the above | Explicit integration or tracked exception required |

### Gaps to close before these replacements are equivalent

1. **Identity:** the engine supports explicit provider/session/scope/endpoint clients and credential-independent anonymous public JSON reads, with shared quota coordination and isolated private resources. Current workbench features retain default-account selection in their binding. Extension consent, Copilot anonymous/device token issuance, additional issuers and CAPI-specific bootstrap credentials still need integration.
2. **Transport shapes:** the current contract is primarily JSON plus bounded text download, not yet the general binary, multipart, SSE/WebSocket and response-metadata contract these clients require.
3. **Operation coverage:** existing typed APIs cover much of PR work, but not everything. Repository discovery/search and pending-review creation, for example, need additional coverage or governed REST/GraphQL access.
4. **Aggregate protection:** per-engine bounded admission, caller fairness, request deadlines and response limits are implemented. Credential invalidation preserves live cooldowns and reclaims expired inactive-account state. Request-rate budgets, aggregate pagination/fan-out budgets, live subscription caps and cross-window coordination remain to be implemented.

The key boundary is to **consolidate request execution, protection and shared resources**, not entire feature services or the generic HTTP service used for unrelated destinations.
