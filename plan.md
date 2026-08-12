# Agent Host GitHub API Service Plan

## Goal

Build a reliable, efficient, extensible GitHub API service inside the Agent Host, with pull requests as the primary resource. Multiple features observing the same pull request must share resource state, requests, and polling, while independently subscribing only to the fragments they need.

The initial implementation is internal to the Agent Host. It does not add a GitHub state or subscription surface to the Agent Host Protocol (AHP), and it does not migrate the existing Sessions GitHub consumers. Existing Agent Host GitHub callers remain compatible through an adapter.

## Scope

The final internal service must support:

- Pull request identity, state, refs, permissions, mergeability, merge methods, review decision, and merge queue state.
- Top-level comments, submitted reviews, inline review comments, and authoritative review-thread resolution state.
- Complete current-head checks, including Check Runs, legacy Status Contexts, requiredness, pagination, and completeness.
- On-demand workflow runs, jobs, failed logs, check annotations, participants, requested reviewers, changed files, and repository comparisons.
- Safe typed mutations for comments, review replies, thread resolution, workflow reruns, branch updates, direct merge, merge-queue enqueue, pull request creation, and the existing auto-merge operation.
- Typed equivalents for the current Sessions `IGitHubService` API and the current Agent Host `IAgentHostOctoKitService` API.
- github.com, GitHub Enterprise Cloud, and GitHub Enterprise Server, with capability detection and fail-closed fallbacks.

The initial scope excludes:

- Migrating Sessions UI consumers to the Agent Host.
- A GitHub resource channel in AHP.
- The Agent Merge controller, automation scheduler, and product authorization UI.
- Remote GitHub tree/blob filesystem calls.
- Persisting private GitHub response bodies.
- Supporting several same-host GitHub accounts concurrently. The existing Agent Host authentication store currently has one active token per protected-resource/scope set.

## Existing Authentication

The Agent Host already has the authentication required by this service:

- The client sends GitHub credentials through the existing `authenticate` command.
- `AgentHostAuthenticationService` stores accepted tokens by protected resource and scopes.
- Existing Agent Host PR operations obtain the repository token through `IAgentService.getAuthToken`.
- `AgentHostOctoKitService` already makes authenticated GitHub REST and GraphQL calls.

No AHP change is required for the GitHub service.

### Internal authentication changes

Refactor the existing Agent Host authentication store into an injectable internal service without changing its AHP contract. Add an internal token-generation signal so GitHub state can react when a credential is accepted or replaced.

The GitHub credential layer will:

1. Obtain the current token for the GitHub repository protected resource.
2. Resolve its stable account identity once with `GET /user`.
3. Use `{ host, accountId }` as the account handle for all resource, cache, queue, and rate-limit keys.
4. Associate the handle with the current token generation.
5. On token replacement, immediately cancel the previous generation's queued and in-flight requests, stop its polling, and clear its active and dormant resource entries and private caches.
6. On a `401`, invalidate the credential generation, stop its work, clear its state, and surface the existing authentication-required flow.
7. On GitHub endpoint changes or Agent Host shutdown, clear all GitHub credential state.

The bootstrap identity request is temporarily keyed by GitHub host and a non-logged token fingerprint, then re-keyed to the stable account ID. OAuth and user-token credentials are supported. A credential that cannot establish a stable user identity fails explicitly rather than sharing an anonymous cache identity.

Removing a VS Code authentication session without sending a replacement token is not currently communicated to the Agent Host. In the first version, cleanup occurs on replacement, `401`, endpoint change, or Agent Host shutdown. Immediate sign-out revocation can be considered separately if product requirements later demand it.

## Public Internal API

Use serializable normalized data types in Agent Host `common` code and Node-only implementations in Agent Host `node` code.

