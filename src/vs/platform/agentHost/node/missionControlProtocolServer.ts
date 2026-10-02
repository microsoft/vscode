/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import WebSocket from 'ws';
import { DeferredPromise, IntervalTimer, RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import { Reassembler } from '../common/webPubSub/chunking.js';
import { buildPublish, parseInbound, RELIABLE_JSON_SUBPROTOCOL } from '../common/webPubSub/framing.js';
import { parseGroupName } from '../common/webPubSub/groups.js';
import { MissionControlControlVerifier } from './missionControlControl.js';
import { MissionControlAuthentication } from './missionControlAuthentication.js';
import type { AuthenticateParams } from '../common/agent.js';

export interface IMissionControlSocket {
	send(data: string): void;
	close(): void;
	on(event: 'message', listener: (data: Buffer | string) => void): void;
	on(event: 'close' | 'error', listener: () => void): void;
}

export interface IMissionControlBootstrap {
	readonly url: string;
	readonly access_token: string;
	readonly groups: { readonly control: string };
}

class MissionControlLane extends Disposable implements IProtocolTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.WebPubSub;
	get relayClientId(): string { return this.clientId; }
	get relayPassive(): boolean { return this.passive; }
	get relayHandshakeMeta(): Record<string, unknown> | undefined {
		return this._authentication ? { ...this._authentication.handshakeMeta, ...(this.passive ? { 'copilot.passive': true } : {}) } : undefined;
	}
	relayAuthenticate(params: AuthenticateParams): Promise<AuthenticateParams> {
		if (!this._authentication) {
			throw new Error('Relay authentication is unavailable');
		}
		return this._authentication.authenticate(params);
	}
	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;
	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;
	private _closed = false;
	private _active = false;
	private readonly _earlyMessages: ProtocolMessage[] = [];

	constructor(readonly clientId: string, readonly passive: boolean, private readonly _publish: (group: string, message: unknown) => void, private readonly _prefix: string, private readonly _authentication?: MissionControlAuthentication) {
		super();
	}

	receive(message: unknown): void {
		if (this._closed || typeof message !== 'object' || message === null || Array.isArray(message)) {
			return;
		}
		const request = message as { method?: unknown; params?: { clientId?: unknown } };
		if ((request.method === 'initialize' || request.method === 'reconnect') && request.params?.clientId !== this.clientId) {
			this.dispose();
			return;
		}
		if (request.method === 'initialize' || request.method === 'reconnect') {
			this._authentication?.beginHandshake();
		}
		if (!this._authentication && (request.method === 'authenticate' || request.method === 'resourceRequest' || request.method === 'dispatchAction' || request.method === 'setClientManagedSettingsPermissions')) {
			this.dispose();
			return;
		}
		if (!this._active) {
			if (this._earlyMessages.length >= 32) {
				this.dispose();
			} else {
				this._earlyMessages.push(message as ProtocolMessage);
			}
			return;
		}
		this._onMessage.fire(message as ProtocolMessage);
	}

	activate(): void {
		this._active = true;
		for (const message of this._earlyMessages.splice(0)) {
			this._onMessage.fire(message);
		}
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest): void {
		if (this._closed) {
			throw new Error('Mission Control lane closed');
		}
		const response = hasKey(message, { id: true });
		try {
			this._publish(`${this._prefix}.${response ? 'to-client' : 'broadcast'}`, message);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._onClose.fire();
		}
		super.dispose();
	}
}

/**
 * A bounded virtual AHP server over one reliable-JSON WPS connection.
 * The bootstrap and owner are supplied by the trusted registration lifecycle.
 */
