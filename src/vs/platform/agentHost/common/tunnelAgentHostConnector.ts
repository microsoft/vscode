/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import {
	createTunnelGatewaySelectionRejectedError,
	parseTunnelGatewayInventory,
	parseTunnelGatewaySelectionResponse,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_AGENT_HOST_PORT,
	TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION,
	TUNNEL_GATEWAY_SELECT_PATH,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
	type ITunnelConnectResult,
	type ITunnelGatewayInventory,
	type ITunnelGatewaySelection,
	type ITunnelGatewaySelectionSession,
	type ITunnelInfo,
	type ITunnelRelayMessage,
} from './tunnelAgentHost.js';
import type { ITunnelDuplexStream, ITunnelMessageSocket, ITunnelSocketCloseEvent } from './tunnelMessageSocket.js';

const LOG_PREFIX = '[TunnelAgentHost]';
const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Per-step timeout for dev-tunnel relay and socket operations.
 */
export const TUNNEL_STEP_TIMEOUT_MS = 30_000;

/**
 * A minimal tunnel descriptor that is independent of the dev-tunnels SDK.
 */
export interface ITunnelDescriptor {
	readonly tunnelId?: string;
	readonly clusterId?: string;
	readonly name?: string;
	readonly labels?: readonly string[];
	readonly status?: {
		readonly hostConnectionCount?: number | { readonly current?: number };
	};
}

/**
 * The relay client used to connect a resolved dev tunnel to its agent-host port.
 */
export interface ITunnelRelayClient extends IDisposable {
	connect(): Promise<void>;
	waitForForwardedPort(port: number): Promise<void>;
	connectToForwardedPort(port: number): Promise<ITunnelDuplexStream>;
}

/**
 * A resolved tunnel and its configured relay client.
 */
export interface ITunnelRelayClientSession {
	readonly tunnel: ITunnelDescriptor;
	createRelayClient(): Promise<ITunnelRelayClient>;
}

/**
 * Resolves a dev tunnel before its relay client is created.
 */
export interface ITunnelRelayClientFactory {
	getTunnel(tunnelId: string, clusterId: string, authProvider: 'github' | 'microsoft', token: string): Promise<ITunnelRelayClientSession | undefined>;
}

/**
 * Opens a message socket over a tunnel relay stream.
 */
export interface ITunnelSocketFactory {
	open(stream: ITunnelDuplexStream, path: string): Promise<ITunnelMessageSocket>;
}

/**
 * Logging methods required by the connector.
 */
export interface ITunnelAgentHostConnectorLogService {
	info(message: string): void;
	warn(message: string): void;
}

/**
 * Runs an operation with a named deadline.
 */
export async function withTimeout<T>(
	op: () => Promise<T>,
	timeoutMs: number,
	stepName: string,
): Promise<T> {
	let timedOut = false;
	const result = await raceTimeout(op(), timeoutMs, () => { timedOut = true; });
	if (timedOut) {
		throw new Error(`${LOG_PREFIX} ${stepName} timed out after ${timeoutMs}ms`);
	}
	return result as T;
}

/**
 * Derives the tunnel connection token used by the CLI and desktop clients.
 */
export async function deriveConnectionToken(tunnelId: string): Promise<string> {
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tunnelId)));
	let result = '';

	for (let index = 0; index < hash.length; index += 3) {
		const first = hash[index];
		const second = hash[index + 1];
		const third = hash[index + 2];

		result += BASE64_URL_ALPHABET[first >> 2];
		result += BASE64_URL_ALPHABET[(first & 0b00000011) << 4 | (second ?? 0) >> 4];
		if (second !== undefined) {
			result += BASE64_URL_ALPHABET[(second & 0b00001111) << 2 | (third ?? 0) >> 6];
		}
		if (third !== undefined) {
			result += BASE64_URL_ALPHABET[third & 0b00111111];
		}
	}

	return result.startsWith('-') ? `a${result}` : result;
}

/**
 * Maps a dev-tunnels descriptor to the tunnel information shared with clients.
 */
