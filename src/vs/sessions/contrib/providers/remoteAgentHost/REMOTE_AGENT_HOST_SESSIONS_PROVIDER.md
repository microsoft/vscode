# RemoteAgentHostSessionsProvider — Remote Agent Host Provider

**File:** `src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts`

A sessions provider for a single agent on a remote agent host connection. One instance is created per agent discovered on each connection.

## Registration

Registered dynamically by `RemoteAgentHostContribution`:

```
src/vs/sessions/contrib/remoteAgentHost/browser/remoteAgentHost.contribution.ts
```

- Monitors `IRemoteAgentHostService.onDidChangeConnections`
- Creates one `RemoteAgentHostSessionsProvider` per connection
- Registers via `sessionsProvidersService.registerProvider(sessionsProvider)`
- Disposes providers when connections are removed

## Identity

| Property | Format |
|----------|--------|
| `id` | `'agenthost-${sanitizedAuthority}'` |
| `label` | Connection name or `address` |
| `icon` | `Codicon.remote` |
| `sessionTypes` | Dynamically populated from `rootState.agents`; copilot agents use the platform `COPILOT_CLI_SESSION_TYPE` (`copilotcli`) as the logical session type id, other agents use `remoteAgentHostSessionTypeId(sanitizedAuthority, agent.provider)` (format: `'remote-${sanitizedAuthority}-${agent.provider}'`), label is the agent's `displayName` |

The per-connection identifier built by `vs/platform/agentHost/common/agentHostSessionType` is used as the resource URI scheme registered via `registerChatSessionContentProvider` and the `targetChatSessionType` published by `AgentHostLanguageModelProvider`. For copilot agents, `ISession.sessionType` uses the platform `COPILOT_CLI_SESSION_TYPE` so that remote copilot sessions align with local CLI and cloud copilot sessions. The sessions-core model picker reads models and the desired identifier's resolution via `ISessionsProvider.getModelsSnapshot`, which for the agent host filters registered language models by the session's resource scheme to find models for the active connection, and presentation options via `ISessionsProvider.getModelPickerOptions` (grouped models, featured shown, no "Manage Models" action).

Agents are discovered dynamically from each host's `rootState`; there is no hard-coded allowlist of supported agent providers. A single `RemoteAgentHostSessionsProvider` per host fans out into one `ISessionType` per advertised agent, and fires `onDidChangeSessionTypes` when the host's agent list changes. Each incoming session's type is derived from its backend URI scheme, so sessions for any agent the host exposes route through the same provider.

## IDs and URI Schemes

A remote session uses three distinct identifiers. For a copilot agent on host `myhost:3000`:

| Purpose | Value | Example |
|---------|-------|---------|
| `ISession.sessionType` | Platform type — `COPILOT_CLI_SESSION_TYPE` for copilot agents, per-connection ID for others | `copilotcli` |
| `resource.scheme` | Unique per-connection ID from `remoteAgentHostSessionTypeId()` | `remote-myhost__3000-copilot` |
| LM vendor / `targetChatSessionType` | Same as resource scheme | `remote-myhost__3000-copilot` |

Decoupling these allows copilot sessions from different providers (local CLI, remote hosts, cloud) to share the platform session type while keeping content-provider and model-provider routing isolated per host.

### How each ID is used

- **`ISession.sessionType`** — The logical session type visible to the sessions framework. Controls session-type pickers, context keys (`sessionType`), and behavioral gating (e.g. `isActiveSessionBackgroundProvider`). Copilot agents share `copilotcli` so they behave consistently with local copilot sessions.

- **`resource.scheme`** — The URI scheme of `ISession.resource` (e.g. `remote-myhost__3000-copilot:///abc123`). Routes `registerChatSessionContentProvider` calls to the correct `AgentHostSessionHandler` for each host. The provider's `getModelsSnapshot` filters available models by `session.resource.scheme` (not `session.sessionType`).

- **LM vendor** — The `targetChatSessionType` published by `AgentHostLanguageModelProvider` and used as the vendor when registering language models. Same value as the resource scheme, ensuring each host's models are isolated.

### Other IDs

- **`rawId`** — The session-local identifier (e.g. `abc123`), extracted from the session URI path. Used as the key in `_sessionCache`.
- **`sessionId`** — `{providerId}:{resource}` (e.g. `agenthost-myhost__3000:remote-myhost__3000-copilot:///abc123`). The provider-scoped ID passed to `ISessionsProvider` methods.
- **`providerId`** — `agenthost-${sanitizedAuthority}` (e.g. `agenthost-myhost__3000`). Identifies the provider instance, shared across all agents on the same host.
- **Backend session URI** — `{agentProvider}:///{rawId}` (e.g. `copilot:///abc123`). Used for protocol operations like `disposeSession`, reconstructed via `AgentSession.uri()`.