export class MissionControlProtocolServer extends Disposable implements IProtocolServer {
	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;
	readonly address = undefined;
	private readonly _lanes = this._register(new DisposableMap<string, MissionControlLane>());
	private readonly _reassembler = new Reassembler();
	private readonly _sweep = this._register(new IntervalTimer());
	private readonly _ackTimeout = this._register(new RunOnceScheduler(() => this.dispose(), 30_000));
	private readonly _ready = new DeferredPromise<void>();
	private readonly _pending = new Set<number>();
	private readonly _outbound: { ackId: number; frame: string }[] = [];
	private _outboundBytes = 0;
	private _draining = false;
	private readonly _joins = new Map<number, string>();
	private _socket: IMissionControlSocket | undefined;
	private _ackId = 0;
	private _sequence = 0;
	private _connected = false;
	private _closed = false;

	get isClosed(): boolean { return this._closed; }

	constructor(
		private readonly _bootstrap: IMissionControlBootstrap,
		private readonly _owner: string,
		private readonly _environment: string,
		private readonly _verifier: MissionControlControlVerifier,
		private readonly _socketFactory: (url: string, protocol: string) => IMissionControlSocket = (url, protocol) => new WebSocket(url, protocol),
		private readonly _onError: (error: Error) => void = () => { },
		private readonly _authenticationFactory?: () => MissionControlAuthentication,
		readonly rootMeta?: Record<string, unknown>,
	) {
		super();
		parseGroupName(_bootstrap.groups.control, { expected: { uid: _owner, eid: _environment } });
	}