export function parseTunnelInfo(tunnel: ITunnelDescriptor): ITunnelInfo | undefined {
	const labels = tunnel.labels ?? [];
	const tags = new TunnelTags(labels);
	if (tags.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
		return undefined;
	}

	const { tunnelId, clusterId } = tunnel;
	if (!tunnelId || !clusterId) {
		return undefined;
	}

	const rawCount = tunnel.status?.hostConnectionCount;
	return {
		tunnelId,
		clusterId,
		name: tags.name || tunnel.name || tunnelId,
		tags: labels,
		protocolVersion: tags.protocolVersion,
		hostConnectionCount: typeof rawCount === 'number' ? rawCount : (rawCount?.current ?? 0),
	};
}

/**
 * A gateway selection that owns its socket and relay until completed or cancelled.
 */
export class PendingGatewaySelection implements IDisposable {
	private _disposed = false;
	private readonly _onSocketClosedListener: IDisposable;

	constructor(
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string,
		readonly socket: ITunnelMessageSocket,
		readonly relayClient: ITunnelRelayClient,
		private readonly _onUnexpectedClose: () => void,
	) {
		this._onSocketClosedListener = this.socket.onDidClose(() => {
			if (!this._disposed) {
				this._onUnexpectedClose();
			}
		});
	}

	/** Transfers socket ownership to an active connection. */
	detach(): void {
		this._onSocketClosedListener.dispose();
	}

	dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this._onSocketClosedListener.dispose();
			try {
				this.socket.close();
			} catch {
				// ignore — best-effort cleanup
			}
			try {
				this.socket.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
			try {
				this.relayClient.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
		}
	}
}

class TunnelConnection extends Disposable {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;
	private _closed = false;

	constructor(
		readonly connectionId: string,
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string,
		private readonly _socket: ITunnelMessageSocket,
		private readonly _relayClient: ITunnelRelayClient,
		onMessage: (message: string) => void,
		onSocketClose: (event: ITunnelSocketCloseEvent) => void,
	) {
		super();
		this._register(this._socket.onDidReceiveMessage(onMessage));
		this._register(this._socket.onDidClose(event => {
			onSocketClose(event);
			this.dispose();
		}));
	}

	relaySend(data: string): void {
		this._socket.send(data);
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._socket.close();
			this._socket.dispose();
			this._relayClient.dispose();
			this._onDidClose.fire();
		}
		super.dispose();
	}
}

/**
 * Coordinates dev-tunnel relay connection and gateway selection over injected transports.
 */
export class TunnelAgentHostConnector extends Disposable {
	private readonly _onDidRelayMessage = this._register(new Emitter<ITunnelRelayMessage>());
	readonly onDidRelayMessage: Event<ITunnelRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	private readonly _connections = this._register(new DisposableMap<string, TunnelConnection>());
	private readonly _pendingSelections = this._register(new DisposableMap<string, PendingGatewaySelection>());

	constructor(
		private readonly _relayClientFactory: ITunnelRelayClientFactory,
		private readonly _socketFactory: ITunnelSocketFactory,
		private readonly _logService: ITunnelAgentHostConnectorLogService,
	) {
		super();
	}

