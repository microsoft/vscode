/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Server-side IPC channel that proxies the agent host protocol from a
// renderer to the agent host process running on the server. For each
// renderer client (identified by IPC context) the channel opens its own
// AHP-over-WebSocket connection upstream and pipes raw JSON frames.
//
// The renderer-side counterpart is `AgentHostIpcChannelTransport` in
// `src/vs/platform/agentHost/browser/`. Together they reuse the existing
// `RemoteAgentHostProtocolClient` over IPC instead of a raw WebSocket.

import { Emitter, Event } from '../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable } from '../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../base/common/network.js';
import { IPCServer, IServerChannel } from '../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IServerLifetimeService } from './serverLifetimeService.js';
import type * as wsTypes from 'ws';
import type * as netTypes from 'net';

/**
 * Endpoint description for the upstream agent host. One of `port` or
 * `socketPath` must be set, matching how `setWebSocketConfig` is called
 * for `NodeAgentHostStarter`.
 */
export interface IAgentHostUpstreamEndpoint {
	readonly host?: string;
	readonly port?: string;
	readonly socketPath?: string;
	readonly connectionToken?: string;
}

/**
 * Lazy-loaded `ws` module. Imported once on first connection so renderers
 * that never touch the agent host don't pay the cost.
 */
let _wsModule: typeof wsTypes | undefined;
async function loadWs(): Promise<typeof wsTypes> {
	return _wsModule ??= await import('ws');
}

let _netModule: typeof netTypes | undefined;
async function loadNet(): Promise<typeof netTypes> {
	return _netModule ??= await import('net');
}

/**
 * One upstream connection to the agent host, owned by a single renderer
 * client. The default implementation wraps a `ws.WebSocket`; tests inject
 * a custom factory via {@link AgentHostChannel.upstreamFactory}.
 */
export interface IUpstreamConnection extends IDisposable {
	readonly onFrame: Event<string>;
	readonly onClose: Event<void>;
	connect(): Promise<void>;
	send(frame: string): void;
}

export type UpstreamConnectionFactory = (endpoint: IAgentHostUpstreamEndpoint) => IUpstreamConnection;

/**
 * Default upstream factory: opens an AHP WebSocket to the local agent host.
 */
const defaultUpstreamFactory = (logService: ILogService, lifetime: IServerLifetimeService): UpstreamConnectionFactory =>
	(endpoint) => new WebSocketUpstreamConnection(endpoint, logService, lifetime);

class WebSocketUpstreamConnection extends Disposable implements IUpstreamConnection {
	private readonly _onFrame = this._register(new Emitter<string>());
	readonly onFrame: Event<string> = this._onFrame.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	private _ws: wsTypes.WebSocket | undefined;
	private _connectPromise: Promise<void> | undefined;
	private _closeFired = false;
	private readonly _lifetimeToken = this._register(new MutableDisposable());

	constructor(
		private readonly _endpoint: IAgentHostUpstreamEndpoint,
		private readonly _logService: ILogService,
		private readonly _serverLifetimeService: IServerLifetimeService,
	) {
		super();
	}

