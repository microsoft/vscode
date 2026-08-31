# Remote Agent Host — verification guide

Manual validation for remote agent host connections. Every remote kind is
established by one owner — `RemoteAgentHostService` — through a registered
`IRemoteAgentHostConnectionFactory`. The service performs the handshake,
classifies its outcome, owns status and retry, and disposes the connection.
Contributions own discovery, credentials, leases and UI.

Because the mechanism is shared, most of the value is in [Common
scenarios](#common-scenarios): run those against whichever remote you have,
then run the kind-specific section for anything that remote does uniquely.

Architecture is specified in
[REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md](./REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md).

## Before you start

### Environment

This guide assumes **macOS**, running Code OSS from sources via the `launch`
skill, which gives you a throwaway profile, a driveable workbench, and access to
the agent host logs. Open the Agents window once launched.

### What is reachable here

| Kind | Reachable on macOS desktop? |
|---|---|
| WebSocket | Yes |
| SSH | Yes — needs a reachable SSH host |
| Dev tunnel (desktop) | Yes — needs a tunnel hosting an agent host |
| Cloud sandbox | Yes — needs Copilot cloud sandbox access |
| Dev Container | Yes — needs Docker |
| **WSL** | **No — Windows only. Skipped here; validated manually.** |
| Dev tunnel (web / browser SDK variants) | No — these need a web build; the desktop variant is what you exercise here |

### Settings

| Setting | Effect |
|---|---|
| `chat.remoteAgentHostsEnabled` | Master switch (default `true`). Off ⇒ no connections at all. |
| `chat.remoteAgentHostsAutoConnect` | Default `true`. Gates *background* dialing for kinds whose entry-type config sets `autoConnectGated`. Does not affect explicit user connects. |
| `chat.agentHost.ahpJsonlLogging` | Records the AHP wire protocol to disk. Turn on **before** reproducing a protocol-level problem. |

### Observing what happened

- **Output panel** → `Agent Host` channels, and `agentHost.otlp.<address>` per remote.
- **Command palette** → `Export Agent Host Debug Logs` for a shareable bundle.
  Analyse with the `agent-host-logs` skill; raw process logs via `code-oss-logs`.
- **Host filter** in the Agents window title bar shows per-host connection
  status; the workspace picker shows it per provider.

For C2 and C4 especially, having `chat.agentHost.ahpJsonlLogging` on is what lets
you confirm the `clientId` was preserved and the reconnect replayed rather than
starting fresh.

### Per-kind behaviour table

Referenced throughout. Values live in `ENTRY_TYPE_CONFIGS` in
`src/vs/platform/agentHost/common/remoteAgentHostService.ts`.

| Kind | `dialedFromEntries` | `autoConnectGated` | Reconnect policy |
|---|---|---|---|
| WebSocket | yes | no | 1s→30s, 10 attempts |
| SSH | yes | yes | 1s→30s, 10 attempts |
| Tunnel | yes | yes | 1s→30s, 10 attempts |
| Cloud sandbox | no | — | 1s→30s, 10 attempts |
| Dev Container | no | — | 2s→60s, **3 attempts** |

`dialedFromEntries: yes` ⇒ dialed automatically during reconciliation (startup,
entry added). `no` ⇒ connected only when a caller explicitly asks, but still
self-heals after a drop.

## Common scenarios

Run these for each remote you are validating. Each states its expected result;
a deviation is a bug, not a variation.

### C1 — Cold connect

1. Configure/select the remote and connect.
2. Open a session on it and send a message.

**Expect:** host filter shows connected; the session responds. No duplicate
entries in the host list.

### C2 — Soft reconnect preserves the session

The core promise: a transport drop must not lose your conversation.

1. Connect and start a turn that runs for a while (e.g. ask for a long file read).
2. Kill the transport *underneath* the connection — see the per-kind
   "simulate a drop" note below. Do **not** use the disconnect UI, which is a
   deliberate teardown.

**Expect:**
- Status moves to *reconnecting*, not *disconnected*.
- The session list does **not** empty out.
- The connection returns to connected on its own.
- The in-flight turn either continues or reports a clean error — it must not
  silently vanish, and the host must not cancel it as an abandoned client.
- The same `clientId` is reused (visible in the AHP JSONL log) — this is what
  stops the host from tearing down pending tool calls.

### C3 — Sending while reconnecting

1. Induce a drop as in C2.
2. While status is *reconnecting*, send a message.

**Expect:** the send waits for the reconnect and then delivers. It must **not**
fail with "Cannot send request: not connected". Typed text is never lost.

### C4 — Hard reconnect after soft reconnect gives up

1. Induce a drop and keep the remote unreachable (stop the host process, block
   the network) until the protocol client exhausts its attempts.

**Expect:** status becomes disconnected, then the service retries per the policy
in the table above, with exponential backoff. After the attempt limit it stops
retrying rather than looping forever.

> Regression watch: a policy of *n* attempts must perform exactly *n*. An
> off-by-one here previously made Dev Container's 3 attempts perform 2, and a
> policy of 1 perform none. Count the attempts in the log.

### C5 — Explicit reconnect always works

After C4 has exhausted its budget (or a host is paused):

1. Use the host filter's connect action, or the workspace picker's reconnect.

**Expect:** a fresh connection attempt starts immediately, ignoring exhaustion
and any pause state. A user asking to reconnect is never refused because
automatic recovery gave up.

### C6 — Auto-connect setting is honoured

1. Set `chat.remoteAgentHostsAutoConnect` to `false`.
2. Restart the window with a previously connected host configured.

**Expect:** for kinds with `autoConnectGated: yes` (SSH, tunnel) the host is
**not** dialed automatically; it still appears in the host list as disconnected
and connects on explicit request. WebSocket is deliberately ungated and still
connects.

> Regression watch: the service historically ignored this setting entirely —
> gating lived only in the contributions.

### C7 — Background attempts never prompt

1. With a remote that can require interaction (SSH host key, tunnel gateway
   selection, auth), ensure it will need that interaction.
2. Trigger a **background** reconnect (restart the window, or induce a drop).

**Expect:** no modal, quick pick, or auth prompt appears unattended. The attempt
either succeeds silently or fails and surfaces in status. The same action taken
explicitly by the user *may* prompt.

### C8 — Incompatible host stays addressable

1. Connect to a host running a protocol version this client cannot negotiate.

**Expect:** status is *incompatible* with the host's message visible in the
workspace picker; the entry is **not** removed; the "Update Server" action is
offered and can reach the host over the still-open transport. The client must
not spin on retries — this is terminal until the user acts.

### C9 — Removal is complete

1. Remove/disconnect the host from the host filter or `Manage Remote Agent Hosts…`.

**Expect:** it disappears from the host list, its sessions are no longer offered,
and it does **not** reappear after a reconcile or window reload. No orphaned
relay process or tunnel is left behind (check the transport's own listing —
tunnel status, `docker ps`).

### C10 — No double dial

1. Rapidly toggle a setting that triggers reconciliation (add/remove an entry,
   flip `chat.remoteAgentHostsAutoConnect`) while a connection is being
   established.

**Expect:** exactly one connection per address; no duplicate host entries and no
orphaned client in the logs. The service reserves an address before its first
`await`, so overlapping reconciles must join rather than race.

### C11 — Disabling the feature

1. Set `chat.remoteAgentHostsEnabled` to `false` while connected.

**Expect:** all remote connections are torn down and no new dial is attempted.
Re-enabling restores them (subject to C6).

## WebSocket

The simplest kind: an address in `chat.remoteAgentHosts`, dialed unconditionally.

**Setup.** Start an agent host exposing a WebSocket endpoint, then run
`Add Remote Agent Host…` and paste the address it printed (the command accepts
the full `Listening on ws://…` line, a bare `host:port`, or a URL with a
`?tkn=` connection token).

**Simulate a drop:** kill the host process, or sever the network.

| # | Scenario | Expect |
|---|---|---|
| WS1 | Add a host via the command | Entry written to `chat.remoteAgentHosts`; connects; usable |
| WS2 | Add with a connection token in the URL | Token stored with the entry and not shown in the UI |
| WS3 | Add an unreachable address | Clear failure notification; entry still recorded so it can retry |
| WS4 | Remove the host | Setting entry removed and does not resurrect (C9) |
| WS5 | `chat.remoteAgentHostsAutoConnect: false` | Still auto-connects — deliberately ungated |

## SSH

Entries persist in application storage keyed by a stable `ssh:<alias>` address —
**not** the forwarded local port, which changes per connection. Identity
therefore survives reconnects.

**Setup.** `Connect to Remote Agent Host via SSH…`, pick a host from your SSH
config. Requires a reachable host and the VS Code remote CLI installable there.

**Simulate a drop:** kill the remote agent host process over SSH
(`pkill -f 'code.*agent'` on the remote), or drop the network.

| # | Scenario | Expect |
|---|---|---|
| SSH1 | Connect to an SSH-config host | Connects; entry stored under `ssh:<alias>` |
| SSH2 | Restart the window | Reconnects without prompting (subject to C6) |
| SSH3 | **Unknown host key** on first connect | Prompt appears for a *user-initiated* connect |
| SSH4 | Unknown/changed host key on a **background** reconnect | No prompt; attempt fails and stops retrying rather than looping (C7) |
| SSH5 | Host requiring a password/passphrase, background reconnect | Fails fast rather than retrying forever — credentials are not retained, so a silent redial can never succeed |
| SSH6 | Endpoint selection (editor vs dedicated host) | Picker only on user-initiated connects; background attempts never silently attach to an `editor` endpoint |
| SSH7 | Editor host exits, background reconnect lands on a standalone host | Failover notice shown |
| SSH8 | Incompatible handshake, then reconnect | Failover notice **not** shown — an incompatible handshake is not a successful reconnect |
| SSH9 | Remote CLI must be installed first | Connect waits for installation rather than timing out |
| SSH10 | Disconnect | Storage entry removed; SSH tunnel torn down (C9) |

## Dev tunnels

One kind, three implementations — desktop (shared-process relay), web (embedder
provided), browser (Dev Tunnels SDK). Exactly one is active per platform; on
macOS desktop you are exercising the **desktop** implementation. Cached tunnels
persist across windows.

**Setup.** Start a tunnel from another machine with an agent host, sign in with
the matching account, then pick it from the host filter.

**Simulate a drop:** stop the tunnel host, or put the hosting machine to sleep.

| # | Scenario | Expect |
|---|---|---|
| T1 | Connect to a discovered tunnel | Connects; tunnel cached |
| T2 | Restart the window | Reconnects from cache, subject to C6 |
| T3 | **Explicitly disconnect**, then reconcile/restart | Stays disconnected — suppression must survive; it must not be redialed automatically |
| T4 | Reconnect after suppression, explicitly | Connects and clears suppression |
| T5 | Tunnel deleted remotely | Terminal — no endless retry |
| T6 | Expired auth token on a background reconnect | Token is re-resolved at dial time and the reconnect succeeds; a stale captured token must not cause a failure loop |
| T7 | No cached credentials, background reconnect | Fails without prompting (C7) |
| T8 | **Protocol v6+ tunnel, no stored preference** | Gateway/location selection is offered |
| T9 | Protocol v5 tunnel | No gateway prompt |
| T10 | Sleep/wake with a tunnel connected | Silently dead transport is detected and recovered (C2) |
| T11 | Window focus after a failed attempt | Retry is re-attempted promptly |

> Regression watch (T8): the cached tunnel record did not always carry
> `protocolVersion`, so reconstruction assumed v5 and silently skipped the
> gateway prompt for v6+ tunnels. Entries cached by older builds legitimately
> fall back to v5 — verify with a **freshly cached** tunnel.

## Cloud sandbox

On demand only; never dialed at startup. Credentials are minted per connection
and rotate for the connection's lifetime.

**Setup.** Requires Copilot cloud sandbox access; connect by opening a sandbox
session from Mission Control.

| # | Scenario | Expect |
|---|---|---|
| CS1 | Open a sandbox session | Connects on demand |
| CS2 | Restart the window with a sandbox previously used | **Not** auto-dialed — on-demand kinds are never reconciled into a dial |
| CS3 | Authenticated request right after connect | Succeeds — the sealed GitHub token is applied after `initialize` and before the connection reports connected, so nothing can send an unauthenticated request |
| CS4 | Long-lived session past credential expiry | Refresh keeps it alive; a later soft reconnect uses fresh credentials, not the originals |
| CS5 | Sandbox still waking | Connect waits/retries rather than failing immediately |
| CS6 | Sealed token missing or rejected | Surfaces as an incompatible/failed connection with a clear message — not a silent connection that fails every later request |
| CS7 | Session closed | Credential refresh stops; no leaked timer |

## Dev Container

On demand only, desktop only, reference counted. The expensive case is a *cold*
container; a dropped relay against a running container is cheap, which is why
the policy is slower and gives up sooner (2s→60s, 3 attempts).

**Setup.** Requires Docker. Open a workspace containing a `.devcontainer`
configuration and start a Dev Container agent host session.

**Simulate a drop:** `docker stop` the container, or kill the agent host process
inside it (`docker exec <id> pkill -f agent`).

| # | Scenario | Expect |
|---|---|---|
| DC1 | Connect for a workspace with a Dev Container config | Container starts; session usable |
| DC2 | Second session for the **same** workspace | Reuses the existing connection (reference counted); no second container |
| DC3 | Release one of two sessions | Connection stays alive for the other |
| DC4 | Release the last session | Connection torn down; Output channel retained |
| DC5 | Cancel during a cold container build | Build is cancelled; no half-registered connection and no orphaned container |
| DC6 | Restart the window | **Not** auto-dialed (same rule as CS2) |
| DC7 | Kill the relay, container still running | Recovers cheaply without rebuilding |
| DC8 | Stop the container entirely | Re-establish re-runs `devcontainer up`; at most 3 attempts, then stops |
| DC9 | Delete the workspace folder, then drop the connection | Terminal — no retry against a folder that no longer exists |
| DC10 | Reconnect long after the initial connect | Succeeds — recovery must not depend on the cancellation token of the original connect operation |
| DC11 | Dev Container output | One stable `Dev Container (<workspace>)` channel per workspace, reused across attempts, including output from reconnects |

> Regression watch (DC10): gating reconnects on the initiating operation's
> `CancellationToken` permanently wedges self-healing once that token is
> cancelled, because its scope ends when the first connect returns.

## WSL — not covered here

WSL is Windows-only and is validated manually outside this guide. The common
scenarios apply to it unchanged. Its kind-specific risks are that a background
reconnect must not boot a stopped distro (a user-initiated one may), and that
its `disconnect` is **distro-scoped** rather than channel-scoped, so a stale
transport teardown must never run after a fresh reconnect has been established.

## Reporting a problem

Include:

1. Which kind, and which scenario ID above.
2. Expected vs actual.
3. `Export Agent Host Debug Logs` output.
4. The relevant settings from the table above.
5. Whether the attempt was user-initiated or background — the two paths
   deliberately differ in prompting and retry.
