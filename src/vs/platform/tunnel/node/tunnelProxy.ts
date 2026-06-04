/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { findFreePortFaster } from '../../../base/node/ports.js';
import { NodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ITunnelProxyInfo } from '../common/sharedProcessTunnelProxyService.js';
import { generateSelfSignedCert } from './selfSignedCert.js';

/**
 * A function that opens a TCP tunnel to a given host:port through the
 * remote agent. Returns an object with `getSocket()`, `readEntireBuffer()`,
 * and `dispose()` — a subset of {@link import('../../base/parts/ipc/common/ipc.net.js').PersistentProtocol}.
 */
export interface ITunnelConnectFn {
	(host: string, port: number): Promise<{ getSocket(): ISocket; readEntireBuffer(): VSBuffer; dispose(): void }>;
}

/**
 * An HTTPS proxy server that routes TCP connections through the remote
 * agent tunnel.
 *
 * Handles:
 * - **CONNECT** requests (used by Chromium for HTTPS) — establishes a
 *   raw TCP tunnel through the remote agent.
 * - **Plain HTTP** requests (GET, POST, etc. with absolute URLs) —
 *   establishes a tunnel and forwards the request.
 *
 * The server binds exclusively to `127.0.0.1` and is never exposed to
 * the network — this is the primary security boundary. The additional
 * layers below are defence-in-depth:
 *
 * - **TLS** with a self-signed certificate (generated in-memory)
 *   prevents other local processes from passively sniffing traffic.
 * - **Basic proxy authentication** with randomly generated credentials
 *   prevents other local processes from actively using the proxy.
 * - The certificate **fingerprint** is returned from {@link start} so
 *   the consumer's Electron session can pin it.
 *
 * If certificate generation or server startup fails the proxy simply
 * does not start — the worst outcome is that the browser view falls
 * back to not having remote network access.
 */
export class TunnelProxy extends Disposable {

	private _server: import('https').Server | undefined;
	private _tunnelAgent: import('http').Agent | undefined;
	private _localPort: number = 0;
	private _credentials: { username: string; password: string } | undefined;
	private _expectedAuthHeader: string | undefined;
	private _certFingerprint: string | undefined;

	/**
	 * Sockets we took over from the HTTPS server via CONNECT. Once the
	 * CONNECT handler runs the server no longer tracks them, so
	 * `server.close()` and `server.closeAllConnections()` won't terminate
	 * them — we have to destroy them ourselves on dispose to release the
	 * listening port promptly.
	 */
	private readonly _connectSockets = new Set<net.Socket>();

	get localPort(): number {
		return this._localPort;
	}

	constructor(
		private readonly _connectTunnel: ITunnelConnectFn,
		private readonly _logService: ILogService,
	) {
		super();
	}

	async start(): Promise<ITunnelProxyInfo> {
		const crypto = await import('crypto');
		const http = await import('http');
		const https = await import('https');

		// Generate random credentials
		const username = crypto.randomBytes(16).toString('hex');
		const password = crypto.randomBytes(32).toString('hex');
		this._credentials = { username, password };
		this._expectedAuthHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

		// Generate a self-signed certificate in memory
		const { key, cert, fingerprint } = await generateSelfSignedCert();
		this._certFingerprint = fingerprint;

		// Create an agent that pools tunnel sockets by host:port.
		// Node calls createConnection only when no pooled socket is
		// available for the target; otherwise it reuses an existing one.
		this._tunnelAgent = new http.Agent({ keepAlive: true });
		(this._tunnelAgent.createConnection as unknown) = (
			options: { hostname?: string; host?: string; port?: number },
			oncreate: (err: Error | null, socket?: net.Socket) => void,
		) => {
			const host = options.hostname || options.host || '';
			const port = Number(options.port) || 80;
			this._createTunnelSocket(host, port)
				.then(socket => oncreate(null, socket))
				.catch(err => oncreate(err));
		};

		// HTTPS server: handles plain HTTP requests (absolute-form URLs from
		// Chromium when configured as a proxy) and CONNECT tunnels for HTTPS.
		const server = https.createServer({ key, cert }, (req, res) => this._onRequest(req, res));
		server.on('connect', (req, socket, head) => this._onConnect(req, socket as net.Socket, head));
		server.on('error', err => {
			this._logService.error('[TunnelProxy] Server error:', err);
		});
		this._server = server;

		const port = await findFreePortFaster(0, 2, 1000, '127.0.0.1');
		server.listen(port, '127.0.0.1');
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		const address = server.address() as net.AddressInfo;
		this._localPort = address.port;
		this._logService.info(`[TunnelProxy] Listening on https://127.0.0.1:${this._localPort}`);

		return {
			url: `https://127.0.0.1:${this._localPort}`,
			host: '127.0.0.1',
			port: this._localPort,
			credentials: this._credentials,
			certFingerprint: this._certFingerprint,
		};
	}

