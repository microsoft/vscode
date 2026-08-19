/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentConnection } from './agentService.js';
import type { UnsupportedProtocolVersionErrorData } from './state/protocol/errors.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from './state/sessionProtocol.js';
import { readUnsupportedProtocolVersionErrorMeta, type IVscodeUpgradeResult } from './state/protocolUpgrade.js';
import { TUNNEL_ADDRESS_PREFIX } from './tunnelAgentHost.js';

/**
 * Connection status for a remote agent host.
 *
 * Discriminated by `kind`. The `incompatible` variant carries the rejection
 * message returned by the host (typically when its protocol version is not
 * compatible with anything the client offered) so the UI can surface it.
 */
export type RemoteAgentHostConnectionStatus =
	| { readonly kind: 'connected' }
	| { readonly kind: 'connecting' }
	| { readonly kind: 'disconnected' }
	| {
		readonly kind: 'incompatible';
		/** Human-readable reason from the host (or a synthesised one when the host did not send one). */
		readonly message: string;
		/** Protocol versions the client offered. */
		readonly supportedByClient: readonly string[];
		/** Protocol versions the server reported it can speak, if available. */
		readonly offeredByServer?: readonly string[];
		/**
		 * JSON-RPC method the server has advertised via `_meta` that the
		 * client may invoke to ask the hosting CLI to upgrade the server.
		 * Set only when the server was spawned by a VS Code CLI willing
		 * to receive upgrade signals.
		 */
		readonly vscodeUpgradeMethod?: string;
	};

export namespace RemoteAgentHostConnectionStatus {
	/** Singleton "connected" status. */
	export const connected: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'connected' });
	/** Singleton "connecting" status. */
	export const connecting: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'connecting' });
	/** Singleton "disconnected" status. */
	export const disconnected: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'disconnected' });
	/** Build an "incompatible" status from a host-supplied message and the versions involved. */
	export function incompatible(message: string, supportedByClient: readonly string[], offeredByServer?: readonly string[], vscodeUpgradeMethod?: string): RemoteAgentHostConnectionStatus {
		return Object.freeze({ kind: 'incompatible', message, supportedByClient, offeredByServer, vscodeUpgradeMethod });
	}
	/** Whether the connection is fully established and ready for traffic. */
	export function isConnected(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'connected';
	}
	/** Whether the connection is mid-handshake. */
	export function isConnecting(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'connecting';
	}
	/** Whether the connection is in the plain disconnected state. */
	export function isDisconnected(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'disconnected';
	}
	/** Whether the connection rejected our protocol version. */
	export function isIncompatible(status: RemoteAgentHostConnectionStatus | undefined): status is RemoteAgentHostConnectionStatus & { kind: 'incompatible' } {
		return status?.kind === 'incompatible';
	}
	/** Whether the connection is anything except `connected`. */
	export function isUnavailable(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind !== 'connected';
	}
	/**
	 * If `err` is a protocol-version mismatch reported by an agent host
	 * during the `initialize` handshake, returns an `incompatible` status
	 * carrying the host's message. Returns `undefined` otherwise so callers
	 * can fall back to their existing failure handling.
	 */
	export function fromConnectError(err: unknown, supportedByClient: readonly string[]): RemoteAgentHostConnectionStatus | undefined {
		if (err instanceof ProtocolError && err.code === AHP_UNSUPPORTED_PROTOCOL_VERSION) {
			const data = err.data as Partial<UnsupportedProtocolVersionErrorData> | undefined;
			const offeredByServer = Array.isArray(data?.supportedVersions) ? data.supportedVersions : undefined;
			const vscodeUpgradeMethod = readUnsupportedProtocolVersionErrorMeta(err.data)?.vscodeUpgradeMethod;
			return incompatible(err.message, supportedByClient, offeredByServer, vscodeUpgradeMethod);
		}
		return undefined;
	}
}

/** Configuration key for the list of WebSocket remote agent host addresses. */
export const RemoteAgentHostsSettingId = 'chat.remoteAgentHosts';

