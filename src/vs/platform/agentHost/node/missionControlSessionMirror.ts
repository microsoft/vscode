/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type { ActionEnvelope } from '../common/state/sessionActions.js';
import { chunk, type ChunkEnvelope, type ChunkOptions, DEFAULT_MAX_CHUNK_BYTES } from '../common/webPubSub/chunking.js';

export interface IMissionControlMirrorProject {
	readonly uri: string;
	readonly display_name: string;
}

export interface IMissionControlReplicationFrame {
	readonly environment_id: string;
	readonly session_id: string;
	readonly ns: 'ahp';
	readonly seq: number;
	readonly at: string;
	readonly project?: IMissionControlMirrorProject;
	readonly payload: ChunkEnvelope;
}

export type MissionControlMirrorFailure =
	| { readonly namespace: 'ahp'; readonly reason: 'serialization_failed' | 'framing_failed' | 'spool_capacity'; readonly server_seq: number }
	| { readonly namespace: 'ahp'; readonly reason: 'source_lag'; readonly skipped: number };

export interface IMissionControlSessionLifecycle {
	readonly environment_id: string;
	readonly session_id: string;
	readonly kind: 'started' | 'completed' | 'failed' | 'aborted' | 'mirror_failed';
	readonly at: string;
	readonly details?: Record<string, unknown> | MissionControlMirrorFailure;
}

/** The connection owner adds its transport-only ackId, without wrapping data in another ChunkEnvelope. */
export type MissionControlMirrorEvent =
	| { readonly type: 'event'; readonly event: 'sessionEvents'; readonly dataType: 'json'; readonly data: IMissionControlReplicationFrame }
	| { readonly type: 'event'; readonly event: 'sessionLifecycle'; readonly dataType: 'json'; readonly data: IMissionControlSessionLifecycle };

/** Synchronous queue acceptance only: throw if enqueueing fails; never await socket or service acknowledgements. */
export type MissionControlMirrorSender = (event: MissionControlMirrorEvent) => undefined;

/** Signature, owner, timestamp and nonce verification belong to the control ingress, before this call. */
export interface IMissionControlMirrorBackfill {
	readonly kind: 'backfill_request';
	readonly environment_id: string;
	readonly session_id: string;
	readonly ns: 'ahp';
	readonly from_seq: number;
	readonly to_seq: number;
	readonly request_id: string;
}

const creditWindow = 1024;
const maxMetadataBytes = 16 * 1024;
const transportAckBytes = Buffer.byteLength(',"ackId":9007199254740991');
const defaultLimits = {
	maxSessionFrames: 10_000,
	maxSessionBytes: 32 * 1024 * 1024,
	maxTotalFrames: 100_000,
	maxTotalBytes: 128 * 1024 * 1024,
	maxSessions: 1024,
	maxBackfillFrames: 4096,
	maxBackfillRequests: 64,
	maxFramesPerFlush: 128,
	maxEventBytes: 1024 * 1024,
};

export interface IMissionControlSessionMirrorOptions extends Partial<typeof defaultLimits> {
	readonly chunkOptions?: ChunkOptions;
	readonly now?: () => number;
}

export interface IMissionControlMirrorStatus {
	readonly nextSeq: number;
	readonly publishedSeq: number;
	readonly acknowledgedSeq: number;
	readonly retainedFrames: number;
	readonly retainedBytes: number;
	readonly failure: MissionControlMirrorFailure | undefined;
}

interface RetainedFrame {
	readonly json: string;
	readonly bytes: number;
}

interface BackfillRange {
	nextSeq: number;
	readonly toSeq: number;
}

