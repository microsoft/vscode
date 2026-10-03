/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellationError, RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type { ActionEnvelope } from '../common/state/sessionActions.js';
import { chunk, type ChunkEnvelope, type ChunkOptions, DEFAULT_MAX_CHUNK_BYTES } from '../common/webPubSub/chunking.js';

export interface IMissionControlMirrorProject {
	readonly uri: string;
	readonly display_name: string;
}

export interface IMissionControlSdkEvent {
	readonly type: string;
	readonly data: unknown;
	readonly _truncated?: { readonly reason: 'oversize'; readonly bytes: number };
}

export type IMissionControlReplicationFrame = {
	readonly environment_id: string;
	readonly session_id: string;
	readonly seq: number;
	readonly at: string;
	readonly project?: IMissionControlMirrorProject;
} & (
		| { readonly ns: 'ahp'; readonly payload: ChunkEnvelope }
		| { readonly ns: 'sdk'; readonly payload: IMissionControlSdkEvent }
	);

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
	readonly journalEventId?: string;
}

interface BackfillRange {
	nextSeq: number;
	readonly toSeq: number;
}

interface NamespaceSpool {
	readonly frames: Map<number, RetainedFrame>;
	nextSeq: number;
	publishedSeq: number;
	acknowledgedSeq: number;
	nextToSend: number;
	bytes: number;
}

interface SdkSpool extends NamespaceSpool {
	sequenceLimit: number;
	droppedSequence: number | undefined;
	droppedCount: number;
}

interface SessionSpool extends NamespaceSpool {
	readonly sessionId: string;
	readonly project: IMissionControlMirrorProject | undefined;
	readonly backfills: BackfillRange[];
	sdk?: SdkSpool;
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
 * AHP restart continuity is unresolved; SDK sequence ranges are reserved durably by its source before admission.
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
	private _sdkRetainedFrames = 0;
	private _sdkRetainedBytes = 0;
	private _backfillFrames = 0;
	private _backfillRequests = 0;
	private _sdkAcknowledged: ((sessionId: string, journalEventId: string) => void) | undefined;
	private readonly _sdkCapacityWaiters = new Map<string, DeferredPromise<void>>();

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
			for (const waiter of this._sdkCapacityWaiters.values()) {
				waiter.error(new CancellationError());
			}
			this._sdkCapacityWaiters.clear();
			this._sessions.clear();
			this._retainedFrames = this._retainedBytes = this._backfillFrames = this._backfillRequests = 0;
			this._sdkRetainedFrames = this._sdkRetainedBytes = 0;
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

	/** Grants a durably reserved range; discarded reservations become permitted SDK sequence gaps after restart. */
	reserveSdkSequences(sessionId: string, first: number, limit: number): void {
		const session = this._session(sessionId);
		if (!isSequence(first) || !isSequence(limit) || limit - first < 2
			|| (session.sdk && (first !== session.sdk.sequenceLimit || limit <= first))) {
			throw new Error('Invalid SDK sequence reservation');
		}
		if (session.sdk) {
			session.sdk.sequenceLimit = limit;
		} else {
			session.sdk = {
				frames: new Map(), nextSeq: first, publishedSeq: first - 1, acknowledgedSeq: first - 1, nextToSend: first,
				bytes: 0, sequenceLimit: limit, droppedSequence: undefined, droppedCount: 0,
			};
		}
	}

	getSdkNextSequence(sessionId: string): number | undefined {
		return this._session(sessionId).sdk?.nextSeq;
	}

	/** SDK data is selected by its provider; oversized bodies use the portable placeholder, never chunking. */
	enqueueSdk(sessionId: string, event: IMissionControlSdkEvent, at: string, journalEventId?: string): boolean {
		const session = this._session(sessionId);
		const sdk = session.sdk;
		if (!sdk || sdk.nextSeq + 1 >= sdk.sequenceLimit || !event.type || !Number.isFinite(Date.parse(at))) {
			throw new Error('SDK sequence range or event is invalid');
		}
		const { json, bytes } = this._sdkCandidate(session, event, at);
		if (!this._sdkHasCapacity(sdk, bytes)) {
			this._recordSdkDrop(session, 1, at);
			return false;
		}
		sdk.frames.set(sdk.nextSeq++, { json, bytes, journalEventId });
		sdk.bytes += bytes;
		this._sdkRetainedFrames++;
		this._sdkRetainedBytes += bytes;
		this._wake(session);
		return true;
	}