/** Configuration key to enable remote agent host connections. */
export const RemoteAgentHostsEnabledSettingId = 'chat.remoteAgentHostsEnabled';

/**
 * Configuration key that controls whether online dev tunnels and
 * configured SSH remote agent hosts are auto-connected at startup.
 */
export const RemoteAgentHostAutoConnectSettingId = 'chat.remoteAgentHostsAutoConnect';

export const enum RemoteAgentHostEntryType {
	WebSocket = 'websocket',
	SSH = 'ssh',
	WSL = 'wsl',
	Tunnel = 'tunnel',
	CloudSandbox = 'cloudSandbox',
}

export interface IRemoteAgentHostWebSocketConnection {
	readonly type: RemoteAgentHostEntryType.WebSocket;
	readonly address: string;
}

export interface IRemoteAgentHostSSHConnection {
	readonly type: RemoteAgentHostEntryType.SSH;
	/**
	 * The WebSocket address used by the agent host protocol client to
	 * communicate with the remote agent host process. This is typically a
	 * forwarded local port (e.g. `localhost:4321`) established by the SSH
	 * tunnel — it is NOT the SSH hostname itself.
	 */
	readonly address: string;
	/**
	 * SSH config host alias (e.g. `myserver`). When set, the SSH tunnel is
	 * automatically re-established on startup using the user's SSH config.
	 * This takes precedence over {@link hostName} when constructing the
	 * VS Code Remote SSH authority.
	 */
	readonly sshConfigHost?: string;
	/**
	 * The actual SSH hostname or IP address of the remote machine
	 * (e.g. `myserver.example.com`). This is the host that the SSH
	 * client connects to, and is used to construct the VS Code Remote
	 * SSH authority when {@link sshConfigHost} is not available.
	 */
	readonly hostName: string;
	/** SSH username for the remote machine. */
	readonly user?: string;
	/** SSH port on the remote machine (default 22). */
	readonly port?: number;
}

export interface IRemoteAgentHostTunnelConnection {
	readonly type: RemoteAgentHostEntryType.Tunnel;
	/** Dev tunnel ID. */
	readonly tunnelId: string;
	/** Dev tunnel cluster region. */
	readonly clusterId: string;
	/**
	 * User-defined display name for this tunnel (derived from tunnel tags).
	 * Used as the tunnel name in the VS Code Remote Tunnels authority
	 * (e.g. `tunnel+<label>`). Falls back to {@link tunnelId} if not set.
	 */
	readonly label?: string;
	/** Auth provider used to connect to this tunnel. */
	readonly authProvider?: 'github' | 'microsoft';
}

export interface IRemoteAgentHostWSLConnection {
	readonly type: RemoteAgentHostEntryType.WSL;
	/** Display address: `wsl:<distro>`. */
	readonly address: string;
	/** WSL distro name (e.g. `Ubuntu-22.04`). */
	readonly distro: string;
}

/**
 * A connection to a Copilot cloud "sandbox" environment (agent integration slug
 * `copilot-developer-cli`), reached over a Mission Control-brokered Azure Web
 * PubSub relay. Not persisted to settings — the connection is established
 * on demand with freshly-minted, short-lived credentials.
 */
export interface IRemoteAgentHostCloudSandboxConnection {
	readonly type: RemoteAgentHostEntryType.CloudSandbox;
	/** Synthesized display address: `cloudsandbox:<environmentId>`. */
	readonly address: string;
	/** Stable Mission Control environment identifier (`env_<uuid>`). */
	readonly environmentId: string;
	/** The cloud session/task id this connection is for, when known. */
	readonly sessionId?: string;
}

export type RemoteAgentHostConnection = IRemoteAgentHostWebSocketConnection | IRemoteAgentHostSSHConnection | IRemoteAgentHostWSLConnection | IRemoteAgentHostTunnelConnection | IRemoteAgentHostCloudSandboxConnection;

/** A configured remote agent host entry. WebSocket entries are persisted in {@link RemoteAgentHostsSettingId}; SSH entries are persisted in storage. */
export interface IRemoteAgentHostEntry {
	readonly name: string;
	readonly connectionToken?: string;
	readonly connection: RemoteAgentHostConnection;
}

