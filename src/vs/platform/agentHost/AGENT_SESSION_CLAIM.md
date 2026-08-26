# Agent Host external session claim

An evaluation controller that already owns a remote Agent Host session can hand
that session to an Agents Window, so the window contributes its real browser,
editor, language, terminal, and customization surfaces to a run the controller
continues to drive.

This is pin-specific plumbing, not a product feature. There is no CLI
subcommand, claim URI, setting, menu, Command Palette entry, or keybinding, and
it changes nothing about ordinary authentication.

A command URI or any `executeCommand` caller *can* address the handler once it
exists — VS Code has no per-caller command ACL. What protects it is that the
command is not registered at all without the launch argument, and that reaching
the session still requires the nonce pre-image, which only the controller and
its bridge hold.

## Shape

```text
controller + bridge (Python)      VS Code window
----------------------------      --------------
create + authenticate session
mint nonce, keep it private
commitment = SHA-256(canonical(nonce, sessionType, sessionUri, bridgeId, bridgeVersion))
launch --agents --agent-session-claim-hash <hex>
                                  register hidden command (only when gated)
bridge invokes ------------------> workbench.action.agentHost.claimExternalSession
                                    { nonce, sessionType, sessionUri,
                                      bridgeExtensionId, bridgeExtensionVersion }
                                  burn gate (+ persist spent marker), re-hash,
                                  compare, await the exact handler (bounded),
                                  require existing session, claim() + whenSettled
observe activeClient inventory
start the evaluated turn
```

VS Code never sees the nonce until the bridge presents it, and never stores it.
The launch argument is a one-way commitment, so argv carries nothing secret and
the product needs no descriptor schema, credential store, broker, or
authentication mode of its own. The controller and the bridge own the entire
secret lifecycle, including the `0600` files they keep it in.

## Commitment

The commitment covers the nonce **and** the session type, the exact canonical
session URI, and the bridge extension's id and version. Knowing the nonce is
therefore not enough to claim something else: every field is pinned.

Canonicalization is netstring-style — each field is prefixed with its length and
a colon — so no combination of field contents can produce the same bytes as a
different combination. A plain separator would let a crafted `sessionUri`
impersonate a different `nonce`/`sessionType` split.

The request must carry exactly the five fields, each non-empty **printable
ASCII**; unknown or missing fields are rejected rather than ignored. The ASCII
restriction is what makes the length prefix portable: for ASCII a JavaScript
string's `length` equals its UTF-8 byte length, so a controller computing the
same commitment in Python prefixes the same numbers without mirroring UTF-16
semantics. The session URI must
re-serialize to itself with a lowercase scheme, because the host's registry is
keyed by the exact string; the handler then re-checks that it round-trips
through the named session type.

The commitment is compared with `===`. Both sides are non-secret at that point —
the commitment is a public one-way hash and the pre-image is what the caller just
supplied — and a timing-leaked prefix of a hash does not help forge the rest.

The bridge's id and version are pinned *by the commitment*, and by nothing else:
the product does not check that the extension is installed at that version,
because it would not add a guarantee — any caller that can produce the pre-image
was told it by the controller.

## One use

The gate is a single in-memory value, taken and cleared as the first statement
of the command handler — before parsing, before hashing, before any lookup — and
the commitment is simultaneously written to storage as spent. A claim is
therefore one-use *even when it fails*: a wrong nonce, a malformed argument, or
a handler that never appears all burn it.

The spent marker is what survives a window reload, which would otherwise
re-arm the in-memory gate from the same unchanged argv. It is keyed by the
commitment, so a new run with a new commitment is unaffected.

Its scope is the profile: markers accumulate in the evaluation profile's
application storage and are discarded with it, which is why an ephemeral profile
per run is the real boundary. Two windows sharing a profile share the marker, so
a second window launched with the same commitment finds it already spent — that
is the intended outcome for a duplicate launch, and it also means a genuinely
concurrent second claim needs its own commitment. Without the launch argument the
command is never registered, so an ordinary window has nothing to invoke.

## Racing the handler

The bridge can invoke the command before `RemoteAgentHostContribution` has
connected and registered its session handlers. Rather than fail on a race the
caller cannot control, the command waits for the exact session type.

That wait is event-driven end to end. The registry exposes
`onDidRegisterTarget`, and `whenTargetReady` resolves either immediately (the
handler is already there) or from that event, filtered to the exact session
type. It schedules nothing and polls nothing: an unrelated registration does not
settle it, and a handler that is already registered resolves with no clock
involved at all. Session hydration and the active-client settle are likewise
driven by the subscription's own change/error events and by observable state.

`AGENT_SESSION_CLAIM_BUDGET_MS` is the single named budget covering all three
waits, and it exists only as a terminal failure guard — never as a success
condition. When it fires the claim fails with the fixed-vocabulary outcome
`budgetExceeded`, classified once around the whole operation so it reads the
same whether the guard interrupted readiness, hydration, or the settle; a
cancellation from anywhere else reports `cancelled`. On success the guard is
disposed without ever firing.

