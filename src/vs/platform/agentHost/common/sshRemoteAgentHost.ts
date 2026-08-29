/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { AgentHostEndpointAddress, AgentHostServerType } from './agentHostEndpointRegistry.js';
import type { RemoteAgentHostLocationPreference } from './remoteAgentHostLocationPreference.js';
import type { IRelayMessage } from './relayTransport.js';

export type { IRelayMessage } from './relayTransport.js';

/**
 * Lifecycle ownership of the remote agent host process backing a
 * connection: `managed` means this desktop spawned it (and is relying on
 * its `--idle-timeout` to self-clean-up when unused), `external` means it
 * was already running (another editor window, or a previously spawned
 * standalone) and this desktop merely attached to it.
 */
export type SSHAgentHostLifecycle = 'managed' | 'external';

export const ISSHRemoteAgentHostService = createDecorator<ISSHRemoteAgentHostService>('sshRemoteAgentHostService');

/**
 * IPC channel name for the main-process SSH service.
 */
export const SSH_REMOTE_AGENT_HOST_CHANNEL = 'sshRemoteAgentHost';

export const enum SSHAuthMethod {
	/** Use the local SSH agent for key-based auth. */
	Agent = 'agent',
	/** Authenticate with an explicit private key file. */
	KeyFile = 'keyFile',
	/** Authenticate with a password. */
	Password = 'password',
}

export interface ISSHAgentHostConfig {
	/** Remote hostname or IP. */
	readonly host: string;
	/** SSH port (default 22). */
	readonly port?: number;
	/** Username on the remote machine. */
	readonly username: string;
	/** Authentication method. */
	readonly authMethod: SSHAuthMethod;
	/** Path to the private key file (when {@link authMethod} is KeyFile). */
	readonly privateKeyPath?: string;
	/** Raw IdentityAgent value from resolved SSH config; may be a socket path, `none`, `SSH_AUTH_SOCK`, or an environment reference. */
	readonly identityAgent?: string;
	/** Password string (when {@link authMethod} is Password). */
	readonly password?: string;
	/** Display name for this connection. */
	readonly name: string;
	/** SSH config host alias (e.g. "robfast2") for reconnection on restart. */
	readonly sshConfigHost?: string;
	/** Dev override: custom command to start the remote agent host instead of the default CLI. */
	readonly remoteAgentHostCommand?: string;
	/** When true, enables OpenSSH agent forwarding (auth-agent@openssh.com) for this connection. Requires {@link authMethod} to be Agent. */
	readonly agentForward?: boolean;
	/**
	 * Whether this connect attempt was directly requested by the user (e.g.
	 * "Connect" from the workspace picker) as opposed to a silent background
	 * reconnect (e.g. on startup, or a scheduled auto-reconnect retry).
	 * Defaults to `true` when omitted, preserving today's picker-eligible
	 * behavior for every existing caller that doesn't set this explicitly.
	 *
	 * When explicitly `false` and {@link preferredAgentLocation} is unset,
	 * endpoint selection never shows the main↔renderer picker and never
	 * silently attaches to an `editor`-owned endpoint even if one is the
	 * only live endpoint — it deterministically reuses a live `standalone`
	 * endpoint when one exists, or spawns a new dedicated one otherwise.
	 * This keeps unattended reconnects from blocking on renderer UI or
	 * stealing a session out from under another open editor window.
	 */
	readonly userInitiated?: boolean;
	/**
	 * The renderer's previously stored {@link IRemoteAgentHostLocationPreferenceService}
	 * choice for this host's stable connection key (see
	 * {@link computeSSHConnectionKey}), threaded through so the main process
	 * can honor it without ever emitting an {@link ISSHEndpointSelectionRequest}.
	 * Takes priority over {@link userInitiated}: a stored `editor` preference
	 * lets even a silent/background reconnect (`userInitiated: false`) land on
	 * a live `editor`-owned endpoint (falling back to `dedicated` selection,
	 * without mutating the stored preference, if none is live), and a stored
	 * `dedicated` preference always selects a dedicated endpoint. When unset,
	 * behavior is unchanged: {@link userInitiated} alone governs whether the
	 * picker may be shown. Non-secret; safe to keep in the sanitized config.
	 */
	readonly preferredAgentLocation?: RemoteAgentHostLocationPreference;
}