/** Raw shape of persisted remote agent host entries. */
export interface IRawRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
	readonly connectionToken?: string;
	readonly sshConfigHost?: string;
	readonly sshHostName?: string;
	readonly sshUser?: string;
	readonly sshPort?: number;
}

/** Where durable copies of a remote agent host entry live. */
export type RemoteAgentHostEntryStore = 'settings' | 'storage' | 'runtime';

/**
 * Static, per-connection-type description of how an entry is addressed,
 * persisted and connected. Collects the behavioural differences between
 * transports into one table so the service does not branch on
 * {@link RemoteAgentHostEntryType} in a dozen places.
 */
interface IRemoteAgentHostEntryTypeConfigBase<TConnection extends RemoteAgentHostConnection> {
	readonly type: TConnection['type'];
	/**
	 * Whether RemoteAgentHostService dials this entry itself. When `false`,
	 * an owning transport service establishes the connection and registers
	 * it via `addManagedConnection`.
	 */
	readonly selfConnecting: boolean;
	/** Whether the address is subject to `normalizeRemoteAgentHostAddress`. */
	readonly normalizedAddress: boolean;
	/** Stable identity for the entry. */
	address(connection: TConnection): string;
}

/**
 * An entry type with a durable home. Narrowing a config on
 * `store !== 'runtime'` guarantees both converters are present.
 */
export interface IPersistedEntryTypeConfig<TConnection extends RemoteAgentHostConnection = RemoteAgentHostConnection> extends IRemoteAgentHostEntryTypeConfigBase<TConnection> {
	readonly store: 'settings' | 'storage';
	/** Serialize for persistence. */
	toRaw(entry: IRemoteAgentHostEntry, connection: TConnection): IRawRemoteAgentHostEntry;
	/** Rehydrate from persisted form. */
	fromRaw(raw: IRawRemoteAgentHostEntry): IRemoteAgentHostEntry;
}

/** An entry type that lives only for the lifetime of its connection and is never written to disk. */
interface IRuntimeEntryTypeConfig<TConnection extends RemoteAgentHostConnection = RemoteAgentHostConnection> extends IRemoteAgentHostEntryTypeConfigBase<TConnection> {
	readonly store: 'runtime';
	readonly toRaw?: never;
	readonly fromRaw?: never;
}

export type IRemoteAgentHostEntryTypeConfig<TConnection extends RemoteAgentHostConnection = RemoteAgentHostConnection> =
	IPersistedEntryTypeConfig<TConnection> | IRuntimeEntryTypeConfig<TConnection>;

export const WEBSOCKET_ENTRY_TYPE_CONFIG: IPersistedEntryTypeConfig<IRemoteAgentHostWebSocketConnection> = {
	type: RemoteAgentHostEntryType.WebSocket,
	store: 'settings',
	selfConnecting: true,
	normalizedAddress: true,
	address: connection => connection.address,
	toRaw: (entry, connection) => ({
		address: connection.address, name: entry.name, connectionToken: entry.connectionToken,
	}),
	fromRaw: raw => ({ name: raw.name, connectionToken: raw.connectionToken, connection: { type: RemoteAgentHostEntryType.WebSocket, address: raw.address } }),
};

export const SSH_ENTRY_TYPE_CONFIG: IPersistedEntryTypeConfig<IRemoteAgentHostSSHConnection> = {
	type: RemoteAgentHostEntryType.SSH,
	store: 'storage',
	selfConnecting: false,
	normalizedAddress: true,
	address: connection => connection.address,
	toRaw: (entry, connection) => ({
		address: connection.address, name: entry.name, connectionToken: entry.connectionToken,
		sshConfigHost: connection.sshConfigHost, sshHostName: connection.hostName, sshUser: connection.user, sshPort: connection.port,
	}),
	fromRaw: raw => ({
		name: raw.name, connectionToken: raw.connectionToken,
		connection: { type: RemoteAgentHostEntryType.SSH, address: raw.address, sshConfigHost: raw.sshConfigHost, hostName: raw.sshHostName ?? raw.address, user: raw.sshUser, port: raw.sshPort },
	}),
};