interface SessionSpool {
	readonly sessionId: string;
	readonly project: IMissionControlMirrorProject | undefined;
	readonly frames: Map<number, RetainedFrame>;
	readonly backfills: BackfillRange[];
	nextSeq: number;
	publishedSeq: number;
	acknowledgedSeq: number;
	nextToSend: number;
	bytes: number;
	failure: MissionControlMirrorFailure | undefined;
	failureEvent: string | undefined;
	failurePending: boolean;
	lifecycleEvent: string | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSequence(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSessionId(value: string): boolean {
	return /^[A-Za-z][A-Za-z0-9+.-]*:\/[^\s]+$/.test(value);
}

/**
 * Process-owned, bounded AHP frame spool, independent of socket lifetimes and direct client dispatch.
 * Restart loses retained frames and sequence counters: continuing the same mirrored session URI after restart is unsafe.
 * Only authoritative ActionEnvelopes are admitted; the mirror wire contract defines no initialSnapshot notification or native raw-SDK source.
 */
export class MissionControlSessionMirror extends Disposable {
	private readonly _sessions = new Map<string, SessionSpool>();
	private readonly _ready = new Set<SessionSpool>();
	private readonly _scheduler = this._register(new RunOnceScheduler(() => this._flush(), 1));
	private readonly _limits: typeof defaultLimits;
	private readonly _chunkOptions: ChunkOptions | undefined;
	private readonly _now: () => number;
	private _attachment: { readonly sender: MissionControlMirrorSender } | undefined;
	private _retainedFrames = 0;
	private _retainedBytes = 0;
	private _backfillFrames = 0;
	private _backfillRequests = 0;

	constructor(
		private readonly _environmentId: string,
		options: IMissionControlSessionMirrorOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		const { chunkOptions, now, ...limits } = options;
		const resolvedLimits = { ...defaultLimits, ...limits };
		if (!_environmentId || Buffer.byteLength(_environmentId) > maxMetadataBytes
			|| Object.values(resolvedLimits).some(value => !Number.isSafeInteger(value) || value < 1)
			|| resolvedLimits.maxEventBytes > defaultLimits.maxEventBytes) {
			throw new Error('Invalid Mission Control mirror limits or environment');
		}
		super();
		this._limits = resolvedLimits;
		this._chunkOptions = chunkOptions;
		this._now = now ?? Date.now;
		this._register(toDisposable(() => {
			this.detach();
			this._sessions.clear();
			this._retainedFrames = this._retainedBytes = this._backfillFrames = this._backfillRequests = 0;
		}));
	}

	/** Register before observing actions; entries are never evicted or reused while this process owns the mirror. */
	registerSession(sessionId: string, project?: IMissionControlMirrorProject): void {
		this._assertLive();
		if (!isSessionId(sessionId) || (project && (!project.uri || !project.display_name))
			|| Buffer.byteLength(JSON.stringify({ environmentId: this._environmentId, sessionId, project })) > maxMetadataBytes) {
			throw new Error('Invalid Mission Control mirror session metadata');
		}
		const failureEvent = this._failureJson(sessionId, {
			namespace: 'ahp', reason: 'serialization_failed', server_seq: Number.MAX_SAFE_INTEGER,
		});
		if (Buffer.byteLength(failureEvent) + transportAckBytes > this._limits.maxEventBytes) {
			throw new Error('Mission Control mirror session cannot fit an integrity signal');
		}
		const existing = this._sessions.get(sessionId);
		if (existing) {
			if (existing.project?.uri !== project?.uri || existing.project?.display_name !== project?.display_name) {
				throw new Error('Mission Control mirror project cannot change');
			}
			return;
		}
		if (this._sessions.size >= this._limits.maxSessions) {
			throw new Error('Mission Control mirror session capacity exhausted');
		}
		this._sessions.set(sessionId, {
			sessionId, project: project && { uri: project.uri, display_name: project.display_name },
			frames: new Map(), backfills: [], nextSeq: 0, publishedSeq: -1, acknowledgedSeq: -1, nextToSend: 0,
			bytes: 0, failure: undefined, failureEvent: undefined, failurePending: false, lifecycleEvent: undefined,
		});
	}

	/** The caller supplies the owning session, including for chat/changeset channels; admission never publishes inline. */
	enqueue(envelope: ActionEnvelope, sessionId: string): boolean {
		const session = this._session(sessionId);
		if (session.failure) {
			return false;
		}
		if (!isSequence(envelope.serverSeq)) {
			throw new Error('Invalid authoritative AHP serverSeq');
		}
		let serialised: string;
		try {
			serialised = JSON.stringify(envelope);
			if (serialised === undefined) {
				throw new Error('Unserialisable AHP envelope');
			}
		} catch {
			this._fail(session, { namespace: 'ahp', reason: 'serialization_failed', server_seq: envelope.serverSeq });
			return false;
		}

		let candidates: RetainedFrame[];
		try {
			const at = this._timestamp();
			const overhead = Buffer.byteLength(this._frameJson(session, Number.MAX_SAFE_INTEGER, at, { kind: 'message', data: null }))
				- Buffer.byteLength(JSON.stringify({ kind: 'message', data: null })) + transportAckBytes;
			const payload: ActionEnvelope = JSON.parse(serialised);
			const fragments = chunk(payload, {
				...this._chunkOptions,
				maxChunkBytes: Math.min(this._chunkOptions?.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES, this._limits.maxEventBytes - overhead),
			});
			if (!Number.isSafeInteger(session.nextSeq + fragments.length)) {
				throw new Error('Mirror sequence exhausted');
			}
			candidates = fragments.map((fragment, index) => {
				const json = this._frameJson(session, session.nextSeq + index, at, fragment);
				const bytes = Buffer.byteLength(json);
				if (bytes + transportAckBytes > this._limits.maxEventBytes) {
					throw new Error('Mirror event exceeds transport ceiling');
				}
				return { json, bytes };
			});
		} catch {
			this._fail(session, { namespace: 'ahp', reason: 'framing_failed', server_seq: envelope.serverSeq });
			return false;
		}
		const bytes = candidates.reduce((sum, frame) => sum + frame.bytes, 0);
		if (session.frames.size + candidates.length > this._limits.maxSessionFrames || session.bytes + bytes > this._limits.maxSessionBytes
			|| this._retainedFrames + candidates.length > this._limits.maxTotalFrames || this._retainedBytes + bytes > this._limits.maxTotalBytes) {
			this._fail(session, { namespace: 'ahp', reason: 'spool_capacity', server_seq: envelope.serverSeq });
			return false;
		}
		for (const frame of candidates) {
			session.frames.set(session.nextSeq++, frame);
		}
		session.bytes += bytes;
		this._retainedBytes += bytes;
		this._retainedFrames += candidates.length;
		this._wake(session);
		return true;
	}

	reportSourceLag(sessionId: string, skipped: number): void {
		const session = this._session(sessionId);
		if (!Number.isSafeInteger(skipped) || skipped < 1) {
			throw new Error('Invalid authoritative AHP source lag');
		}
		this._fail(session, { namespace: 'ahp', reason: 'source_lag', skipped });
	}

	/** Ordinary unsent lifecycle markers coalesce separately from the sticky mirror integrity signal. */
	setLifecycle(sessionId: string, kind: Exclude<IMissionControlSessionLifecycle['kind'], 'mirror_failed'>, details?: Record<string, unknown>): void {
		const session = this._session(sessionId);
		if (!['started', 'completed', 'failed', 'aborted'].includes(kind)) {
			throw new Error('Invalid Mission Control session lifecycle');
		}
		const json = JSON.stringify({
			type: 'event', event: 'sessionLifecycle', dataType: 'json',
			data: { environment_id: this._environmentId, session_id: sessionId, kind, at: this._timestamp(), ...(details && { details }) },
		} satisfies MissionControlMirrorEvent);
		if (Buffer.byteLength(json) + transportAckBytes > Math.min(maxMetadataBytes * 2, this._limits.maxEventBytes)) {
			throw new Error('Mission Control lifecycle capacity exhausted');
		}
		session.lifecycleEvent = json;
		this._wake(session);
	}

	/** Attach only after the connection is ready; disposing an old attachment cannot detach its replacement. */
	attach(sender: MissionControlMirrorSender): IDisposable {
		this._assertLive();
		const attachment = { sender };
		this._attachment = attachment;
		this._ready.clear();
		for (const session of this._sessions.values()) {
			session.nextToSend = session.acknowledgedSeq + 1;
			session.failurePending = session.failureEvent !== undefined;
			this._wake(session);
		}
		return toDisposable(() => {
			if (this._attachment === attachment) {
				this.detach();
			}
		});
	}

	detach(): void {
		this._attachment = undefined;
		this._ready.clear();
		this._scheduler.cancel();
	}

	/** Takes the decoded ingest-ack body; validation is atomic and transport acknowledgements never release spool entries. */
	ingestAck(value: unknown): void {
		this._assertLive();
		if (!isObject(value) || !isObject(value.watermarks)
			|| Object.keys(value).some(key => key !== 'watermarks' && key !== 'ack_for_batch')
			|| (value.ack_for_batch !== undefined && typeof value.ack_for_batch !== 'string')
			|| Object.keys(value.watermarks).length > this._limits.maxSessions
			|| Buffer.byteLength(JSON.stringify(value)) > this._limits.maxEventBytes) {
			throw new Error('Invalid Mission Control ingest acknowledgement');
		}
		const advances: { session: SessionSpool; sequence: number }[] = [];
		for (const [sessionId, namespaces] of Object.entries(value.watermarks)) {
			if (!isSessionId(sessionId) || !isObject(namespaces) || Object.keys(namespaces).length === 0
				|| Object.entries(namespaces).some(([ns, seq]) => (ns !== 'ahp' && ns !== 'sdk') || !isSequence(seq))) {
				throw new Error('Invalid Mission Control ingest watermark');
			}
			const session = this._sessions.get(sessionId);
			if (session && isSequence(namespaces.ahp)) {
				if (namespaces.ahp > session.publishedSeq) {
					throw new Error('Mission Control ingest watermark exceeds published sequence');
				}
				advances.push({ session, sequence: namespaces.ahp });
			}
		}
		for (const { session, sequence } of advances) {
			if (sequence <= session.acknowledgedSeq) {
				continue;
			}
			session.acknowledgedSeq = sequence;
			for (const [seq, frame] of session.frames) {
				if (seq > sequence) {
					break;
				}
				session.frames.delete(seq);
				session.bytes -= frame.bytes;
				this._retainedBytes -= frame.bytes;
				this._retainedFrames--;
			}
			session.nextToSend = Math.max(session.nextToSend, sequence + 1);
			for (const range of session.backfills) {
				const next = Math.min(range.toSeq + 1, Math.max(range.nextSeq, sequence + 1));
				this._backfillFrames -= next - range.nextSeq;
				range.nextSeq = next;
			}
			this._pruneBackfills(session);
			this._wake(session);
		}
	}

	/** Replay retained, already-published frames in inclusive sequence order, without rechunking or bypassing credit. */
	backfill(request: IMissionControlMirrorBackfill): void {
		const session = this._session(request.session_id);
		const count = request.to_seq - request.from_seq + 1;
		if (request.kind !== 'backfill_request' || request.environment_id !== this._environmentId || request.ns !== 'ahp'
			|| !request.request_id || Buffer.byteLength(request.request_id) > maxMetadataBytes
			|| !isSequence(request.from_seq) || !isSequence(request.to_seq) || count < 1
			|| request.from_seq <= session.acknowledgedSeq || request.to_seq > session.publishedSeq) {
			throw new Error('Invalid or unavailable Mission Control backfill range');
		}
		if (count > this._limits.maxBackfillFrames - this._backfillFrames || this._backfillRequests >= this._limits.maxBackfillRequests) {
			throw new Error('Mission Control backfill capacity exhausted');
		}
		session.backfills.push({ nextSeq: request.from_seq, toSeq: request.to_seq });
		this._backfillFrames += count;
		this._backfillRequests++;
		this._wake(session);
	}

	getSessionStatus(sessionId: string): IMissionControlMirrorStatus {
		const session = this._session(sessionId);
		return {
			nextSeq: session.nextSeq, publishedSeq: session.publishedSeq, acknowledgedSeq: session.acknowledgedSeq,
			retainedFrames: session.frames.size, retainedBytes: session.bytes, failure: session.failure && { ...session.failure },
		};
	}

	get statistics(): { readonly sessions: number; readonly retainedFrames: number; readonly retainedBytes: number; readonly pendingBackfillFrames: number; readonly pendingBackfillRequests: number } {
		return {
			sessions: this._sessions.size, retainedFrames: this._retainedFrames, retainedBytes: this._retainedBytes,
			pendingBackfillFrames: this._backfillFrames, pendingBackfillRequests: this._backfillRequests,
		};
	}

	private _frameJson(session: SessionSpool, seq: number, at: string, payload: ChunkEnvelope): string {
		return JSON.stringify({
			type: 'event', event: 'sessionEvents', dataType: 'json',
			data: {
				environment_id: this._environmentId, session_id: session.sessionId, ns: 'ahp', seq, at,
				...(session.project && { project: session.project }), payload,
			},
		} satisfies MissionControlMirrorEvent);
	}

	private _timestamp(): string {
		return new Date(this._now()).toISOString();
	}

	private _failureJson(sessionId: string, details: MissionControlMirrorFailure): string {
		return JSON.stringify({
			type: 'event', event: 'sessionLifecycle', dataType: 'json',
			data: { environment_id: this._environmentId, session_id: sessionId, kind: 'mirror_failed', at: this._timestamp(), details },
		} satisfies MissionControlMirrorEvent);
	}

	private _assertLive(): void {
		if (this._store.isDisposed) {
			throw new Error('Mission Control mirror disposed');
		}
	}

	private _session(sessionId: string): SessionSpool {
		this._assertLive();
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error('Mission Control mirror session is not registered');
		}
		return session;
	}

	private _fail(session: SessionSpool, failure: MissionControlMirrorFailure): void {
		if (session.failure) {
			return;
		}
		session.failure = failure;
		session.failureEvent = this._failureJson(session.sessionId, failure);
		session.failurePending = true;
		this._logService.error('[MissionControlSessionMirror] AHP mirror failed', { environment: this._environmentId, session: session.sessionId, ...failure });
		this._wake(session);
	}

	private _canSendFrame(session: SessionSpool): boolean {
		return session.nextToSend < session.nextSeq
			&& (session.nextToSend <= session.publishedSeq || session.publishedSeq - session.acknowledgedSeq < creditWindow);
	}

	private _wake(session: SessionSpool): void {
		if (this._attachment && (session.failurePending || session.lifecycleEvent || this._canSendFrame(session) || session.backfills.length > 0)) {
			this._ready.add(session);
			if (!this._scheduler.isScheduled()) {
				this._scheduler.schedule();
			}
		} else {
			this._ready.delete(session);
		}
	}

	private _pruneBackfills(session: SessionSpool): void {
		for (let index = session.backfills.length - 1; index >= 0; index--) {
			if (session.backfills[index].nextSeq > session.backfills[index].toSeq) {
				session.backfills.splice(index, 1);
				this._backfillRequests--;
			}
		}
	}

	private _flush(): void {
		const attachment = this._attachment;
		for (let sent = 0; attachment && this._attachment === attachment && sent < this._limits.maxFramesPerFlush; sent++) {
			const session = this._ready.values().next().value;
			if (!session) {
				break;
			}
			this._ready.delete(session);
			const failure = session.failurePending;
			const lifecycle = !failure && session.lifecycleEvent;
			const normalFrame = !failure && !lifecycle && this._canSendFrame(session);
			const range = !failure && !lifecycle && !normalFrame ? session.backfills[0] : undefined;
			const seq = normalFrame ? session.nextToSend : range?.nextSeq;
			const json = failure ? session.failureEvent : lifecycle || (seq !== undefined ? session.frames.get(seq)?.json : undefined);
			if (!json) {
				throw new Error('Mission Control mirror spool invariant violated');
			}
			try {
				if (attachment.sender(JSON.parse(json) as MissionControlMirrorEvent) !== undefined) {
					throw new Error('Mission Control mirror sender must accept synchronously');
				}
			} catch {
				if (this._attachment === attachment) {
					this.detach();
				}
				this._logService.warn('[MissionControlSessionMirror] Transport queue failed; retained frames await reattachment', { environment: this._environmentId, session: session.sessionId });
				break;
			}
			if (normalFrame && seq !== undefined) {
				session.publishedSeq = Math.max(session.publishedSeq, seq);
			}
			if (this._attachment !== attachment) {
				break;
			}
			if (failure) {
				session.failurePending = false;
			} else if (lifecycle) {
				if (session.lifecycleEvent === lifecycle) {
					session.lifecycleEvent = undefined;
				}
			} else if (normalFrame && seq !== undefined) {
				session.nextToSend = Math.max(seq + 1, session.acknowledgedSeq + 1);
			} else if (range && range.nextSeq === seq) {
				range.nextSeq++;
				this._backfillFrames--;
				this._pruneBackfills(session);
			}
			this._wake(session);
		}
		if (this._attachment && this._ready.size > 0 && !this._scheduler.isScheduled()) {
			this._scheduler.schedule();
		}
	}
}
