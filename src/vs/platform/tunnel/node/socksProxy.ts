/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { Emitter, Event } from '../../../base/common/event.js';
import { findFreePortFaster } from '../../../base/node/ports.js';
import { NodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { addressMatchesSet } from '../common/tunnel.js';

/**
 * A function that opens a TCP tunnel to a given host:port through the
 * remote agent.
 */
export interface ITunnelConnectFn {
	(host: string, port: number): Promise<{ getSocket(): ISocket; readEntireBuffer(): VSBuffer; dispose(): void }>;
}

// SOCKS5 protocol constants
const SOCKS_VERSION = 0x05;
const AUTH_NONE = 0x00;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;
const REP_SUCCESS = 0x00;
const REP_GENERAL_FAILURE = 0x01;
const REP_HOST_UNREACHABLE = 0x04;

/**
 * A SOCKS5 proxy server that acts as a smart router for browser view
 * traffic in remote workspaces.
 *
 * - Destinations in the {@link _allowlist} (forwarded ports) are tunneled
 *   through the remote agent via {@link _connectTunnel}.
 * - All other destinations are connected directly (local network).
 *
 * This means ALL traffic goes through the proxy (set via Chromium's
 * `session.setProxy()`), but only forwarded-port traffic actually
 * traverses the remote tunnel. The proxy tracks which connections were
 * tunneled vs direct so consumers can determine the routing state of
 * any page.
 *
 * The server binds exclusively to `127.0.0.1` and uses no
 * authentication (SOCKS5 method 0x00).
 */
export class SocksProxy extends Disposable {
	private _server: net.Server | undefined;
	private _localPort: number = 0;

	/**
	 * Set of allowed destinations in `"host:port"` format. Only
	 * connections to destinations in this set are tunneled through the
	 * remote agent; all others connect directly.
	 */
	private readonly _allowlist = new Set<string>();

	/**
	 * Active tunneled connections, refcounted by `host:port`.
	 * When the count drops to zero the key is removed. This is the
	 * authoritative source of truth for what is *currently* being
	 * routed through the remote agent.
	 */
	private readonly _activeTunneled = new Map<string, number>();

	/**
	 * Active direct connections, refcounted by `host:port`.
	 */
	private readonly _activeDirect = new Map<string, number>();

	private readonly _onDidChangeActiveConnections = this._register(new Emitter<void>());

	/**
	 * Fires whenever a tunneled or direct connection opens or closes.
	 * Consumers can read {@link activeTunneledHosts} and
	 * {@link activeDirectHosts} for the current state.
	 */
	readonly onDidChangeActiveConnections: Event<void> = this._onDidChangeActiveConnections.event;

	/**
	 * The set of `host:port` strings with at least one active connection
	 * routed through the remote agent tunnel.
	 */
	get activeTunneledHosts(): ReadonlySet<string> {
		return new Set(this._activeTunneled.keys());
	}

	/**
	 * The set of `host:port` strings with at least one active connection
	 * routed directly (local network).
	 */
	get activeDirectHosts(): ReadonlySet<string> {
		return new Set(this._activeDirect.keys());
	}

	get localPort(): number {
		return this._localPort;
	}

	constructor(
		private readonly _connectTunnel: ITunnelConnectFn,
		private readonly _logService: ILogService,
	) {
		super();
	}

	/**
	 * Start the SOCKS5 proxy on a free port on 127.0.0.1.
	 * Returns the local port.
	 */
	async start(): Promise<number> {
		const server = net.createServer(socket => this._onConnection(socket));
		this._server = server;

		server.on('error', err => {
			this._logService.error('[SocksProxy] Server error:', err);
		});

		const port = await findFreePortFaster(0, 2, 1000, '127.0.0.1');
		server.listen(port, '127.0.0.1');
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		const address = server.address() as net.AddressInfo;
		this._localPort = address.port;
		this._logService.info(`[SocksProxy] Listening on socks5://127.0.0.1:${this._localPort}`);

		return this._localPort;
	}

	override dispose(): void {
		this._server?.close();
		super.dispose();
	}

	/**
	 * Replace the set of allowed destinations.
	 * @param destinations Array of `{host, port}` that the proxy should
	 *   forward. All other destinations will connect directly.
	 */
	updateAllowlist(destinations: ReadonlyArray<{ host: string; port: number }>): void {
		this._allowlist.clear();
		for (const { host, port } of destinations) {
			this._allowlist.add(`${host}:${port}`);
		}
		this._logService.trace(`[SocksProxy] Allowlist updated: ${this._allowlist.size} destinations`);
	}

	private _isAllowed(host: string, port: number): boolean {
		return addressMatchesSet(host, port, this._allowlist);
	}

	private _trackConnection(key: string, tunneled: boolean, client: net.Socket): void {
		const map = tunneled ? this._activeTunneled : this._activeDirect;
		map.set(key, (map.get(key) ?? 0) + 1);
		this._onDidChangeActiveConnections.fire();

		const onClose = () => {
			const count = (map.get(key) ?? 1) - 1;
			if (count <= 0) {
				map.delete(key);
			} else {
				map.set(key, count);
			}
			this._onDidChangeActiveConnections.fire();
		};
		client.once('close', onClose);
	}

	/**
	 * Handle a new client connection. Implements the SOCKS5 handshake
	 * (RFC 1928) with no-auth, then tunnels allowed CONNECT requests
	 * through the remote agent.
	 */
	private async _onConnection(client: net.Socket): Promise<void> {
		try {
			// --- Phase 1: Method negotiation ---
			const greeting = await this._read(client, 2);
			if (greeting[0] !== SOCKS_VERSION) {
				client.destroy();
				return;
			}
			const nMethods = greeting[1];
			const methods = await this._read(client, nMethods);

			// We only support no-auth (0x00)
			if (!methods.includes(AUTH_NONE)) {
				client.write(Buffer.from([SOCKS_VERSION, 0xFF])); // no acceptable methods
				client.end();
				return;
			}
			client.write(Buffer.from([SOCKS_VERSION, AUTH_NONE]));

			// --- Phase 2: CONNECT request ---
			const header = await this._read(client, 4);
			if (header[0] !== SOCKS_VERSION || header[1] !== CMD_CONNECT) {
				this._sendReply(client, REP_GENERAL_FAILURE);
				return;
			}
			// header[2] is reserved

			const { host, port } = await this._parseAddress(client, header[3]);

			const isTunneled = this._isAllowed(host, port);
			const key = `${host}:${port}`;

			if (isTunneled) {
				this._logService.trace(`[SocksProxy] TUNNEL ${host}:${port} (via remote)`);

				// Connect through the remote agent tunnel
				const protocol = await this._connectTunnel(host, port);
				const remoteSocket = protocol.getSocket();
				const dataChunk = protocol.readEntireBuffer();
				protocol.dispose();

				this._sendReply(client, REP_SUCCESS);
				this._trackConnection(key, true, client);

				if (dataChunk.byteLength > 0) {
					client.write(dataChunk.buffer);
				}

				if (remoteSocket instanceof NodeSocket) {
					this._mirrorNodeSocket(client, remoteSocket);
				} else {
					this._mirrorGenericSocket(client, remoteSocket);
				}
			} else {
				this._logService.trace(`[SocksProxy] DIRECT ${host}:${port}`);

				// Connect directly (local network)
				const directSocket = net.createConnection({ host, port });
				await new Promise<void>((resolve, reject) => {
					directSocket.once('connect', resolve);
					directSocket.once('error', reject);
				});

				this._sendReply(client, REP_SUCCESS);
				this._trackConnection(key, false, client);

				directSocket.on('end', () => client.end());
				directSocket.on('close', () => client.end());
				directSocket.on('error', () => client.destroy());
				client.on('end', () => directSocket.end());
				client.on('close', () => directSocket.end());
				client.on('error', () => directSocket.destroy());
				directSocket.pipe(client);
				client.pipe(directSocket);
			}
		} catch (err) {
			this._logService.error('[SocksProxy] Connection error:', err);
			if (!client.destroyed) {
				try {
					this._sendReply(client, REP_HOST_UNREACHABLE);
				} catch {
					client.destroy();
				}
			}
		}
	}

	/**
	 * Parse the destination address from the SOCKS5 request.
	 */
	private async _parseAddress(client: net.Socket, atyp: number): Promise<{ host: string; port: number }> {
		let host: string;
		switch (atyp) {
			case ATYP_IPV4: {
				const addr = await this._read(client, 4);
				host = `${addr[0]}.${addr[1]}.${addr[2]}.${addr[3]}`;
				break;
			}
			case ATYP_DOMAIN: {
				const lenBuf = await this._read(client, 1);
				const nameBuf = await this._read(client, lenBuf[0]);
				host = nameBuf.toString('ascii');
				break;
			}
			case ATYP_IPV6: {
				const addr = await this._read(client, 16);
				const parts: string[] = [];
				for (let i = 0; i < 16; i += 2) {
					parts.push(((addr[i] << 8) | addr[i + 1]).toString(16));
				}
				host = parts.join(':');
				break;
			}
			default:
				throw new Error(`Unsupported SOCKS5 address type: ${atyp}`);
		}
		const portBuf = await this._read(client, 2);
		const port = (portBuf[0] << 8) | portBuf[1];
		return { host, port };
	}

	/**
	 * Send a SOCKS5 reply with the given status. Uses a dummy bind
	 * address of 0.0.0.0:0 since the client doesn't need it.
	 */
	private _sendReply(client: net.Socket, rep: number): void {
		// +----+-----+-------+------+----------+----------+
		// |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
		// +----+-----+-------+------+----------+----------+
		client.write(Buffer.from([
			SOCKS_VERSION, rep, 0x00, ATYP_IPV4,
			0, 0, 0, 0, // 0.0.0.0
			0, 0,        // port 0
		]));
		if (rep !== REP_SUCCESS) {
			client.end();
		}
	}

	/**
	 * Read exactly `length` bytes from the socket.
	 */
	private _read(socket: net.Socket, length: number): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			const tryRead = () => {
				const data = socket.read(length) as Buffer | null;
				if (data) {
					resolve(data);
				} else {
					socket.once('readable', tryRead);
				}
			};
			socket.once('error', reject);
			socket.once('close', () => reject(new Error('Socket closed during SOCKS5 handshake')));
			tryRead();
		});
	}

	private _mirrorNodeSocket(localSocket: net.Socket, remoteNodeSocket: NodeSocket): void {
		const remoteSocket = remoteNodeSocket.socket;
		remoteSocket.on('end', () => localSocket.end());
		remoteSocket.on('close', () => localSocket.end());
		remoteSocket.on('error', () => localSocket.destroy());
		localSocket.on('end', () => remoteSocket.end());
		localSocket.on('close', () => remoteSocket.end());
		localSocket.on('error', () => remoteSocket.destroy());

		remoteSocket.pipe(localSocket);
		localSocket.pipe(remoteSocket);
	}

	private _mirrorGenericSocket(localSocket: net.Socket, remoteSocket: ISocket): void {
		remoteSocket.onClose(() => localSocket.destroy());
		remoteSocket.onEnd(() => localSocket.end());
		remoteSocket.onData(d => localSocket.write(d.buffer));
		localSocket.on('data', d => remoteSocket.write(VSBuffer.wrap(d)));
		localSocket.on('end', () => remoteSocket.end());
		localSocket.on('close', () => remoteSocket.end());
		localSocket.on('error', () => remoteSocket.end());
		localSocket.resume();
	}
}
