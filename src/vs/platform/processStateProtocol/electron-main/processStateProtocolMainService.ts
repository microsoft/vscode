/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import {
	decodeMessages,
	encodeMessage,
	IInitializeParams,
	IInitializeResult,
	initialWatchDoc,
	IPspSessionSnapshot,
	IProcessStateProtocolMainService,
	ISessionUpdateParams,
	IWatchDoc,
	IJsonRpcRequest,
	JsonRpcMessage,
	PROTOCOL_VERSION,
	PspMethod,
} from '../common/protocol.js';

/**
 * Main-process implementation of the PSP hub. Owns a single named pipe / UDS server and tracks
 * publishers per claimed token.
 */
export class ProcessStateProtocolMainService extends Disposable implements IProcessStateProtocolMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _server: net.Server;
	private readonly _sessionsByToken = new Map<string, MutableSession>();
	private _endpoint: string | undefined;
	private _whenListening: Promise<string> | undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<readonly IPspSessionSnapshot[]>());
	readonly onDidChangeSessions: Event<readonly IPspSessionSnapshot[]> = this._onDidChangeSessions.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._server = net.createServer(socket => this._onConnection(socket));
		this._register(toDisposable(() => this._server.close()));

		// Start listening eagerly so the endpoint is ready before any renderer asks.
		void this._start().catch(err => this._logService.error('[psp] failed to start hub', err));
	}

	getEndpoint(): Promise<string> {
		return this._start();
	}

	async claimToken(token: string): Promise<void> {
		if (!this._sessionsByToken.has(token)) {
			this._sessionsByToken.set(token, new MutableSession(token));
			// No publisher yet — no snapshot change to broadcast.
		}
	}

	async revokeToken(token: string): Promise<void> {
		const session = this._sessionsByToken.get(token);
		if (!session) {
			return;
		}
		this._sessionsByToken.delete(token);
		const wasConnected = session.connected;
		session.dispose();
		if (wasConnected) {
			this._broadcast();
		}
	}

	private _start(): Promise<string> {
		if (!this._whenListening) {
			this._endpoint = computeEndpointPath();
			this._whenListening = new Promise<string>((resolve, reject) => {
				this._server.once('error', reject);
				this._server.listen(this._endpoint, () => {
					this._server.removeListener('error', reject);
					this._logService.info(`[psp] hub listening at ${this._endpoint}`);
					resolve(this._endpoint!);
				});
			});
		}
		return this._whenListening;
	}

	private _onConnection(socket: net.Socket): void {
		const store = new DisposableStore();
		store.add(toDisposable(() => socket.destroy()));

		let buffer = '';
		let session: MutableSession | undefined;

		socket.setEncoding('utf8');
		socket.on('data', (chunk: string) => {
			buffer += chunk;
			let parsed: { messages: JsonRpcMessage[]; tail: string };
			try {
				parsed = decodeMessages(buffer);
			} catch (err) {
				// Malformed frame — drop the connection rather than risk drift.
				socket.destroy(err as Error);
				return;
			}
			buffer = parsed.tail;
			for (const msg of parsed.messages) {
				try {
					const next = this._dispatch(socket, session, msg);
					if (next) {
						session = next;
					}
				} catch (err) {
					socket.destroy(err as Error);
					return;
				}
			}
		});

		socket.on('close', () => {
			if (session) {
				const wasConnected = session.connected;
				session.detach();
				if (wasConnected) {
					this._broadcast();
				}
			}
			store.dispose();
		});
		socket.on('error', () => { /* handled via close */ });
	}

	private _dispatch(socket: net.Socket, current: MutableSession | undefined, msg: JsonRpcMessage): MutableSession | undefined {
		if ('id' in msg && msg.method === PspMethod.Initialize) {
			const req = msg as IJsonRpcRequest;
			const params = req.params as IInitializeParams | undefined;
			if (!params || typeof params.token !== 'string') {
				socket.write(encodeMessage({ jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'missing token' } }));
				socket.destroy();
				return undefined;
			}
			const session = this._sessionsByToken.get(params.token);
			if (!session) {
				socket.write(encodeMessage({ jsonrpc: '2.0', id: req.id, error: { code: 4401, message: 'unknown or revoked token' } }));
				socket.destroy();
				return undefined;
			}
			if (session.connected) {
				socket.write(encodeMessage({ jsonrpc: '2.0', id: req.id, error: { code: 4409, message: 'token already in use' } }));
				socket.destroy();
				return undefined;
			}
			session.attach({ name: params.client?.name, version: params.client?.version });
			const result: IInitializeResult = { protocolVersion: PROTOCOL_VERSION, sessionId: session.id };
			socket.write(encodeMessage({ jsonrpc: '2.0', id: req.id, result }));
			this._broadcast();
			return session;
		}

		if (!current) {
			throw new Error('publisher must initialize before sending other messages');
		}

		if (msg.method === PspMethod.SessionUpdate) {
			const params = (msg as { params?: ISessionUpdateParams }).params;
			if (params && params.doc && typeof params.doc.status === 'string') {
				current.update(params.doc);
				this._broadcast();
			}
			return undefined;
		}

		if (msg.method === PspMethod.SessionClose) {
			current.detach();
			this._broadcast();
			socket.destroy();
			return undefined;
		}

		return undefined;
	}

	private _broadcast(): void {
		const snapshots: IPspSessionSnapshot[] = [];
		for (const session of this._sessionsByToken.values()) {
			if (session.connected) {
				snapshots.push(session.toSnapshot());
			}
		}
		this._onDidChangeSessions.fire(snapshots);
	}
}

class MutableSession {

	readonly id: string = randomUUID();
	private _connected = false;
	private _client: { readonly name?: string; readonly version?: string } | undefined;
	private _doc: IWatchDoc = initialWatchDoc;

	get connected(): boolean { return this._connected; }

	constructor(private readonly _token: string) { }

	attach(client: { name?: string; version?: string }): void {
		this._connected = true;
		this._client = client;
	}

	detach(): void {
		this._connected = false;
	}

	update(doc: IWatchDoc): void {
		this._doc = doc;
	}

	dispose(): void {
		this._connected = false;
	}

	toSnapshot(): IPspSessionSnapshot {
		return {
			id: this.id,
			token: this._token,
			client: this._client,
			doc: this._doc,
		};
	}
}

function computeEndpointPath(): string {
	const id = randomUUID();
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-psp-${id}`;
	}
	return path.join(os.tmpdir(), `vscode-psp-${id}.sock`);
}