```ts
export interface GitHubAccountHandle {
	readonly host: string;
	readonly accountId: string;
}

export interface PullRequestRef extends GitHubAccountHandle {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

export type PullRequestPriority = 'background' | 'visible' | 'interactive';

export interface PullRequestInterests {
	readonly core?: true;
	readonly conversation?: {
		readonly topLevelComments?: boolean;
		readonly submittedReviews?: boolean;
		readonly inlineComments?: boolean;
		readonly reviewThreads?: boolean;
		readonly includeBodies?: boolean;
	};
	readonly checks?: {
		readonly required?: boolean;
		readonly includeOptional?: boolean;
	};
	readonly mergeability?: true;
	readonly participants?: true;
}

export interface PullRequestSubscriptionOptions extends PullRequestInterests {
	readonly priority: PullRequestPriority;
}

export interface PullRequestResource {
	readonly ref: PullRequestRef;
	readonly snapshot: IObservable<PullRequestSnapshot>;
}

export interface PullRequestSubscription extends IDisposable {
	readonly resource: PullRequestResource;
	update(options: PullRequestSubscriptionOptions): void;
	refresh(fragment?: PullRequestFragment, token?: CancellationToken): Promise<void>;
}
```

`subscribePullRequest(ref, options)` returns a subscription to the canonical resource. Subscriptions for the same account, host, repository, and pull request share the same resource object:

```ts
subscriptionA.resource === subscriptionB.resource
```

Consumers declare interests and priority. They cannot choose polling intervals or bypass the service with a raw token.

Core is an implicit dependency of every subscription because it detects canonical repository changes, head changes, and terminal pull request state. Core must remain a cheap fragment and must not implicitly load reviews, checks, or the complete mergeability query.

## Fragment Model

Use independently fetched and scheduled fragments:

- `core`
- `topLevelComments`
- `submittedReviews`
- `inlineComments`
- `reviewThreads`
- `checks`
- `mergeability`
- `participants`

Workflow logs, requested reviewers, changed files, commits, comparisons, and similar large or slow resources remain typed on-demand operations rather than continuously scheduled fragments.

Every fragment exposes correctness metadata:

```ts
export interface FragmentState<T> {
	readonly value?: T;
	readonly status: 'missing' | 'loading' | 'ready' | 'stale' | 'error';
	readonly complete: boolean;
	readonly observedAt?: string;
	readonly attemptedAt?: string;
	readonly headSha?: string;
	readonly error?: GitHubRequestError;
}
```

The service must preserve distinctions between:

- No required checks exist.
- Required checks have not loaded.
- Check results are truncated.
- Requiredness is unavailable.
- A request failed.
- Mergeability is still `UNKNOWN`.
- Review-thread topology is incomplete.

Agent Merge may consume a fragment only when it is `ready`, complete, and associated with the current head where applicable.

## Resource Sharing and Interest Union

Each canonical pull request entry owns:

- Its normalized reference and repository aliases.
- Subscriber options.
- Effective interests and priority per fragment.
- Fragment snapshots and generations.
- In-flight fragment operations.
- Scheduled deadlines and invalidations.
- Mutation serialization.
- Credential generation.

Interest changes are incremental:

- The first subscriber immediately loads core and its requested fragments.
- A new subscriber loads only newly required fragments.
- Updating a subscription changes only the affected fragments.
- Removing a subscription immediately unschedules fragments no remaining subscriber needs.
- Removing the last subscriber stops all network scheduling immediately.
- The entry may remain dormant for a short bounded grace period to avoid churn, but performs no network work.
- Dormant entries are held in a bounded LRU and then disposed.
- Credential invalidation bypasses the grace period and purges entries immediately.

Priority is calculated per fragment rather than once per pull request. A visible comments consumer must not promote checks requested only by a background consumer.

When the final body consumer leaves but topology remains requested, body-bearing state is downgraded and released after the fragment grace period.

## Canonical Keys

The initial key is:

```text
host + accountId + normalized owner + normalized repo + pull request number
```

After core loads:

- Prefer the stable repository node/database ID in the canonical key.
- Record the canonical `nameWithOwner` or REST `base.repo.full_name`.
- Keep aliases from stale owner/repository names to the canonical entry.
- Follow REST repository redirects.
- Retry a GraphQL request once after a confirmed repository rename or transfer.

No cache or resource may be shared across accounts or GitHub hosts.

## Architecture

```text
AgentHostGitHubService
├── PullRequestResourceService
├── PullRequestMutationService
├── IssueResourceService
└── GitHubQueryService
    ├── PullRequestRequestPlanner
    ├── GitHubHostCapabilitiesService
    ├── GitHubTransport
    │   ├── REST ETag/body cache
    │   ├── GraphQL executor
    │   └── in-flight read coalescing
    ├── GitHubRequestQueue
    ├── GitHubRateLimitCoordinator
    └── GitHubCredentialService
```