	async connect(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelConnectResult> {
		this.closeTunnelConnections(tunnelId, 'reconnecting');
		this._logService.info(`${LOG_PREFIX} Connecting to tunnel ${tunnelId} in cluster ${clusterId}...`);

		const session = await this._relayClientFactory.getTunnel(tunnelId, clusterId, authProvider, token);
		if (!session) {
			throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
		}

		const { tunnel } = session;
		const relayClient = await session.createRelayClient();
		let portStream: ITunnelDuplexStream;
		try {
			await withTimeout(() => relayClient.connect(), TUNNEL_STEP_TIMEOUT_MS, 'tunnel relay connect');
			this._logService.info(`${LOG_PREFIX} Tunnel relay connected, waiting for port ${TUNNEL_AGENT_HOST_PORT}...`);
			await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			this._logService.info(`${LOG_PREFIX} Connected to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
		} catch (err) {
			this._disposeRelayClient(relayClient);
			throw err;
		}

		const connectionToken = await deriveConnectionToken(tunnelId);
		const name = new TunnelTags(tunnel.labels).name || tunnel.name || tunnelId;
		const connectionId = generateUuid();
		let socket: ITunnelMessageSocket;
		try {
			socket = await withTimeout(
				() => this._socketFactory.open(portStream, `/?tkn=${encodeURIComponent(connectionToken)}`),
				TUNNEL_STEP_TIMEOUT_MS,
				'WebSocket relay open',
			);
			this._logService.info(`${LOG_PREFIX} WebSocket relay connected to agent host via tunnel`);
		} catch (err) {
			this._disposeRelayClient(relayClient);
			throw err;
		}

		this._createConnection(connectionId, `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`, name, connectionToken, socket, relayClient);
		return {
			connectionId,
			address: `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`,
			name,
			connectionToken,
			selected: { serverType: 'unknown', instanceId: '', role: 'primary', lifecycle: 'external' },
		};
	}

	async prepareSelection(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelGatewaySelectionSession | undefined> {
		const session = await this._relayClientFactory.getTunnel(tunnelId, clusterId, authProvider, token);
		if (!session) {
			throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
		}

		const { tunnel } = session;
		const tags = new TunnelTags(tunnel.labels);
		if (tags.protocolVersion < TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION) {
			return undefined;
		}

		this._logService.info(`${LOG_PREFIX} Preparing gateway selection for tunnel ${tunnelId} in cluster ${clusterId}...`);
		const relayClient = await session.createRelayClient();
		let socket: ITunnelMessageSocket;
		try {
			await withTimeout(() => relayClient.connect(), TUNNEL_STEP_TIMEOUT_MS, 'tunnel relay connect');
			await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			const portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			socket = await withTimeout(() => this._socketFactory.open(portStream, TUNNEL_GATEWAY_SELECT_PATH), TUNNEL_STEP_TIMEOUT_MS, 'gateway selection WebSocket open');
		} catch (err) {
			this._disposeRelayClient(relayClient);
			throw err;
		}

		let inventoryText: string;
		try {
			inventoryText = await withTimeout(() => this._readNextGatewayMessage(socket), TUNNEL_STEP_TIMEOUT_MS, 'gateway inventory message');
		} catch (err) {
			this._disposeSocket(socket);
			this._disposeRelayClient(relayClient);
			throw err;
		}

		let inventory: ITunnelGatewayInventory;
		let connectionToken: string;
		try {
			inventory = parseTunnelGatewayInventory(inventoryText);
			connectionToken = await deriveConnectionToken(tunnelId);
		} catch (err) {
			this._disposeSocket(socket);
			this._disposeRelayClient(relayClient);
			throw err;
		}

		const selectionId = generateUuid();
		this._pendingSelections.set(selectionId, new PendingGatewaySelection(
			`${TUNNEL_ADDRESS_PREFIX}${tunnelId}`,
			tags.name || tunnel.name || tunnelId,
			connectionToken,
			socket,
			relayClient,
			() => {
				this._logService.warn(`${LOG_PREFIX} Gateway selection WebSocket for ${selectionId} closed before a selection was made`);
				this._pendingSelections.deleteAndDispose(selectionId);
			},
		));
		return { selectionId, inventory };
	}

	async completeSelection(selectionId: string, selection: ITunnelGatewaySelection): Promise<ITunnelConnectResult> {
		const pending = this._pendingSelections.deleteAndLeak(selectionId);
		if (!pending) {
			throw new Error(`${LOG_PREFIX} No pending gateway selection with id ${selectionId}`);
		}
		pending.detach();

		let response: ReturnType<typeof parseTunnelGatewaySelectionResponse>;
		try {
			pending.socket.send(JSON.stringify(selection));
			const responseText = await withTimeout(() => this._readNextGatewayMessage(pending.socket), TUNNEL_STEP_TIMEOUT_MS, 'gateway selection acknowledgement');
			response = parseTunnelGatewaySelectionResponse(responseText);
		} catch (err) {
			this._disposeSocket(pending.socket);
			this._disposeRelayClient(pending.relayClient);
			throw err;
		}

		if (!response.ok) {
			this._disposeSocket(pending.socket);
			this._disposeRelayClient(pending.relayClient);
			throw createTunnelGatewaySelectionRejectedError(`${LOG_PREFIX} ${response.error}`);
		}

		const connectionId = generateUuid();
		this._createConnection(connectionId, pending.address, pending.name, pending.connectionToken, pending.socket, pending.relayClient);
		this._logService.info(`${LOG_PREFIX} Gateway selection ${selectionId} completed: selected ${response.selected.serverType} ${response.selected.instanceId}`);
		return { connectionId, address: pending.address, name: pending.name, connectionToken: pending.connectionToken, selected: response.selected };
	}

	async cancelSelection(selectionId: string): Promise<void> {
		this._pendingSelections.deleteAndDispose(selectionId);
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		this._connections.get(connectionId)?.relaySend(message);
	}

	async disconnect(connectionId: string): Promise<void> {
		this._connections.deleteAndDispose(connectionId);
	}

	closeTunnelConnections(tunnelId: string, operation: 'deleting' | 'reconnecting'): void {
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		for (const [connectionId, connection] of this._connections) {
			if (connection.address === address) {
				this._logService.info(`${LOG_PREFIX} Closing existing relay for tunnel ${tunnelId} before ${operation}`);
				this._connections.deleteAndDispose(connectionId);
			}
		}
	}

	/** Registers a pending selection without creating a relay for unit tests. */
	setPendingGatewaySelectionForTests(selectionId: string, pending: PendingGatewaySelection): void {
		this._pendingSelections.set(selectionId, pending);
	}

	/** Removes and disposes a pending selection for unit tests. */
	deletePendingGatewaySelectionForTests(selectionId: string): void {
		this._pendingSelections.deleteAndDispose(selectionId);
	}

	private _createConnection(connectionId: string, address: string, name: string, connectionToken: string, socket: ITunnelMessageSocket, relayClient: ITunnelRelayClient): void {
		const connection = new TunnelConnection(
			connectionId,
			address,
			name,
			connectionToken,
			socket,
			relayClient,
			data => this._onDidRelayMessage.fire({ connectionId, data }),
			event => this._logService.info(`${LOG_PREFIX} WebSocket relay closed for connection ${connectionId}; code=${event.code}, reason=${event.reason || '(empty)'}`),
		);
		const onConnectionClose = connection.onDidClose(() => {
			onConnectionClose.dispose();
			this._connections.deleteAndLeak(connectionId);
			this._onDidRelayClose.fire(connectionId);
		});
		this._connections.set(connectionId, connection);
	}

	private _readNextGatewayMessage(socket: ITunnelMessageSocket): Promise<string> {
		return new Promise((resolve, reject) => {
			const subscriptions: IDisposable[] = [];
			let settled = false;
			const cleanup = () => {
				for (const subscription of subscriptions.splice(0)) {
					subscription.dispose();
				}
			};
			const onMessage = socket.onDidReceiveMessage(message => {
				if (settled) {
					return;
				}
				settled = true;
				cleanup();
				resolve(message);
			});
			if (settled) {
				onMessage.dispose();
				return;
			}
			subscriptions.push(onMessage);
			const onClose = socket.onDidClose(event => {
				if (settled) {
					return;
				}
				settled = true;
				cleanup();
				if (event.error) {
					reject(event.error);
				} else {
					reject(new Error(`${LOG_PREFIX} Gateway WebSocket closed before expected message; code=${event.code}, reason=${event.reason || '(empty)'}`));
				}
			});
			if (settled) {
				onClose.dispose();
			} else {
				subscriptions.push(onClose);
			}
		});
	}

	private _disposeSocket(socket: ITunnelMessageSocket): void {
		try {
			socket.close();
		} catch {
			// ignore — best-effort cleanup
		}
		try {
			socket.dispose();
		} catch {
			// ignore — best-effort cleanup
		}
	}

	private _disposeRelayClient(relayClient: ITunnelRelayClient): void {
		try {
			relayClient.dispose();
		} catch {
			// ignore — best-effort cleanup
		}
	}
}
