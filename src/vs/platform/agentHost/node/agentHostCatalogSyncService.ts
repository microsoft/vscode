/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { URI } from '../../../base/common/uri.js';
import { getComparisonKey } from '../../../base/common/resources.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import { type IDisposable, type IReference } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionCatalogSyncSnapshot, ISessionDataService, ISessionDatabase } from '../common/sessionDataService.js';
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
	| { readonly status: 'pending'; readonly sourceRevision: number; readonly reason: AgentHostDatabaseSessionV2UpsertResult | 'upsertFailed' | 'acknowledgementSuperseded' };

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

	synchronizeWithFactory(session: URI, requestFactory: (database: AgentHostCatalogDatabaseReference) => Promise<IAgentHostCatalogSyncRequest>): Promise<AgentHostCatalogSyncResult> {
		return this.runExclusive(session, async (synchronize, database) => {
			await this._markPayloadDirty(session);
			let result: AgentHostCatalogSyncResult;
			for (let attempt = 0; ; attempt++) {
				const request = await requestFactory(database);
				result = await synchronize(request);
				if (request.chatCatalogRevision === undefined || result.status !== 'pending'
					|| result.reason !== 'conflict' || attempt + 1 >= MAX_GENERATION_RETRIES) {
					break;
				}
			}
			await this._markPayloadDirty(session);
			return result;
		});
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
		synchronize: (request: IAgentHostCatalogSyncRequest) => Promise<AgentHostCatalogSyncResult>,
		database: AgentHostCatalogDatabaseReference,
	) => Promise<T>): Promise<T> {
		if (this.isSessionDeletionFenced(session)) {
			return Promise.reject(new AgentHostCatalogDeletionFencedError(session));
		}
		return this._queue(
			session, 'write',
			async () => {
				const database = this._sessionDataService.openDatabase(session);
				try {
					return await operation(request => this._synchronizeWithDatabaseNow(session, request, database), database);
				} finally {
					database.dispose();
				}
			},
		);
	}

	runMigrationExclusive<T>(session: URI, operation: (
		database: AgentHostCatalogDatabaseReference | undefined,
		synchronize: (request: IAgentHostCatalogSyncRequest, validate?: () => Promise<void>) => Promise<AgentHostCatalogSyncResult>,
	) => Promise<T>): Promise<T> {
		if (this.isSessionDeletionFenced(session)) {
			return Promise.reject(new AgentHostCatalogDeletionFencedError(session));
		}
		return this._queue(session, 'migration', async () => {
			const database = await this._sessionDataService.tryOpenDatabase(session);
			try {
				return await operation(
					database,
					(request, validate) => database
						? this._synchronizeWithDatabaseNow(session, request, database)
						: this._synchronizeCentralOnlyNow(session, request, validate),
				);
			} finally {
				database?.dispose();
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

	private async _synchronizeWithDatabaseNow(
		session: URI,
		request: IAgentHostCatalogSyncRequest,
		ref: ReturnType<ISessionDataService['openDatabase']>,
	): Promise<AgentHostCatalogSyncResult> {
		const sessionKey = session.toString();
		const encoded = this._encode(request.data);
		const operationId = generateUuid();
		const stopWatch = StopWatch.create();
		for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
			const traceStage = (stage: string) => this._logService.trace(`[AgentHostCatalogSync] session=${sessionKey}, operationId=${operationId}, attempt=${attempt}, stage=${stage}, elapsedMs=${Math.round(stopWatch.elapsed())}`);
			traceStage('readLocalReceipt');
			const existing = await ref.object.getCatalogSyncSnapshot();
			let central: IAgentHostDatabaseSessionV2 | undefined;
			try {
				traceStage('readCentralCatalog');
				central = await this._catalogDatabase.getSessionV2(sessionKey);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to read sessions_v2 row for ${sessionKey}`, error);
				const legacyMetadataMatches = await catalogLegacyMetadataMatches(ref.object, request.legacyMetadata);
				const pending = await this._storePending(ref.object, request, encoded, existing, legacyMetadataMatches);
				return { status: 'pending', sourceRevision: pending.sourceRevision, reason: 'upsertFailed' };
			}

			const sessionGeneration = central?.sessionGeneration
				?? (existing?.state === 'pending' ? existing.sessionGeneration : generateUuid());
			traceStage('readLegacyMetadata');
			const legacyMetadataMatches = await catalogLegacyMetadataMatches(ref.object, request.legacyMetadata);
			const sourceRevision = this._sourceRevision(existing, central, sessionGeneration, encoded.payloadHash, legacyMetadataMatches);
			const snapshot = this._pendingSnapshot(sessionGeneration, sourceRevision, encoded);

			if (existing && existing.sessionGeneration !== sessionGeneration) {
				traceStage('transitionLocalReceipt');
				const transitioned = await ref.object.transitionMetadataValuesAndCatalogSyncSnapshot(
					request.legacyMetadata,
					existing.sessionGeneration,
					snapshot,
				);
				if (!transitioned) {
					continue;
				}
			} else {
				traceStage('writeLocalReceipt');
				const writeResult = await ref.object.setMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, snapshot);
				if (writeResult === 'replayed'
					&& request.chatCatalogRevision === undefined
					&& matchesAcknowledgedCatalogReceipt(existing, central)
					&& legacyMetadataMatches) {
					traceStage('acknowledged');
					return { status: 'acknowledged', sourceRevision };
				}
			}

			let upsertResult: AgentHostDatabaseSessionV2UpsertResult;
			try {
				traceStage('upsertCentralCatalog');
				upsertResult = await this._upsertSessionCatalog(
					this._envelope(sessionKey, sessionGeneration, sourceRevision, encoded),
					central?.sessionGeneration,
					request.chatCatalogRevision,
				);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to upsert sessions_v2 row for ${sessionKey}`, error);
				return { status: 'pending', sourceRevision, reason: 'upsertFailed' };
			}
			if (upsertResult === 'generationMismatch') {
				continue;
			}
			if (upsertResult !== 'applied' && upsertResult !== 'replayed') {
				this._logService.warn(`[AgentHostCatalogSync] sessions_v2 payload for ${sessionKey} remains pending: ${upsertResult}`);
				return { status: 'pending', sourceRevision, reason: upsertResult };
			}

			const acknowledgement: ISessionCatalogSyncAcknowledgement = {
				sessionGeneration,
				sourceRevision,
				projectionVersion: snapshot.projectionVersion,
				payloadHash: snapshot.payloadHash,
			};
			traceStage('acknowledgeLocalReceipt');
			if (!await ref.object.acknowledgeCatalogSyncSnapshot(acknowledgement)) {
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

	private async _synchronizeCentralOnlyNow(session: URI, request: IAgentHostCatalogSyncRequest, validate?: () => Promise<void>): Promise<AgentHostCatalogSyncResult> {
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

	private _upsertSessionCatalog(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined, chatCatalogRevision: number | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		return chatCatalogRevision === undefined
			? this._catalogDatabase.upsertSessionV2(envelope, expectedSessionGeneration)
			: this._catalogDatabase.upsertSessionV2FromChatCatalog(envelope, expectedSessionGeneration, chatCatalogRevision);
	}

	private async _storePending(
		database: ReturnType<ISessionDataService['openDatabase']>['object'],
		request: IAgentHostCatalogSyncRequest,
		encoded: IAgentHostCatalogEncodedPayload,
		existing: ISessionCatalogSyncSnapshot | undefined,
		legacyMetadataMatches: boolean,
	): Promise<ISessionCatalogSyncPendingSnapshot> {
		const sessionGeneration = existing?.sessionGeneration ?? generateUuid();
		const sourceRevision = this._sourceRevision(existing, undefined, sessionGeneration, encoded.payloadHash, legacyMetadataMatches);
		const snapshot = this._pendingSnapshot(sessionGeneration, sourceRevision, encoded);
		if (existing && existing.sessionGeneration !== sessionGeneration) {
			await database.transitionMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, existing.sessionGeneration, snapshot);
		} else {
			await database.setMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, snapshot);
		}
		return snapshot;
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
