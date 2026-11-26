---
description: Keep Agent Host Protocol clients interoperable with non-VS Code hosts.
applyTo: "src/vs/platform/agentHost/**,src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/**,src/vs/workbench/contrib/chat/browser/remoteAgentHost/**,src/vs/sessions/contrib/providers/agentHost/**,src/vs/sessions/contrib/providers/remoteAgentHost/**"
---

# AHP interoperability

This document contains durable, cross-cutting interoperability rules for VS Code's AHP clients and hosts. Keep it focused on stable protocol boundaries and reusable implementation guidance; do not add task-specific details, historical facts, or individual bug-fix behavior that belongs in code, tests, issues, or pull requests.

AHP clients communicate with any conforming Agent Host, not only the local VS Code Agent Host. Treat host-advertised session and chat URIs, identifiers, state, and capabilities as authoritative. Do not derive or reinterpret them using the local host's URI format, provider names, or implementation conventions. Helpers that construct IDs for the local host are not a substitute for reading IDs supplied by a remote host.

## Protocol constructs before `_meta`

- Agents **MUST NOT** use `_meta` to express information or behavior that existing protocol constructs can express. Check the standard fields, state, actions, commands, and negotiated capabilities before adding or extending metadata.
- If a requirement cannot be satisfied without `_meta`, agents **SHOULD** open an issue in [microsoft/agent-host-protocol](https://github.com/microsoft/agent-host-protocol/issues) describing the requirement and the protocol gap, rather than silently treating a private extension as the protocol.
- Alternate Agent Host and UI implementations may neither provide nor understand `_meta`. Any use of `_meta` **MUST** fall back gracefully in both directions: clients must remain functional when a host omits the metadata, and hosts must remain functional when a client omits or ignores it. Preserve standard protocol behavior without the extension; do not make metadata a requirement for interoperability or use it to assume a particular host or UI implementation.

For optional extensions that still need `_meta`, use namespaced keys and typed readers that validate each value's shape before use.

When changing an AHP client, cover a conforming host that advertises valid but different URIs and identifiers, as well as absent optional extensions. Test the behavior at the client boundary, not only against the local VS Code host.

## Native session identity

Follow the [Agent Host session identity contract](../../src/vs/workbench/contrib/sessions/providers/agentHost/AGENT_HOST_SESSIONS_PROVIDER.md#identity). Backend identities are mixed and immutable: negotiate addressing only for new allocations, never rewrite restored, discovered, adopted, or continued conversations. Keep frontend resources, session IDs, and chat fragments stable; carry the advertised provider and exact backend resource through caches and owning-connection resolution. `ahp-session` carries no provider identity and must never imply Copilot.

Back changes with boundary tests for both version-skew directions, mixed legacy/standard resources, reconnects, opaque advertised chats, and cache reloads. Restart tests must use fresh provider instances, and discovery/deletion tests must preserve provider/backing identity rather than equating raw IDs across providers. Scope legacy visibility to positively identified legacy VS Code connections; unmarked conforming peers must not be classified as legacy.
