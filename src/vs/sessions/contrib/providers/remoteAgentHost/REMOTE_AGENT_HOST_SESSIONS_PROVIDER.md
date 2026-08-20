# Remote Agent Host sessions provider

> **Specification change gate:** Do not update this document for connection bug
> fixes, retries, telemetry, or transport algorithms. Update it only when
> connection ownership, routing identity, or provider lifecycle changes.

## Scope

`RemoteAgentHostSessionsProvider` specializes the shared Agent Host provider for
one remote connection. A connection may advertise multiple agents and session
types.

Shared Agent Host adaptation is specified in
[AGENT_HOST_SESSIONS_PROVIDER.md](../agentHost/AGENT_HOST_SESSIONS_PROVIDER.md).

## Registration

`RemoteAgentHostContribution` observes `IRemoteAgentHostService` connections.
It creates and registers one provider per connection and disposes the provider
when that connection is removed.

Agent discovery is dynamic. Changes to a host's advertised agents update the
provider's session types without recreating the provider.

## Identity

Remote sessions use separate logical and routing identities:

| Identity | Purpose |
|----------|---------|
| Provider ID | Identifies the remote connection's provider instance |
| `ISession.sessionType` | Logical type used by Sessions UI and capabilities |
| Session resource scheme | Routes content and operations to the exact host and agent |
| Model target/vendor | Routes language models to the exact host and agent |

Copilot agents may share a logical session type with local and cloud Copilot
providers while retaining a connection-specific resource scheme. Other agents
use a connection-specific logical type.

Never use the logical session type where host-specific routing is required.
Resource schemes and provider IDs are created through the shared Agent Host
identifier helpers rather than hand-built strings.

## Connection ownership

The remote contribution owns:

- connect, disconnect, and reconnect policy;
- authentication and interactive connection prompts;
- remote filesystem browsing;
- transport diagnostics and connection status;
- connection-scoped listener disposal.

The provider exposes connection state through `IAgentHostSessionsProvider` and
delegates protocol operations to the live connection. Disconnecting clears live
state without manufacturing successful operation results.

## Session lifecycle

Drafts expose the shared untitled `ISession` contract and use remote workspace
metadata. First send commits through the shared Agent Host lifecycle. Existing
sessions use the shared adapter and cache.

Remote session and chat resources preserve connection-specific routing identity
through creation, hydration, and replacement. Backend session identifiers are
translated only inside the provider.

## Authentication and recovery

Authentication challenges, credential refresh, and transport retries remain
connection policy. The request that encountered a challenge observes its actual
success, cancellation, or failure; provider operations do not silently convert
authentication failures into availability results.

Concurrent prompts use the shared setup operation where credentials are shared.
Connection-specific recovery state remains isolated per remote host.

## Preferred run location

The remote Agent Host services may remember a user's preferred run location.
The owning location-preference service defines its persistence key and
selection policy. Providers consume the resolved location; they do not duplicate
preference state in session metadata.

Transport-specific fallback and retry algorithms belong in the owning SSH,
tunnel, or remote-host service and its tests.

## Testing

Focused tests live beside the remote provider and remote-host services. Tests
own connection races, authentication paths, routing identifiers, fallback, and
regressions.

## Change policy

Update this specification only when connection/provider ownership, routing
identity, or the shared Agent Host lifecycle boundary changes. Do not append
transport algorithms, telemetry schemas, retry narratives, or incident history.