## Browse Actions

- **"Folders"** — Opens a file dialog scoped to the agent host filesystem (`agent-host://` scheme)

## New Session Behavior

`createNewSession(workspace)` creates a minimal `ISession` object literal (not a class instance) with:
- All observable fields initialized via `observableValue()`
- Status set to `SessionStatus.Untitled`
- Session type set to the first advertised agent type from the host
- Workspace label derived from the URI path

## Connection Management

- `setConnection(connection, defaultDirectory?)` — Wires a live agent host connection directly; dynamically discovers session types from the host's root state agents
- `clearConnection()` — Clears the connection when the host disconnects
- Handles session notifications (`notify/sessionAdded`, `notify/sessionRemoved`) and state changes
- Fires `onDidChangeSessionTypes` when the host's agent list changes
- Missing Copilot credentials open the standard product sign-in dialog when the user starts a session. On the first `auth/required` notification for an exact protected resource, the client silently re-resolves and force-forwards its current token. A later completed same-token challenge invokes the standard force-sign-in flow; silently rotated tokens are forwarded without prompting. Each connection keeps independent recovery state, while concurrent prompts share the existing Chat Setup operation so hosts cannot independently rotate shared authentication. Authentication and transport failures propagate to the pending request; `false` is reserved for canceled or unavailable authentication.
- Remote-host management options do not expose an IPC output channel; remote diagnostics use the host's forwarded logs when available.
- SSH connection progress notifications are closed when the connect promise settles; keyboard-interactive prompt cancellation rejects the connect promise as cancellation and does not show an error notification.
- SSH config host connections use resolved `IdentityFile` and `IdentityAgent` values from `ssh -G`; encrypted private keys are prompted for a passphrase through the same quick-input bridge as keyboard-interactive auth.
- Startup SSH auto-reconnect treats keyboard-interactive cancellation as an intentional pause and does not schedule another reconnect attempt. Host key denial pauses until an explicit reconnect so background retries cannot repeatedly reject a key that requires user review.
- A manual SSH reconnect from the host picker bypasses that paused auto-reconnect state and starts a fresh reconnect attempt for stored SSH hosts; host-picker disconnect/cancel for SSH uses the SSH service instead of removing the stored host.
- Tunnel auto-reconnect preserves why each host paused: focus or browser network recovery resumes only exhausted retry budgets, authentication additions resume only authentication pauses, and an offline host resumes only after discovery confirms it is online. Merely focusing the window never attempts an untracked or known-offline cached tunnel.
- `vscodeAgents.sshConnect/attempt` records each complete SSH plus AHP initialization attempt from the initial connection and stored-host reconnect paths, with connect/reconnect, user-initiated, attempt number, duration, success, retry intent, and a bounded failure category. It never records host names, addresses, aliases, or raw error messages.
- VS Code remote transports declare their route in AHP initialize metadata (`dev_tunnel`, `ssh`, `wsl`, `remote_extension_host`, `direct_websocket`, or `web_pub_sub`). Agent Host product telemetry combines that declaration with the host-observed physical transport and launcher kind; message telemetry retains the initiating client id and route.
- `ITunnelHostService` is a required dependency of the tunnel agent host contribution on every target, because tunnel discovery filters out the locally hosted tunnel. Hosting is CLI-backed and therefore impossible in a browser, so web registers an inert implementation that reports a permanently inactive sharing state rather than leaving the service unregistered. Omitting it fails construction of the whole contribution and silently disables tunnel discovery.

## Stubbed Operations

