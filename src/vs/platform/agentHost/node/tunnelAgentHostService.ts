/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tunnel } from '@microsoft/dev-tunnels-contracts';
import type { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { createHash } from 'crypto';
import type WebSocket from 'ws';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { raceTimeout } from '../../../base/common/async.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import {
	ITunnelAgentHostMainService,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_AGENT_HOST_PORT,
	TUNNEL_LAUNCHER_LABEL,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
	type ITunnelConnectResult,
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

export class TunnelAgentHostMainService extends Disposable implements ITunnelAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRelayMessage = this._register(new Emitter<ITunnelRelayMessage>());
	readonly onDidRelayMessage: Event<ITunnelRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	private readonly _connections = new Map<string, TunnelConnection>();

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

	async connect(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelConnectResult> {
		// Tear down any existing connection to this tunnel first.
		// Each connect() call creates a fresh relay with its own protocol
		// session, so the old one must be closed to avoid conflicts.
		for (const [id, conn] of this._connections) {
			if (conn.address === `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`) {
				this._logService.info(`${LOG_PREFIX} Closing existing relay for tunnel ${tunnelId} before reconnecting`);
				this._connections.delete(id);
				conn.dispose();
				break;
			}
		}

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

		conn.onDidClose(() => {
			this._connections.delete(connectionId);
			this._onDidRelayClose.fire(connectionId);
		});

		this._connections.set(connectionId, conn);
		return { connectionId, address, name, connectionToken };
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
				resolve({
					send: (data: string) => {
						if (ws.readyState === ws.OPEN) {
							ws.send(data);
						}
					},
					close: () => ws.close(),
				});
			});

			ws.on('message', (data: WebSocket.RawData) => {
				let text: string;
				if (Array.isArray(data)) {
					text = Buffer.concat(data).toString();
				} else if (data instanceof ArrayBuffer) {
					text = Buffer.from(new Uint8Array(data)).toString();
				} else {
					text = data.toString();
				}
				this._onDidRelayMessage.fire({ connectionId, data: text });
			});

			ws.on('close', (code: number, reason: Buffer) => {
				this._logService.info(`${LOG_PREFIX} WebSocket relay closed for connection ${connectionId}; code=${code}, reason=${reason?.toString() || '(empty)'}`);
				const conn = this._connections.get(connectionId);
				if (conn) {
					conn.dispose();
				}
			});

			ws.on('error', (wsErr: unknown) => {
				this._logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
				reject(wsErr);
			});
		});
	}
}
