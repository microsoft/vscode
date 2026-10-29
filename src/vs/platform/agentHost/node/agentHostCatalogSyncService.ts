/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SESSION_STATE_VALUE_KEYS } from './agentHostSessionStateMirror.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { URI } from '../../../base/common/uri.js';
import { getComparisonKey } from '../../../base/common/resources.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import { type IDisposable, type IReference } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionCatalogSyncSnapshot, ISessionDataService, ISessionDatabase, SessionCatalogSyncTransitionResult, SessionCatalogSyncWriteResult } from '../common/sessionDataService.js';
import { IAgentHostSessionStateStore, ISessionStateExclusive, SessionStateDeletedError, SessionStateMirrorFlush } from '../common/agentHostSessionStateStore.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, AgentHostCatalogData, decodeAgentHostCatalogPayload, encodeAgentHostCatalogPayload, hashAgentHostCatalogPayload, IAgentHostCatalogEncodedPayload } from './agentHostCatalogProjection.js';
import type { AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabase, IAgentHostDatabaseSessionV2, IAgentHostDatabaseSessionV2Envelope, IAgentHostDatabaseSessionV2Receipt } from './agentHostDatabase.js';

const INITIAL_SOURCE_REVISION = 0;
const MAX_GENERATION_RETRIES = 3;

export interface IAgentHostCatalogSyncRequest {
	readonly data: AgentHostCatalogData;
	readonly legacyMetadata: Readonly<Record<string, string>>;
	readonly chatCatalogRevision?: number;
}

export type AgentHostCatalogDatabaseReference = IReference<ISessionDatabase>;

export type AgentHostCatalogSyncResult =
	| { readonly status: 'acknowledged'; readonly sourceRevision: number }
	| { readonly status: 'pending'; readonly sourceRevision: number; readonly reason: AgentHostDatabaseSessionV2UpsertResult | 'upsertFailed' | 'acknowledgementSuperseded' | 'acknowledgementFailed' };

export type AgentHostCatalogPendingReplayOutcome =
	| { readonly session: string; readonly status: 'succeeded'; readonly reason: 'pendingReplayed'; readonly sourceRevision: number }
	| { readonly session: string; readonly status: 'pending'; readonly reason: 'upsertFailed'; readonly sourceRevision: number }
	| { readonly session: string; readonly status: 'retry'; readonly reason: 'missingCatalog' | 'staleIncarnation' | 'superseded' | 'tombstoned' | 'cancelled' }
	| { readonly session: string; readonly status: 'failed'; readonly reason: 'malformedPayload' | 'payloadMismatch' | 'centralApplyFailed' | 'acknowledgementSuperseded'; readonly error?: string };

/** A synchronously-established deletion fence whose drain includes previously queued synchronization. */
export interface IAgentHostCatalogDeletionFence extends IDisposable {
	readonly whenDrained: Promise<void>;
}

export class AgentHostCatalogDeletionFencedError extends Error {
	constructor(session: URI) {
		super(`Catalog synchronization rejected during session deletion: ${session.toString()}`);
	}
}

/**
 * Whether the stored catalog row is exactly the one an acknowledged local
 * receipt describes, so the session needs no further synchronization.
 */
export function matchesAcknowledgedCatalogReceipt(
	receipt: ISessionCatalogSyncSnapshot | undefined,
	catalog: IAgentHostDatabaseSessionV2Receipt | undefined,
): boolean {
	return receipt?.state === 'acknowledged'
		&& catalog?.sessionGeneration === receipt.sessionGeneration
		&& catalog.sourceRevision === receipt.sourceRevision
		&& catalog.payloadVersion === receipt.projectionVersion
		&& catalog.payloadHash === receipt.payloadHash;
}

/**
 * Whether the local receipt already records `acknowledgement`. A write that
 * replays an acknowledged receipt leaves nothing pending to acknowledge.
 */
function isCatalogReceiptAcknowledged(
	receipt: ISessionCatalogSyncSnapshot | undefined,
	acknowledgement: ISessionCatalogSyncAcknowledgement,
): boolean {
	return receipt?.state === 'acknowledged'
		&& receipt.sessionGeneration === acknowledgement.sessionGeneration
		&& receipt.sourceRevision === acknowledgement.sourceRevision
		&& receipt.projectionVersion === acknowledgement.projectionVersion
		&& receipt.payloadHash === acknowledgement.payloadHash;
}

/** Whether every legacy compatibility key the request carries is already persisted. */
export async function catalogLegacyMetadataMatches(
	database: ReturnType<ISessionDataService['openDatabase']>['object'],
	legacyMetadata: Readonly<Record<string, string>>,
): Promise<boolean> {
	const metadataKeys: Record<string, true> = {};
	for (const key of Object.keys(legacyMetadata)) {
		metadataKeys[key] = true;
	}
	const persistedMetadata = await database.getMetadataObject(metadataKeys);
	return Object.entries(legacyMetadata).every(([key, value]) => persistedMetadata[key] === value);
}