function runtimeEntryTypeConfig<TConnection extends RemoteAgentHostConnection>(type: TConnection['type'], normalizedAddress: boolean, address: (connection: TConnection) => string): IRuntimeEntryTypeConfig<TConnection> {
	return { type, store: 'runtime', selfConnecting: false, normalizedAddress, address };
}

const WSL_ENTRY_TYPE_CONFIG = runtimeEntryTypeConfig<IRemoteAgentHostWSLConnection>(RemoteAgentHostEntryType.WSL, true, connection => connection.address);
const TUNNEL_ENTRY_TYPE_CONFIG = runtimeEntryTypeConfig<IRemoteAgentHostTunnelConnection>(RemoteAgentHostEntryType.Tunnel, false, connection => `${TUNNEL_ADDRESS_PREFIX}${connection.tunnelId}`);
const CLOUD_SANDBOX_ENTRY_TYPE_CONFIG = runtimeEntryTypeConfig<IRemoteAgentHostCloudSandboxConnection>(RemoteAgentHostEntryType.CloudSandbox, true, connection => connection.address);

const ENTRY_TYPE_CONFIGS: { readonly [K in RemoteAgentHostEntryType]: IRemoteAgentHostEntryTypeConfig<Extract<RemoteAgentHostConnection, { type: K }>> } = {
	[RemoteAgentHostEntryType.WebSocket]: WEBSOCKET_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.SSH]: SSH_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.WSL]: WSL_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.Tunnel]: TUNNEL_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.CloudSandbox]: CLOUD_SANDBOX_ENTRY_TYPE_CONFIG,
};

/** Gets the static persistence and connection policy for an entry type. */
export function getEntryTypeConfig(type: RemoteAgentHostEntryType): IRemoteAgentHostEntryTypeConfig {
	return ENTRY_TYPE_CONFIGS[type] as IRemoteAgentHostEntryTypeConfig;
}

export function getEntryAddress(entry: IRemoteAgentHostEntry): string {
	return getEntryTypeConfig(entry.connection.type).address(entry.connection);
}

export function remoteAgentHostLogOutputChannelId(address: string): string {
	return `agentHost.otlp.${address}`;
}

/**
 * Output channel id for the local agent host process logger (forwarded
 * from the utility process via `RemoteLoggerChannelClient`). Matches the
 * logger id registered in `agentHostMain.ts`.
 */
export const AGENT_HOST_LOG_OUTPUT_CHANNEL_ID = 'agenthost';

export const enum RemoteAgentHostInputValidationError {
	Empty = 'empty',
	Invalid = 'invalid',
}

export interface IParsedRemoteAgentHostInput {
	readonly address: string;
	readonly connectionToken?: string;
	readonly suggestedName: string;
}

export type RemoteAgentHostInputParseResult =
	| { readonly parsed: IParsedRemoteAgentHostInput; readonly error?: undefined }
	| { readonly parsed?: undefined; readonly error: RemoteAgentHostInputValidationError };

export const IRemoteAgentHostService = createDecorator<IRemoteAgentHostService>('remoteAgentHostService');

/**
 * Manages connections to one or more remote agent host processes over
 * WebSocket. Each connection is identified by its address string and
 * exposed as an {@link IAgentConnection}, the same interface used for
 * the local agent host.
 */