Responsibilities:

### `GitHubCredentialService`

- Resolve current Agent Host GitHub repository credentials.
- Resolve stable account identity.
- Own credential generations.
- Clear all associated state on replacement or invalidation.
- Never log or expose tokens.

### `GitHubTransport`

- Execute typed REST and GraphQL requests.
- Apply authentication, API version, media type, timeout, and cancellation.
- Enforce explicit network-cache bypass.
- Parse structured responses, redirects, pagination, and errors.
- Own exact ETag/body cache entries.
- Coalesce identical idempotent reads.

### `GitHubRateLimitCoordinator` and `GitHubRequestQueue`

- Share quota and backoff across all resources for an account.
- Serialize requests initially per credential.
- Prioritize mutations and interactive work over background polling.
- Yield between pagination pages.
- Bound total and per-host concurrency.

### `GitHubHostCapabilitiesService`

- Detect GraphQL fields and GitHub-host capabilities.
- Cache supported query variants by host and enterprise version.
- Avoid repeatedly sending known-invalid queries.
- Provide explicit fail-closed capability results.

### `PullRequestRequestPlanner`

- Convert fragment interests into the smallest valid REST/GraphQL request plan.
- Select host-compatible fallbacks.
- Keep independent fragments on independent refresh schedules.

### `PullRequestResourceService`

- Own canonical resources and subscriptions.
- Union fragment interests and priorities.
- Publish observable snapshots.
- Schedule, invalidate, and refresh fragments.
- Reject stale-head and stale-generation results.

### `PullRequestMutationService`

- Expose typed writes only.
- Serialize writes per pull request.
- Revalidate state before safety-critical writes.
- Reconcile ambiguous outcomes.
- Invalidate only affected fragments.

### `AgentHostOctoKitService`

- Become a compatibility adapter over the new transport/query/mutation services.
- Preserve existing callers and edge-case behavior while new code uses the new APIs.

## HTTP and Fetch Caching

### Current behavior

The Agent Host supplies `AgentHostOctoKitService` with `AgentHostProxyResolver.fetch`. That wrapper uses `@vscode/proxy-agent` only to select a dispatcher for proxy and certificate handling. It does not install an HTTP response-cache interceptor.

The underlying implementation is Node's global `fetch`. A local verification using the repository's current Node runtime sent two network requests for two identical fetches even when the first response contained:

```http
Cache-Control: public, max-age=3600
ETag: v1
```

Therefore there is currently no observed opaque fetch cache in this path. `AgentHostOctoKitService` does have its own explicit `pullRequestSearchCache`, but it is an ETag/body cache: a subsequent request still reaches GitHub with `If-None-Match`, and the cached body is used only after a `304`.

### Required invariant

The new implementation must not rely on Node or proxy-agent implementation details. Every GitHub request must reach the network transport. The only response reuse allowed for live pull request state is the service-owned, account-scoped ETag cache after an authoritative `304 Not Modified`.

For every REST and GraphQL fetch:

```ts
fetch(url, {
	...options,
	cache: 'no-store',
	headers: {
		...headers,
		'Cache-Control': 'no-store',
	},
});
```

This must be applied in the shared `GitHubTransport`, not repeated by individual fetchers.

Additional rules:

- Do not use a browser, Electron-session, service-worker, or generic request cache for GitHub API reads.
- Proxy resolution and connection pooling are allowed; response caching is not.
- GraphQL responses are never served from an opaque transport cache. Any short-lived GraphQL reuse is explicit, typed service state controlled by fragment freshness and invalidation.
- REST requests may send `If-None-Match` from the service-owned cache.
- A `304` may reuse only the exact body stored with the exact validator and request key.
- A `200` without an ETag must remove the previous validator.
- A `200` with a new ETag atomically replaces both validator and body.
- Every page and query variant has a separate cache entry.
- Explicit interactive refresh still reaches GitHub; it may use conditional validation unless a mutation-safety operation requires an unconditional representation.
- Merge preparation must not accept merely fresh-looking local state. It performs authoritative refreshes and evaluates the returned fragment generations.

### Cache key

REST cache entries are keyed by:

- GitHub host.
- Account ID.
- HTTP method.
- Final URL, including page, per-page, filters, and `since`.
- Accept/media-type headers.
- GitHub API version.
- Representation version.