	connect(): Promise<void> {
		if (this._socket || this._closed) {
			throw new Error('Mission Control socket already connected or disposed');
		}
		const url = new URL(this._bootstrap.url);
		if (url.username || url.password || url.search || url.hash
			|| (this._authenticationFactory ? url.protocol !== 'wss:' : url.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
			throw new Error('Mission Control returned an unsafe WPS endpoint');
		}
		url.searchParams.set('access_token', this._bootstrap.access_token);
		this._socket = this._socketFactory(url.toString(), RELIABLE_JSON_SUBPROTOCOL);
		this._socket.on('message', data => this._receive(data));
		this._socket.on('close', () => this.dispose());
		this._socket.on('error', () => this.dispose());
		this._sweep.cancelAndSet(() => this._reassembler.sweepExpired(), 15_000);
		this._ackTimeout.schedule();
		return this._ready.p;
	}

	private _send(frame: object): void {
		if (this._closed || !this._socket || this._pending.size + this._joins.size >= 128) {
			throw new Error('Mission Control WPS publish queue unavailable');
		}
		this._socket.send(JSON.stringify(frame));
	}

	private _join(group: string): void {
		const ackId = ++this._ackId;
		this._joins.set(ackId, group);
		this._ackTimeout.schedule();
		this._send({ type: 'joinGroup', group, ackId });
	}

	private _publish(group: string, payload: unknown): void {
		const frames = buildPublish({ group, payload, nextAckId: () => ++this._ackId }).map(frame => ({ ackId: frame.ackId, frame: JSON.stringify(frame) }));
		const bytes = frames.reduce((total, frame) => total + Buffer.byteLength(frame.frame), 0);
		if (this._closed || this._outbound.length + frames.length > 512 || this._outboundBytes + bytes > 64 * 1024 * 1024) {
			throw new Error('Mission Control ordered publish queue exceeded its limit');
		}
		this._outbound.push(...frames);
		this._outboundBytes += bytes;
		this._drain();
	}

	private _drain(): void {
		if (this._draining || this._closed) {
			return;
		}
		this._draining = true;
		try {
			while (this._pending.size === 0 && this._outbound.length > 0) {
				const next = this._outbound.shift()!;
				this._outboundBytes -= Buffer.byteLength(next.frame);
				this._pending.add(next.ackId);
				this._ackTimeout.schedule();
				this._socket!.send(next.frame);
			}
		} finally {
			this._draining = false;
		}
	}

	private _receive(data: Buffer | string): void {
		if (this._closed) {
			return;
		}
		try {
			if (data.length > 2 * 1024 * 1024) {
				throw new Error('Mission Control WPS frame exceeds receive limit');
			}
			const frame: unknown = JSON.parse(data.toString());
			if (typeof frame !== 'object' || frame === null) {
				throw new Error('Invalid WPS frame');
			}
			const fields = frame as Record<string, unknown>;
			if (fields.type === 'system' && fields.event === 'connected') {
				this._connected = true;
				this._join(this._bootstrap.groups.control);
				return;
			}
			if (fields.type === 'ack') {
				const id = fields.ackId;
				if (typeof id !== 'number') {
					throw new Error('Invalid WPS acknowledgement');
				}
				const group = this._joins.get(id);
				this._joins.delete(id);
				const pending = this._pending.delete(id);
				if ((group || pending) && fields.success !== true && !(pending && (fields.error as { name?: string } | undefined)?.name === 'Duplicate')) {
					this.dispose();
					throw new Error('Mission Control WPS operation rejected');
				}
				if (group && group !== this._bootstrap.groups.control) {
					const clientId = parseGroupName(group).scope === 'client' ? group.split('.')[5] : undefined;
					const lane = clientId ? this._lanes.get(clientId) : undefined;
					if (lane) {
						this._onConnection.fire(lane);
						lane.activate();
					}
				}
				if (group === this._bootstrap.groups.control) {
					this._ready.complete();
				}
				if (this._joins.size === 0 && this._pending.size === 0) {
					this._ackTimeout.cancel();
				}
				this._drain();
				return;
			}
			if (!this._connected) {
				throw new Error('WPS message before handshake');
			}
			if (fields.type === 'message' && fields.sequenceId !== undefined) {
				const id = fields.sequenceId;
				if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
					throw new Error('Invalid WPS sequence');
				}
				const duplicate = id <= this._sequence;
				this._sequence = Math.max(this._sequence, id);
				this._send({ type: 'sequenceAck', sequenceId: this._sequence });
				if (duplicate) {
					return;
				}
			}
			const envelope = typeof fields.data === 'object' && fields.data !== null ? fields.data as { readonly kind?: unknown } : undefined;
			if (fields.type === 'message' && fields.from === 'group' && fields.group === this._bootstrap.groups.control
				&& fields.dataType === 'json' && envelope?.kind === 'spawn_request') {
				this._openLane(fields.data);
				return;
			}
			const result = parseInbound(frame, { reassembler: this._reassembler, groupValidation: { expected: { uid: this._owner, eid: this._environment } } });
			if (result.kind !== 'payload') {
				return;
			}
			if (result.group.scope === 'env' && result.group.lane === 'control') {
				this._openLane(result.payload);
			} else if (result.group.scope === 'client' && result.group.lane === 'to-host') {
				if (this._authenticationFactory && fields.fromUserId !== this._owner) {
					throw new Error('WPS publisher does not match the registered owner');
				}
				this._lanes.get(result.group.cid)?.receive(result.payload);
			}
		} catch (error) {
			this._onError(error instanceof Error ? error : new Error(String(error)));
			if (!this._ready.isSettled) {
				this.dispose();
			}
		}
	}

	private _openLane(payload: unknown): void {
		const spawn = this._verifier.verify(payload);
		if (this._lanes.has(spawn.client_id) || this._lanes.size >= 32) {
			throw new Error('Mission Control client lane already exists or capacity reached');
		}
		const prefix = `user.${this._owner}.env.${this._environment}.client.${spawn.client_id}`;
		const lane = new MissionControlLane(spawn.client_id, spawn.passive === true, (group, payload) => this._publish(group, payload), prefix, this._authenticationFactory?.());
		this._lanes.set(spawn.client_id, lane);
		Event.once(lane.onClose)(() => this._lanes.deleteAndLeak(spawn.client_id));
		this._join(`${prefix}.to-host`);
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			if (!this._ready.isSettled) {
				this._ready.error(new Error('Mission Control WPS connection closed before joining control group'));
			}
			this._socket?.close();
			this._socket = undefined;
		}
		super.dispose();
	}
}