- `deleteChat` — No-op (agent host sessions don't support deleting individual chats)

## Send Flow

1. Requires an active connection
2. Validates session is the current new session
3. Opens the chat widget and loads the session model
4. Sends the request through the chat service (delegates to `AgentHostSessionHandler`)
5. Adds the untitled session to the pending set
6. Waits for a real backend session to appear via notification
7. Returns committed session or keeps temp visible on timeout
8. Fires `onDidReplaceSession` when the real session replaces the temporary one

## Preferred Agent Run Location

A shared, provider-agnostic per-host "run agents on a dedicated agent host, or in a remote VS Code editor window" preference. Both the SSH and tunnel providers resolve their connection-time endpoint selection from it; changing the preference from either surface below (F1 command or per-host Options item) immediately reconnects that host so the new preference takes effect right away, rather than waiting for its next connection.

- **Type + DI service** — `RemoteAgentHostLocationPreference = 'dedicated' | 'editor'` and `IRemoteAgentHostLocationPreferenceService` (`getPreference(hostKey)`, `setPreference(hostKey, preference)`, `onDidChangePreference`) in `src/vs/platform/agentHost/common/remoteAgentHostLocationPreference.ts`. **Host keys are stable *preference* keys, not live connection addresses** — for tunnels this is `TUNNEL_ADDRESS_PREFIX + tunnelId`, but for SSH hosts it is `computeSSHConnectionKey()`'s result (`ssh:<sshConfigHost>`, or `<user>@<host>:<port>` when no config alias is set), which is **not** the same string as `getEntryAddress()`/`provider.remoteAddress` — that live address is a forwarded local endpoint (e.g. `localhost:4321`) that changes per-connection and is never `ssh:`-prefixed. Every surface below must persist/read under the stable key while still resolving/reconnecting the live provider by its live address; conflating the two silently breaks persistence (the preference is saved under a key `SSHRemoteAgentHostService` never reads back) or hides the feature entirely (an `ssh:` prefix check against a live address never matches).
- **Storage** — `RemoteAgentHostLocationPreferenceService` (`src/vs/platform/agentHost/browser/remoteAgentHostLocationPreferenceService.ts`) persists one JSON map under the single storage key `remoteAgentHost.locationPreferences` (`StorageScope.APPLICATION` / `StorageTarget.USER`). Parsing is defensive: malformed JSON, a non-object shape, or any individual entry with an unrecognized value is dropped without discarding the rest of the map. Registered as a desktop singleton in `sessions.desktop.main.ts`.
- **Modal** — `promptRemoteAgentHostLocationPreference()` (`src/vs/platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.ts`) is a reusable `IDialogService.prompt` using the standard `custom.buttonDetails` two-choice pattern (no custom DOM/CSS), offering "Dedicated Agent Host" / "VS Code Editor" with descriptive details and a Cancel button. `orderRemoteAgentHostLocationOptions()` puts the host's current preference first when there is one; because button order alone communicates nothing to screen readers, the current option's detail is additionally suffixed with a localized `" (Current)"` marker (`withCurrentPreferenceMarker()`) so the saved choice is visible and announced regardless of position, with no marker at all when there is no saved preference.
- **Command** — `workbench.action.sessions.changeRemoteAgentHostLocationPreference` (`src/vs/sessions/contrib/providers/remoteAgentHost/electron-browser/remoteAgentHostLocationPreferenceCommand.ts`), F1 title **"Chat: Change Preferred Remote Agent Location"**, category `CHAT_CATEGORY`, gated on `ChatContextKeys.enabled` + `config.chat.remoteAgentHostsEnabled`. It enumerates SSH hosts from `IRemoteAgentHostService.configuredEntries` and tunnels from `ITunnelAgentHostService.getCachedTunnels()` via `collectRemoteAgentHostLocationTargets()`, which computes each SSH entry's stable `preferenceKey` with `computeSSHConnectionKey()` (deduplicating by that key) while separately recording its live `address` (`getEntryAddress()`) for provider lookup — tunnels use the same value for both. It quick-picks among the resulting `{ preferenceKey, address, label }` targets when there is more than one (`pickRemoteAgentHostLocationTarget`), resolves the matching live `IAgentHostSessionsProvider` by exact `remoteAddress` equality against the target's `address` (the pure `findAgentHostProviderForTarget()` helper, filtering `ISessionsProvidersService.getProviders()` through `isAgentHostProvider`), and delegates to the shared `changeRemoteAgentHostLocationPreference()` helper below — passing the target's `preferenceKey` — to open the modal, persist, and reconnect.
- **Per-host Options item** — the same preference can be changed directly from a single host's own "Options for {0}" quickpick (`showRemoteHostOptions()` in `src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteHostOptions.ts`, used by both Manage Remote Agent Hosts and host context menus). Each provider exposes `remoteLocationPreferenceKey` (`IAgentHostSessionsProvider`, defaulting to `remoteAddress` when a subclass has no separate stable identity) alongside its live `remoteAddress`; `showRemoteHostOptions()` reads that field into a local `preferenceKey` and passes it to `buildRemoteHostOptionItems()`. A **"Change Preferred Agent Location"** item appears only when `supportsRemoteAgentHostLocationPreference(preferenceKey ?? address)` — i.e. an `ssh:`/`tunnel:`-keyed *preference key* on desktop, never a live forwarded SSH address — and delegates to the same shared helper directly with the resolved provider, passing `preferenceKey` (not `address`). Since `IRemoteAgentHostLocationPreferenceService` is a desktop-only singleton and the web tunnel service does not consult a preference at all, the item (and the underlying service lookup) is unconditionally suppressed on web via an `isWebPlatform` parameter defaulting to the ambient `isWeb` constant.
- **Shared prompt/persist/reconnect helper** — `changeRemoteAgentHostLocationPreference()` (`src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteHostOptions.ts`) is the single implementation both surfaces above call, so they can't drift. It takes the stable `preferenceKey` (not a live address) and opens the modal seeded with the host's current preference under that key; on cancel it persists nothing and reconnects nothing. On confirm it **persists first under `preferenceKey`**, then — when a live provider was resolved — reconnects that host via the shared `reconnectRemoteHost(provider, remoteAgentHostService)` helper (which respects a provider's own SSH/tunnel `connect()` callback, falling back to `IRemoteAgentHostService.reconnect(provider.remoteAddress)` — the live address, independent of `preferenceKey`) under an `IProgressService.withProgress` notification titled "Reconnecting to {0}...". A successful reconnect shows a concise "Preference updated for {0}." confirmation; a failed reconnect keeps the already-persisted preference and surfaces a "Preference saved for {0}, but reconnection failed: {1}" error — it never silently swallows the failure. Interrupting the host's current session this way is intentional: the user just asked to change where its agents run. If no provider can be resolved for an otherwise-known target (an exceptional race, e.g. the host listed but not currently live), the preference is still saved and a warning explains it will apply the next time that host connects, instead of falsely claiming immediate effect.
- **Provider wiring for `remoteLocationPreferenceKey`** — `RemoteAgentHostSessionsProvider` (`src/vs/sessions/contrib/providers/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts`) accepts an optional `preferenceKey` on its config and exposes it as `remoteLocationPreferenceKey`, defaulting to `address` when omitted (tunnels, WSL, cloud sandbox — hosts with no separate stable identity). `RemoteAgentHost.contribution.ts`'s `_createProvider()` computes this key for SSH entries with `computeSSHConnectionKey()` — the same helper `collectRemoteAgentHostLocationTargets()` uses — so the F1 command and the per-host Options item always agree on which key a given SSH host's preference is stored under, regardless of its current forwarded address.
- **Tunnel wiring** — `TunnelAgentHostService.connect()` (`tunnelAgentHostServiceImpl.ts`) resolves a protocol-v6 gateway selection via `resolveGatewaySelection()` instead of an endpoint `IQuickInputService` picker: it reads `IRemoteAgentHostLocationPreferenceService.getPreference('tunnel:<tunnelId>')`, selects the live `editor` endpoint for a saved `'editor'` preference (falling back to a dedicated endpoint, without changing the preference, if none is live — this still applies to a background/non-user-initiated reconnect, since a stored editor preference is explicit consent), always falls back to dedicated for a saved `'dedicated'` preference, and — only with no saved preference, a live editor, and a user-initiated connect — prompts `promptRemoteAgentHostLocationPreference()` and persists the choice. A background connect or a host with no live editor never prompts. `selectEditorGatewayEndpoint`/`selectDedicatedGatewayFallback` pick deterministically (sorted by `instanceId`) among several live endpoints of the same type. Modal cancellation cancels the pending gateway selection (`ITunnelAgentHostMainService.cancelSelection`) exactly as an endpoint-picker cancellation used to, and persists nothing. Protocol-v5 tunnels (no gateway inventory) are unaffected and never prompt.
- **Rejected-selection failover** — a registry entry can outlive the agent host that published it (entries are only pruned once the owning PID dies), so the gateway inventory can advertise an `editor` endpoint whose socket is already gone. `completeSelection` then rejects with an error named `TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME`, which is the one failure that proves the tunnel itself is healthy and only the chosen endpoint is dead. `TunnelAgentHostService._completeSelectionWithFallback()` treats it as exactly that: it re-runs `prepareSelection` and retries once with `selectGatewayFallbackAfterRejection()` (a dedicated host, never the instance just rejected), so the failover happens inside a single connect attempt instead of after the whole reconnect backoff window. Every other failure means the tunnel is unreachable and is rethrown unchanged, leaving the contribution to keep retrying the same destination and selection. A fallback never mutates the stored preference, so the editor host is preferred again as soon as it is back, and an `editor` → `standalone` substitution always notifies (see `shouldNotifyTunnelFailover`), including on a user-initiated connect that explicitly asked for the editor host.
- **SSH wiring** — `SSHRemoteAgentHostService._resolveEndpointSelection()` (`sshRemoteAgentHostServiceImpl.ts`) applies the same preference-resolution rules to `onDidRequestEndpointSelection` candidates, keyed by `getPreference(request.connectionKey)` — `request.connectionKey` is computed with the same `computeSSHConnectionKey()` helper described above, so it always matches what the command/Options item persisted under — replacing its former endpoint `IQuickInputService` picker. Candidate selection is deterministic by `instanceId`; a dedicated fallback spawns a new host when none is live.