One pre-existing debounce sits inside this path: the active-client entry
coalesces republishes over `ACTIVE_CLIENT_RECONCILIATION_DEBOUNCE_MS` (5ms).
That is signal scheduling, not readiness — `whenSettled` observes the resulting
state and resolves on it, so nothing here treats elapsed time as an outcome.

## Claim

`AgentHostSessionHandler.claimExternalSession` joins an already-existing
session. It hydrates a bare session subscription and fails if the session did
not hydrate — it never creates or materializes one — and requires the session to
round-trip through that handler's own session type. It then publishes the active
client through the existing `claim()` path and awaits `whenSettled`.

It opens no chat model, so there is no draft synchronization, no pending-message
projection, no server-turn watcher, and no MCP authentication watcher. The only
watcher it installs is the existing session-scoped `inputNeeded` watcher, which
already runs from a bare `IAgentSubscription<SessionState>`; without it the
published tool inventory could never be exercised.

A chat opened on the same session addresses the same session resource, so the
`inputNeeded` watcher, the `ActiveClientEntry`, and the session subscription are
all shared. Each is reference-counted, and either holder may be released first
without tearing the other down. The claim also binds the hydrated subscription to
the active-client entry, so later inventory or remote state changes re-reconcile
rather than publishing once and going stale.

Releasing the last holder publishes the active-client removal. A claim released
while a chat is still open drops only its own references. Removal is best
effort: it also runs during shutdown, where the connection may already be gone,
and a failure to say goodbye must not take the window down.

## Client tool approval

A claimed session has no chat surface, so nothing can answer a confirmation. A
client tool that declares `canRequestPreApproval` would otherwise be denied once
its grace window expired, which would make the published evaluation inventory
unusable — the window would advertise tools it could never run.

Such tools are therefore approved from the claim itself: a window launched with a
claim commitment is an evaluation window whose effects are expected and
sandboxed. The approval is locally derived and deliberately *not* read from the
host's confirmation state, so the server still cannot approve its own tool calls,
and it is unreachable for any session this window was not launched to claim —
including an ordinary chat session open in the same window.

It is evaluated per tool call rather than captured when the watcher is created,
so it starts and stops exactly with the claim: a claim taken after a chat already
installed the shared watcher still applies, and releasing the claim restores
ordinary confirmation for a chat that outlives it.

This is a real capability grant: for the claimed session, the full evaluation
inventory runs without prompting. It is safe only because of the operational
constraints below.

## Authentication

Unchanged. The window authenticates the Agent Host connection through the
ordinary flow, cache, and settling of `authenticationPending`. Ordinary users,
local hosts, SSH, WSL, tunnels, and cloud sandbox connections are untouched, and
this change adds no code on any authentication path.

## Accepted operational security assumptions

These are properties of how the evaluation is deployed, not things the product
enforces. The design is only as strong as they are.

- **Isolated profile.** The window runs on a dedicated profile containing only
  the reviewed bridge extension, with no signed-in accounts, so no personal
  credential is present to forward and no unreviewed extension can invoke the
  command.
- **Separate UID.** The window runs as its own user, so untrusted workspace
  processes cannot read its argv, profile, or memory, and cannot reach the
  bridge's private state.
- **Trusted pinned host.** The Agent Host the window connects to is the pinned
  process the controller started. The window trusts what it says, including its
  tool-call confirmation state, which is why no local pre-approval policy is
  layered on top.
- **Controller-owned secrets.** The nonce and any evaluation credentials live in
  controller/bridge-owned `0600` state, are short-lived, and are never passed to
  VS Code on a command line or in settings.
- **Sandboxed effects.** Everything the claimed session's tools can touch — the
  workspace, the terminal, the browser profile, the network — is inside the
  evaluation sandbox, because a claimed session auto-approves the full inventory.
- **Workspace trust is not consulted.** The claim does not go through the
  workspace-trust gate: it publishes an inventory rather than opening a folder,
  and the evaluation workspace is untrusted content running in a sandbox by
  construction. In a general-purpose window this would be a bypass.

## Remaining risk

- **Transport.** The window trusts the endpoint it was launched against. Nothing
  cryptographically authenticates the peer, so `sessionType`/`sessionUri` pin
  *what* is claimed but not *which* server answers.
- **Server principal.** The Agent Host exposes one connection principal, so at
  the protocol level a claimed window can do whatever its connection token
  allows — the claim restricts what the window *does*, not what it *could* do.
- **Caller attribution.** VS Code does not tell a command handler which
  extension invoked it. The bridge's id and version are pinned by the commitment,
  but nothing verifies which extension actually called: knowledge of the
  pre-image is the only proof of the caller.
- **Token scope.** Any credential the controller forwards through the ordinary
  authentication flow is an ordinary bearer token to the host; nothing binds it
  to this claim or session beyond its own lifetime and scopes.
- **Storage-backed replay gate.** The spent marker lives in profile storage. A
  profile wiped between reloads within one run — or storage that fails to
  persist — would re-arm the in-memory gate from the unchanged argv. The
  evaluation profile is ephemeral per run, which is what makes a fresh commitment
  per run the real boundary.