export interface IRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when a remote connection is established or lost. */
	readonly onDidChangeConnections: Event<void>;

	/** Currently connected remote addresses with metadata. */
	readonly connections: readonly IRemoteAgentHostConnectionInfo[];

	/** All configured remote agent host entries, regardless of connection status. */
	readonly configuredEntries: readonly IRemoteAgentHostEntry[];

	/**
	 * Get a per-connection {@link IAgentConnection} for subscribing to
	 * state, dispatching actions, creating sessions, etc.
	 *
	 * Returns `undefined` if no active connection exists for the address.
	 */
	getConnection(address: string): IAgentConnection | undefined;

	/**
	 * Get a per-connection {@link IAgentConnection} by its sanitized
	 * connection authority (as produced by `agentHostAuthority`), rather than
	 * its raw address. Useful for callers that only have the authority
	 * component of a remote session URI scheme (`remote-<authority>-<provider>`).
	 *
	 * Returns `undefined` if no active connection matches the authority.
	 */
	getConnectionByAuthority(authority: string): IAgentConnection | undefined;

	/**
	 * Adds or updates a configured remote host and resolves once a connection
	 * to that host is available.
	 */
	addRemoteAgentHost(entry: IRemoteAgentHostEntry): Promise<IRemoteAgentHostConnectionInfo>;

	/**
	 * Removes a configured remote host entry by address.
	 * Disconnects any active connection and removes the entry from settings.
	 */
	removeRemoteAgentHost(address: string): Promise<void>;

	/**
	 * Forcefully reconnect to a configured remote host.
	 * Tears down any existing connection and starts a fresh connect attempt
	 * with reset backoff.
	 */
	reconnect(address: string): void;

	/**
	 * Register a pre-connected agent connection.
	 * Used by the SSH and tunnel services to inject relay-backed connections
	 * without going through the WebSocket connect flow.
	 *
	 * The optional `transportDisposable` represents the underlying transport
	 * (e.g. an SSH tunnel relay or tunnel-relay session) and is owned by this
	 * service for the lifetime of the entry. It will be disposed when:
	 *   - the entry is removed via {@link removeRemoteAgentHost}
	 *   - the entry is reconciled away (config-driven removal)
	 *   - this service itself is disposed
	 * Callers should put any teardown that needs to happen on entry removal
	 * (e.g. closing the shared-process tunnel, dropping renderer-side handles)
	 * into this disposable, so a single removal path tears down the whole stack.
	 *
	 * `status` defaults to `connected`. Pass `incompatible` when the managed
	 * transport is alive but the protocol handshake rejected the client version;
	 * this keeps recovery actions (such as server upgrade) addressable without
	 * exposing the connection as ready for session traffic.
	 */
	addManagedConnection(entry: IRemoteAgentHostEntry, connection: IAgentConnection, transportDisposable?: IDisposable, status?: RemoteAgentHostConnectionStatus): Promise<IRemoteAgentHostConnectionInfo>;

	/**
	 * Force the protocol client at `address` (if any) to treat its
	 * transport as closed. Used by services that learn about a
	 * connection loss out-of-band — e.g. the SSH service receiving an
	 * `onDidCloseConnection` IPC event from the shared process — to
	 * make sure the renderer-side client doesn't sit in `Connected`
	 * waiting on its watchdog. The watchdog is a `setTimeout` and
	 * Chromium aggressively throttles those in backgrounded windows,
	 * so we can't rely on it as the sole death-detection path.
	 *
	 * No-op if no active entry exists for the address, or if the
	 * existing client has already transitioned out of `Connected`.
	 */
	notifyConnectionClosed(address: string): void;

	/**
	 * Look up the {@link IRemoteAgentHostEntry} for a given address.
	 * Checks both configured entries from settings and dynamically
	 * registered entries (e.g. tunnel connections).
	 */
	getEntryByAddress(address: string): IRemoteAgentHostEntry | undefined;

	/**
	 * Ask the remote agent host to upgrade itself via its hosting CLI.
	 *
	 * Sends the host-advertised JSON-RPC method (typically
	 * `_vscodeUpgrade`) on the existing transport — even when the handshake
	 * has not completed (e.g. the host was just rejected for protocol
	 * incompatibility). The hosting CLI receives the signal, checks for a
	 * newer build, and kills+respawns the server on success. The caller
	 * SHOULD then reconnect to re-attempt the handshake.
	 *
	 * Resolves with the host's status payload describing what happened
	 * (whether an upgrade was needed, whether it was started); rejects on
	 * transport failure, timeout, or a JSON-RPC error response.
	 */
	triggerServerUpgrade(address: string, method: string): Promise<IVscodeUpgradeResult>;
}

/** Metadata about a single remote connection. */
export interface IRemoteAgentHostConnectionInfo {
	readonly address: string;
	readonly name: string;
	readonly clientId: string;
	readonly defaultDirectory?: string;
	readonly status: RemoteAgentHostConnectionStatus;
}