	/** Journal replay waits for durable credit rather than dropping the newest state behind a historical backlog. */
	async waitForSdkCapacity(sessionId: string, event: IMissionControlSdkEvent, at: string, token: CancellationToken): Promise<void> {
		while (true) {
			this._assertLive();
			const session = this._session(sessionId);
			const sdk = session.sdk;
			if (!sdk) {
				throw new Error('SDK sequence range has not been reserved');
			}
			const { bytes } = this._sdkCandidate(session, event, at);
			if (bytes > this._limits.maxSessionBytes || bytes > this._limits.maxTotalBytes) {
				throw new Error('SDK event cannot fit the replay spool');
			}
			if (this._sdkHasCapacity(sdk, bytes)) {
				return;
			}
			if (this._sdkCapacityWaiters.has(sessionId)) {
				throw new Error('SDK replay already owns a capacity wait');
			}
			const waiter = new DeferredPromise<void>();
			this._sdkCapacityWaiters.set(sessionId, waiter);
			try {
				await raceCancellationError(waiter.p, token);
			} finally {
				if (this._sdkCapacityWaiters.get(sessionId) === waiter) {
					this._sdkCapacityWaiters.delete(sessionId);
				}
			}
		}
	}

	private _sdkHasCapacity(sdk: SdkSpool, bytes: number): boolean {
		return sdk.droppedSequence === undefined && sdk.frames.size < this._limits.maxSessionFrames
			&& sdk.bytes + bytes <= this._limits.maxSessionBytes && this._sdkRetainedFrames < this._limits.maxTotalFrames
			&& this._sdkRetainedBytes + bytes <= this._limits.maxTotalBytes;
	}

	private _sdkCandidate(session: SessionSpool, event: IMissionControlSdkEvent, at: string): RetainedFrame {
		let json = this._sdkFrameJson(session, session.sdk!.nextSeq, at, event);
		const originalBytes = Buffer.byteLength(json);
		if (originalBytes + transportAckBytes > this._limits.maxEventBytes) {
			json = this._sdkFrameJson(session, session.sdk!.nextSeq, at, {
				type: event.type, data: null, _truncated: { reason: 'oversize', bytes: originalBytes },
			});
		}
		const bytes = Buffer.byteLength(json);
		if (bytes + transportAckBytes > this._limits.maxEventBytes) {
			throw new Error('SDK metadata cannot fit the transport ceiling');
		}
		return { json, bytes };
	}

	setSdkAcknowledgementHandler(handler: (sessionId: string, journalEventId: string) => void): IDisposable {
		if (this._sdkAcknowledged) {
			throw new Error('SDK acknowledgement ownership is already assigned');
		}
		this._sdkAcknowledged = handler;
		return toDisposable(() => {
			if (this._sdkAcknowledged === handler) {
				this._sdkAcknowledged = undefined;
			}
		});
	}

	reportSdkSourceLag(sessionId: string, skipped: number): void {
		if (!Number.isSafeInteger(skipped) || skipped < 1) {
			throw new Error('Invalid SDK source lag');
		}
		this._recordSdkDrop(this._session(sessionId), skipped, this._timestamp());
	}