	connect(): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.reject(new Error('UpstreamConnection is disposed'));
		}
		return this._connectPromise ??= this._doConnect();
	}

	private async _doConnect(): Promise<void> {
		const ws = await loadWs();
		const url = this._buildUrl();
		const wsOptions = await this._buildWsOptions();

		this._logService.info(`[AgentHostChannel] Opening upstream to ${this._endpoint.socketPath ?? url}`);
		const socket = new ws.WebSocket(url, wsOptions);
		this._ws = socket;

		return new Promise<void>((resolve, reject) => {
			const onOpen = () => {
				cleanup();
				this._logService.trace('[AgentHostChannel] Upstream open');
				this._lifetimeToken.value = this._serverLifetimeService.active('AgentHostChannel');
				socket.on('message', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8');
					this._onFrame.fire(text);
				});
				socket.on('close', () => this._fireClose());
				socket.on('error', err => {
					this._logService.warn('[AgentHostChannel] Upstream error', err);
					this._fireClose();
				});
				resolve();
			};

			const onError = (err: Error) => {
				cleanup();
				this._logService.warn('[AgentHostChannel] Upstream connection failed', err);
				this._fireClose();
				reject(err);
			};

			const onClose = () => {
				cleanup();
				this._fireClose();
				reject(new Error('Upstream closed before connect'));
			};

			const cleanup = () => {
				socket.removeListener('open', onOpen);
				socket.removeListener('error', onError);
				socket.removeListener('close', onClose);
			};

			socket.on('open', onOpen);
			socket.on('error', onError);
			socket.on('close', onClose);
		});
	}

	send(frame: string): void {
		const ws = this._ws;
		if (!ws || ws.readyState !== ws.OPEN) {
			this._logService.warn('[AgentHostChannel] Drop send: upstream not open');
			this._fireClose();
			return;
		}
		ws.send(frame);
	}

	override dispose(): void {
		this._ws?.close();
		this._fireClose();
		super.dispose();
	}

	private _fireClose(): void {
		if (this._closeFired) {
			return;
		}
		this._closeFired = true;
		this._lifetimeToken.clear();
		this._onClose.fire();
	}

	private _buildUrl(): string {
		const host = this._endpoint.host ?? 'localhost';
		const port = this._endpoint.port ?? '0';
		let url = `ws://${host}:${port}`;
		if (this._endpoint.connectionToken) {
			url += `?${connectionTokenQueryName}=${encodeURIComponent(this._endpoint.connectionToken)}`;
		}
		return url;
	}

	private async _buildWsOptions(): Promise<wsTypes.ClientOptions | undefined> {
		if (!this._endpoint.socketPath) {
			return undefined;
		}
		const net = await loadNet();
		const socketPath = this._endpoint.socketPath;
		// Note: `createConnection` shape required by `ws` differs slightly
		// across versions; we cast through `unknown` to match the local typings.
		const createConnection = (() => net.createConnection(socketPath)) as unknown as wsTypes.ClientOptions['createConnection'];
		return { createConnection } satisfies wsTypes.ClientOptions;
	}
}

/**
 * IPC channel that proxies the agent host protocol. One channel instance
 * serves all renderer clients; per-context state is tracked in `_perCtx`.
 */
export class AgentHostChannel<TContext> extends Disposable implements IServerChannel<TContext> {

	private readonly _perCtx = new Map<TContext, IUpstreamConnection>();
	private readonly _upstreamFactory: UpstreamConnectionFactory;

	constructor(
		ipcServer: IPCServer<TContext>,
		private readonly _endpoint: IAgentHostUpstreamEndpoint,
		private readonly _logService: ILogService,
		serverLifetimeService: IServerLifetimeService,
		upstreamFactory?: UpstreamConnectionFactory,
	) {
		super();
		this._upstreamFactory = upstreamFactory ?? defaultUpstreamFactory(_logService, serverLifetimeService);
		this._register(ipcServer.onDidRemoveConnection(c => this._disposeCtx(c.ctx as unknown as TContext)));
	}

	listen<T>(ctx: TContext, event: string): Event<T> {
		const conn = this._getOrCreate(ctx);
		switch (event) {
			case 'frame': return conn.onFrame as Event<unknown> as Event<T>;
			case 'close': return conn.onClose as Event<unknown> as Event<T>;
		}
		throw new Error(`Invalid listen: ${event}`);
	}

	async call<T>(ctx: TContext, command: string, arg?: unknown): Promise<T> {
		const conn = this._getOrCreate(ctx);
		switch (command) {
			case 'connect':
				this._logService.info(`[AgentHostChannel] Renderer ctx=${String(ctx)} requested connect to upstream`);
				await conn.connect();
				return undefined as T;
			case 'send':
				if (typeof arg !== 'string') {
					throw new Error('send: arg must be a string frame');
				}
				conn.send(arg);
				return undefined as T;
			case 'close':
				this._disposeCtx(ctx);
				return undefined as T;
		}
		throw new Error(`Invalid call: ${command}`);
	}

	override dispose(): void {
		for (const conn of this._perCtx.values()) {
			conn.dispose();
		}
		this._perCtx.clear();
		super.dispose();
	}

	private _getOrCreate(ctx: TContext): IUpstreamConnection {
		let conn = this._perCtx.get(ctx);
		if (!conn) {
			conn = this._upstreamFactory(this._endpoint);
			this._perCtx.set(ctx, conn);
			// If the upstream closes on its own (e.g. agent host restart or
			// connection drop), evict it from the cache so the next
			// `connect()` call creates a fresh upstream rather than
			// returning the stuck-closed one.
			const sub = conn.onClose(() => {
				sub.dispose();
				if (this._perCtx.get(ctx) === conn) {
					this._perCtx.delete(ctx);
				}
			});
		}
		return conn;
	}

	private _disposeCtx(ctx: TContext): void {
		const conn = this._perCtx.get(ctx);
		if (conn) {
			this._perCtx.delete(ctx);
			conn.dispose();
		}
	}
}