/**
 * Compute the stable per-host key used to key in-flight SSH connections,
 * the shared endpoint-selection request/candidates, and this host's
 * persisted {@link RemoteAgentHostLocationPreference}. Uses the SSH config
 * host alias when available (`ssh:<alias>`), falling back to
 * `user@host:port` for config-less (explicit credential) connections. Both
 * the node-side SSH service and the renderer-side preference lookup must
 * use this exact key so a preference set on one path is honored by the
 * other. `username`/`host`/`port` are optional since callers that only
 * know a {@link ISSHAgentHostConfig.sshConfigHost sshConfigHost} alias
 * up front (e.g. the renderer's `reconnect()`, before the main process has
 * resolved the alias to a hostname) never reach the fallback branch that
 * needs them.
 */
export function computeSSHConnectionKey(config: { sshConfigHost?: string; username?: string; host?: string; port?: number }): string {
	return config.sshConfigHost
		? `ssh:${config.sshConfigHost}`
		: `${config.username}@${config.host}:${config.port ?? 22}`;
}

/**
 * A sanitized view of the SSH config that omits secret material
 * (password, private key path). Exposed on active connections so
 * consumers can inspect connection metadata without accessing credentials.
 */
export type ISSHAgentHostConfigSanitized = Omit<ISSHAgentHostConfig, 'password' | 'privateKeyPath'>;

export interface ISSHAgentHostConnection extends IDisposable {
	/** The SSH config used to establish this connection (secrets stripped). */
	readonly config: ISSHAgentHostConfigSanitized;
	/** The connection address (e.g. `ssh:myhost` or `user@host:22`) registered with IRemoteAgentHostService. */
	readonly localAddress: string;
	/** The display name. */
	readonly name: string;
	/** Fires when this SSH connection is closed or lost. */
	readonly onDidClose: Event<void>;
	/**
	 * Kind of remote agent host process backing this connection, when known
	 * (registry-discovered connections only; unset for the legacy
	 * `remoteAgentHostCommand` override path).
	 */
	readonly serverType?: AgentHostServerType;
	/** Registry `instanceId` of the remote agent host backing this connection, when known. */
	readonly instanceId?: string;
	/** Whether this is the primary connection selected for this remote (see {@link ISSHConnectResult.primary}). */
	readonly primary?: boolean;
	/** Whether this desktop spawned (and therefore is relying on idle-timeout to clean up) the backing process, or merely attached to an already-running one. */
	readonly lifecycle?: SSHAgentHostLifecycle;
}

/**
 * Manages SSH connections that bootstrap a remote agent host process.
 *
 * Each connection SSHs into a remote machine, ensures the VS Code CLI
 * is installed, starts `code agent-host`, and creates a WebSocket relay
 * over the SSH channel. Messages are forwarded between the renderer and
 * the remote agent host via IPC through the shared process.
 */
export interface ISSHRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when the set of active SSH connections changes. */
	readonly onDidChangeConnections: Event<void>;

	/** Progress messages during connect. */
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress>;

	/** Currently active SSH-bootstrapped connections. */
	readonly connections: readonly ISSHAgentHostConnection[];

	/**
	 * Bootstrap a remote agent host over SSH.
	 *
	 * 1. Opens an SSH connection to the remote host
	 * 2. Downloads and installs the VS Code CLI if needed
	 * 3. Starts `code agent-host`
	 * 4. Creates a WebSocket relay over the SSH channel
	 * 5. Waits for {@link IRemoteAgentHostService} to complete the protocol handshake
	 *
	 * Resolves with the connection handle once the agent host is reachable.
	 */
	connect(config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection>;

	/**
	 * Disconnect an SSH-bootstrapped connection by host address.
	 * Tears down the SSH tunnel, stops the remote agent host, and removes its
	 * persisted SSH entry.
	 */
	disconnect(host: string): Promise<void>;

	/** List SSH config host aliases (excluding wildcards). */
	listSSHConfigHosts(): Promise<string[]>;

	/**
	 * Ensure `~/.ssh/config` exists (creating it with the right permissions if
	 * missing) and return its URI. The parent `~/.ssh` directory is created
	 * with mode 0700 and the config file with mode 0600 on POSIX systems.
	 */
	ensureUserSSHConfig(): Promise<URI>;

	/**
	 * List the known SSH configuration file URIs in priority order — typically the
	 * per-user `~/.ssh/config` (always returned, even if it does not yet exist) and
	 * the system-wide `/etc/ssh/ssh_config` (only when present on disk).
	 */
	listSSHConfigFiles(): Promise<URI[]>;

	/** Resolve full SSH config for a host via `ssh -G`. */
	resolveSSHConfig(host: string): Promise<ISSHResolvedConfig>;

	/**
	 * Re-establish an SSH tunnel on startup for a previously connected host.
	 * Resolves once the service-owned protocol connection is ready.
	 *
	 * @param userInitiated See {@link ISSHAgentHostConfig.userInitiated}.
	 * Defaults to `true` (picker-eligible) when omitted; background/auto
	 * reconnect callers must pass `false` explicitly to guarantee no picker
	 * ever opens and no `editor` endpoint is ever silently chosen.
	 */
	reconnect(sshConfigHost: string, name: string, userInitiated?: boolean): Promise<ISSHAgentHostConnection>;
}
/**
 * Serializable result from a successful SSH connect operation.
 * Returned over IPC from the main process.
 */
