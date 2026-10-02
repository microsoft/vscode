<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# Copilot API service

[CopilotApiService](common/copilotApiService.ts) owns Copilot endpoint discovery, model catalogs, typed inference calls, and their protocol transformations. It is extracted from the former Agent Host implementation; consumers import the shared service directly. The [Agent Host binding](../agentHost/node/agentHostCopilotApiService.ts) supplies endpoint configuration, device/client metadata, credential provenance, the CAPI client package and the host's existing fetch implementation. There is no second Agent Host discovery or model transport.

The portable implementation receives the `@vscode/copilot-api` module from its binding instead of loading a Node dependency in common code. Its domain/header routing still uses `CAPIClient.updateDomains` and `makeRequest`. The current binding supplies the GitHub OAuth token directly; this service does not mint a Copilot session token or substitute a repository-scoped grant.

## Discovery and bootstrap

GitHub `/copilot_internal/user` reads use the runtime's existing [GitHub service](README.md) through an explicit bootstrap client. This internal read-only capability accepts the supplied credential before host authentication has published it. It does not call `/user`, select an account, prompt, read the accepted-token store, or make a token accepted.

The authentication owner can supply account provenance for the exact pending or accepted token. Provenance affects quota accounting, never access checks or response sharing. Known account IDs share applicable GitHub account admission/cooldowns; unknown identities conservatively share an API-origin bucket. Learning an identity does not bypass an unresolved-origin cooldown. Token changes and client release do not erase server-required waits.

Bootstrap clients isolate private responses by token and API base, use the combined GitHub client-capacity bound, and confine GET requests and redirects to their approved HTTPS API base. They omit ambient credentials and referrers. Their last reference cancels only their own work.

Generic GitHub 403 messages are not sufficient quota evidence: entitlement/policy denials remain 403 failures rather than becoming account-wide cooldowns. Discovery admission and queued-waiter feedback use the server-reported resource learned by the shared GitHub coordinator, including when it differs from core.

## CAPI model/control requests

[ControlTransport](common/controlTransport.ts) reuses the bounded queue, scheduler, response reader, and operation-waiter mechanisms. Copilot supplies its catalog limits and response cooldown policy; the transport does not interpret Copilot schemas or GitHub quota headers. Its admission/cooldown state is separate from GitHub REST/GraphQL because CAPI throttling is not repository-core quota.

- Discovery plus a model read has a 30-second caller budget, including metadata initialization, queueing, cooldowns and body reads. An earlier caller deadline is preserved.
- The model queue retains at most 256 operations, with 64 per account/caller; active work is capped at four globally, two per host/caller, and one per account identity. Model reads cannot hold GitHub repository request slots.
- Compatible concurrent model requests coalesce. Their keys include the credential context and request headers/integration-suppression option, because catalogs depend on both user and integration.
- Each shared discovery/model operation supports at most 64 waiters. Cancelling one caller preserves peers; cancelling the last waiter aborts the underlying work.
- Model bodies are bounded to 16 MiB. Invalid model-list envelopes are errors, not empty successful catalogs. Every successful caller receives its own parsed result.
- Only model GETs receive one transient retry. Numeric/date `Retry-After` applies before subsequent work; unhinted 429/529 refusals impose a conservative one-minute wait. These waits survive context rotation and do not park GitHub repository traffic. CAPI status and error codes, including quota-exhaustion 402, remain available to callers.
- A known cooldown that cannot fit a discovery/model caller's remaining budget fails promptly with status 429, code `rate_limited`, and `retryAfterMs`, without a wire request. This also applies when a cooldown is learned while queued; a short-budget waiter does not cancel a peer that can wait. Other timeouts and explicit cancellation remain distinct.
- Model requests keep CAPI protocol headers, omit ambient credentials, and reject redirects rather than forwarding credentials to another destination.

Discovery contexts are capped at 64. Cached payloads and bootstrap leases expire after 30 minutes, with refresh eligibility five minutes before expiry. Expiry does not abort an active refresh; that work retains its own request deadline. Captured SKU readers retain a bounded lightweight cell so they can follow a refresh of the same credential; other idle expired contexts are removed. Endpoint changes, rejected credentials, host token replacement/revocation and disposal invalidate affected cached state. Captured readers cannot regain validity after their credential context is invalidated. Authentication publication can reuse a successful pre-accept discovery without another wire request.

## Deliberate boundaries

Inference `messages`, `responses` and utility completion POSTs retain their existing request/response and streaming behavior. Discovery/model prerequisites are governed, but inference itself is not put through this buffered model-control queue and is never automatically replayed by it. Streaming leases, start/idle deadlines, transfer policy, broader cache/subscription consolidation and separate CAPI request telemetry are later work.

This slice migrates Agent Host discovery/model consumers, not workbench account-policy orchestration, shared-process connector clients, extension hosts, CAPI task/control mutations or SDK-owned requests. Desktop shared-process hosting and cross-process quota coordination remain separate changes. Standalone hosts do not depend on an attached workbench.
