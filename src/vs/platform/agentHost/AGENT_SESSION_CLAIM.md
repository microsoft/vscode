# Agent Host external session claim

An evaluation controller that already owns a remote Agent Host session can hand
that session to an Agents Window, so the window contributes its real browser,
editor, language, terminal, and customization surfaces to a run the controller
continues to drive.

This is pin-specific plumbing, not a product feature. There is no CLI
subcommand, claim URI, setting, menu, Command Palette entry, keybinding, command
URI, URL handler, or extension API, and it changes nothing about ordinary
authentication.

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
                                  burn gate, re-hash, constant-time compare,
                                  check bridge version, resolve handler,
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

The request must carry exactly the five fields, each a non-empty string; unknown
or missing fields are rejected rather than ignored. The session URI must be
canonical: it re-serializes to itself, has a lowercase scheme, and carries no
query, fragment, or `..` segment. The host's registry is keyed by the exact
string, so an equivalent-but-differently-spelled URI must not be accepted.

## One use

The gate is a single in-memory value, taken and cleared as the first statement
of the command handler — before parsing, before hashing, before any lookup. A
claim is therefore one-use *even when it fails*: a wrong nonce, a malformed
argument, or a missing handler all burn it. Without the launch argument the
command is never registered, so an ordinary window has nothing to invoke.

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
published tool inventory could never be exercised. Releasing the claim publishes
the active-client removal and drops the watcher and the subscription.

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

## Remaining risk

- **Transport.** The window trusts the endpoint it was launched against. Nothing
  cryptographically authenticates the peer, so `sessionType`/`sessionUri` pin
  *what* is claimed but not *which* server answers.
- **Server principal.** The Agent Host exposes one connection principal, so at
  the protocol level a claimed window can do whatever its connection token
  allows — the claim restricts what the window *does*, not what it *could* do.
- **Caller attribution.** VS Code does not tell a command handler which
  extension invoked it. The bridge's id and version are pinned by the commitment
  and checked against what is installed, but knowledge of the pre-image remains
  the only proof of the caller.
- **Token scope.** Any credential the controller forwards through the ordinary
  authentication flow is an ordinary bearer token to the host; nothing binds it
  to this claim or session beyond its own lifetime and scopes.