export interface ISSHConnectResult {
	/** Unique identifier for this connection's relay channel. */
	readonly connectionId: string;
	/** Display-friendly address (e.g. "ssh:robfast2"). */
	readonly address: string;
	readonly name: string;
	readonly connectionToken: string | undefined;
	readonly config: ISSHAgentHostConfigSanitized;
	/** SSH config host alias for reconnection on restart. */
	readonly sshConfigHost?: string;
	/**
	 * Kind of remote agent host process backing this connection
	 * (`editor` or `standalone`), when discovered through the shared
	 * endpoint registry. Unset for the legacy `remoteAgentHostCommand`
	 * override path, which bypasses registry discovery entirely.
	 */
	readonly serverType?: AgentHostServerType;
	/** Registry `instanceId` of the remote agent host backing this connection, when known. */
	readonly instanceId?: string;
	/**
	 * Whether this connection is the primary one for this remote: the one
	 * chosen (explicitly, or by deterministic reuse/spawn) to back the
	 * editor's own remote session. Every successful `connect()`/`reconnect()`
	 * result today is primary; this field exists so future consumers can
	 * distinguish it without relying on absence-of-alternative.
	 */
	readonly primary?: boolean;
	/**
	 * Whether this desktop spawned the backing remote agent host process
	 * (`managed`, relies on `--idle-timeout` for cleanup) or merely attached
	 * to an already-running one (`external`, e.g. another editor window or a
	 * previously spawned standalone — never killed on disconnect).
	 */
	readonly lifecycle?: SSHAgentHostLifecycle;
}

/**
 * How OpenSSH should react to an unknown or changed host key. `ssh -G`
 * canonicalizes `yes` to `true` and `no`/`off` to `false`, which the resolved
 * config parser normalizes back to this policy representation.
 */
export type SSHStrictHostKeyChecking = 'ask' | 'accept-new' | 'yes' | 'no' | 'off';

/** Narrow an arbitrary `ssh -G` value to a {@link SSHStrictHostKeyChecking}. */
export function isSSHStrictHostKeyChecking(value: string): value is SSHStrictHostKeyChecking {
	return value === 'ask' || value === 'accept-new' || value === 'yes' || value === 'no' || value === 'off';
}

/**
 * Resolved SSH configuration for a host, obtained from `ssh -G`.
 */
export interface ISSHResolvedConfig {
	readonly hostname: string;
	readonly user: string | undefined;
	readonly port: number;
	readonly identityFile: string[];
	readonly identityAgent: string | undefined;
	readonly forwardAgent: boolean;
	/**
	 * `UserKnownHostsFile` paths, in priority order. `ssh -G` emits these as a
	 * single space-separated list, so this is already split. Typically
	 * `~/.ssh/known_hosts` and `~/.ssh/known_hosts2`.
	 */
	readonly userKnownHostsFiles: string[];
	/** `GlobalKnownHostsFile` paths, e.g. `/etc/ssh/ssh_known_hosts`. */
	readonly globalKnownHostsFiles: string[];
	/** Resolved and normalized `StrictHostKeyChecking`, when recognized. */
	readonly strictHostKeyChecking: SSHStrictHostKeyChecking | undefined;
}

export interface ISSHConnectProgress {
	readonly connectionKey: string;
	readonly message: string;
}

/**
 * A single prompt within a keyboard-interactive authentication request.
 * Mirrors the shape ssh2 hands us — `echo: false` means the user input
 * should be hidden (typically a password).
 */
