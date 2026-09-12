# Hydra-RL Multi-Turn Routing

Auto can reuse a model across user turns under a server-owned Hydra-RL
controller. CAPI owns experiment assignment, model selection, and the routing
policy. VS Code only transports controller state and honors the authorized
skip schedule. There is no additional client experiment or setting.

This is an experimental efficiency treatment, not a claim of improved answer
quality. Shipping protocol support does not enable the server experiment.

## Protocol

Every eligible `POST /auto` request advertises support through
`hydra_rl_multi_turn`. A new user turn with prior state sends:

```json
{
  "prompt": "current user request",
  "hydra_rl_multi_turn": {
    "state_token": "<previous controller token>",
    "advance": true
  }
}
```

The first request omits `state_token`. Ancillary requests and model-session
token renewals send `advance: false`. The existing prompt, tier, image, and
history-preparation behavior is otherwise unchanged.

An active server response includes:

```json
{
  "session_token": "<model session token>",
  "expires_at": 1800000000,
  "selected_model": { "id": "selected-model" },
  "multi_turn_mode": "hydra_rl",
  "hydra_rl_multi_turn": {
    "state_token": "<next controller token>",
    "skip_turns": 3,
    "decision": "hold"
  }
}
```

Only a valid `hydra_rl_multi_turn` response block activates local scheduling.
The mode string alone does not activate it. Missing state, including responses
from older servers or control assignments, preserves legacy sticky Auto
behavior. Capability is advertised again whenever normal routing reaches
`/auto`; an omitted response block does not permanently disable negotiation.

The controller token must be a nonblank string. `skip_turns` is an integer from
0 through 7, matching the current protocol maximum; omission means 0. Invalid
state is rejected before it can enter the cache. `decision` is not interpreted,
so new server decision names do not change client behavior.

## Turn Accounting

The bounded, in-memory conversation cache holds the opaque controller token,
remaining skip count, and last handled request ID alongside the existing model
endpoint and session token. Controller state is neither decoded nor logged.

- A nonempty prompt or slash command with a new chat request ID is a user turn.
- Repeated resolutions of the same ID do not consume another skip or advance
  the controller. Identical text with a new ID is a new turn.
- Calls without a chat request ID, including `vscode.lm` ancillary resolutions,
  do not advance the controller.
- Exactly `skip_turns` subsequent user turns may reuse the cached endpoint.
  The following user turn sends the latest state with `advance: true` and uses
  the model selected by the server.
- Active turns in a conversation are serialized. Concurrent resolutions of
  the same request are deduplicated.
- A model-session token expiring during a skip window still consumes that user
  turn locally. Renewal sends `advance: false` and cannot refill the consumed
  skip budget. Controller-token expiry remains a server responsibility.

## Recovery

Compaction, authentication changes, service disposal, cache eviction, tier or
incompatible vision changes, leaving Auto, and fallback away from Auto reset
the applicable controller state. Model-change resets leave legacy sticky sessions unchanged.
Invalidation during an in-flight request cannot restore the invalidated state;
responses and queued work from a previous signed-in account are rejected.

A `400` response while presenting controller state permits one retry without
that state. Transient router failures retain a compatible cached endpoint and
controller state, with another check available on a later user turn.

Typed bad-request, not-found, and rate-limit failures from the selected model
invalidate an active Hydra selection for the next resolution. They do not
retry the model call. A rejected model cannot be reused as the router-failure
fallback, and a late failure from a replaced endpoint cannot invalidate its
replacement. Network, server, cancellation, and authentication failures do not
trigger this model-rejection reset.

## Observability

- `automode.autoV2Decision.hydraRlMultiTurnActive` reports server activation,
  not client capability. `hydraRlSkipTurns` records the authorized skip count.
- `automode.hydraRlMultiTurnSkip` reports each genuine user turn served from
  the cached endpoint without a call to `/auto`, with the remaining skip count.
- `automode.autoV2Fallback` uses `hydraRlStateRejected` for fresh-state recovery.

Opaque state and model-session tokens are excluded from these events and from
the Auto decision log.

## Implementation

- [Wire contract and validation](../../src/platform/endpoint/node/autoV2Fetcher.ts)
- [Conversation scheduling](../../src/platform/endpoint/node/automodeService.ts)
- [Selected-model rejection handling](../../src/platform/endpoint/node/autoChatEndpoint.ts)