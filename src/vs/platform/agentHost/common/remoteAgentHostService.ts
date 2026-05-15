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
	};

export namespace RemoteAgentHostConnectionStatus {
	/** Singleton "connected" status. */
	export const connected: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'connected' });
	/** Singleton "connecting" status. */
	export const connecting: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'connecting' });
	/** Singleton "disconnected" status. */
	export const disconnected: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'disconnected' });
	/** Build an "incompatible" status from a host-supplied message and the versions involved. */
	export function incompatible(message: string, supportedByClient: readonly string[], offeredByServer?: readonly string[]): RemoteAgentHostConnectionStatus {
		return Object.freeze({ kind: 'incompatible', message, supportedByClient, offeredByServer });
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
			return incompatible(err.message, supportedByClient, offeredByServer);
		}
		return undefined;
	}
}

/** Configuration key for the list of remote agent host addresses. */
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
	Tunnel = 'tunnel',
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

export type RemoteAgentHostConnection = IRemoteAgentHostWebSocketConnection | IRemoteAgentHostSSHConnection | IRemoteAgentHostTunnelConnection;

/** An entry in the {@link RemoteAgentHostsSettingId} setting. */
export interface IRemoteAgentHostEntry {
	readonly name: string;
	readonly connectionToken?: string;
	readonly connection: RemoteAgentHostConnection;
}

export function getEntryAddress(entry: IRemoteAgentHostEntry): string {
	switch (entry.connection.type) {
		case RemoteAgentHostEntryType.WebSocket:
		case RemoteAgentHostEntryType.SSH:
			return entry.connection.address;
		case RemoteAgentHostEntryType.Tunnel:
			return `${TUNNEL_ADDRESS_PREFIX}${entry.connection.tunnelId}`;
	}
}

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

	/** All configured remote agent host entries from settings, regardless of connection status. */
	readonly configuredEntries: readonly IRemoteAgentHostEntry[];

	/**
	 * Get a per-connection {@link IAgentConnection} for subscribing to
	 * state, dispatching actions, creating sessions, etc.
	 *
	 * Returns `undefined` if no active connection exists for the address.
	 */
	getConnection(address: string): IAgentConnection | undefined;

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
	 */
	addManagedConnection(entry: IRemoteAgentHostEntry, connection: IAgentConnection, transportDisposable?: IDisposable): Promise<IRemoteAgentHostConnectionInfo>;

	/**
	 * Look up the {@link IRemoteAgentHostEntry} for a given address.
	 * Checks both configured entries from settings and dynamically
	 * registered entries (e.g. tunnel connections).
	 */
	getEntryByAddress(address: string): IRemoteAgentHostEntry | undefined;
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
	async addRemoteAgentHost(): Promise<IRemoteAgentHostConnectionInfo> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
	async removeRemoteAgentHost(_address: string): Promise<void> { }
	reconnect(_address: string): void { }
	async addManagedConnection(): Promise<IRemoteAgentHostConnectionInfo> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
	getEntryByAddress(): IRemoteAgentHostEntry | undefined { return undefined; }
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

/** Raw shape of entries persisted in the {@link RemoteAgentHostsSettingId} setting. */
export interface IRawRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
	readonly connectionToken?: string;
	readonly sshConfigHost?: string;
	readonly sshHostName?: string;
	readonly sshUser?: string;
	readonly sshPort?: number;
}

export function rawEntryToEntry(raw: IRawRemoteAgentHostEntry): IRemoteAgentHostEntry | undefined {
	if (raw.sshConfigHost || raw.sshHostName || raw.sshUser || raw.sshPort) {
		return {
			name: raw.name,
			connectionToken: raw.connectionToken,
			connection: {
				type: RemoteAgentHostEntryType.SSH,
				address: raw.address,
				sshConfigHost: raw.sshConfigHost,
				hostName: raw.sshHostName ?? raw.address,
				user: raw.sshUser,
				port: raw.sshPort,
			},
		};
	}
	return {
		name: raw.name,
		connectionToken: raw.connectionToken,
		connection: {
			type: RemoteAgentHostEntryType.WebSocket,
			address: raw.address,
		},
	};
}

export function entryToRawEntry(entry: IRemoteAgentHostEntry): IRawRemoteAgentHostEntry | undefined {
	switch (entry.connection.type) {
		case RemoteAgentHostEntryType.SSH:
			return {
				address: entry.connection.address,
				name: entry.name,
				connectionToken: entry.connectionToken,
				sshConfigHost: entry.connection.sshConfigHost,
				sshHostName: entry.connection.hostName,
				sshUser: entry.connection.user,
				sshPort: entry.connection.port,
			};
		case RemoteAgentHostEntryType.WebSocket:
			return {
				address: entry.connection.address,
				name: entry.name,
				connectionToken: entry.connectionToken,
			};
		case RemoteAgentHostEntryType.Tunnel:
			return undefined;
	}
}
