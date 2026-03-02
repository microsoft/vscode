/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { networkInterfaces } from 'os';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IRemoteControlConfirmation, IRemoteControlConfirmationResponse, IRemoteControlMainService, IRemoteControlServerInfo } from '../common/remoteControl.js';
import { getRemoteControlWebClientHtml } from './webClient.js';

function getLanAddress(): string {
	const interfaces = networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] ?? []) {
			if (iface.family === 'IPv4' && !iface.internal) {
				return iface.address;
			}
		}
	}
	return 'localhost';
}

export class RemoteControlMainService extends Disposable implements IRemoteControlMainService {
	declare readonly _serviceBrand: undefined;

	private _server: http.Server | undefined;
	private _port: number | undefined;
	private _pendingConfirmations: IRemoteControlConfirmation[] = [];
	private readonly _sseClients: Set<http.ServerResponse> = new Set();

	private readonly _onDidReceiveConfirmation = this._register(new Emitter<IRemoteControlConfirmationResponse>());
	readonly onDidReceiveConfirmation: Event<IRemoteControlConfirmationResponse> = this._onDidReceiveConfirmation.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async startServer(port?: number): Promise<IRemoteControlServerInfo> {
		if (this._server) {
			const lanIp = getLanAddress();
			return { port: this._port!, url: `http://${lanIp}:${this._port}` };
		}

		const requestedPort = port ?? 0; // 0 = OS picks a free port
		const httpModule = await import('http');

		return new Promise<IRemoteControlServerInfo>((resolve, reject) => {
			const server = httpModule.createServer((req, res) => this._handleRequest(req, res));

			server.on('error', (err) => {
				this.logService.error('[RemoteControl] Server error:', err);
				reject(err);
			});

			server.listen(requestedPort, '0.0.0.0', () => {
				const addr = server.address();
				if (addr && typeof addr === 'object') {
					this._port = addr.port;
					this._server = server;
					const lanIp = getLanAddress();
					this.logService.info(`[RemoteControl] Server started on http://${lanIp}:${this._port}`);
					resolve({ port: this._port, url: `http://${lanIp}:${this._port}` });
				} else {
					reject(new Error('Failed to get server address'));
				}
			});
		});
	}

	async stopServer(): Promise<void> {
		if (this._server) {
			// Close all SSE connections
			for (const client of this._sseClients) {
				client.end();
			}
			this._sseClients.clear();

			return new Promise<void>((resolve) => {
				this._server!.close(() => {
					this.logService.info('[RemoteControl] Server stopped');
					this._server = undefined;
					this._port = undefined;
					resolve();
				});
			});
		}
	}

	async isRunning(): Promise<boolean> {
		return !!this._server;
	}

	async updatePendingConfirmations(confirmations: IRemoteControlConfirmation[]): Promise<void> {
		this._pendingConfirmations = confirmations;
		this._broadcastSSE('confirmations', JSON.stringify(confirmations));
	}

	override dispose(): void {
		this.stopServer();
		super.dispose();
	}

	private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const url = req.url ?? '/';
		const method = req.method ?? 'GET';

		// CORS headers for development
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		// Route handling
		if (method === 'GET' && url === '/') {
			this._serveWebClient(res);
		} else if (method === 'GET' && url === '/api/pending') {
			this._servePending(res);
		} else if (method === 'GET' && url === '/api/events') {
			this._serveSSE(req, res);
		} else if (method === 'POST' && url === '/api/confirm') {
			this._handleConfirm(req, res);
		} else if (method === 'GET' && url === '/api/status') {
			this._serveStatus(res);
		} else {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'not found' }));
		}
	}

	private _serveWebClient(res: http.ServerResponse): void {
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(getRemoteControlWebClientHtml());
	}

	private _servePending(res: http.ServerResponse): void {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ confirmations: this._pendingConfirmations }));
	}

	private _serveStatus(res: http.ServerResponse): void {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			running: true,
			pendingCount: this._pendingConfirmations.length,
		}));
	}

	private _serveSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		});

		// Send current state immediately
		res.write(`event: confirmations\ndata: ${JSON.stringify(this._pendingConfirmations)}\n\n`);

		this._sseClients.add(res);
		this.logService.info(`[RemoteControl] SSE client connected (total: ${this._sseClients.size})`);

		req.on('close', () => {
			this._sseClients.delete(res);
			this.logService.info(`[RemoteControl] SSE client disconnected (total: ${this._sseClients.size})`);
		});
	}

	private _handleConfirm(req: http.IncomingMessage, res: http.ServerResponse): void {
		let body = '';
		req.on('data', (chunk: Buffer) => {
			body += chunk.toString();
			// Reject excessively large payloads
			if (body.length > 10_000) {
				res.writeHead(413, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'payload too large' }));
				req.destroy();
			}
		});
		req.on('end', () => {
			try {
				const data = JSON.parse(body);
				const toolCallId = String(data.toolCallId ?? '');
				const approved = Boolean(data.approved);
				const editedCommand = data.editedCommand ? String(data.editedCommand) : undefined;

				if (!toolCallId) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'toolCallId required' }));
					return;
				}

				// Check that this toolCallId is actually pending
				const pending = this._pendingConfirmations.find(c => c.toolCallId === toolCallId);
				if (!pending) {
					res.writeHead(404, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'confirmation not found' }));
					return;
				}

				this.logService.info(`[RemoteControl] Confirmation received: ${toolCallId} ${approved ? 'APPROVED' : 'DENIED'}`);

				// Fire the event — the workbench will pick it up
				this._onDidReceiveConfirmation.fire({ toolCallId, approved, editedCommand });

				// Remove from pending list
				this._pendingConfirmations = this._pendingConfirmations.filter(c => c.toolCallId !== toolCallId);
				this._broadcastSSE('confirmations', JSON.stringify(this._pendingConfirmations));

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ ok: true }));
			} catch (err) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'invalid JSON' }));
			}
		});
	}

	private _broadcastSSE(event: string, data: string): void {
		const message = `event: ${event}\ndata: ${data}\n\n`;
		for (const client of this._sseClients) {
			client.write(message);
		}
	}
}
