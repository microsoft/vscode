/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import type * as http from 'http';
import type * as https from 'https';

import { findFreePortFaster } from '../../../base/node/ports.js';
import { NodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Limiter } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ITunnelProxyInfo } from '../common/sharedProcessTunnelProxyService.js';
import { generateSelfSignedCert } from './selfSignedCert.js';

/**
 * Maximum number of tunnel connections we establish through the remote
 * agent at the same time. Each new tunnel dials the loopback forwarder,
 * which opens a fresh multiplexed channel to the remote (crypto +
 * round-trips) on a single event loop. An ad-heavy page fans out dozens
 * of simultaneous CONNECTs to distinct hosts; left unbounded, that
 * stampede overflows the forwarder's accept backlog and it starts
 * refusing (ECONNREFUSED) and resetting (ECONNRESET) connections. This
 * cap smooths the burst to a rate the forwarder can absorb; excess
 * requests queue rather than fail.
 */
const MAX_CONCURRENT_TUNNEL_CONNECTS = 6;

/**
 * A function that opens a TCP tunnel to a given host:port through the
 * remote agent. Resolves only once the remote has confirmed the target is
 * reachable (via the tunnel handshake) and rejects otherwise. Returns an
 * object with `getSocket()`, `readEntireBuffer()`, and `dispose()` — a
 * subset of {@link import('../../base/parts/ipc/common/ipc.net.js').PersistentProtocol}.
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

	private _server: https.Server | undefined;
	private _http: typeof http | undefined;
	private _tunnelAgent: http.Agent | undefined;
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

	/**
	 * The remote (tunnel) side of every active bridge — both CONNECT
	 * tunnels and pooled plain-HTTP sockets. We destroy these explicitly
	 * and synchronously on dispose rather than relying on the local
	 * socket's async `'close'` to propagate `end()`; during shared-process
	 * teardown the event loop may not get another turn to fire that
	 * listener, which would leave the upstream tunnel socket dangling.
	 */
	private readonly _remoteSockets = new Set<net.Socket>();

	/**
	 * Bounds how many tunnels we create concurrently through the remote
	 * agent. Gates the setup (connect + handshake) only; once a tunnel is
	 * established the slot is released and data piping proceeds unthrottled.
	 */
	private readonly _connectLimiter = this._register(new Limiter<Awaited<ReturnType<ITunnelConnectFn>>>(MAX_CONCURRENT_TUNNEL_CONNECTS));

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
		this._http = http;
		this._tunnelAgent = this._createTunnelAgent();

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
		// Any tunnels still queued behind the limiter are abandoned here:
		// disposing the limiter drops the outstanding queue without settling
		// those promises, so their awaiting `_onConnect`/`_createTunnelSocket`
		// never resumes. That's fine — we destroy every socket below, and the
		// local sockets those handlers would have served are torn down too, so
		// nothing is left waiting on a tunnel that will never arrive.
		for (const socket of this._connectSockets) {
			socket.destroy();
		}
		this._connectSockets.clear();
		for (const socket of this._remoteSockets) {
			socket.destroy();
		}
		this._remoteSockets.clear();
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
	 * Create an `http.Agent` that pools tunnel sockets by target
	 * host:port. Node calls `createConnection` only when no pooled socket
	 * is available for the target; otherwise it reuses an existing one.
	 */
	private _createTunnelAgent(): http.Agent {
		if (!this._http) {
			throw new Error('HTTP module not initialized');
		}
		const agent = new this._http.Agent({ keepAlive: true });
		agent.createConnection = (options, oncreate) => {
			const host = options.hostname || options.host || '';
			const port = Number(options.port) || 80;
			this._createTunnelSocket(host, port)
				.then(socket => oncreate?.(null, socket))
				.catch(err => oncreate?.(err, null!));
		};
		return agent;
	}

	/**
	 * Drop every pooled keep-alive tunnel socket by recreating the
	 * agent. Called when the upstream tunnel endpoint changes: the pooled
	 * sockets all dial the now-stale endpoint, so they would be reset en
	 * masse once it goes away. Recreating the agent closes the idle ones
	 * gracefully and forces subsequent requests to dial the new endpoint.
	 */
	drainConnectionPool(): void {
		if (!this._tunnelAgent) {
			return; // not started yet; nothing pooled
		}
		const oldAgent = this._tunnelAgent;
		this._tunnelAgent = this._createTunnelAgent();
		oldAgent?.destroy();
		this._logService.trace('[TunnelProxy] Upstream endpoint changed; drained pooled tunnel sockets');
	}

	/**
	 * Handle HTTP CONNECT requests (used for HTTPS tunneling).
	 * Parses `host:port` from the request URL, establishes a tunnel
	 * through the remote agent, and pipes the sockets together.
	 */
	private async _onConnect(req: http.IncomingMessage, socket: net.Socket, head: Buffer): Promise<void> {
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

			const protocol = await this._connectLimiter.queue(() => this._connectTunnel(host, port));
			const remoteSocket = this._getRemoteNetSocket(protocol);
			const dataChunk = protocol.readEntireBuffer();
			protocol.dispose();

			socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

			if (dataChunk.byteLength > 0) {
				socket.write(dataChunk.buffer);
			}

			if (head.length > 0) {
				remoteSocket.write(head);
			}

			this._mirrorNodeSocket(socket, remoteSocket);
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
	private async _onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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

		// Plain HTTP forwarding only — HTTPS goes through CONNECT.
		// In practice every HTTP/1.1 client (browsers included) uses
		// CONNECT for HTTPS via a proxy, so an absolute-form `https:`
		// URL here should never happen. Reject loudly rather than
		// silently misforward it as plaintext (`http.request` to either
		// the URL's port or default 80 would produce confusing failures
		// or wrong content).
		if (parsed.protocol !== 'http:') {
			this._logService.warn(`[TunnelProxy] Rejecting non-HTTP forwarded request: ${req.method} ${req.url}`);
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
				// Reset the client connection instead of returning a 502 body.
				// Chromium renders a 502 body as a page, whereas a transport
				// reset triggers `did-fail-load`, so the browser shows its
				// native "failed to load" error page (consistent with the
				// HTTPS/CONNECT path).
				res.destroy();
			});

			req.pipe(proxyReq);
		} catch (err) {
			this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
			// Reset the client connection so the browser shows its native
			// "failed to load" page rather than rendering an HTTP error.
			res.destroy();
		}
	}

	/**
	 * Create a `net.Socket`-compatible stream backed by a remote agent
	 * tunnel. Called by the `http.Agent` when it needs a new connection
	 * to a given host:port (i.e. no pooled socket is available).
	 */
	private async _createTunnelSocket(host: string, port: number): Promise<net.Socket> {
		// The connect function resolves only once the remote has confirmed the
		// target is reachable (via the tunnel handshake) and rejects otherwise.
		// A rejection here lets the http.Agent fail the request (the client
		// connection is reset) rather than hanging or silently returning
		// nothing.
		const protocol = await this._connectLimiter.queue(() => this._connectTunnel(host, port));
		const tunnelStream = this._getRemoteNetSocket(protocol);
		const dataChunk = protocol.readEntireBuffer();
		protocol.dispose();

		this._trackRemoteSocket(tunnelStream);

		if (dataChunk.byteLength > 0) {
			tunnelStream.unshift(dataChunk.buffer);
		}

		return tunnelStream;
	}

	/**
	 * Extract the underlying `net.Socket` from a freshly-connected tunnel
	 * protocol.
	 *
	 * In the shared process the remote socket factory is always
	 * {@link nodeSocketFactory}, which yields a {@link NodeSocket} (a thin
	 * wrapper over a real `net.Socket`). Working directly with that raw
	 * socket lets us rely on Node's native stream backpressure (via
	 * `pipe()` and the keep-alive `http.Agent`) instead of re-implementing
	 * it around the generic {@link ISocket} interface. Generic transports
	 * (e.g. `WebSocketNodeSocket`) are not produced here and are therefore
	 * not supported — reject them loudly rather than silently mishandle
	 * backpressure or teardown.
	 */
	private _getRemoteNetSocket(protocol: { getSocket(): ISocket; dispose(): void }): net.Socket {
		const remoteSocket = protocol.getSocket();
		if (!(remoteSocket instanceof NodeSocket)) {
			protocol.dispose();
			throw new Error('[TunnelProxy] Unsupported remote socket type; only NodeSocket tunnels are supported');
		}
		// Take ownership of the raw socket, detaching NodeSocket's own
		// listeners. NodeSocket installs an 'error' listener that routes
		// every non-EPIPE error through onUnexpectedError, which the shared
		// process logs as an "uncaught exception". When the upstream tunnel
		// endpoint dies, every pooled/active tunnel socket is reset at once
		// - that ECONNRESET is expected teardown here, not an unexpected
		// error. We bridge the raw socket ourselves (attaching our own
		// 'error' handlers), so NodeSocket's routing must be removed.
		const socket = remoteSocket.socket;
		remoteSocket.dispose(false);

		return socket;
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

	private _mirrorNodeSocket(localSocket: net.Socket, remoteSocket: net.Socket): void {
		this._trackRemoteSocket(remoteSocket);
		remoteSocket.on('end', () => localSocket.end());
		remoteSocket.on('close', () => localSocket.end());
		remoteSocket.on('error', () => localSocket.destroy());
		localSocket.on('end', () => remoteSocket.end());
		localSocket.on('close', () => remoteSocket.end());
		localSocket.on('error', () => remoteSocket.destroy());

		remoteSocket.pipe(localSocket);
		localSocket.pipe(remoteSocket);
	}

	/**
	 * Track a remote tunnel socket so {@link dispose} can tear it down
	 * synchronously. The socket auto-removes itself once closed.
	 */
	private _trackRemoteSocket(socket: net.Socket): void {
		this._remoteSockets.add(socket);

		// Once we detach NodeSocket's listeners (see _getRemoteNetSocket)
		// the raw socket has no 'error' handler of its own. A net.Socket
		// that emits 'error' without a listener throws as a genuine
		// uncaught exception, so every socket we own must have one.
		// Destroying on error tears the socket down quietly and lets the
		// agent evict it from the pool. (CONNECT bridges attach an
		// additional handler in _mirrorNodeSocket; a second listener is
		// harmless.)
		socket.on('error', () => socket.destroy());
		socket.on('close', () => this._remoteSockets.delete(socket));
	}
}