/** Projected values are read from the central state, which may legitimately be ahead of a queued request; they never indicate a diverged mirror. */
function withoutProjectedKeys(legacyMetadata: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
	return Object.fromEntries(Object.entries(legacyMetadata).filter(([key]) => !SESSION_STATE_VALUE_KEYS.some(entry => entry.projected && entry.key === key)));
}

/** Replays a durable snapshot without resolving provider metadata or changing its generation or revision. */
export async function replayPendingCatalogSnapshot(
	catalogDatabase: IAgentHostDatabase,
	session: URI,
	snapshot: ISessionCatalogSyncPendingSnapshot,
	acknowledge: (acknowledgement: ISessionCatalogSyncAcknowledgement) => Promise<boolean>,
	token: CancellationToken,
): Promise<AgentHostCatalogPendingReplayOutcome> {
	const sessionKey = session.toString();
	const cancelled = { session: sessionKey, status: 'retry', reason: 'cancelled' } as const;
	if (token.isCancellationRequested) {
		return cancelled;
	}
	const decoded = decodeAgentHostCatalogPayload(snapshot.payload);
	if (!decoded.ok || snapshot.projectionVersion !== AGENT_HOST_CATALOG_PAYLOAD_VERSION) {
		return { session: sessionKey, status: 'failed', reason: 'malformedPayload', error: decoded.ok ? 'Unsupported payload version' : decoded.error };
	}
	if (decoded.value.payload !== snapshot.payload || hashAgentHostCatalogPayload(snapshot.payload) !== snapshot.payloadHash) {
		return { session: sessionKey, status: 'failed', reason: 'payloadMismatch', error: 'Pending payload is not canonical or its hash does not match' };
	}
	let central = await catalogDatabase.getSessionV2(sessionKey);
	if (token.isCancellationRequested) {
		return cancelled;
	}
	if (central && central.sessionGeneration !== snapshot.sessionGeneration) {
		return { session: sessionKey, status: 'retry', reason: 'staleIncarnation' };
	}
	const tombstoned = await catalogDatabase.isSessionTombstoned(sessionKey);
	if (token.isCancellationRequested) {
		return cancelled;
	}
	if (tombstoned) {
		return { session: sessionKey, status: 'retry', reason: 'tombstoned' };
	}
	central = await catalogDatabase.getSessionV2(sessionKey);
	if (token.isCancellationRequested) {
		return cancelled;
	}
	if (central && central.sessionGeneration !== snapshot.sessionGeneration) {
		return { session: sessionKey, status: 'retry', reason: 'staleIncarnation' };
	}

	let applyResult: AgentHostDatabaseSessionV2UpsertResult;
	try {
		const [catalog] = await catalogDatabase.readCatalogSnapshot([sessionKey]);
		if (token.isCancellationRequested) {
			return cancelled;
		}
		const envelope: IAgentHostDatabaseSessionV2Envelope = {
			session: sessionKey,
			sessionGeneration: snapshot.sessionGeneration,
			sourceRevision: snapshot.sourceRevision,
			payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payloadHash: snapshot.payloadHash,
			verified: true,
			payload: snapshot.payload,
		};
		applyResult = catalog?.authorityVersion === 2 && catalog.header
			? await catalogDatabase.upsertSessionV2FromChatCatalog(envelope, central?.sessionGeneration, catalog.header.revision)
			: await catalogDatabase.upsertSessionV2(envelope, central?.sessionGeneration);
	} catch (error) {
		return { session: sessionKey, status: 'pending', reason: 'upsertFailed', sourceRevision: snapshot.sourceRevision };
	}
	if (token.isCancellationRequested) {
		return cancelled;
	}
	if (applyResult === 'tombstoned') {
		return { session: sessionKey, status: 'retry', reason: 'tombstoned' };
	}
	if (applyResult === 'generationMismatch') {
		return { session: sessionKey, status: 'retry', reason: 'staleIncarnation' };
	}
	if (applyResult === 'missingSession') {
		return { session: sessionKey, status: 'retry', reason: 'missingCatalog' };
	}
	if (applyResult === 'stale' || applyResult === 'conflict') {
		return { session: sessionKey, status: 'retry', reason: 'superseded' };
	}
	if (applyResult !== 'applied' && applyResult !== 'replayed') {
		return { session: sessionKey, status: 'failed', reason: 'centralApplyFailed', error: applyResult };
	}
	if (!await acknowledge(snapshot)) {
		return { session: sessionKey, status: 'failed', reason: 'acknowledgementSuperseded' };
	}
	return { session: sessionKey, status: 'succeeded', reason: 'pendingReplayed', sourceRevision: snapshot.sourceRevision };
}