	override dispose(): void {
		for (const socket of this._connectSockets) {
			socket.destroy();
		}
		this._connectSockets.clear();
		this._tunnelAgent?.destroy();
		this._server?.closeAllConnections();
		this._server?.close();
		super.dispose();
	}

	/**
	 * Verify the `Proxy-Authorization` header against our credentials.
	 * Returns `true` if the request is authorized.
	 */
	private _checkAuth(authHeader: string | undefined): boolean {
		return authHeader === this._expectedAuthHeader;
	}

	/**
	 * Handle HTTP CONNECT requests (used for HTTPS tunneling).
	 * Parses `host:port` from the request URL, establishes a tunnel
	 * through the remote agent, and pipes the sockets together.
	 */
	private async _onConnect(req: import('http').IncomingMessage, socket: net.Socket, head: Buffer): Promise<void> {
		// Track the socket from the moment the CONNECT event fires so
		// dispose can tear it down even before the upstream tunnel
		// returns (or if auth/host validation fails). The close listener
		// auto-removes whether we close it here or later.
		this._connectSockets.add(socket);
		socket.on('close', () => this._connectSockets.delete(socket));

		if (!this._checkAuth(req.headers['proxy-authorization'])) {
			socket.write(
				'HTTP/1.1 407 Proxy Authentication Required\r\n' +
				'Proxy-Authenticate: Basic realm="TunnelProxy"\r\n' +
				'\r\n'
			);
			socket.end();
			return;
		}

		const { host, port } = this._parseHostPort(req.url ?? '', 443);
		if (!host) {
			socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
			socket.end();
			return;
		}

		this._logService.trace(`[TunnelProxy] CONNECT ${host}:${port}`);

		try {
			socket.pause();

			const protocol = await this._connectTunnel(host, port);
			const remoteSocket = protocol.getSocket();
			const dataChunk = protocol.readEntireBuffer();
			protocol.dispose();

			socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

			if (dataChunk.byteLength > 0) {
				socket.write(dataChunk.buffer);
			}

			if (head.length > 0) {
				if (remoteSocket instanceof NodeSocket) {
					remoteSocket.socket.write(head);
				} else {
					remoteSocket.write(VSBuffer.wrap(head));
				}
			}

			if (remoteSocket instanceof NodeSocket) {
				this._mirrorNodeSocket(socket, remoteSocket);
			} else {
				this._mirrorGenericSocket(socket, remoteSocket);
			}
		} catch (err) {
			this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
			socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
			socket.end();
		}
	}

	/**
	 * Handle plain HTTP requests (GET, POST, etc. with absolute URLs).
	 *
	 * Chromium sends proxied HTTP requests with absolute-form URLs
	 * (e.g. `GET http://example.com/page HTTP/1.1`) and reuses keep-alive
	 * connections to the proxy for requests to **different** hosts.
	 *
	 * Each request is forwarded via `http.request` using a shared
	 * `http.Agent` that pools tunnel sockets by host:port. The agent
	 * calls `_createTunnelSocket` only when no pooled socket is available;
	 * otherwise it reuses an existing tunnel connection.
	 */
	private async _onRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
		if (!this._checkAuth(req.headers['proxy-authorization'])) {
			res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="TunnelProxy"' });
			res.end();
			return;
		}

		let parsed: URL;
		try {
			parsed = new URL(req.url ?? '');
		} catch {
			res.writeHead(400);
			res.end();
			return;
		}

		const host = parsed.hostname;
		const port = parseInt(parsed.port, 10) || 80;

		if (!host) {
			res.writeHead(400);
			res.end();
			return;
		}

		this._logService.trace(`[TunnelProxy] ${req.method} ${host}:${port}${parsed.pathname}`);