export interface ISSHKeyboardInteractivePrompt {
	readonly prompt: string;
	readonly echo: boolean;
}

/**
 * Request from the main process for the renderer to gather responses to
 * a keyboard-interactive auth challenge from the SSH server. The renderer
 * is expected to respond with {@link ISSHRemoteAgentHostMainService.respondKeyboardInteractive}
 * within a reasonable time, or the underlying SSH connect attempt will time out.
 */
export interface ISSHKeyboardInteractiveRequest {
	readonly requestId: string;
	readonly connectionKey: string;
	/** Display-friendly host (e.g. SSH config alias or `user@host`). */
	readonly displayHost: string;
	readonly username: string;
	/** Optional name field from the server (often empty). */
	readonly name: string;
	/** Optional instructions field from the server (often empty). */
	readonly instructions: string;
	readonly prompts: readonly ISSHKeyboardInteractivePrompt[];
}

/**
 * One live remote agent host endpoint the user could connect to, as
 * surfaced by `code agent endpoints` on the remote machine. Deliberately
 * excludes the raw {@link AgentHostEndpointAddress} details that aren't
 * useful for disambiguation (e.g. a socket path) but keeps enough
 * (server type, PID, quality, and a display form of the address) for the
 * renderer to build a fully localized, accessible label without needing
 * any pre-formatted string from the main process.
 */
export interface ISSHEndpointCandidate {
	readonly type: AgentHostServerType;
	readonly pid: number;
	readonly instanceId: string;
	readonly quality?: string;
	readonly endpoint: AgentHostEndpointAddress;
}

/**
 * Request from the main process for the renderer to choose which live
 * remote agent host endpoint (or "start a new one") to connect to. Fired
 * when the shared endpoint registry on the remote host contains at least
 * one `editor`-owned entry, since in that case silent reuse could steal a
 * session out from under another open editor window. The renderer is
 * expected to respond with {@link ISSHRemoteAgentHostMainService.respondEndpointSelection}.
 */
export interface ISSHEndpointSelectionRequest {
	readonly requestId: string;
	readonly connectionKey: string;
	/** Display-friendly host (e.g. SSH config alias or `user@host`). */
	readonly displayHost: string;
	/** Every live endpoint on the remote, both `editor`- and `standalone`-owned. */
	readonly candidates: readonly ISSHEndpointCandidate[];
}

/**
 * The renderer's answer to an {@link ISSHEndpointSelectionRequest}: either
 * attach to one of the offered live candidates (identified by its identity
 * triple, since PIDs alone are not stable across reuse), or spawn a new
 * dedicated standalone agent host.
 */
export type ISSHEndpointSelection =
	| { readonly kind: 'candidate'; readonly type: AgentHostServerType; readonly pid: number; readonly instanceId: string }
	| { readonly kind: 'spawn' };

/**
 * What the user's `known_hosts` files say about a presented host key. Mirrors
 * `KnownHostsMatch` in `../node/sshKnownHosts.js`, redeclared here because
 * this common-layer module cannot import from `node`.
 */
export type SSHKnownHostsMatch = 'match' | 'mismatch' | 'revoked' | 'ca-only' | 'unknown';

/**
 * Error name for a connect attempt refused because the server's host key was
 * not trusted. Matching on the name (rather than `instanceof`) is deliberate:
 * the error is raised in the shared process and inspected in the renderer, and
 * only `name`/`message` survive IPC serialization.
 */
export const SSH_HOST_KEY_DENIED_ERROR_NAME = 'SSHHostKeyDenied';

/**
 * Raised when host key verification refused the connection.
 *
 * The host key UI owns the conversation about *why* — either the user
 * declined the prompt themselves, or a specific, actionable notification
 * (with a "Forget Saved Host Key" action) is already on screen. Callers should
 * therefore not add a generic "failed to connect" error on top; see
 * {@link isSSHHostKeyDeniedError}.
 */
export class SSHHostKeyDeniedError extends Error {
	constructor(displayHost: string) {
		super(`Host key verification failed for ${displayHost}`);
		this.name = SSH_HOST_KEY_DENIED_ERROR_NAME;
	}
}

/** Whether `error` is an {@link SSHHostKeyDeniedError}, including across IPC. */
export function isSSHHostKeyDeniedError(error: unknown): boolean {
	return error instanceof Error && error.name === SSH_HOST_KEY_DENIED_ERROR_NAME;
}

