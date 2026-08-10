/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tunnel } from '@microsoft/dev-tunnels-contracts';
import type { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { createHash } from 'crypto';
import type WebSocket from 'ws';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { raceTimeout } from '../../../base/common/async.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import {
	createTunnelGatewaySelectionRejectedError,
	ITunnelAgentHostMainService,
	parseTunnelGatewayInventory,
	parseTunnelGatewaySelectionResponse,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_AGENT_HOST_PORT,
	TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION,
	TUNNEL_GATEWAY_SELECT_PATH,
	TUNNEL_LAUNCHER_LABEL,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
	type ITunnelConnectResult,
	type ITunnelGatewaySelection,
	type ITunnelGatewaySelectionSession,
	type ITunnelInfo,
	type ITunnelRelayMessage,
} from '../common/tunnelAgentHost.js';

const LOG_PREFIX = '[TunnelAgentHost]';

/**
 * Per-step timeout for the dev-tunnels SDK calls inside {@link TunnelAgentHostMainService.connect}.
 *
 * Without this, a silently dropped network (TCP half-open, host gone but relay still
 * accepting our messages) can leave `relayClient.connect()`,
 * `waitForForwardedPort()`, `connectToForwardedPort()`, or the WebSocket `'open'`
 * event pending forever — which in turn hangs the renderer's
 * `_tunnelService.connect(...)` await, leaving the per-host `_pendingConnects`
 * flag set and effectively disabling auto-reconnect for the lifetime of the
 * shared process.
 */
export const TUNNEL_STEP_TIMEOUT_MS = 30_000;

export async function withTimeout<T>(
	op: () => Promise<T>,
	timeoutMs: number,
	stepName: string,
): Promise<T> {
	// Use raceTimeout so the timer is cleared in `finally` once `op` settles
	// (avoids stray timers across frequent reconnect attempts). The void-return
	// disambiguation is handled by the onTimeout callback flag below.
	let timedOut = false;
	const result = await raceTimeout(op(), timeoutMs, () => { timedOut = true; });
	if (timedOut) {
		throw new Error(`${LOG_PREFIX} ${stepName} timed out after ${timeoutMs}ms`);
	}
	return result as T;
}

/**
 * Derive a connection token from a tunnel ID using the same convention
 * as the VS Code CLI (see `get_connection_token` in cli/src/commands/tunnels.rs).
 */
function deriveConnectionToken(tunnelId: string): string {
	const hash = createHash('sha256');
	hash.update(tunnelId);
	let result = hash.digest('base64url');
	if (result.startsWith('-')) {
		result = `a${result}`;
	}
	return result;
}

function rawGatewayDataToString(data: WebSocket.RawData): string {
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString();
	} else if (data instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(data)).toString();
	}
	return data.toString();
}

/** State for a single active tunnel relay connection. */
class TunnelConnection extends Disposable {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _closed = false;

	constructor(
		readonly connectionId: string,
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string,
		private readonly _relay: { send: (data: string) => void; close: () => void },
		private readonly _relayClient: { dispose(): void },
	) {
		super();
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._relay.close();
			this._relayClient.dispose();
			this._onDidClose.fire();
		}
		super.dispose();
	}

	relaySend(data: string): void {
		this._relay.send(data);
	}
}

/**
 * A protocol-v6 gateway selection that has been prepared (relay connected,
 * selection WebSocket open, inventory received) but not yet completed. Owns
 * the gateway WebSocket and relay client until either
 * {@link TunnelAgentHostMainService.completeSelection} takes over ownership
 * via {@link detach}, or this is disposed (cancellation, or the socket
 * closing unexpectedly before a selection was made).
 */
export class PendingGatewaySelection implements IDisposable {
	private _disposed = false;
	private readonly _onSocketClosed = () => {
		if (!this._disposed) {
			this._onUnexpectedClose();
		}
	};

	constructor(
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string,
		readonly ws: WebSocket,
		readonly relayClient: { dispose(): void },
		private readonly _onUnexpectedClose: () => void,
	) {
		this.ws.once('close', this._onSocketClosed);
	}

	/** Detach the auto-cleanup listener so ownership of the socket can transfer to a live {@link TunnelConnection}. */
	detach(): void {
		this.ws.off('close', this._onSocketClosed);
	}

	dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this.ws.off('close', this._onSocketClosed);
			try {
				this.ws.close();
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

export class TunnelAgentHostMainService extends Disposable implements ITunnelAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRelayMessage = this._register(new Emitter<ITunnelRelayMessage>());
	readonly onDidRelayMessage: Event<ITunnelRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	private readonly _connections = new Map<string, TunnelConnection>();
	private readonly _pendingSelections = this._register(new DisposableMap<string, PendingGatewaySelection>());

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async listTunnels(token: string, authProvider: 'github' | 'microsoft', additionalTunnelNames?: string[]): Promise<ITunnelInfo[]> {
		const client = await this._createManagementClient(token, authProvider);
		const results: ITunnelInfo[] = [];
		const seen = new Set<string>();

		try {
			// Enumerate all tunnels with the vscode-server-launcher label
			const tunnels = await client.listTunnels(undefined, undefined, {
				labels: [TUNNEL_LAUNCHER_LABEL],
				requireAllLabels: true,
				includePorts: true,
				tokenScopes: ['connect'],
			});

			for (const tunnel of tunnels) {
				const info = this._parseTunnelInfo(tunnel);
				if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION) {
					results.push(info);
					seen.add(info.tunnelId);
				}
			}
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to enumerate tunnels`, err);
		}

		// Look up additional tunnels by name
		if (additionalTunnelNames) {
			for (const tunnelName of additionalTunnelNames) {
				try {
					const [tunnel] = await client.listTunnels(undefined, undefined, {
						labels: [tunnelName, TUNNEL_LAUNCHER_LABEL],
						requireAllLabels: true,
						includePorts: true,
						tokenScopes: ['connect'],
						limit: 1,
					});
					if (tunnel) {
						const info = this._parseTunnelInfo(tunnel);
						if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION && !seen.has(info.tunnelId)) {
							results.push(info);
							seen.add(info.tunnelId);
						}
					}
				} catch (err) {
					this._logService.warn(`${LOG_PREFIX} Failed to look up tunnel '${tunnelName}'`, err);
				}
			}
		}

		this._logService.info(`${LOG_PREFIX} Found ${results.length} tunnel(s) with agent host support`);
		return results;
	}

	async deleteTunnel(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<void> {
		const client = await this._createManagementClient(token, authProvider);
		const tunnel: Tunnel = { tunnelId, clusterId };
		this._logService.info(`${LOG_PREFIX} Deleting tunnel ${tunnelId} in cluster ${clusterId}...`);
		await client.deleteTunnel(tunnel);

		// Tear the relays down only once the tunnel is actually gone. Closing
		// them first reports a disconnect while the tunnel is still cached,
		// which lets an auto-reconnect be scheduled against a tunnel that is
		// midway through being deleted — and needlessly drops a live
		// connection if the delete then fails.
		this._closeTunnelConnections(tunnelId, 'deleting');
		this._logService.info(`${LOG_PREFIX} Deleted tunnel ${tunnelId}`);
	}

	async connect(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelConnectResult> {
		this._closeTunnelConnections(tunnelId, 'reconnecting');

		const client = await this._createManagementClient(token, authProvider);
		const connectionId = generateUuid();
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;

		this._logService.info(`${LOG_PREFIX} Connecting to tunnel ${tunnelId} in cluster ${clusterId}...`);

		// Get the full tunnel with endpoints and access tokens
		const tunnel: Tunnel = { tunnelId, clusterId };
		const resolved = await client.getTunnel(tunnel, {
			includePorts: true,
			tokenScopes: ['connect'],
		});

		if (!resolved) {
			throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
		}

		// Connect to the tunnel relay
		const { TunnelRelayTunnelClient } = await import('@microsoft/dev-tunnels-connections');
		const relayClient = new TunnelRelayTunnelClient(client);
		relayClient.acceptLocalConnectionsForForwardedPorts = false;
		if (resolved.endpoints) {
			relayClient.endpoints = resolved.endpoints;
		}

		// Bound each SDK step. A silently dead network can leave any of these
		// pending forever, which would hang the renderer's
		// `_tunnelService.connect(...)` await and prevent auto-reconnect from
		// re-arming until the app is restarted.
		let portStream: NodeJS.ReadWriteStream;
		try {
			await withTimeout(() => relayClient.connect(resolved), TUNNEL_STEP_TIMEOUT_MS, 'tunnel relay connect');
			this._logService.info(`${LOG_PREFIX} Tunnel relay connected, waiting for port ${TUNNEL_AGENT_HOST_PORT}...`);

			// Wait for the agent host port to become available
			await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);

			// Connect to the forwarded port — returns a Duplex stream
			portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			this._logService.info(`${LOG_PREFIX} Connected to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
		} catch (err) {
			// Clean up the dev-tunnels relay client so we don't leak an
			// orphan client when the SDK call hangs or fails.
			try {
				relayClient.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
			throw err;
		}

		// Derive connection token from tunnel ID (matches CLI convention)
		const connectionToken = deriveConnectionToken(tunnelId);

		// Parse display name from tags
		const tags = new TunnelTags(resolved.labels);
		const name = tags.name || resolved.name || tunnelId;

		// Create WebSocket over the port stream
		let relay: { send: (data: string) => void; close: () => void };
		try {
			relay = await withTimeout(
				() => this._createWebSocketRelay(portStream, connectionToken, connectionId),
				TUNNEL_STEP_TIMEOUT_MS,
				'WebSocket relay open',
			);
		} catch (err) {
			try {
				relayClient.dispose();
			} catch {
				// ignore
			}
			throw err;
		}

		const conn = new TunnelConnection(
			connectionId,
			address,
			name,
			connectionToken,
			relay,
			relayClient,
		);

		// Self-disposing: Emitter.dispose() clears listeners without marking
		// previously returned subscription handles as disposed, so this must
		// dispose its own handle once it fires to avoid tripping the
		// disposable leak tracker in tests that exercise a full connection.
		const onConnClose = conn.onDidClose(() => {
			onConnClose.dispose();
			this._connections.delete(connectionId);
			this._onDidRelayClose.fire(connectionId);
		});

		this._connections.set(connectionId, conn);
		return {
			connectionId, address, name, connectionToken,
			// Legacy v5 tunnels have no gateway inventory, so `connect` always
			// reuses a single deterministic target with no picker involved.
			selected: { serverType: 'unknown', instanceId: '', role: 'primary', lifecycle: 'external' },
		};
	}

	async prepareSelection(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelGatewaySelectionSession | undefined> {
		const client = await this._createManagementClient(token, authProvider);
		const tunnel: Tunnel = { tunnelId, clusterId };
		const resolved = await client.getTunnel(tunnel, {
			includePorts: true,
			tokenScopes: ['connect'],
		});
		if (!resolved) {
			throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
		}

		const tags = new TunnelTags(resolved.labels);
		if (tags.protocolVersion < TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION) {
			// Caller must fall back to the legacy `connect()`, which
			// preserves the v5 direct-reuse behavior with no picker.
			return undefined;
		}

		this._logService.info(`${LOG_PREFIX} Preparing gateway selection for tunnel ${tunnelId} in cluster ${clusterId}...`);

		const { TunnelRelayTunnelClient } = await import('@microsoft/dev-tunnels-connections');
		const relayClient = new TunnelRelayTunnelClient(client);
		relayClient.acceptLocalConnectionsForForwardedPorts = false;
		if (resolved.endpoints) {
			relayClient.endpoints = resolved.endpoints;
		}

		let ws: WebSocket;
		try {
			await withTimeout(() => relayClient.connect(resolved), TUNNEL_STEP_TIMEOUT_MS, 'tunnel relay connect');
			await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			const portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
			ws = await withTimeout(() => this._openGatewaySelectSocket(portStream), TUNNEL_STEP_TIMEOUT_MS, 'gateway selection WebSocket open');
		} catch (err) {
			try {
				relayClient.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
			throw err;
		}

		let inventoryText: string;
		try {
			inventoryText = await withTimeout(() => this._readNextGatewayMessage(ws), TUNNEL_STEP_TIMEOUT_MS, 'gateway inventory message');
		} catch (err) {
			try {
				ws.close();
			} catch {
				// ignore — best-effort cleanup
			}
			try {
				relayClient.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
			throw err;
		}

		const inventory = parseTunnelGatewayInventory(inventoryText);
		const connectionToken = deriveConnectionToken(tunnelId);
		const name = tags.name || resolved.name || tunnelId;
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		const selectionId = generateUuid();

		this._pendingSelections.set(selectionId, new PendingGatewaySelection(
			address, name, connectionToken, ws, relayClient,
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
		// Ownership of the WebSocket/relay client has transferred to us: stop
		// treating an unexpected close as "cancelled before selecting".
		pending.detach();

		const { ws, relayClient, address, name, connectionToken } = pending;

		let responseText: string;
		try {
			ws.send(JSON.stringify(selection));
			responseText = await withTimeout(() => this._readNextGatewayMessage(ws), TUNNEL_STEP_TIMEOUT_MS, 'gateway selection acknowledgement');
		} catch (err) {
			try {
				ws.close();
			} catch {
				// ignore — best-effort cleanup
			}
			try {
				relayClient.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
			throw err;
		}

		const response = parseTunnelGatewaySelectionResponse(responseText);
		if (!response.ok) {
			// The selected entry disappeared, or the CLI otherwise rejected
			// the selection (e.g. its socket was already gone). Close
			// everything rather than silently substituting another target —
			// but tag the error so the caller can tell this apart from an
			// unreachable tunnel and pick a different endpoint itself.
			try {
				ws.close();
			} catch {
				// ignore — best-effort cleanup
			}
			try {
				relayClient.dispose();
			} catch {
				// ignore — best-effort cleanup
			}
			throw createTunnelGatewaySelectionRejectedError(`${LOG_PREFIX} ${response.error}`);
		}

		const connectionId = generateUuid();
		const relay = this._attachRelaySteadyStateHandlers(ws, connectionId);
		const conn = new TunnelConnection(connectionId, address, name, connectionToken, relay, relayClient);

		// Self-disposing: see the matching comment in connect().
		const onConnClose = conn.onDidClose(() => {
			onConnClose.dispose();
			this._connections.delete(connectionId);
			this._onDidRelayClose.fire(connectionId);
		});

		this._connections.set(connectionId, conn);
		this._logService.info(`${LOG_PREFIX} Gateway selection ${selectionId} completed: selected ${response.selected.serverType} ${response.selected.instanceId}`);

		return { connectionId, address, name, connectionToken, selected: response.selected };
	}

	async cancelSelection(selectionId: string): Promise<void> {
		this._pendingSelections.deleteAndDispose(selectionId);
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		const conn = this._connections.get(connectionId);
		if (conn) {
			conn.relaySend(message);
		}
	}

	async disconnect(connectionId: string): Promise<void> {
		const conn = this._connections.get(connectionId);
		if (conn) {
			conn.dispose();
		}
	}

	private async _createManagementClient(token: string, authProvider: 'github' | 'microsoft'): Promise<TunnelManagementHttpClient> {
		const mgmt = await import('@microsoft/dev-tunnels-management');
		const authHeader = authProvider === 'github' ? `github ${token}` : `Bearer ${token}`;

		return new mgmt.TunnelManagementHttpClient(
			'vscode-sessions',
			mgmt.ManagementApiVersions.Version20230927preview,
			async () => authHeader,
		);
	}

	private _closeTunnelConnections(tunnelId: string, operation: 'deleting' | 'reconnecting'): void {
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		for (const [connectionId, connection] of this._connections) {
			if (connection.address === address) {
				this._logService.info(`${LOG_PREFIX} Closing existing relay for tunnel ${tunnelId} before ${operation}`);
				this._connections.delete(connectionId);
				connection.dispose();
			}
		}
	}

	private _parseTunnelInfo(tunnel: Tunnel): ITunnelInfo | undefined {
		const labels = tunnel.labels ?? [];
		const tags = new TunnelTags(labels);

		if (tags.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
			return undefined;
		}

		const tunnelId = tunnel.tunnelId;
		const clusterId = tunnel.clusterId;
		if (!tunnelId || !clusterId) {
			return undefined;
		}

		const name = tags.name || tunnel.name || tunnelId;
		const rawCount = tunnel.status?.hostConnectionCount;
		const hostConnectionCount = typeof rawCount === 'number' ? rawCount : (rawCount?.current ?? 0);
		return {
			tunnelId,
			clusterId,
			name,
			tags: labels,
			protocolVersion: tags.protocolVersion,
			hostConnectionCount,
		};
	}

	private async _createWebSocketRelay(
		portStream: NodeJS.ReadWriteStream,
		connectionToken: string,
		connectionId: string,
	): Promise<{ send: (data: string) => void; close: () => void }> {
		const WS = await import('ws');

		return new Promise((resolve, reject) => {
			// Construct WebSocket URL — the stream is already connected to the right port
			let url = `ws://localhost:${TUNNEL_AGENT_HOST_PORT}`;
			if (connectionToken) {
				url += `?tkn=${encodeURIComponent(connectionToken)}`;
			}

			// Create WebSocket over the existing stream from the tunnel relay
			const ws = new WS.WebSocket(url, {
				createConnection: (() => portStream) as unknown as WebSocket.ClientOptions['createConnection'],
			});

			ws.on('open', () => {
				this._logService.info(`${LOG_PREFIX} WebSocket relay connected to agent host via tunnel`);
				resolve(this._attachRelaySteadyStateHandlers(ws, connectionId));
			});

			ws.on('error', (wsErr: unknown) => {
				this._logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
				reject(wsErr);
			});
		});
	}

	/**
	 * Attach the steady-state message-pump handlers ('message'/'close') to an
	 * already-open agent host WebSocket, shared between the legacy
	 * direct-reuse relay and the protocol-v6 gateway relay (which reuses the
	 * same WebSocket used for inventory/selection once a selection succeeds).
	 */
	private _attachRelaySteadyStateHandlers(ws: WebSocket, connectionId: string): { send: (data: string) => void; close: () => void } {
		ws.on('message', (data: WebSocket.RawData) => {
			this._onDidRelayMessage.fire({ connectionId, data: rawGatewayDataToString(data) });
		});

		ws.on('close', (code: number, reason: Buffer) => {
			this._logService.info(`${LOG_PREFIX} WebSocket relay closed for connection ${connectionId}; code=${code}, reason=${reason?.toString() || '(empty)'}`);
			const conn = this._connections.get(connectionId);
			if (conn) {
				conn.dispose();
			}
		});

		return {
			send: (data: string) => {
				if (ws.readyState === ws.OPEN) {
					ws.send(data);
				}
			},
			close: () => ws.close(),
		};
	}

	/**
	 * Open the protocol-v6 gateway's selection WebSocket route over an
	 * already-connected tunnel port stream. No `?tkn=` query parameter is
	 * needed: connections arriving through the tunnel relay bypass the
	 * gateway's loopback per-request token check entirely (only used for
	 * the local, non-tunneled accept loop on the CLI side).
	 */
	private async _openGatewaySelectSocket(portStream: NodeJS.ReadWriteStream): Promise<WebSocket> {
		const WS = await import('ws');

		return new Promise((resolve, reject) => {
			const url = `ws://localhost:${TUNNEL_AGENT_HOST_PORT}${TUNNEL_GATEWAY_SELECT_PATH}`;
			const ws = new WS.WebSocket(url, {
				createConnection: (() => portStream) as unknown as WebSocket.ClientOptions['createConnection'],
			});

			const onError = (wsErr: unknown) => reject(wsErr);
			ws.once('open', () => {
				ws.off('error', onError);
				resolve(ws);
			});
			ws.once('error', onError);
		});
	}

	/**
	 * Await exactly one message on a gateway WebSocket — used to read the
	 * one-time inventory message and, later, the one-time selection
	 * acknowledgement, both of which precede the raw AHP frame-proxying
	 * phase that reuses the same socket.
	 */
	private _readNextGatewayMessage(ws: WebSocket): Promise<string> {
		return new Promise((resolve, reject) => {
			const cleanup = () => {
				ws.off('message', onMessage);
				ws.off('close', onClose);
				ws.off('error', onError);
			};
			const onMessage = (data: WebSocket.RawData) => {
				cleanup();
				resolve(rawGatewayDataToString(data));
			};
			const onClose = (code: number, reason: Buffer) => {
				cleanup();
				reject(new Error(`${LOG_PREFIX} Gateway WebSocket closed before expected message; code=${code}, reason=${reason?.toString() || '(empty)'}`));
			};
			const onError = (wsErr: unknown) => {
				cleanup();
				reject(wsErr);
			};
			ws.once('message', onMessage);
			ws.once('close', onClose);
			ws.once('error', onError);
		});
	}
}

/**
 * Test-only seam: register a pending gateway selection directly, bypassing
 * the dev-tunnels SDK connection steps in {@link TunnelAgentHostMainService.prepareSelection},
 * so {@link TunnelAgentHostMainService.completeSelection} and {@link TunnelAgentHostMainService.cancelSelection}
 * can be unit tested against fake WebSocket-like streams.
 */
export function setPendingGatewaySelectionForTests(
	service: TunnelAgentHostMainService,
	selectionId: string,
	pending: PendingGatewaySelection,
): void {
	(service as unknown as { _pendingSelections: DisposableMap<string, PendingGatewaySelection> })._pendingSelections.set(selectionId, pending);
}

/**
 * Test-only seam: remove (and dispose) a pending gateway selection directly,
 * mirroring what the real unexpected-close handler in {@link TunnelAgentHostMainService.prepareSelection}
 * does, so tests can simulate that wiring without depending on the dev-tunnels SDK.
 */
export function deletePendingGatewaySelectionForTests(
	service: TunnelAgentHostMainService,
	selectionId: string,
): void {
	(service as unknown as { _pendingSelections: DisposableMap<string, PendingGatewaySelection> })._pendingSelections.deleteAndDispose(selectionId);
}