		try {
			const http = await import('http');
			const path = parsed.pathname + parsed.search;
			const headers = { ...req.headers };

			// Strip hop-by-hop headers per RFC 9110 Section 7.6.1.
			// An intermediary MUST parse the Connection header and remove any
			// fields named in it, then remove Connection itself. It SHOULD
			// also remove other known hop-by-hop headers.
			const connectionTokens = (headers['connection'] ?? '')
				.toString()
				.split(',')
				.map(t => t.trim().toLowerCase())
				.filter(t => t.length > 0);
			for (const token of connectionTokens) {
				delete headers[token];
			}
			delete headers['connection'];
			delete headers['keep-alive'];
			delete headers['proxy-authorization'];
			delete headers['proxy-connection'];
			delete headers['te'];
			delete headers['transfer-encoding'];
			delete headers['upgrade'];

			const proxyReq = http.request({
				agent: this._tunnelAgent,
				hostname: host,
				port,
				path,
				method: req.method,
				headers,
			}, proxyRes => {
				res.writeHead(proxyRes.statusCode!, proxyRes.headers);
				proxyRes.pipe(res);
			});

			proxyReq.on('error', err => {
				this._logService.error(`[TunnelProxy] Proxy request error for ${host}:${port}:`, err);
				if (!res.headersSent) {
					res.writeHead(502);
					res.end();
				} else {
					res.destroy();
				}
			});

			req.pipe(proxyReq);
		} catch (err) {
			this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
			if (!res.headersSent) {
				res.writeHead(502);
			}
			res.end();
		}
	}

	/**
	 * Create a `net.Socket`-compatible stream backed by a remote agent
	 * tunnel. Called by the `http.Agent` when it needs a new connection
	 * to a given host:port (i.e. no pooled socket is available).
	 */
	private async _createTunnelSocket(host: string, port: number): Promise<net.Socket> {
		const protocol = await this._connectTunnel(host, port);
		const remoteSocket = protocol.getSocket();
		const dataChunk = protocol.readEntireBuffer();
		protocol.dispose();

		let tunnelStream: net.Socket;
		if (remoteSocket instanceof NodeSocket) {
			tunnelStream = remoteSocket.socket;
		} else {
			const { Duplex } = await import('stream');
			const duplex = new Duplex({
				read() { /* data is pushed via onData below */ },
				write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
					remoteSocket.write(VSBuffer.wrap(chunk));
					callback();
				},
				final(callback: (error?: Error | null) => void) {
					remoteSocket.end();
					callback();
				}
			});
			remoteSocket.onData(d => duplex.push(d.buffer));
			remoteSocket.onEnd(() => duplex.push(null));
			remoteSocket.onClose(() => duplex.destroy());
			tunnelStream = duplex as unknown as net.Socket;
		}

		if (dataChunk.byteLength > 0) {
			tunnelStream.unshift(Buffer.from(dataChunk.buffer));
		}

		return tunnelStream;
	}

	/**
	 * Parse a `host:port` string. Falls back to `defaultPort` when the
	 * port component is missing. Returns an empty host when the address
	 * is empty or the port is outside the valid TCP range (1-65535), per
	 * RFC 9110 section 9.3.6 ("A server MUST reject a CONNECT request that
	 * targets an empty or invalid port number").
	 */
	private _parseHostPort(address: string, defaultPort: number): { host: string; port: number } {
		let host: string;
		let port: number;

		// Handle IPv6 bracket notation [::1]:port
		const bracketMatch = /^\[(?<host>[^\]]+)\]:(?<port>\d+)$/.exec(address);
		if (bracketMatch?.groups) {
			host = bracketMatch.groups['host'];
			port = parseInt(bracketMatch.groups['port'], 10);
		} else {
			const bracketOnly = /^\[(?<host>[^\]]+)\]$/.exec(address);
			if (bracketOnly?.groups) {
				host = bracketOnly.groups['host'];
				port = defaultPort;
			} else {
				const lastColon = address.lastIndexOf(':');
				if (lastColon === -1) {
					host = address;
					port = defaultPort;
				} else {
					const maybePort = parseInt(address.substring(lastColon + 1), 10);
					if (isNaN(maybePort)) {
						// Likely an IPv6 address without brackets
						host = address;
						port = defaultPort;
					} else {
						host = address.substring(0, lastColon);
						port = maybePort;
					}
				}
			}
		}

		// Validate port range
		if (port < 1 || port > 65535) {
			return { host: '', port: 0 };
		}

		return { host, port };
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