/**
 * Request from the shared process for the renderer to decide whether a
 * server's host key should be trusted. Fired from ssh2's `hostVerifier` during
 * key exchange — that is, *before* authentication — so declining guarantees no
 * password or SSH agent access is ever exposed to an unverified server.
 *
 * The shared process only gathers evidence ({@link knownHostsMatch} and the
 * fingerprint); the renderer owns the actual policy, since it holds the trust
 * store and the UI. The renderer must answer via
 * {@link ISSHRemoteAgentHostMainService.respondHostKeyVerification} with the
 * same `requestId`, otherwise the connection stalls until the deadline.
 *
 * (`ISSHRemoteAgentHostMainService` is a misnomer inherited from its siblings:
 * it and the WSL/tunnel equivalents are all registered in `sharedProcessMain`,
 * so they run in the shared process, not the main process.)
 */
export interface ISSHHostKeyVerificationRequest {
	readonly requestId: string;
	readonly connectionKey: string;
	/** Display-friendly host (e.g. SSH config alias or `user@host`). */
	readonly displayHost: string;
	/** Resolved hostname the key was presented for. */
	readonly host: string;
	readonly port: number;
	/** Host key algorithm, e.g. `ssh-ed25519`. */
	readonly keyType: string;
	/** OpenSSH-style `SHA256:...` fingerprint, matching `ssh-keygen -lf`. */
	readonly fingerprint: string;
	/** What the user's `known_hosts` files say about this key. */
	readonly knownHostsMatch: SSHKnownHostsMatch;
	/** Resolved `StrictHostKeyChecking` from `ssh -G`, when recognized. */
	readonly strictHostKeyChecking?: SSHStrictHostKeyChecking;
	/**
	 * Whether the owning connect attempt was directly requested by the user.
	 * Background reconnects must never open a modal, so an unknown host key on
	 * a silent reconnect is declined rather than prompted for.
	 */
	readonly userInitiated: boolean;
}

/**
 * A host key proven to belong to an already-authenticated server, delivered
 * via OpenSSH's `UpdateHostKeys` extension (`hostkeys-00@openssh.com`). ssh2
 * completes the `hostkeys-prove-00@openssh.com` challenge and verifies the
 * signatures before surfacing these, so they can be trusted without prompting
 * — this is what lets a legitimate server key rotation be picked up silently
 * instead of surfacing as a scary mismatch.
 */
export interface ISSHHostKeysAnnouncement {
	readonly connectionKey: string;
	readonly host: string;
	readonly port: number;
	readonly keys: readonly { readonly keyType: string; readonly fingerprint: string }[];
}

/**
 * Main-process service that performs the actual SSH work.
 * The renderer calls this over IPC and handles registration
 * with {@link IRemoteAgentHostService} locally.
 */
export const ISSHRemoteAgentHostMainService = createDecorator<ISSHRemoteAgentHostMainService>('sshRemoteAgentHostMainService');

export interface ISSHRemoteAgentHostMainService {
	readonly _serviceBrand: undefined;

	/** Fires when the set of active SSH connections changes. */
	readonly onDidChangeConnections: Event<void>;

	/** Fires when a connection is closed from the shared process side. */
	readonly onDidCloseConnection: Event<string /* connectionId */>;

	/** Progress messages during connect (e.g. "Installing CLI..."). */
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress>;

	/** Fires when a message is received from a remote agent host via the SSH relay. */
	readonly onDidRelayMessage: Event<IRelayMessage>;

	/** Fires when a relay connection to a remote agent host closes. */
	readonly onDidRelayClose: Event<string /* connectionId */>;

	/**
	 * Fires when the SSH server requests keyboard-interactive auth (typically
	 * a password prompt). The renderer must answer via {@link respondKeyboardInteractive}
	 * with the same `requestId`, otherwise the auth attempt will hang until the
	 * SSH handshake deadline elapses.
	 */
	readonly onDidRequestKeyboardInteractive: Event<ISSHKeyboardInteractiveRequest>;

	/**
	 * Fires when a previously requested keyboard-interactive prompt is no
	 * longer needed (e.g. the underlying SSH connect attempt failed or was
	 * aborted). The renderer should dismiss any UI it opened for `requestId`.
	 */
	readonly onDidCancelKeyboardInteractive: Event<string /* requestId */>;

