/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentConnection } from './agentService.js';
import { TUNNEL_ADDRESS_PREFIX } from './tunnelAgentHost.js';

/** Connection status for a remote agent host. */
export const enum RemoteAgentHostConnectionStatus {
	Connected = 'connected',
	Connecting = 'connecting',
	Disconnected = 'disconnected',
}

/** Configuration key for the list of remote agent host addresses. */
export const RemoteAgentHostsSettingId = 'chat.remoteAgentHosts';

/** Configuration key to enable remote agent host connections. */
export const RemoteAgentHostsEnabledSettingId = 'chat.remoteAgentHostsEnabled';

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
	readonly address: string;
	/** SSH config host alias — if set, the tunnel is re-established on startup. */
	readonly sshConfigHost?: string;
}

export interface IRemoteAgentHostTunnelConnection {
	readonly type: RemoteAgentHostEntryType.Tunnel;
	/** Dev tunnel ID. */
	readonly tunnelId: string;
	/** Dev tunnel cluster region. */
	readonly clusterId: string;
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
	 */
	addSSHConnection(entry: IRemoteAgentHostEntry, connection: IAgentConnection): Promise<IRemoteAgentHostConnectionInfo>;
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
	async addSSHConnection(): Promise<IRemoteAgentHostConnectionInfo> {
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

/** Raw shape of entries persisted in the {@link RemoteAgentHostsSettingId} setting. */
export interface IRawRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
	readonly connectionToken?: string;
	readonly sshConfigHost?: string;
}

export function rawEntryToEntry(raw: IRawRemoteAgentHostEntry): IRemoteAgentHostEntry | undefined {
	if (raw.sshConfigHost) {
		return {
			name: raw.name,
			connectionToken: raw.connectionToken,
			connection: {
				type: RemoteAgentHostEntryType.SSH,
				address: raw.address,
				sshConfigHost: raw.sshConfigHost,
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
