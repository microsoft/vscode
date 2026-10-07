/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import WebSocket from 'ws';
import { randomInt } from 'crypto';
import { DeferredPromise, IntervalTimer, RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { AgentHostClientConnectionKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import { getConnectionDiagnosticError } from '../../common/connectionDiagnostics.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { Reassembler } from '../../common/webPubSub/chunking.js';
import { buildPublish, parseInbound, RELIABLE_JSON_SUBPROTOCOL } from '../../common/webPubSub/framing.js';
import { parseGroupName } from '../../common/webPubSub/groups.js';
import { MissionControlControlVerifier } from './missionControlControl.js';
import { MissionControlAuthentication } from './missionControlAuthentication.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { MissionControlSessionMirror, type MissionControlMirrorEvent } from './missionControlSessionMirror.js';

export interface IMissionControlSocket {
	send(data: string): void;
	close(): void;
	on(event: 'message', listener: (data: Buffer | string) => void): void;
	on(event: 'close', listener: (code: number) => void): void;
	on(event: 'error', listener: (error: Error) => void): void;
}

export interface IMissionControlBootstrap {
	readonly url: string;
	readonly access_token: string;
	readonly groups: { readonly control: string; readonly ingest_ack?: string };
}

const relayKeepAliveTimeoutMs = 15 * 60_000;
const maxQueuedMirrorFrames = 128;
const maxQueuedMirrorBytes = 16 * 1024 * 1024;

function newConnectionGeneration(): number {
	return randomInt(1, 2 ** 48);
}

class MissionControlLane extends Disposable implements IProtocolTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.MissionControl;
	readonly transportKind = AgentHostTransportKind.WebSocket;
	get relayClientId(): string { return this.clientId; }
	get relayPassive(): boolean { return this.passive; }
	get relayAuthenticated(): boolean | undefined { return this._authentication?.authenticated; }
	get relayHandshakeMeta(): Record<string, unknown> | undefined {
		return { ...this._authentication?.handshakeMeta, 'copilot.keepAliveTimeoutMs': relayKeepAliveTimeoutMs, ...(this.passive ? { 'copilot.passive': true } : {}) };
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
	private _hasHandshake = false;
	private _handshakeId: number | string | undefined;
	private readonly _earlyMessages: ProtocolMessage[] = [];
	readonly generation = newConnectionGeneration();
	lastReceived = Date.now();
	get isClosed(): boolean { return this._closed; }

	constructor(readonly clientId: string, readonly passive: boolean, private readonly _publish: (group: string, message: unknown, generation: number) => void, private readonly _prefix: string, private readonly _authentication?: MissionControlAuthentication, private readonly _rehandshake?: (lane: MissionControlLane, message: object) => void, private readonly _didClose?: (lane: MissionControlLane) => void) {
		super();
	}

	receive(message: unknown): void {
		if (this._closed || typeof message !== 'object' || message === null || Array.isArray(message)) {
			return;
		}
		this.lastReceived = Date.now();
		const request = message as { id?: unknown; method?: unknown; params?: { clientId?: unknown } };
		if ((request.method === 'initialize' || request.method === 'reconnect') && request.params?.clientId !== this.clientId) {
			this.dispose();
			return;
		}
		if (request.method === 'initialize' || request.method === 'reconnect') {
			if (this._active && (this._hasHandshake || this._handshakeId !== undefined) && this._rehandshake) {
				this._rehandshake(this, message);
				return;
			}
			this._handshakeId = typeof request.id === 'number' || typeof request.id === 'string' ? request.id : undefined;
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
		if (response && this._handshakeId !== undefined && message.id === this._handshakeId) {
			this._hasHandshake = hasKey(message, { result: true });
			this._handshakeId = undefined;
		}
		try {
			this._publish(`${this._prefix}.${response ? 'to-client' : 'broadcast'}`, message, this.generation);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._authentication?.dispose();
			this._onClose.fire();
			this._didClose?.(this);
		}
		super.dispose();
	}
}

/**
 * A bounded virtual AHP server over one reliable-JSON WPS connection.
 * The bootstrap and owner are supplied by the trusted registration lifecycle.
 */
export class MissionControlProtocolServer extends Disposable implements IProtocolServer {
	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;
	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;
	readonly address = undefined;
	private readonly _lanes = this._register(new DisposableMap<string, MissionControlLane>());
	private readonly _reassembler = new Reassembler();
	private readonly _sweep = this._register(new IntervalTimer());
	private readonly _ackTimeout = this._register(new RunOnceScheduler(() => {
		this.dispose();
		this._onError(new Error('Mission Control WPS acknowledgement timed out'));
	}, 30_000));
	private readonly _ready = new DeferredPromise<void>();
	private readonly _pending = new Set<number>();
	private readonly _outbound: { ackId: number; frame: string; mirror?: boolean }[] = [];
	private _outboundBytes = 0;
	private _queuedMirrorFrames = 0;
	private _queuedMirrorBytes = 0;
	private _draining = false;
	private readonly _joins = new Map<number, string>();
	private readonly _bootstrapJoins = new Set<string>();
	private _socket: IMissionControlSocket | undefined;
	private _ackId = 0;
	private _sequence = 0;
	private _connected = false;
	private _closed = false;
	private _ackDeadline: number | undefined;

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
		private readonly _mirror?: MissionControlSessionMirror,
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
		this._socket.on('close', code => {
			if (!this._closed) {
				this.dispose();
				this._onError(new Error(`Mission Control WPS socket closed (code ${code})`));
			}
		});
		this._socket.on('error', error => {
			if (!this._closed) {
				this.dispose();
				this._onError(error);
			}
		});
		this._sweep.cancelAndSet(() => {
			this._reassembler.sweepExpired();
			for (const [id, lane] of this._lanes) {
				if (Date.now() - lane.lastReceived >= relayKeepAliveTimeoutMs) {
					this._lanes.deleteAndLeak(id)?.dispose();
					this._send({ type: 'leaveGroup', group: `user.${this._owner}.env.${this._environment}.client.${id}.to-host` });
				}
			}
		}, 15_000);
		this._waitForAck();
		return this._ready.p;
	}

	private _waitForAck(): void {
		this._ackDeadline ??= Date.now() + 30_000;
		this._ackTimeout.schedule(Math.max(0, this._ackDeadline - Date.now()));
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
		this._waitForAck();
		this._send({ type: 'joinGroup', group, ackId });
	}

	private _publish(group: string, payload: unknown, generation?: number): void {
		const frames = buildPublish({ group, payload, generation, nextAckId: () => ++this._ackId }).map(frame => ({ ackId: frame.ackId, frame: JSON.stringify(frame) }));
		this._enqueue(frames);
	}

	publishMirrorEvent(event: MissionControlMirrorEvent): undefined | false {
		if (this._closed) {
			throw new Error('Mission Control mirror transport closed');
		}
		const ackId = this._ackId + 1;
		const frame = JSON.stringify({ ...event, ackId });
		const bytes = Buffer.byteLength(frame);
		if (this._queuedMirrorFrames >= maxQueuedMirrorFrames || this._queuedMirrorBytes + bytes > maxQueuedMirrorBytes
			|| this._outbound.length >= 512 || this._outboundBytes + bytes > 64 * 1024 * 1024) {
			return false;
		}
		this._ackId = ackId;
		this._enqueue([{ ackId, frame, mirror: true }]);
		return undefined;
	}

	private _enqueue(frames: readonly { ackId: number; frame: string; mirror?: boolean }[]): void {
		const bytes = frames.reduce((total, frame) => total + Buffer.byteLength(frame.frame), 0);
		if (this._closed || this._outbound.length + frames.length > 512 || this._outboundBytes + bytes > 64 * 1024 * 1024) {
			throw new Error('Mission Control ordered publish queue exceeded its limit');
		}
		this._outbound.push(...frames);
		this._outboundBytes += bytes;
		for (const frame of frames) {
			if (frame.mirror) {
				this._queuedMirrorFrames++;
				this._queuedMirrorBytes += Buffer.byteLength(frame.frame);
			}
		}
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
				const bytes = Buffer.byteLength(next.frame);
				this._outboundBytes -= bytes;
				if (next.mirror) {
					this._queuedMirrorFrames--;
					this._queuedMirrorBytes -= bytes;
				}
				this._pending.add(next.ackId);
				this._waitForAck();
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
				this._bootstrapJoins.add(this._bootstrap.groups.control);
				if (this._mirror && this._bootstrap.groups.ingest_ack) {
					this._bootstrapJoins.add(this._bootstrap.groups.ingest_ack);
				}
				this._join(this._bootstrap.groups.control);
				if (this._mirror && this._bootstrap.groups.ingest_ack) {
					this._join(this._bootstrap.groups.ingest_ack);
				}
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
					throw new Error(`Mission Control WPS operation rejected${fields.error ? `: ${getConnectionDiagnosticError(fields.error).message}` : ''}`);
				}
				if (group && group !== this._bootstrap.groups.control && group !== this._bootstrap.groups.ingest_ack) {
					const clientId = parseGroupName(group).scope === 'client' ? group.split('.')[5] : undefined;
					const lane = clientId ? this._lanes.get(clientId) : undefined;
					if (lane) {
						this._onConnection.fire(lane);
						lane.activate();
					}
				}
				if ((group === this._bootstrap.groups.control || group === this._bootstrap.groups.ingest_ack)
					&& group !== undefined) {
					this._bootstrapJoins.delete(group);
					if (this._bootstrapJoins.size === 0) {
						this._ready.complete();
					}
				}
				if (this._joins.size === 0 && this._pending.size === 0) {
					this._ackTimeout.cancel();
					this._ackDeadline = undefined;
				}
				this._drain();
				this._mirror?.resumePublishing();
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
				&& fields.dataType === 'json' && (envelope?.kind === 'spawn_request' || envelope?.kind === 'backfill_request')) {
				this._receiveControl(fields.data);
				return;
			}
			if (this._mirror && fields.type === 'message' && fields.from === 'group' && fields.group === this._bootstrap.groups.ingest_ack
				&& fields.dataType === 'json' && typeof fields.data === 'object' && fields.data !== null && hasKey(fields.data, { watermarks: true })) {
				this._mirror.ingestAck(fields.data);
				return;
			}
			if (fields.type === 'message' && fields.from === 'group' && typeof fields.group === 'string') {
				const group = parseGroupName(fields.group, { expected: { uid: this._owner, eid: this._environment } });
				if (group.scope === 'client' && group.lane === 'to-host') {
					if (this._authenticationFactory && fields.fromUserId !== this._owner) {
						throw new Error('WPS publisher does not match the registered owner');
					}
					const lane = this._lanes.get(group.cid);
					if (lane) {
						lane.lastReceived = Date.now();
					}
				}
			}
			const result = parseInbound(frame, { reassembler: this._reassembler, groupValidation: { expected: { uid: this._owner, eid: this._environment } } });
			if (result.kind !== 'payload' && result.kind !== 'batch') {
				return;
			}
			if (result.group.scope === 'env' && result.group.lane === 'control') {
				if (result.kind === 'payload') {
					this._receiveControl(result.payload);
				}
			} else if (result.group.scope === 'env' && result.group.lane === 'ingest-ack' && result.kind === 'payload') {
				this._mirror?.ingestAck(result.payload);
			} else if (result.group.scope === 'client' && result.group.lane === 'to-host') {
				if (this._authenticationFactory && fields.fromUserId !== this._owner) {
					throw new Error('WPS publisher does not match the registered owner');
				}
				for (const payload of result.kind === 'batch' ? result.payloads : [result.payload]) {
					this._receiveForClient(result.group.cid, payload);
				}
			}
		} catch (error) {
			this._onError(error instanceof Error ? error : new Error(String(error)));
			if (!this._ready.isSettled) {
				this.dispose();
			}
		}
	}

	private _receiveControl(payload: unknown): void {
		if (typeof payload === 'object' && payload !== null && Object.getOwnPropertyDescriptor(payload, 'kind')?.value === 'backfill_request') {
			const backfill = this._verifier.verifyBackfill(payload);
			if (!this._mirror) {
				throw new Error('Mission Control session mirroring is unavailable');
			}
			this._mirror.backfill(backfill);
		} else {
			this._openLane(payload);
		}
	}

	private _receiveForClient(clientId: string, payload: unknown): void {
		let lane = this._lanes.get(clientId);
		if (lane?.isClosed) {
			lane = this._createLane(clientId, lane.passive);
			this._onConnection.fire(lane);
			lane.activate();
		}
		lane?.receive(payload);
	}

	private _openLane(payload: unknown): void {
		const spawn = this._verifier.verify(payload);
		const existing = this._lanes.get(spawn.client_id);
		if (existing) {
			if (existing.passive !== (spawn.passive === true)) {
				throw new Error('Mission Control cannot change the role of an existing client lane');
			}
			return;
		}
		if (this._lanes.size >= 32) {
			throw new Error('Mission Control client lane capacity reached');
		}
		this._createLane(spawn.client_id, spawn.passive === true);
		this._join(`user.${this._owner}.env.${this._environment}.client.${spawn.client_id}.to-host`);
	}

	private _createLane(clientId: string, passive: boolean): MissionControlLane {
		const prefix = `user.${this._owner}.env.${this._environment}.client.${clientId}`;
		const lane = new MissionControlLane(clientId, passive, (group, payload, generation) => this._publish(group, payload, generation), prefix, this._authenticationFactory?.(), (previous, message) => {
			if (this._closed || this._lanes.get(clientId) !== previous) {
				return;
			}
			previous.dispose();
			this._receiveForClient(clientId, message);
		}, ended => {
			if (!this._closed && this._lanes.get(clientId) === ended) {
				const ackId = ++this._ackId;
				const frame = JSON.stringify({ type: 'sendToGroup', group: `${prefix}.to-client`, ackId, dataType: 'json', noEcho: true, data: { kind: 'closed', generation: ended.generation } });
				try {
					this._enqueue([{ ackId, frame }]);
				} catch (error) {
					this._onError(error instanceof Error ? error : new Error(String(error)));
					this.dispose();
					return;
				}
			}
		});
		this._lanes.set(clientId, lane);
		return lane;
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			if (!this._ready.isSettled) {
				this._ready.error(new Error('Mission Control WPS connection closed before joining control group'));
			}
			this._socket?.close();
			this._socket = undefined;
			this._onClose.fire();
		}
		super.dispose();
	}
}