	/**
	 * Provide responses for a previously fired keyboard-interactive request.
	 * Pass `undefined` when the user cancels the prompt; this aborts the
	 * owning SSH connection attempt.
	 */
	respondKeyboardInteractive(requestId: string, responses: readonly string[] | undefined): Promise<void>;

	/**
	 * Fires when connect() discovers at least one live `editor`-owned
	 * endpoint on the remote and needs the renderer to choose which
	 * live endpoint (or "spawn new") to connect to. The renderer must
	 * answer via {@link respondEndpointSelection} with the same `requestId`.
	 */
	readonly onDidRequestEndpointSelection: Event<ISSHEndpointSelectionRequest>;

	/**
	 * Fires when a previously requested endpoint selection is no longer
	 * needed (e.g. the owning connect attempt failed or was aborted). The
	 * renderer should dismiss any picker UI it opened for `requestId`.
	 */
	readonly onDidCancelEndpointSelection: Event<string /* requestId */>;

	/**
	 * Provide the user's answer to a previously fired endpoint-selection
	 * request. Pass `undefined` when the user cancels the picker; this
	 * aborts the owning connect attempt with a cancellation error.
	 */
	respondEndpointSelection(requestId: string, selection: ISSHEndpointSelection | undefined): Promise<void>;

	/**
	 * Fires when a server presents a host key during key exchange and the
	 * renderer must decide whether to trust it. Answering is mandatory: until
	 * {@link respondHostKeyVerification} is called with the same `requestId`,
	 * the SSH handshake is suspended.
	 */
	readonly onDidRequestHostKeyVerification: Event<ISSHHostKeyVerificationRequest>;

	/**
	 * Fires when a previously requested host key verification is no longer
	 * needed (e.g. the owning connect attempt failed or was aborted). The
	 * renderer should dismiss any UI it opened for `requestId`.
	 */
	readonly onDidCancelHostKeyVerification: Event<string /* requestId */>;

	/**
	 * Provide the user's trust decision for a previously fired host key
	 * verification request. Passing `false` fails the key exchange, which
	 * tears the connection down before any authentication is attempted.
	 */
	respondHostKeyVerification(requestId: string, trusted: boolean): Promise<void>;

	/**
	 * Fires when a server announces its full set of host keys over an
	 * already-authenticated connection. See {@link ISSHHostKeysAnnouncement} —
	 * these keys are cryptographically proven, so consumers can persist them
	 * without prompting.
	 */
	readonly onDidAnnounceHostKeys: Event<ISSHHostKeysAnnouncement>;

	/**
	 * Bootstrap a remote agent host over SSH. Returns serializable
	 * connection info for the renderer to register.
	 */
	connect(config: ISSHAgentHostConfig): Promise<ISSHConnectResult>;

	/**
	 * Send a message to a remote agent host through the SSH relay.
	 */
	relaySend(connectionId: string, message: string): Promise<void>;

	/**
	 * Disconnect an SSH-bootstrapped connection by host address.
	 */
	disconnect(host: string): Promise<void>;

	/** List SSH config host aliases (excluding wildcards). */
	listSSHConfigHosts(): Promise<string[]>;

	/**
	 * Ensure `~/.ssh/config` exists (creating it with the right permissions if
	 * missing) and return its URI.
	 */
	ensureUserSSHConfig(): Promise<URI>;

	/** List the known SSH configuration file URIs (user config always included). */
	listSSHConfigFiles(): Promise<URI[]>;

	/** Resolve full SSH config for a host via `ssh -G`. */
	resolveSSHConfig(host: string): Promise<ISSHResolvedConfig>;

	/**
	 * Re-establish an SSH tunnel for a previously connected host.
	 * Resolves the SSH config alias, connects, and returns fresh
	 * connection info with a new local forwarded port.
	 *
	 * @param userInitiated See {@link ISSHAgentHostConfig.userInitiated}.
	 * Defaults to `true` (picker-eligible) when omitted.
	 * @param preferredAgentLocation See {@link ISSHAgentHostConfig.preferredAgentLocation}.
	 * The renderer computes this from its stored preference for this host's
	 * {@link computeSSHConnectionKey stable key} before calling reconnect.
	 */
	reconnect(sshConfigHost: string, name: string, remoteAgentHostCommand?: string, agentForward?: boolean, userInitiated?: boolean, preferredAgentLocation?: RemoteAgentHostLocationPreference): Promise<ISSHConnectResult>;
}
