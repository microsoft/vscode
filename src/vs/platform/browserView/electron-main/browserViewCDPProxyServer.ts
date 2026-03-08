/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type * as http from 'http';
import { AddressInfo, Socket } from 'net';
import { upgradeToISocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CDPBrowserProxy } from '../common/cdp/proxy.js';
import { CDPEvent, CDPRequest, CDPError, CDPErrorCode, ICDPBrowserTarget, ICDPConnection } from '../common/cdp/types.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IBrowserViewCDPProxyServer = createDecorator<IBrowserViewCDPProxyServer>('browserViewCDPProxyServer');

export interface IBrowserViewCDPProxyServer {
	readonly _serviceBrand: undefined;

	/**
	 * Returns a debug endpoint with a short-lived, single-use token for a specific browser target.
	 */
	getWebSocketEndpointForTarget(target: ICDPBrowserTarget): Promise<string>;

	/**
	 * Unregister a previously registered browser target.
	 */
	removeTarget(target: ICDPBrowserTarget): Promise<void>;
}

/**
 * WebSocket server that provides CDP debugging for browser views.
 *
 * Manages a registry of {@link ICDPBrowserTarget} instances, each reachable
 * at its own `/devtools/browser/{id}` WebSocket endpoint.
 */
export class BrowserViewCDPProxyServer extends Disposable implements IBrowserViewCDPProxyServer {
	declare readonly _serviceBrand: undefined;

	private server: http.Server | undefined;
	private port: number | undefined;

	private readonly tokens = this._register(new TokenManager<string>());
	private readonly targets = new Map<string, ICDPBrowserTarget>();

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	/**
	 * Register a browser target and return a WebSocket endpoint URL for it.
	 * The target is reachable at `/devtools/browser/{targetId}`.
	 */
	async getWebSocketEndpointForTarget(target: ICDPBrowserTarget): Promise<string> {
		await this.ensureServerStarted();

		const targetInfo = await target.getTargetInfo();
		const targetId = targetInfo.targetId;

		// Register (or re-register) the target
		this.targets.set(targetId, target);

		const token = await this.tokens.issueToken(targetId);
		return `ws://localhost:${this.port}/devtools/browser/${targetId}?token=${token}`;
	}

	/**
	 * Unregister a previously registered browser target.
	 */
	async removeTarget(target: ICDPBrowserTarget): Promise<void> {
		const targetInfo = await target.getTargetInfo();
		this.targets.delete(targetInfo.targetId);
	}

	private async ensureServerStarted(): Promise<void> {
		if (this.server) {
			return;
		}

		const http = await import('http');
		this.server = http.createServer();

		await new Promise<void>((resolve, reject) => {
			// Only listen on localhost to prevent external access
			this.server!.listen(0, '127.0.0.1', () => resolve());
			this.server!.once('error', reject);
		});

		const address = this.server.address() as AddressInfo;
		this.port = address.port;

		this.server.on('request', (req, res) => this.handleHttpRequest(req, res));
		this.server.on('upgrade', (req: http.IncomingMessage, socket: Socket) => this.handleWebSocketUpgrade(req, socket));
	}

	private async handleHttpRequest(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		this.logService.debug(`[BrowserViewDebugProxy] HTTP request at ${_req.url}`);
		// No support for HTTP endpoints for now.
		res.writeHead(404);
		res.end();
	}

	private handleWebSocketUpgrade(req: http.IncomingMessage, socket: Socket): void {
		const [pathname, params] = (req.url || '').split('?');

		const browserMatch = pathname.match(/^\/devtools\/browser\/([^/?]+)$/);

		this.logService.debug(`[BrowserViewDebugProxy] WebSocket upgrade requested: ${pathname}`);

		if (!browserMatch) {
			this.logService.warn(`[BrowserViewDebugProxy] Rejecting WebSocket on unknown path: ${pathname}`);
			socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
			socket.end();
			return;
		}

		const targetId = browserMatch[1];

		const token = new URLSearchParams(params).get('token');
		const tokenTargetId = token && this.tokens.consumeToken(token);
		if (!tokenTargetId || tokenTargetId !== targetId) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.end();
			return;
		}

		const target = this.targets.get(targetId);
		if (!target) {
			this.logService.warn(`[BrowserViewDebugProxy] Browser target not found: ${targetId}`);
			socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
			socket.end();
			return;
		}