export class AgentHostCatalogSyncService {

	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _deletionFences = new Map<string, { count: number; readonly whenDrained: Promise<void> }>();

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _catalogDatabase: IAgentHostDatabase,
		private readonly _sessionStateStore: IAgentHostSessionStateStore,
		private readonly _logService: ILogService,
	) { }

	isSessionDeletionFenced(session: URI): boolean {
		return this._deletionFences.has(this._getStorageKey(session));
	}

	/** Makes one provider-independent replay attempt, serialized with ordinary writes and deletion. */
	replayPending(session: URI, token: CancellationToken): Promise<AgentHostCatalogPendingReplayOutcome | undefined> {
		if (token.isCancellationRequested || this.isSessionDeletionFenced(session)) {
			return Promise.resolve(undefined);
		}
		return this.runMigrationExclusive(session, async database => {
			if (!database || token.isCancellationRequested) {
				return undefined;
			}
			const snapshot = await database.object.getCatalogSyncSnapshot();
			if (token.isCancellationRequested || snapshot?.state !== 'pending') {
				return undefined;
			}
			return replayPendingCatalogSnapshot(this._catalogDatabase, session, snapshot,
				acknowledgement => database.object.acknowledgeCatalogSyncSnapshot(acknowledgement), token);
		});
	}

	/** Prevents new synchronization and returns a shared per-database queue drain. */
	beginSessionDeletion(session: URI): IAgentHostCatalogDeletionFence {
		const storageKey = this._getStorageKey(session);
		let fence = this._deletionFences.get(storageKey);
		if (fence) {
			fence.count++;
		} else {
			fence = {
				count: 1,
				whenDrained: this._queue(session, 'deletionFence', async () => { }),
			};
			this._deletionFences.set(storageKey, fence);
		}
		const acquiredFence = fence;
		const release = createSingleCallFunction(() => {
			if (this._deletionFences.get(storageKey) !== acquiredFence) {
				return;
			}
			acquiredFence.count--;
			if (acquiredFence.count === 0) {
				this._deletionFences.delete(storageKey);
			}
		});
		return {
			whenDrained: acquiredFence.whenDrained,
			dispose: release,
		};
	}

	synchronize(session: URI, request: IAgentHostCatalogSyncRequest): Promise<AgentHostCatalogSyncResult> {
		return this.runExclusive(session, async synchronize => {
			await this._markPayloadDirty(session);
			const result = await synchronize(request);
			await this._markPayloadDirty(session);
			return result;
		});
	}

	/** @param imported whether the session has central state, when the caller already read it (e.g. a page prefetch). */
	synchronizeWithFactory(session: URI, requestFactory: (database: AgentHostCatalogDatabaseReference) => Promise<IAgentHostCatalogSyncRequest>, validate?: () => Promise<void>, writeValidator?: () => boolean, imported?: boolean): Promise<AgentHostCatalogSyncResult> {
		return this.runExclusive(session, async (synchronize, database) => {
			await this._markPayloadDirty(session);
			let result: AgentHostCatalogSyncResult;
			for (let attempt = 0; ; attempt++) {
				const request = await requestFactory(database);
				result = await synchronize(request, validate, writeValidator);
				if (request.chatCatalogRevision === undefined || result.status !== 'pending'
					|| result.reason !== 'conflict' || attempt + 1 >= MAX_GENERATION_RETRIES) {
					break;
				}
			}
			await this._markPayloadDirty(session);
			return result;
		}, imported);
	}

	synchronizeMigrationWithFactory(
		session: URI,
		requestFactory: (database: AgentHostCatalogDatabaseReference | undefined) => Promise<IAgentHostCatalogSyncRequest>,
		validate?: () => Promise<void>,
	): Promise<AgentHostCatalogSyncResult> {
		return this.runMigrationExclusive(session, async (database, synchronize) => {
			if (database) {
				await this._markPayloadDirty(session);
			}
			let result: AgentHostCatalogSyncResult;
			for (let attempt = 0; ; attempt++) {
				const request = await requestFactory(database);
				result = await synchronize(request, validate);
				if (request.chatCatalogRevision === undefined || result.status !== 'pending'
					|| result.reason !== 'conflict' || attempt + 1 >= MAX_GENERATION_RETRIES) {
					break;
				}
			}
			if (database) {
				await this._markPayloadDirty(session);
			}
			return result;
		});
	}

	runExclusive<T>(session: URI, operation: (
		synchronize: (request: IAgentHostCatalogSyncRequest, validate?: () => Promise<void>, writeValidator?: () => boolean) => Promise<AgentHostCatalogSyncResult>,
		database: AgentHostCatalogDatabaseReference,
	) => Promise<T>, imported?: boolean): Promise<T> {
		if (this.isSessionDeletionFenced(session)) {
			return Promise.reject(new AgentHostCatalogDeletionFencedError(session));
		}
		return this._queue(
			session, 'write',
			async () => {
				const database = this._sessionDataService.openDatabase(session);
				try {
					// Never imports: an imported session's central state is loaded first, so the projection includes older builds'
					// edits; a session without central state (one only discovered) is still sourced from its session.db.
					const known = { imported };
					const withCentral = <R>(run: (exclusive: ISessionStateExclusive | undefined) => Promise<R>) => this._withCentralIfImported(session, run, known);
					return await operation(
						(request, validate, writeValidator) => this._synchronizeWithDatabaseNow(session, request, database, withCentral, validate, writeValidator),
						this._projectFromCentral(database, withCentral));
				} finally {
					database.dispose();
				}
			},
		);
	}

	runMigrationExclusive<T>(session: URI, operation: (
		database: AgentHostCatalogDatabaseReference | undefined,
		synchronize: (request: IAgentHostCatalogSyncRequest, validate?: () => Promise<void>, writeValidator?: () => boolean) => Promise<AgentHostCatalogSyncResult>,
	) => Promise<T>): Promise<T> {
		if (this.isSessionDeletionFenced(session)) {
			return Promise.reject(new AgentHostCatalogDeletionFencedError(session));
		}
		return this._queue(session, 'migration', async () => {
			const database = await this._sessionDataService.tryOpenDatabase(session);
			if (!database) {
				return operation(undefined, (request, validate, writeValidator) => this._synchronizeCentralOnlyNow(session, request, validate, writeValidator));
			}
			try {
				// Re-projection never imports: a session without central state is still sourced from its session.db.
				const known: { imported?: boolean } = {};
				const withCentral = <R>(run: (exclusive: ISessionStateExclusive | undefined) => Promise<R>) => this._withCentralIfImported(session, run, known);
				return await operation(
					this._projectFromCentral(database, withCentral),
					(request, validate, writeValidator) => this._synchronizeWithDatabaseNow(session, request, database, withCentral, validate, writeValidator),
				);
			} finally {
				database.dispose();
			}
		});
	}

	/** Native and standard session URIs can address the same session database. */
	private _getStorageKey(session: URI): string {
		return getComparisonKey(this._sessionDataService.getSessionDataDir(session));
	}

	private _queue<T>(session: URI, kind: 'write' | 'migration' | 'deletionFence', operation: () => Promise<T>): Promise<T> {
		const operationId = generateUuid();
		const stopWatch = StopWatch.create();
		const prefix = `[AgentHostCatalogSync] session=${session.toString()}, operationId=${operationId}, kind=${kind}`;
		this._logService.trace(`${prefix}, stage=queued`);
		return this._sequencer.queue(this._getStorageKey(session), async () => {
			const queueWaitMs = Math.round(stopWatch.elapsed());
			const executionStopWatch = StopWatch.create();
			this._logService.trace(`${prefix}, stage=started, queueWaitMs=${queueWaitMs}`);
			let outcome = 'failed';
			try {
				const result = await operation();
				outcome = 'completed';
				return result;
			} finally {
				this._logService.trace(`${prefix}, stage=settled, outcome=${outcome}, queueWaitMs=${queueWaitMs}, executionMs=${Math.round(executionStopWatch.elapsed())}`);
			}
		});
	}

	/**
	 * {@link _withCentral} for a session with central state; without it (never imported) the operation runs against
	 * session.db alone. Whether it has central state is read once per synchronization (`known`); a loaded session always has.
	 */
	private async _withCentralIfImported<T>(session: URI, operation: (exclusive: ISessionStateExclusive | undefined) => Promise<T>, known: { imported?: boolean }): Promise<T> {
		if (!this._sessionStateStore.peek(session)) {
			known.imported ??= !!(await this._catalogDatabase.readSessionStateValues([session.toString()], [])).get(session.toString())?.imported;
			if (!known.imported) {
				return operation(undefined);
			}
		}
		return this._withCentral(session, operation);
	}

	/** Runs in the store's exclusive section; a deleted session has no central state, so the operation runs against session.db alone. */
	private async _withCentral<T>(session: URI, operation: (exclusive: ISessionStateExclusive | undefined) => Promise<T>): Promise<T> {
		let started = false;
		try {
			return await this._sessionStateStore.runExclusive(session, exclusive => {
				started = true;
				return operation(exclusive);
			});
		} catch (error) {
			if (started || !(error instanceof SessionStateDeletedError)) {
				throw error;
			}
			return operation(undefined);
		}
	}

	/** The database reference with the metadata the store owns served from central state. */
	private _projectFromCentral(database: AgentHostCatalogDatabaseReference, withCentral: <R>(run: (exclusive: ISessionStateExclusive | undefined) => Promise<R>) => Promise<R>): AgentHostCatalogDatabaseReference {
		const object = new Proxy(database.object, {
			get: (target, property) => {
				if (property === 'getMetadataObject') {
					// A short exclusive section per read: the request factory may itself use the store.
					return <T extends Record<string, unknown>>(keys: T) => withCentral(exclusive => exclusive
						? this._sessionStateStore.catalogMetadataReference(exclusive).object.getMetadataObject(keys)
						: target.getMetadataObject(keys));
				}
				const value = Reflect.get(target, property, target);
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
		return { object, dispose: () => { } };
	}

	private _synchronizeWithDatabaseNow(
		session: URI,
		request: IAgentHostCatalogSyncRequest,
		ref: ReturnType<ISessionDataService['openDatabase']>,
		withCentral: <R>(run: (exclusive: ISessionStateExclusive | undefined) => Promise<R>) => Promise<R>,
		validate?: () => Promise<void>,
		writeValidator?: () => boolean,
	): Promise<AgentHostCatalogSyncResult> {
		return withCentral(exclusive => this._synchronizeWithDatabaseLocked(session, request, ref, exclusive, validate, writeValidator));
	}

	private async _synchronizeWithDatabaseLocked(
		session: URI,
		request: IAgentHostCatalogSyncRequest,
		ref: ReturnType<ISessionDataService['openDatabase']>,
		exclusive: ISessionStateExclusive | undefined,
		validate?: () => Promise<void>,
		writeValidator?: () => boolean,
	): Promise<AgentHostCatalogSyncResult> {
		const sessionKey = session.toString();
		const encoded = this._encode(request.data);
		const operationId = generateUuid();
		const stopWatch = StopWatch.create();
		for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
			await validate?.();
			const traceStage = (stage: string) => this._logService.trace(`[AgentHostCatalogSync] session=${sessionKey}, operationId=${operationId}, attempt=${attempt}, stage=${stage}, elapsedMs=${Math.round(stopWatch.elapsed())}`);
			traceStage('readLocalReceipt');
			const existing = await ref.object.getCatalogSyncSnapshot();
			let central: IAgentHostDatabaseSessionV2 | undefined;
			try {
				traceStage('readCentralCatalog');
				central = await this._catalogDatabase.getSessionV2(sessionKey);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to read sessions_v2 row for ${sessionKey}`, error);
				const legacyMetadataMatches = await catalogLegacyMetadataMatches(ref.object, withoutProjectedKeys(request.legacyMetadata));
				const pending = await this._storePending(ref.object, exclusive, request, encoded, existing, legacyMetadataMatches, validate, writeValidator);
				return {
					status: 'pending',
					sourceRevision: pending.snapshot.sourceRevision,
					reason: pending.result === 'cancelled' ? 'cancelled' : 'upsertFailed',
				};
			}

			const sessionGeneration = central?.sessionGeneration
				?? (existing?.state === 'pending' ? existing.sessionGeneration : generateUuid());
			traceStage('readLegacyMetadata');
			const legacyMetadataMatches = await catalogLegacyMetadataMatches(ref.object, withoutProjectedKeys(request.legacyMetadata));
			const sourceRevision = this._sourceRevision(existing, central, sessionGeneration, encoded.payloadHash, legacyMetadataMatches);
			const snapshot = this._pendingSnapshot(sessionGeneration, sourceRevision, encoded);

			if (existing && existing.sessionGeneration !== sessionGeneration) {
				traceStage('transitionLocalReceipt');
				await validate?.();
				const transitioned = await this._writeThroughCentral(exclusive, request, writeValidator, () => ref.object.transitionMetadataValuesAndCatalogSyncSnapshot(
					request.legacyMetadata,
					existing.sessionGeneration,
					snapshot,
					writeValidator,
				));
				if (transitioned === 'cancelled') {
					return { status: 'pending', sourceRevision, reason: 'cancelled' };
				}
				if (transitioned === 'generationMismatch') {
					continue;
				}
			} else {
				traceStage('writeLocalReceipt');
				await validate?.();
				const writeResult = await this._writeThroughCentral(exclusive, request, writeValidator, () => ref.object.setMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, snapshot, writeValidator));
				if (writeResult === 'cancelled') {
					return { status: 'pending', sourceRevision, reason: 'cancelled' };
				}
				if (writeResult === 'replayed'
					&& request.chatCatalogRevision === undefined
					&& matchesAcknowledgedCatalogReceipt(existing, central)
					&& legacyMetadataMatches) {
					traceStage('acknowledged');
					return { status: 'acknowledged', sourceRevision };
				}
			}

			let upsertResult: AgentHostDatabaseSessionV2UpsertResult;
			await validate?.();
			try {
				traceStage('upsertCentralCatalog');
				upsertResult = await this._upsertSessionCatalog(
					this._envelope(sessionKey, sessionGeneration, sourceRevision, encoded),
					central?.sessionGeneration,
					request.chatCatalogRevision,
					writeValidator,
				);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to upsert sessions_v2 row for ${sessionKey}`, error);
				return { status: 'pending', sourceRevision, reason: 'upsertFailed' };
			}
			if (upsertResult === 'generationMismatch') {
				continue;
			}
			if (upsertResult !== 'applied' && upsertResult !== 'replayed') {
				// A chat catalog that moved on under the request (an import or a conversion) is retried by
				// synchronizeWithFactory, whose callers warn if it never settles.
				const message = `[AgentHostCatalogSync] sessions_v2 payload for ${sessionKey} remains pending: ${upsertResult}`;
				if (upsertResult === 'conflict' && request.chatCatalogRevision !== undefined) {
					this._logService.trace(message);
				} else {
					this._logService.warn(message);
				}
				return { status: 'pending', sourceRevision, reason: upsertResult };
			}

			const acknowledgement: ISessionCatalogSyncAcknowledgement = {
				sessionGeneration,
				sourceRevision,
				projectionVersion: snapshot.projectionVersion,
				payloadHash: snapshot.payloadHash,
			};
			traceStage('acknowledgeLocalReceipt');
			await validate?.();
			let acknowledged: boolean;
			try {
				acknowledged = await ref.object.acknowledgeCatalogSyncSnapshot(acknowledgement)
					|| isCatalogReceiptAcknowledged(await ref.object.getCatalogSyncSnapshot(), acknowledgement);
			} catch (error) {
				// The catalog row is committed: the receipt stays pending for reconciliation to replay and acknowledge.
				this._logService.warn(`[AgentHostCatalogSync] Failed to acknowledge the catalog sync receipt for ${sessionKey}`, error);
				return { status: 'pending', sourceRevision, reason: 'acknowledgementFailed' };
			}
			if (!acknowledged) {
				return { status: 'pending', sourceRevision, reason: 'acknowledgementSuperseded' };
			}
			traceStage('acknowledged');
			return { status: 'acknowledged', sourceRevision };
		}

		const snapshot = await ref.object.getCatalogSyncSnapshot();
		return {
			status: 'pending',
			sourceRevision: snapshot?.sourceRevision ?? INITIAL_SOURCE_REVISION,
			reason: 'generationMismatch',
		};
	}

	private async _synchronizeCentralOnlyNow(session: URI, request: IAgentHostCatalogSyncRequest, validate?: () => Promise<void>, writeValidator?: () => boolean): Promise<AgentHostCatalogSyncResult> {
		const sessionKey = session.toString();
		const encoded = this._encode(request.data);
		let observedGeneration: string | undefined;
		let hasObservedGeneration = false;
		let acceptGenerationWinner = false;
		let pendingRevision = INITIAL_SOURCE_REVISION;
		for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
			await validate?.();
			let central: IAgentHostDatabaseSessionV2 | undefined;
			try {
				central = await this._catalogDatabase.getSessionV2(sessionKey);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to read sessions_v2 row for ${sessionKey}`, error);
				return { status: 'pending', sourceRevision: pendingRevision, reason: 'upsertFailed' };
			}
			if (hasObservedGeneration && central?.sessionGeneration !== observedGeneration) {
				if (central && acceptGenerationWinner && this._matchesEncodedPayload(central, encoded)) {
					return { status: 'acknowledged', sourceRevision: central.sourceRevision };
				}
			}
			observedGeneration = central?.sessionGeneration;
			hasObservedGeneration = true;
			acceptGenerationWinner = false;
			const sessionGeneration = central?.sessionGeneration ?? generateUuid();
			const matches = central?.payloadVersion === AGENT_HOST_CATALOG_PAYLOAD_VERSION
				&& central.payloadHash === encoded.payloadHash;
			if (central && matches && request.chatCatalogRevision === undefined) {
				return { status: 'acknowledged', sourceRevision: central.sourceRevision };
			}
			const sourceRevision = central ? central.sourceRevision + (matches ? 0 : 1) : INITIAL_SOURCE_REVISION;
			pendingRevision = sourceRevision;
			let result: AgentHostDatabaseSessionV2UpsertResult;
			try {
				await validate?.();
				result = await this._upsertSessionCatalog(
					this._envelope(sessionKey, sessionGeneration, sourceRevision, encoded),
					central?.sessionGeneration,
					request.chatCatalogRevision,
					writeValidator,
				);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to upsert sessions_v2 row for ${sessionKey}`, error);
				return { status: 'pending', sourceRevision, reason: 'upsertFailed' };
			}
			if (result === 'generationMismatch') {
				acceptGenerationWinner = true;
				continue;
			}
			if (result === 'conflict') {
				if (request.chatCatalogRevision !== undefined) {
					return { status: 'pending', sourceRevision, reason: result };
				}
				continue;
			}
			if (result === 'stale') {
				let winner: IAgentHostDatabaseSessionV2 | undefined;
				try {
					winner = await this._catalogDatabase.getSessionV2(sessionKey);
				} catch (error) {
					this._logService.warn(`[AgentHostCatalogSync] Failed to verify newer sessions_v2 row for ${sessionKey}`, error);
					return { status: 'pending', sourceRevision, reason: 'upsertFailed' };
				}
				if (winner?.sessionGeneration === sessionGeneration
					&& winner.sourceRevision > sourceRevision
					&& this._matchesEncodedPayload(winner, encoded)) {
					return { status: 'acknowledged', sourceRevision: winner.sourceRevision };
				}
				continue;
			}
			if (result === 'applied' || result === 'replayed') {
				const landed = await this._catalogDatabase.getSessionV2(sessionKey);
				if (landed?.sessionGeneration === sessionGeneration
					&& landed.sourceRevision === sourceRevision
					&& this._matchesEncodedPayload(landed, encoded)) {
					return { status: 'acknowledged', sourceRevision };
				}
				continue;
			}
			return { status: 'pending', sourceRevision, reason: result };
		}
		return {
			status: 'pending',
			sourceRevision: pendingRevision,
			reason: 'conflict',
		};
	}

	private _upsertSessionCatalog(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined, chatCatalogRevision: number | undefined, validate?: () => boolean): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		return chatCatalogRevision === undefined
			? this._catalogDatabase.upsertSessionV2(envelope, expectedSessionGeneration, validate)
			: this._catalogDatabase.upsertSessionV2FromChatCatalog(envelope, expectedSessionGeneration, chatCatalogRevision, validate);
	}

	/**
	 * Adopts the request's store-owned values into central state, then runs the
	 * session.db write (mirror and outbox in one transaction) and records what it mirrored.
	 * A replayed write leaves session.db's values untouched, so its entries stay dirty for the store to mirror.
	 * Any other write that session.db did not take (cancelled because it was superseded, or a generation mismatch) has
	 * its adoption undone, so the store does not mirror its values either and a retry starts from the previous values.
	 */
	private async _writeThroughCentral<T extends string>(exclusive: ISessionStateExclusive | undefined, request: IAgentHostCatalogSyncRequest, writeValidator: (() => boolean) | undefined, write: () => Promise<T>): Promise<T> {
		if (!exclusive || writeValidator?.() === false) {
			return write();
		}
		const previous = this._sessionStateStore.legacyMetadata(URI.parse(exclusive.snapshot.session), Object.keys(request.legacyMetadata)).values;
		let adopted: Awaited<ReturnType<ISessionStateExclusive['writeLegacyMetadata']>>;
		try {
			adopted = await exclusive.writeLegacyMetadata(request.legacyMetadata, SessionStateMirrorFlush.Coalesced);
		} catch (error) {
			if (error instanceof SessionStateDeletedError) {
				// A session being deleted drains its in-flight synchronization against session.db alone.
				return write();
			}
			throw error;
		}
		const result = await write();
		if (result === 'applied') {
			exclusive.noteMirrored(adopted.revision, adopted.entries);
		} else if (result !== 'replayed') {
			await this._undoAdoption(exclusive, previous);
		}
		return result;
	}

	private async _undoAdoption(exclusive: ISessionStateExclusive, previous: Readonly<Record<string, string | undefined>>): Promise<void> {
		try {
			await exclusive.writeLegacyMetadata(Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, value ?? null])), SessionStateMirrorFlush.Coalesced);
		} catch (error) {
			if (!(error instanceof SessionStateDeletedError)) {
				throw error;
			}
			// A session being deleted has no central state left to restore.
		}
	}

	private async _storePending(
		database: ReturnType<ISessionDataService['openDatabase']>['object'],
		exclusive: ISessionStateExclusive | undefined,
		request: IAgentHostCatalogSyncRequest,
		encoded: IAgentHostCatalogEncodedPayload,
		existing: ISessionCatalogSyncSnapshot | undefined,
		legacyMetadataMatches: boolean,
		validate?: () => Promise<void>,
		writeValidator?: () => boolean,
	): Promise<{ readonly snapshot: ISessionCatalogSyncPendingSnapshot; readonly result: SessionCatalogSyncWriteResult | SessionCatalogSyncTransitionResult }> {
		const sessionGeneration = existing?.sessionGeneration ?? generateUuid();
		const sourceRevision = this._sourceRevision(existing, undefined, sessionGeneration, encoded.payloadHash, legacyMetadataMatches);
		const snapshot = this._pendingSnapshot(sessionGeneration, sourceRevision, encoded);
		await validate?.();
		if (existing && existing.sessionGeneration !== sessionGeneration) {
			const result = await this._writeThroughCentral(exclusive, request, writeValidator, () => database.transitionMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, existing.sessionGeneration, snapshot, writeValidator));
			return { snapshot, result };
		}
		const result = await this._writeThroughCentral(exclusive, request, writeValidator, () => database.setMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, snapshot, writeValidator));
		return { snapshot, result };
	}

	private _sourceRevision(
		existing: ISessionCatalogSyncSnapshot | undefined,
		central: IAgentHostDatabaseSessionV2Receipt | undefined,
		sessionGeneration: string,
		payloadHash: string,
		legacyMetadataMatches: boolean,
	): number {
		const local = existing?.sessionGeneration === sessionGeneration ? existing : undefined;
		const current = central?.sessionGeneration === sessionGeneration ? central : undefined;
		const baselineRevision = Math.max(
			local?.sourceRevision ?? INITIAL_SOURCE_REVISION,
			current?.sourceRevision ?? INITIAL_SOURCE_REVISION,
		);
		const localMatches = local?.projectionVersion === AGENT_HOST_CATALOG_PAYLOAD_VERSION
			&& local.payloadHash === payloadHash;
		const centralMatches = current?.payloadVersion === AGENT_HOST_CATALOG_PAYLOAD_VERSION
			&& current.payloadHash === payloadHash;
		if (legacyMetadataMatches) {
			if (localMatches && (!current || centralMatches || local.sourceRevision > current.sourceRevision)) {
				return baselineRevision;
			}
			if (!local && centralMatches) {
				return baselineRevision;
			}
		}
		return local || current ? baselineRevision + 1 : INITIAL_SOURCE_REVISION;
	}

	private _pendingSnapshot(sessionGeneration: string, sourceRevision: number, encoded: IAgentHostCatalogEncodedPayload): ISessionCatalogSyncPendingSnapshot {
		return {
			sessionGeneration,
			sourceRevision,
			projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payload: encoded.payload,
			payloadHash: encoded.payloadHash,
			state: 'pending',
		};
	}

	private _envelope(session: string, sessionGeneration: string, sourceRevision: number, encoded: IAgentHostCatalogEncodedPayload): IAgentHostDatabaseSessionV2Envelope {
		return {
			session,
			sessionGeneration,
			sourceRevision,
			payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payloadHash: encoded.payloadHash,
			verified: true,
			payload: encoded.payload,
		};
	}

	private _encode(data: AgentHostCatalogData): IAgentHostCatalogEncodedPayload {
		const result = encodeAgentHostCatalogPayload(data);
		if (!result.ok) {
			throw new Error(`Invalid catalog data: ${result.error}`);
		}
		return result.value;
	}

	private _matchesEncodedPayload(receipt: IAgentHostDatabaseSessionV2, encoded: IAgentHostCatalogEncodedPayload): boolean {
		return receipt.payloadVersion === AGENT_HOST_CATALOG_PAYLOAD_VERSION
			&& receipt.payloadHash === encoded.payloadHash
			&& receipt.payload === encoded.payload;
	}

	private async _markPayloadDirty(session: URI): Promise<number | undefined> {
		const operationId = generateUuid();
		const stopWatch = StopWatch.create();
		const prefix = `[AgentHostCatalogSync] session=${session.toString()}, operationId=${operationId}, kind=markPayloadDirty`;
		this._logService.trace(`${prefix}, stage=started`);
		let outcome = 'failed';
		try {
			const result = await this._catalogDatabase.markSessionV2PayloadDirty(session.toString());
			outcome = 'completed';
			return result;
		} catch (error) {
			this._logService.warn(`[AgentHostCatalogSync] Failed to mark sessions_v2 payload dirty for ${session.toString()}`, error);
			return undefined;
		} finally {
			this._logService.trace(`${prefix}, stage=settled, outcome=${outcome}, executionMs=${Math.round(stopWatch.elapsed())}`);
		}
	}

}