export class NullRemoteAgentHostService implements IRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly connections: readonly IRemoteAgentHostConnectionInfo[] = [];
	readonly configuredEntries: readonly IRemoteAgentHostEntry[] = [];
	getConnection(): IAgentConnection | undefined { return undefined; }
	getConnectionByAuthority(): IAgentConnection | undefined { return undefined; }
	async addRemoteAgentHost(): Promise<IRemoteAgentHostConnectionInfo> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
	async removeRemoteAgentHost(_address: string): Promise<void> { }
	reconnect(_address: string): void { }
	notifyConnectionClosed(_address: string): void { }
	async addManagedConnection(): Promise<IRemoteAgentHostConnectionInfo> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
	getEntryByAddress(): IRemoteAgentHostEntry | undefined { return undefined; }
	async triggerServerUpgrade(): Promise<IVscodeUpgradeResult> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
}

export function parseRemoteAgentHostInput(input: string): RemoteAgentHostInputParseResult {
	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return { error: RemoteAgentHostInputValidationError.Empty };
	}

	const candidate = extractRemoteAgentHostCandidate(trimmedInput);
	if (!candidate) {
		return { error: RemoteAgentHostInputValidationError.Invalid };
	}

	const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate);
	try {
		const url = new URL(hasExplicitScheme ? candidate : `ws://${candidate}`);
		const normalizedProtocol = normalizeRemoteAgentHostProtocol(url.protocol);
		if (!normalizedProtocol || !url.host) {
			return { error: RemoteAgentHostInputValidationError.Invalid };
		}

		const connectionToken = url.searchParams.get(connectionTokenQueryName) ?? undefined;
		url.searchParams.delete(connectionTokenQueryName);

		// Only preserve wss: in the address - the transport defaults to ws:
		const address = formatRemoteAgentHostAddress(url, normalizedProtocol === 'wss:' ? normalizedProtocol : undefined);
		if (!address) {
			return { error: RemoteAgentHostInputValidationError.Invalid };
		}

		return {
			parsed: {
				address,
				connectionToken,
				suggestedName: url.host,
			},
		};
	} catch {
		return { error: RemoteAgentHostInputValidationError.Invalid };
	}
}

function extractRemoteAgentHostCandidate(input: string): string | undefined {
	const urlMatch = input.match(/(?<url>(?:https?|wss?):\/\/\S+)/i);
	const candidate = urlMatch?.groups?.url ?? input;
	const trimmedCandidate = candidate.trim().replace(/[),.;\]]+$/, '');
	return trimmedCandidate || undefined;
}

function normalizeRemoteAgentHostProtocol(protocol: string): 'ws:' | 'wss:' | undefined {
	switch (protocol.toLowerCase()) {
		case 'ws:':
		case 'http:':
			return 'ws:';
		case 'wss:':
		case 'https:':
			return 'wss:';
		default:
			return undefined;
	}
}

function formatRemoteAgentHostAddress(url: URL, protocol: 'ws:' | 'wss:' | undefined): string | undefined {
	if (!url.host) {
		return undefined;
	}

	const path = url.pathname !== '/' ? url.pathname : '';
	const query = url.search;
	const base = protocol ? `${protocol}//${url.host}` : url.host;
	return `${base}${path}${query}`;
}

/**
 * Parses an entry persisted before each store became type-specific, when a
 * single flat shape held both WebSocket and SSH entries and the variant had
 * to be inferred from which `ssh*` fields were present. Used only by the
 * migration path.
 */
export function parseLegacyRawEntry(raw: IRawRemoteAgentHostEntry): IRemoteAgentHostEntry {
	if (raw.sshConfigHost !== undefined || raw.sshHostName !== undefined || raw.sshUser !== undefined || raw.sshPort !== undefined) {
		return SSH_ENTRY_TYPE_CONFIG.fromRaw(raw);
	}
	return WEBSOCKET_ENTRY_TYPE_CONFIG.fromRaw(raw);
}