		this.logService.debug(`[BrowserViewDebugProxy] WebSocket connected: ${pathname}`);

		const upgraded = upgradeToISocket(req, socket, {
			debugLabel: 'browser-view-cdp-' + generateUuid(),
			enableMessageSplitting: false,
		});

		if (!upgraded) {
			return;
		}

		const proxy = new CDPBrowserProxy(target);
		const disposables = this.wireWebSocket(upgraded, proxy);
		this._register(disposables);
		this._register(upgraded);
	}

	/**
	 * Wire a WebSocket (ISocket) to an ICDPConnection bidirectionally.
	 * Returns a DisposableStore that cleans up all subscriptions.
	 */
	private wireWebSocket(upgraded: ISocket, connection: ICDPConnection): DisposableStore {
		const disposables = new DisposableStore();

		// Socket -> Connection: parse JSON, call sendMessage, write response/error
		disposables.add(upgraded.onData((rawData: VSBuffer) => {
			try {
				const message = rawData.toString();
				const { id, method, params, sessionId } = JSON.parse(message) as CDPRequest;
				this.logService.debug(`[BrowserViewDebugProxy] <- ${message}`);
				connection.sendMessage(method, params, sessionId)
					.then((result: unknown) => {
						const response = { id, result, sessionId };
						const responseStr = JSON.stringify(response);
						this.logService.debug(`[BrowserViewDebugProxy] -> ${responseStr}`);
						upgraded.write(VSBuffer.fromString(responseStr));
					})
					.catch((error: Error) => {
						const response = {
							id,
							error: {
								code: error instanceof CDPError ? error.code : CDPErrorCode.ServerError,
								message: error.message || 'Unknown error'
							},
							sessionId
						};
						const responseStr = JSON.stringify(response);
						this.logService.debug(`[BrowserViewDebugProxy] -> ${responseStr}`);
						upgraded.write(VSBuffer.fromString(responseStr));
					});
			} catch (error) {
				this.logService.error('[BrowserViewDebugProxy] Error parsing message:', error);
				upgraded.end();
			}
		}));

		// Connection -> Socket: serialize events and write
		disposables.add(connection.onEvent((event: CDPEvent) => {
			const eventStr = JSON.stringify(event);
			this.logService.debug(`[BrowserViewDebugProxy] -> ${eventStr}`);
			upgraded.write(VSBuffer.fromString(eventStr));
		}));

		// Connection close -> close socket
		disposables.add(connection.onClose(() => {
			this.logService.debug(`[BrowserViewDebugProxy] WebSocket closing`);
			upgraded.end();
		}));

		// Socket closed -> cleanup
		disposables.add(upgraded.onClose(() => {
			this.logService.debug(`[BrowserViewDebugProxy] WebSocket closed`);
			connection.dispose();
			disposables.dispose();
		}));

		return disposables;
	}

	override dispose(): void {
		if (this.server) {
			this.server.close();
			this.server = undefined;
		}

		super.dispose();
	}
}

class TokenManager<TDetails> extends Disposable {
	/** Map of currently valid single-use tokens to their associated details. */
	private readonly tokens = new Map<string, { details: TDetails; expiresAt: number }>();

	/**
	 * Creates a short-lived, single-use token bound to a specific target.
	 * The token is revoked once consumed or after 30 seconds.
	 */
	async issueToken(details: TDetails): Promise<string> {
		const token = this.makeToken();
		this.tokens.set(token, { details: Object.freeze(details), expiresAt: Date.now() + 30_000 });
		this._register(disposableTimeout(() => this.tokens.delete(token), 30_000));
		return token;
	}

	/**
	 * Consume a token. Returns the details it was issued with, or
	 * `undefined` if the token is invalid or expired.
	 */
	consumeToken(token: string): TDetails | undefined {
		if (!token) {
			return undefined;
		}
		const info = this.tokens.get(token);
		if (!info) {
			return undefined;
		}
		this.tokens.delete(token);
		return Date.now() <= info.expiresAt ? info.details : undefined;
	}

	private makeToken(): string {
		const bytes = crypto.getRandomValues(new Uint8Array(32));
		const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
		const base64 = btoa(binary);
		const urlSafeToken = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		return urlSafeToken;
	}
}