	private _recordSdkDrop(session: SessionSpool, count: number, at: string): void {
		const sdk = session.sdk;
		if (!sdk || sdk.nextSeq >= sdk.sequenceLimit || !Number.isSafeInteger(sdk.droppedCount + count)) {
			throw new Error('SDK truncation marker cannot be sequenced');
		}
		if (sdk.droppedSequence === undefined) {
			sdk.droppedSequence = sdk.nextSeq++;
			this._sdkRetainedFrames++;
			this._logService.warn('[MissionControlSessionMirror] SDK metadata was dropped', { environment: this._environmentId, session: session.sessionId });
		}
		sdk.droppedCount += count;
		if (sdk.droppedSequence <= sdk.publishedSeq) {
			return;
		}
		const previousBytes = sdk.frames.get(sdk.droppedSequence)?.bytes ?? 0;
		const json = this._sdkFrameJson(session, sdk.droppedSequence, at, { type: 'session.events_truncated', data: { dropped_count: sdk.droppedCount } });
		const bytes = Buffer.byteLength(json);
		if (bytes + transportAckBytes > this._limits.maxEventBytes) {
			throw new Error('SDK truncation marker exceeds transport ceiling');
		}
		sdk.frames.set(sdk.droppedSequence, { json, bytes });
		sdk.bytes += bytes - previousBytes;
		this._sdkRetainedBytes += bytes - previousBytes;
		this._wake(session);
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
			if (session.sdk) {
				session.sdk.nextToSend = session.sdk.acknowledgedSeq + 1;
			}
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
		const advances: { session: SessionSpool; sequence: number; ns: 'ahp' | 'sdk' }[] = [];
		for (const [sessionId, namespaces] of Object.entries(value.watermarks)) {
			if (!isSessionId(sessionId) || !isObject(namespaces) || Object.keys(namespaces).length === 0
				|| Object.entries(namespaces).some(([ns, seq]) => (ns !== 'ahp' && ns !== 'sdk') || !isSequence(seq))) {
				throw new Error('Invalid Mission Control ingest watermark');
			}
			const session = this._sessions.get(sessionId);
			for (const ns of ['ahp', 'sdk'] as const) {
				const spool = ns === 'ahp' ? session : session?.sdk;
				const sequence = namespaces[ns];
				if (!session || !spool || !isSequence(sequence)) {
					continue;
				}
				if (sequence > spool.publishedSeq) {
					throw new Error('Mission Control ingest watermark exceeds published sequence');
				}
				advances.push({ session, sequence, ns });
			}
		}
		for (const { session, sequence, ns } of advances) {
			const spool = ns === 'ahp' ? session : session.sdk!;
			if (sequence <= spool.acknowledgedSeq) {
				continue;
			}
			spool.acknowledgedSeq = sequence;
			let journalEventId: string | undefined;
			for (const [seq, frame] of spool.frames) {
				if (seq > sequence) {
					break;
				}
				spool.frames.delete(seq);
				spool.bytes -= frame.bytes;
				if (ns === 'ahp') {
					this._retainedBytes -= frame.bytes;
					this._retainedFrames--;
				} else {
					this._sdkRetainedBytes -= frame.bytes;
					this._sdkRetainedFrames--;
					journalEventId = frame.journalEventId ?? journalEventId;
				}
			}
			spool.nextToSend = Math.max(spool.nextToSend, sequence + 1);
			if (ns === 'sdk' && session.sdk?.droppedSequence !== undefined && session.sdk.droppedSequence <= sequence) {
				session.sdk.droppedSequence = undefined;
				if (session.sdk.droppedCount) {
					this._recordSdkDrop(session, 0, this._timestamp());
				}
			}
			for (const range of session.backfills) {
				if (ns !== 'ahp') {
					break;
				}
				const next = Math.min(range.toSeq + 1, Math.max(range.nextSeq, sequence + 1));
				this._backfillFrames -= next - range.nextSeq;
				range.nextSeq = next;
			}
			this._pruneBackfills(session);
			this._wake(session);
			if (ns === 'sdk' && journalEventId !== undefined) {
				this._sdkAcknowledged?.(session.sessionId, journalEventId);
			}
			if (ns === 'sdk') {
				const waiters = [...this._sdkCapacityWaiters.values()];
				this._sdkCapacityWaiters.clear();
				for (const waiter of waiters) {
					waiter.complete();
				}
			}
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

	private _sdkFrameJson(session: SessionSpool, seq: number, at: string, payload: IMissionControlSdkEvent): string {
		return JSON.stringify({
			type: 'event', event: 'sessionEvents', dataType: 'json',
			data: { environment_id: this._environmentId, session_id: session.sessionId, ns: 'sdk', seq, at, ...(session.project && { project: session.project }), payload },
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

	private _canSendFrame(session: NamespaceSpool): boolean {
		return session.nextToSend < session.nextSeq
			&& (session.nextToSend <= session.publishedSeq || session.publishedSeq - session.acknowledgedSeq < creditWindow);
	}

	private _wake(session: SessionSpool): void {
		if (this._attachment && (session.failurePending || session.lifecycleEvent || this._canSendFrame(session)
			|| (session.sdk && this._canSendFrame(session.sdk)) || session.backfills.length > 0)) {
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
			const sdkFrame = !failure && !lifecycle && !normalFrame && session.sdk && this._canSendFrame(session.sdk) ? session.sdk : undefined;
			const range = !failure && !lifecycle && !normalFrame && !sdkFrame ? session.backfills[0] : undefined;
			const seq = normalFrame ? session.nextToSend : sdkFrame ? sdkFrame.nextToSend : range?.nextSeq;
			const json = failure ? session.failureEvent : lifecycle || (seq !== undefined ? (sdkFrame ?? session).frames.get(seq)?.json : undefined);
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
			} else if (sdkFrame && seq !== undefined) {
				const firstPublication = seq > sdkFrame.publishedSeq;
				sdkFrame.publishedSeq = Math.max(sdkFrame.publishedSeq, seq);
				if (firstPublication && sdkFrame.droppedSequence === seq) {
					sdkFrame.droppedCount = 0;
				}
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
			} else if (sdkFrame && seq !== undefined) {
				sdkFrame.nextToSend = Math.max(seq + 1, sdkFrame.acknowledgedSeq + 1);
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
