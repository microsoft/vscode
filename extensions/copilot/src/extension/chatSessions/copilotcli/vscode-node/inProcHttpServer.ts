/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type * as express from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ILogger } from '../../../../platform/log/common/logService';
import { Disposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { ICopilotCLISessionTracker } from './copilotCLISessionTracker';

interface McpProviderOptions {
	id: string;
	serverLabel: string;
	serverVersion: string;
	registerTools: (server: McpServer, sessionId: string) => Promise<void> | void;
	registerPushNotifications?: () => Promise<void> | void;
}

class AsyncLazy<T> {
	private _value: T | undefined;
	private _promise: Promise<T> | undefined;

	constructor(private readonly factory: () => Promise<T>) { }

	get value(): Promise<T> {
		if (this._value !== undefined) {
			return Promise.resolve(this._value);
		}

		if (this._promise) {
			return this._promise;
		}

		this._promise = this.factory().then(value => {
			this._value = value;
			return value;
		});

		return this._promise;
	}
}

export class InProcHttpServer extends Disposable {
	private readonly _transports: Record<string, StreamableHTTPServerTransport> = {};
	private readonly _onDidClientConnect = this._register(new vscode.EventEmitter<string>());
	public readonly onDidClientConnect = this._onDidClientConnect.event;
	private readonly _onDidClientDisconnect = this._register(new vscode.EventEmitter<string>());
	public readonly onDidClientDisconnect = this._onDidClientDisconnect.event;
	constructor(
		private readonly _logger: ILogger,
		private readonly _sessionTracker: ICopilotCLISessionTracker,
	) {
		super();
	}

	broadcastNotification(method: string, params: Record<string, unknown>): void {
		const message = {
			jsonrpc: '2.0' as const,
			method,
			params,
		};

		for (const sessionId in this._transports) {
			this._transports[sessionId].send(message).catch(() => {
				this._logger.debug(`Failed to send notification "${method}" to client ${sessionId}`);
			});
		}
	}

	sendNotification(sessionId: string, method: string, params: Record<string, unknown>): void {
		const transport = this._getTransport(sessionId);
		if (!transport) {
			this._logger.debug(`Cannot send notification "${method}": session ${sessionId} not found`);
			return;
		}

		const message = {
			jsonrpc: '2.0' as const,
			method,
			params,
		};

		transport.send(message).catch(() => {
			this._logger.debug(`Failed to send notification "${method}" to client ${sessionId}`);
		});
	}

	getConnectedSessionIds(): readonly string[] {
		return Object.keys(this._transports);
	}

	async start(
		mcpOptions: McpProviderOptions,
	): Promise<{ serverUri: vscode.Uri; headers: Record<string, string> }> {
		let socketPath: string | undefined;

		this._logger.debug(`Starting MCP HTTP server for ${mcpOptions.serverLabel}...`);

		try {
			const nonce = generateUuid();
			socketPath = await getRandomSocketPath();
			this._logger.trace(`Generated socket path: ${socketPath}`);

			const expressModule = (await expressLazy.value) as unknown as {
				default?: typeof import('express');
			} & typeof import('express');
			const expressApp = expressModule.default || expressModule;

			const app: express.Application = (expressApp as () => express.Application)();

			// MCP requests like open_diff include full file contents which can exceed the default ~100KB limit
			app.use(expressApp.json({ limit: '10mb' }));
			app.use((req: express.Request, res: express.Response, next: express.NextFunction) =>
				this._authMiddleware(nonce, req, res, next),
			);

			app.post('/mcp', (req: express.Request, res: express.Response) => this._handlePost(mcpOptions, req, res));
			app.get('/mcp', (req: express.Request, res: express.Response) => this._handleGetDelete(req, res));
			app.delete('/mcp', (req: express.Request, res: express.Response) => this._handleGetDelete(req, res));

			const httpServer = app.listen(socketPath);
			this._logger.debug('HTTP server listening on socket');

			// Register push notifications if provided
			if (mcpOptions.registerPushNotifications) {
				this._logger.debug('Registering push notifications...');
				await Promise.resolve(mcpOptions.registerPushNotifications());
			}

			this._register(toDisposable(() => {
				this._logger.info('Shutting down MCP server...');
				for (const sessionId in this._transports) {
					void this._transports[sessionId].close();
					this._unregisterTransport(sessionId);
				}

				if (httpServer.listening) {
					httpServer.close();
					httpServer.closeAllConnections();
				}

				void tryCleanupSocket(socketPath);
				this._logger.debug('MCP server shutdown complete');
			}));
			return {
				serverUri: vscode.Uri.from({
					scheme: os.platform() === 'win32' ? 'pipe' : 'unix',
					path: socketPath,
					fragment: '/mcp',
				}),
				headers: {
					Authorization: `Nonce ${nonce}`,
				},
			};
		} catch (err) {
			void tryCleanupSocket(socketPath);
			throw err;
		}
	}

	private _registerTransport(sessionId: string, transport: StreamableHTTPServerTransport): void {
		this._transports[sessionId] = transport;
		this._onDidClientConnect.fire(sessionId);
		this._logger.info(`Client connected: ${sessionId}`);
	}

	private _unregisterTransport(sessionId: string): void {
		delete this._transports[sessionId];
		this._onDidClientDisconnect.fire(sessionId);
		this._logger.info(`Client disconnected: ${sessionId}`);
	}

	private _getTransport(sessionId: string): StreamableHTTPServerTransport | undefined {
		return this._transports[sessionId];
	}

	private _authMiddleware(nonce: string, req: express.Request, res: express.Response, next: express.NextFunction): void {
		if (req.headers.authorization !== `Nonce ${nonce}`) {
			this._logger.debug(`Unauthorized request to ${req.method} ${req.path}`);
			res.status(401).send('Unauthorized');
			return;
		}

		next();
	}

	private async _handlePost(mcpOptions: McpProviderOptions, req: express.Request, res: express.Response): Promise<void> {
		const sessionId = req.headers['mcp-session-id'] ?? req.headers['x-copilot-session-id'];
		if (Array.isArray(sessionId) || !sessionId || typeof sessionId !== 'string') {
			res.status(400).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Bad Request: Session ID must be a single, defined, string value' },
				id: null,
			});
			return;
		}
		this._logger.trace(`POST /mcp request, sessionId: ${sessionId ?? '(none)'}`);

		const isInitializeRequest = await isInitializeRequestLazy.value;
		const { StreamableHTTPServerTransport } = await streamableHttpLazy.value;

		let transport: StreamableHTTPServerTransport;
		const existingTransport = sessionId ? this._getTransport(sessionId) : undefined;
		if (sessionId && existingTransport) {
			if (isInitializeRequest(req.body)) {
				this._logger.debug(`Rejecting duplicate initialize for session ${sessionId}`);
				res.status(409).json({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: 'Conflict: A connection for this session already exists',
					},
					id: null,
				});
				return;
			}
			transport = existingTransport;
		} else if (sessionId && isInitializeRequest(req.body)) {
			this._logger.debug('Creating new MCP session...');
			const clientPid = parseInt(req.headers['x-copilot-pid'] as string, 10);
			const clientPpid = parseInt(req.headers['x-copilot-parent-pid'] as string, 10);
			let sessionRegistration: { dispose(): void } | undefined;
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => sessionId,
				onsessioninitialized: (mcpSessionId) => {
					this._registerTransport(mcpSessionId, transport);
					if (!isNaN(clientPid) && !isNaN(clientPpid)) {
						sessionRegistration = this._sessionTracker.registerSession(mcpSessionId, { pid: clientPid, ppid: clientPpid });
					}
				},
				onsessionclosed: closedSessionId => {
					this._unregisterTransport(closedSessionId);
					sessionRegistration?.dispose();
				},
				enableDnsRebindingProtection: true,
				allowedHosts: ['localhost'],
			});

			const { McpServer } = await mcpServerLazy.value;
			const server = new McpServer({
				name: mcpOptions.id,
				title: mcpOptions.serverLabel,
				version: mcpOptions.serverVersion,
			});

			try {
				this._logger.debug('Registering MCP tools...');
				await Promise.resolve(mcpOptions.registerTools(server, sessionId));
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logger.error(`Failed to register MCP tools: ${errMsg}`);
				res.status(500).json({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: `Failed to register MCP tools: ${errMsg}`,
					},
					id: null,
				});
				return;
			}

			await server.connect(transport);
		} else {
			this._logger.debug('Bad request: No valid session ID provided');
			res.status(400).json({
				jsonrpc: '2.0',
				error: {
					code: -32000,
					message: 'Bad Request: No valid session ID provided',
				},
				id: null,
			});
			return;
		}

		await transport.handleRequest(req, res, req.body);
	}

	private async _handleGetDelete(req: express.Request, res: express.Response): Promise<void> {
		const sessionId = req.headers['mcp-session-id'] as string | undefined;
		this._logger.trace(`${req.method} /mcp request, sessionId: ${sessionId ?? '(none)'}`);

		const transport = sessionId ? this._getTransport(sessionId) : undefined;
		if (!sessionId || !transport) {
			this._logger.debug(`Invalid or missing session ID for ${req.method} request`);
			res.status(400).send('Invalid or missing session ID');
			return;
		}

		await transport.handleRequest(req, res);
	}
}

async function getRandomSocketPath(): Promise<string> {
	if (os.platform() === 'win32') {
		return `\\\\.\\pipe\\mcp-${generateUuid()}.sock`;
	} else {
		const prefix = path.join(os.tmpdir(), 'mcp-');
		const tempDir = await fs.mkdtemp(prefix);
		await fs.chmod(tempDir, 0o700);
		return path.join(tempDir, 'mcp.sock');
	}
}

async function tryCleanupSocket(socketPath: string | undefined): Promise<void> {
	try {
		if (os.platform() === 'win32') {
			return;
		}

		if (!socketPath) {
			return;
		}

		const dir = path.dirname(socketPath);
		await fs.rm(dir, { recursive: true, force: true });
	} catch {
		// Best effort
	}
}

const expressLazy = new AsyncLazy(async () => await import('express'));
const streamableHttpLazy = new AsyncLazy(async () => await import('@modelcontextprotocol/sdk/server/streamableHttp.js'));
const mcpServerLazy = new AsyncLazy(async () => await import('@modelcontextprotocol/sdk/server/mcp.js'));
const isInitializeRequestLazy = new AsyncLazy(async () => {
	const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');
	return isInitializeRequest;
});