Cache bodies and validators are:

- Bounded in memory with an LRU.
- Never persisted in the first version.
- Removed together.
- Purged immediately on credential invalidation.
- Purged on endpoint changes and service disposal.

### Cache tests

The loopback GitHub server must prove:

- Two ordinary identical requests both reach the server.
- `cache: 'no-store'` is passed to the injected fetch implementation.
- The request contains the selected cache-control header.
- The second ETag-backed request reaches the server with `If-None-Match`.
- A `304` returns the exact cached body.
- Different accounts, pages, query parameters, media types, and hosts never share bodies or validators.
- A `200` without an ETag removes an old validator.
- An explicit refresh never returns solely from an opaque fetch cache.

## REST ETag Cache

Store:

- ETag.
- Exact response body.
- Final response URL.
- Fetch time.
- Pagination links.
- Representation version.

Use a bounded account-scoped LRU.

Do not persist response bodies across Agent Host restarts. Persist only Agent Merge automation metadata and watermarks when that controller is implemented. After restart, restored automation performs an immediate catch-up refresh.

## GraphQL Behavior

GraphQL does not use normal ETag validation.

- Cache only normalized fragment state under explicit scheduler freshness rules.
- Refresh on invalidation, mutation, deadline, or explicit request.
- Include GraphQL rate-limit fields.
- Preserve `errors[].type`, `errors[].path`, and partial data.
- Distinguish schema validation, authorization, not-found, rate-limit, and transient errors.
- Never treat partial GraphQL data as complete merge-gating data.

## Request Coalescing and Cancellation

Coalesce only:

- Identical REST `GET` requests.
- Identical GraphQL queries.
- Complete fragment fetch operations, including pagination.

Never coalesce mutations.

Request identity includes host, account, method, final URL or GraphQL operation, normalized variables, media type, and API version.

Cancellation removes only that caller. Abort the underlying request only when no waiter or resource owner remains and cancellation is safe.

## Rate Limits and Retry Policy

Maintain rate-limit state per:

```text
host + accountId + GitHub rate-limit resource/API bucket
```

Read:

- `Retry-After`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Used`
- `X-RateLimit-Reset`
- `X-RateLimit-Resource`
- GraphQL cost, remaining, and reset time
- GraphQL `RATE_LIMITED` errors
- Structured secondary-rate-limit responses

Priority order:

1. Mutation reconciliation.
2. User-triggered mutation.
3. Interactive refresh.
4. Agent Merge gate refresh.
5. Visible UI polling.
6. Background polling.
7. Optional enrichment.

Start with serial requests per credential and yield between pagination pages. Add bounded cross-account concurrency only when supported by authentication.

Retries:

- Reads receive at most one automatic retry for network and `5xx` failures, with jitter.
- Do not immediately retry authentication, authorization, validation, schema, or rate-limit failures.
- Honor `Retry-After`; otherwise wait for rate-limit reset; otherwise use bounded exponential backoff with positive jitter.
- Mutations retry only when idempotent or after operation-specific reconciliation.

## Pull Request Request Plans

### Core

Use:

```http
GET /repos/{owner}/{repo}/pulls/{number}
```

This is the cheap conditional change detector and source of core state, refs, timestamps, canonical repository information, and terminal status.

Do not fetch submitted reviews as part of core.

### Mergeability

Use GraphQL for:

- Stable PR/repository IDs.
- Current head/base OIDs.
- Mergeability and merge-state status.
- Review decision.
- Viewer permissions.
- Allowed merge methods.
- Auto-merge capability.
- Merge queue capability and state.

`mergeable: UNKNOWN` is explicitly incomplete and not merge-ready.

### Checks

Use complete GraphQL `statusCheckRollup` pagination on the current head:

- Include Check Runs and legacy Status Contexts.
- Preserve requiredness as true, false, or unknown.
- Page until complete when used for merge gating.
- Query expected check suites when required to distinguish “not reported” from “no checks”.
- Key results by head SHA.
- Discard old-head responses.

Use REST fallbacks only when GraphQL capability is unavailable, and mark incomplete any requiredness or merge behavior the fallback cannot establish.

### Conversation

Plan these independently:

- Top-level issue comments through paginated REST with per-page ETags.
- Submitted reviews through complete paginated REST.
- Inline review comments through paginated REST.
- Review-thread topology and resolution through fully paginated GraphQL.
- Nested thread comments with bounded concurrency.

`isResolved` is authoritative. Do not infer resolution from replies.

### Participants and requested reviewers

- Build participant information from loaded feedback when possible.
- Fetch timeline participants on demand before handling newly observed feedback authors.
- Keep requested reviewers as an optional, on-demand capability.

### Workflow details and logs

- Never poll logs.
- Fetch workflow runs, jobs, annotations, and failed logs only on demand.
- Do not derive IDs from URLs when typed API fields are available.
- Validate log redirect targets.
- Never forward GitHub authorization to a different origin.
- Bound download size and time.
- Never persist signed URLs.
- Redact secrets before exposing logs to a model.

## Scheduler

Use one central due-time scheduler rather than one timer per fragment.

Scheduling policy is internal and state-aware:

- First interest: immediate load.
- Visible pending checks: short checks cadence.
- Background pending checks: slower checks cadence.
- Terminal checks: stop fast polling and use invalidation/backstop refreshes.
- Visible conversation: moderate cadence.
- Background conversation: slower cadence with a forced complete topology refresh.
- Healthy push source, if added later: push invalidation plus slow supervision poll.
- Merged or closed PR: final refresh and stop.

Use only positive deterministic jitter so polling is never earlier than the base policy. Consumers cannot provide milliseconds.

Polling one fragment must not poll unrelated fragments.

## Head and Generation Races

Every fragment fetch records:

- Resource generation.
- Fragment generation.
- Credential generation.
- Head SHA at request start where applicable.

A response commits only if every relevant generation still matches.

When core observes a new head:

- Update core.
- Invalidate checks and mergeability in one transaction.
- Cancel or supersede queued old-head work.
- Wake interested subscribers.

Old-head results must never overwrite current-head state.

## Mutations

The GitHub service exposes trusted typed mutations. Product authorization and the deterministic Agent Merge gate live in a separate future controller.

The model must never receive a merge or enqueue tool.

### Comment idempotency

Callers provide a stable operation ID. Agent-authored comments and replies append:

```html
<!-- vscode-agent-host-operation:<operation-id> -->
```

After an ambiguous transport failure:

1. Fully refresh the relevant comment/thread fragment.
2. Treat the operation as successful if the marker is present.
3. Retry only if the fragment is complete and the marker is proven absent.
4. Return an indeterminate result without retrying if the proving refresh is partial or failed.

### Reply and resolve

- Reply first.
- Resolve only after reply succeeds or is reconciled as successful.
- A resolve failure leaves the thread open and retryable.

### Workflow rerun

- Do not issue a second rerun while the first is unconfirmed.
- Reconcile run state before retrying.
- Invalidate checks and schedule a near-term same-head refresh after success.

### Branch update

- Always send the expected head SHA.
- Invalidate core, checks, and mergeability.
- Use Git for actual conflict resolution.

### Merge preparation

Use a two-step API:

1. `prepareMerge(ref, expectedHeadSha)` force-refreshes core, checks, submitted reviews, review threads, and mergeability and returns a complete gate snapshot plus an opaque preparation token anchored to the resource and head generations.
2. `merge(preparation, options)` rejects invalidated preparation, repeats fundamental state/head/method checks, and sends the expected head SHA to GitHub.

Before direct merge:

- Require an open, non-draft, non-merged PR.
- Require matching head SHA.
- Require complete checks, reviews, review threads, and mergeability.
- Require the selected merge method to be allowed.
- Require the separate Agent Merge controller to have checked persisted user authorization.

After an ambiguous merge failure:

- Refresh core.
- Reconcile as success if the PR is already merged.
- Otherwise surface GitHub's rejection.

### Merge queue

- Require complete queue capability/state.
- Send PR node ID and `expectedHeadOid`.
- Do not enqueue a PR already in the queue.
- Unknown queue requirement permits neither assumed direct merge nor assumed enqueue.

## Host Capabilities

Model capabilities explicitly:

```ts
export interface GitHubHostCapabilities {
	readonly graphql: boolean;
	readonly mergeQueue: boolean;
	readonly internalMergeStatus: boolean;
	readonly reviewThreads: boolean;
	readonly checkContextRequiredness: boolean;
}
```

Cache capability probes by host and enterprise version.

Do not repeatedly submit a GraphQL query known to fail schema validation.

Fail closed:

- Unknown mergeability is not merge-ready.
- Unknown requiredness makes checks incomplete.
- Unavailable authoritative review threads make the review gate incomplete.
- Unknown queue requirement allows neither direct merge nor enqueue.
- An unavailable internal merge-status provider falls back to public data; public data must still prove every required gate.

## Sessions and Existing Agent Host Parity

Parity means the Agent Host has typed equivalents; Sessions consumers are not migrated in this work.

| Existing capability | New internal capability |
|---|---|
| Repository model | Repository resource/query |
| Pull request lookup by branch | Typed PR lookup |
| Pull request lookup by head SHA | Typed lookup preserving ambiguity behavior |
| PR core, reviews, and mergeability | Independent PR fragments |
| Review threads, reply, and resolve | Conversation fragments and mutations |
| CI checks, annotations, and rerun | Checks and workflow operations |
| Issue model and polling | Issue resource |
| Changed-file comparison | On-demand compare |
| Recent assigned issues | Typed search |
| Recent authored PRs | Typed search |
| Issue-to-PR linkage | Typed GraphQL query |
| Create pull request | Typed mutation |
| Enable auto-merge | Typed mutation and compatibility adapter |

Preserve existing `findPullRequestByHeadSha` behavior:

- Ignore PRs that merely contain the commit but do not have it as their head.
- Prefer open PRs.
- Return a result only for one unambiguous candidate.
- Return no result when the first page is full and completeness cannot be established.

## Test Infrastructure

### Programmable loopback GitHub server

Add a deterministic local HTTP server that:

- Scripts ordered REST and GraphQL responses.
- Captures methods, URLs, headers, and request bodies.
- Supports ETags and `304`.
- Supports Link-header pagination.
- Supports redirects.
- Supports delays, aborts, disconnects, and malformed payloads.
- Supports primary and secondary rate-limit responses.
- Supports GraphQL partial data and typed errors.
- Verifies all scripted requests were consumed.
- Never contacts real GitHub.

### Fake clock and scheduler

Inject:

- Current time.
- Due-time scheduling.
- Jitter source.

Tests advance time deterministically without real delays.

### Pure unit tests

Cover:

- Account/resource/request key normalization.
- Interest and per-fragment priority union.
- Request planning.
- Polling policy.
- Rate-limit and error parsing.
- Fragment completeness.
- Merge readiness classification.
- Mutation invalidation.
- Comment marker parsing and reconciliation.

### Resource lifecycle tests

Cover:

- Two comments subscribers share one resource, fetch, and poller.
- Adding a checks subscriber fetches only checks.
- Visible comments do not promote background checks.
- Removing checks stops only checks.
- Last subscriber stops all work.
- Dormant entries expire.
- Merged/closed PR stops polling.
- Concurrent refreshes coalesce.
- Cancellation detaches one waiter without cancelling others.
- Credential replacement purges active and dormant state.

### Pagination and cache tests

Cover:

- Exact ETag/body pairing.
- Page-specific validators.
- `200` without ETag eviction.
- Incomplete state until every page commits.
- Failed final pages remain incomplete.
- Nested review-thread comment pagination.
- Current-head checks pagination.
- No opaque fetch-cache hits.

### Race tests

Cover:

- Old-head checks cannot overwrite new-head checks.
- Slow old generations cannot overwrite newer refreshes.
- Credential-generation replacement rejects stale responses.
- Merge rejects a moved head.
- Enqueue sends the expected head OID.

### Rate-limit and fairness tests

Cover:

- `429` honors `Retry-After`.
- Primary `403` waits for reset.
- Secondary limits are classified from response body/headers.
- GraphQL `RATE_LIMITED` is not retried immediately.
- Multiple PRs share credential-level backoff.
- Interactive work overtakes background pagination.
- Background work remains fair across PRs.

### Mutation tests

Cover:

- Reply failure never resolves the thread.
- Ambiguous reply plus complete marker refresh does not duplicate.
- Ambiguous reply plus incomplete refresh does not retry.
- Resolve failure leaves the thread open.
- Workflow rerun is not duplicated while unconfirmed.
- Already-queued PR is not enqueued again.
- Merge failure followed by merged refresh reconciles as success.

### Adapter tests

Run the current `IAgentHostOctoKitService` contract against the adapter, including:

- Pull request creation.
- Branch and head-SHA lookup edge cases.
- Issue/PR title and body.
- Auto-merge.
- Enterprise endpoints.
- Error behavior and cancellation.

Optional live GitHub tests remain manual and are not part of CI.

## Delivery Phases

### Phase 1: transport, credentials, tests, and compatibility

1. Add the programmable loopback GitHub server and fake scheduler.
2. Make the existing Agent Host authentication store injectable internally and add token-generation notification.
3. Add `GitHubCredentialService` and stable account resolution.
4. Add structured errors, `GitHubTransport`, explicit no-store fetch behavior, REST ETag/body LRU, and GraphQL executor.
5. Add the priority queue and rate-limit coordinator.
6. Add host capability probing infrastructure.
7. Convert `AgentHostOctoKitService` into a compatibility adapter.
8. Preserve and extend current Agent Host GitHub tests.

Phase 1 is production-ready when existing GitHub operations use the new transport without behavior regressions and all cache, auth-generation, rate-limit, and enterprise tests pass.

### Phase 2: shared pull request read service

1. Add normalized PR types and fragment-state contracts.
2. Add canonical resource registry and subscriptions.
3. Add per-fragment interest/priority union.
4. Add central state-aware scheduling and dormant cleanup.
5. Implement core and canonical repository re-keying.
6. Implement complete conversation fragments.
7. Implement complete current-head checks.
8. Implement mergeability and host fallbacks.
9. Add head/generation race protection.

Phase 2 is production-ready when all merge-relevant data has explicit completeness and independent polling is proven by deterministic tests.

### Phase 3: safe mutations and workflow diagnostics

1. Add top-level comments and inline replies with operation markers.
2. Add thread resolution sequencing.
3. Add workflow run/job/log and annotation operations.
4. Add rerun reconciliation.
5. Add expected-head branch update.
6. Add merge preparation and direct merge.
7. Add merge-queue enqueue.

Phase 3 is production-ready when ambiguous failures cannot blindly duplicate writes and merge/enqueue always fail closed on incomplete or moved state.

### Phase 4: remaining typed parity

1. Add repository and issue resources.
2. Add compare/changed-file operations.
3. Add recent-work searches.
4. Add issue-to-PR linkage.
5. Complete the parity matrix and adapter tests.

## Future Work

Keep these as separate projects:

- AHP GitHub snapshot/subscription channels.
- Migration of Sessions GitHub UI consumers.
- Agent Merge controller and persisted user authorization.
- Durable feedback watermarks.
- Cross-process automation ownership/leases.
- Push invalidation/webhook relay.
- Protected persistence for private GitHub response bodies, if later justified.
- Concurrent same-host GitHub accounts.
- Remote GitHub tree/blob filesystem migration.

## Validation

For each implementation phase:

1. Run the smallest focused Agent Host unit and integration tests.
2. Run `npm run typecheck-client` when the phase changes shared TypeScript contracts or Agent Host wiring.
3. Run `npm run valid-layers-check`.
4. Run the existing Agent Host OctoKit and affected operation-handler tests.
5. Run all new GitHub transport/resource tests against the loopback server.
6. Confirm no test contacts GitHub or requires a token.

## Definition of Done

The service is complete when:

- Consumers of the same PR share one canonical resource.
- Consumers of the same fragment share requests and polling.
- Unrequested fragments issue no requests.
- Removing the last fragment interest stops its scheduling immediately.
- Every merge-relevant fragment exposes provable completeness.
- Old-head and old-generation responses cannot overwrite current state.
- Every GitHub request bypasses opaque fetch caches.
- REST response reuse occurs only through exact service-owned ETag validation after `304`.
- Rate-limit state and scheduling are shared across every PR using the credential.
- Credential replacement purges requests, pollers, and private cached state.
- Mutations cannot blindly duplicate after ambiguous failures.
- Merge and enqueue use expected-head protection and fail closed.
- github.com, GHE.com, and GHES degrade explicitly and safely.
- Existing Agent Host GitHub behavior remains compatible.
- Every current Sessions `IGitHubService` capability has a typed Agent Host equivalent.
