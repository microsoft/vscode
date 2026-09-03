/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, Limiter } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot } from '../common/sessionDataService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, decodeAgentHostCatalogPayload, encodeAgentHostCatalogPayload, hashAgentHostCatalogPayload } from './agentHostCatalogProjection.js';
import { AgentHostCatalogDatabaseReference, AgentHostCatalogDeletionFencedError, AgentHostCatalogSyncResult, AgentHostCatalogSyncService, catalogLegacyMetadataMatches, IAgentHostCatalogSyncRequest, matchesAcknowledgedCatalogReceipt } from './agentHostCatalogSyncService.js';
import type { AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabase, IAgentHostDatabaseSessionV2, IAgentHostDatabaseSessionV2Receipt } from './agentHostDatabase.js';
import type { IRegisteredSession } from './agentSessionRegistry.js';
import type { IAgentHostStorageService } from './agentHostStorageService.js';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FULL_VERIFICATION_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BACKGROUND_DELAY_MS = 1000;
const RECONCILIATION_CURSOR_STORAGE_KEY = 'agentHost.catalogReconciliation.cursor';
type AgentHostCatalogSyncPendingReason = Extract<AgentHostCatalogSyncResult, { status: 'pending' }>['reason'];
type ScheduledPassKind = 'background' | 'periodic';

function compareSessionKeys(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

function receiptsEqual(first: IAgentHostDatabaseSessionV2Receipt | undefined, second: IAgentHostDatabaseSessionV2Receipt | undefined): boolean {
	return first?.sessionGeneration === second?.sessionGeneration
		&& first?.sourceRevision === second?.sourceRevision
		&& first?.payloadVersion === second?.payloadVersion
		&& first?.payloadHash === second?.payloadHash
		&& first?.payloadDirty === second?.payloadDirty;
}

class CatalogReconciliationSupersededError extends Error { }
class CatalogReconciliationProviderUnavailableError extends Error { }

export type AgentHostCatalogReconciliationOutcome =
	| { readonly session: string; readonly status: 'skipped'; readonly reason: 'synchronized' }
	| { readonly session: string; readonly status: 'succeeded'; readonly reason: 'pendingReplayed' | 'synchronized'; readonly sourceRevision: number }
	| { readonly session: string; readonly status: 'pending'; readonly reason: AgentHostCatalogSyncPendingReason; readonly sourceRevision: number }
	| { readonly session: string; readonly status: 'retry'; readonly reason: 'providerUnavailable' | 'missingCatalog' | 'staleIncarnation' | 'superseded' | 'tombstoned' | 'cancelled' }
	| { readonly session: string; readonly status: 'failed'; readonly reason: 'malformedPayload' | 'payloadMismatch' | 'centralApplyFailed' | 'acknowledgementSuperseded' | 'unexpected'; readonly error?: string };

export interface IAgentHostCatalogReconciliationReport {
	readonly outcomes: readonly AgentHostCatalogReconciliationOutcome[];
	readonly cursor: string | undefined;
}

export type AgentHostCatalogReconciliationSourceResult =
	| { readonly status: 'available'; readonly request: IAgentHostCatalogSyncRequest }
	| { readonly status: 'providerUnavailable' };

export interface IAgentHostCatalogReconciliationOptions {
	readonly batchSize?: number;
	readonly concurrency?: number;
	readonly cursorStorageKey?: string;
	readonly intervalMs?: number;
	readonly fullVerificationIntervalMs?: number;
	readonly backgroundDelayMs?: number;
	readonly schedule?: (callback: () => void, delay: number) => IDisposable;
	readonly now?: () => number;
}

export class AgentHostCatalogReconciliationService extends Disposable {

	private readonly _cancellation = this._register(new CancellationTokenSource());
	private readonly _batchSize: number;
	private readonly _concurrency: number;
	private readonly _cursorStorageKey: string;
	private readonly _intervalMs: number;
	private readonly _fullVerificationIntervalMs: number;
	private readonly _backgroundDelayMs: number;
	private readonly _schedule: (callback: () => void, delay: number) => IDisposable;
	private readonly _now: () => number;
	private readonly _scheduledPass = this._register(new MutableDisposable<IDisposable>());
	private _scheduledPassKind: ScheduledPassKind | undefined;
	private _payloadDirtyMark: Promise<void> | undefined;
	private _initialPayloadDirtyMarkPending = true;
	private _lastFullVerification = 0;
	private _running: Promise<IAgentHostCatalogReconciliationReport> | undefined;
	private _rerunRequested = false;
	private _periodic = false;

	constructor(
		private readonly _catalogDatabase: IAgentHostDatabase,
		private readonly _catalogSyncService: AgentHostCatalogSyncService,
		private readonly _storageService: IAgentHostStorageService,
		private readonly _listSessions: () => Promise<readonly IRegisteredSession[]>,
		private readonly _resolveSource: (registered: IRegisteredSession, database: AgentHostCatalogDatabaseReference | undefined) => Promise<AgentHostCatalogReconciliationSourceResult>,
		private readonly _logService: ILogService,
		options: IAgentHostCatalogReconciliationOptions = {},
	) {
		super();
		this._batchSize = this._positiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize');
		this._concurrency = this._positiveInteger(options.concurrency, DEFAULT_CONCURRENCY, 'concurrency');
		this._cursorStorageKey = options.cursorStorageKey ?? RECONCILIATION_CURSOR_STORAGE_KEY;
		this._intervalMs = this._positiveInteger(options.intervalMs, DEFAULT_INTERVAL_MS, 'intervalMs');
		this._fullVerificationIntervalMs = this._positiveInteger(options.fullVerificationIntervalMs, DEFAULT_FULL_VERIFICATION_INTERVAL_MS, 'fullVerificationIntervalMs');
		this._backgroundDelayMs = this._nonNegativeInteger(options.backgroundDelayMs, DEFAULT_BACKGROUND_DELAY_MS, 'backgroundDelayMs');
		this._schedule = options.schedule ?? ((callback, delay) => disposableTimeout(callback, delay));
		this._now = options.now ?? Date.now;
	}

	schedule(): void {
		if (this._cancellation.token.isCancellationRequested) {
			return;
		}
		this._periodic = true;
		if (this._running) {
			void this.runPass();
			return;
		}
		if (this._scheduledPassKind === 'background') {
			return;
		}
		this._schedulePass('background', this._backgroundDelayMs);
	}

	start(): void {
		if (this._cancellation.token.isCancellationRequested) {
			return;
		}
		this._periodic = true;
		this._scheduledPass.clear();
		this._scheduledPassKind = undefined;
		const pass = this.runPass();
		void pass.then(
			report => this._logOutcomes(report.outcomes),
			error => this._logService.error('[AgentHostCatalogReconciliation] Background pass failed', error),
		);
	}

	runPass(): Promise<IAgentHostCatalogReconciliationReport> {
		if (this._cancellation.token.isCancellationRequested) {
			return Promise.resolve({ outcomes: [], cursor: this._readCursor() });
		}
		if (this._running) {
			this._rerunRequested = true;
			return this._running;
		}
		return this._startRun(() => this._runPassLoop(() => this._runSinglePass(this._cancellation.token)));
	}

	async runFullPass(): Promise<IAgentHostCatalogReconciliationReport> {
		while (this._running) {
			await this._running;
		}
		await this._prepareFullVerification();
		if (this._running) {
			return this.runFullPass();
		}
		if (this._cancellation.token.isCancellationRequested) {
			return { outcomes: [], cursor: this._readCursor() };
		}
		return this._startRun(() => this._runPassLoop(() => this._runFullPass(this._cancellation.token)));
	}

	async whenIdle(): Promise<void> {
		if (this._scheduledPassKind === 'background') {
			this._scheduledPass.clear();
			this._scheduledPassKind = undefined;
			await this.runPass();
		} else {
			while (this._running) {
				await this._running;
			}
		}
		while (this._running) {
			await this._running;
		}
		await this._storageService.whenIdle();
	}

	override dispose(): void {
		this._periodic = false;
		this._cancellation.cancel();
		super.dispose();
	}

	private _startRun(run: () => Promise<IAgentHostCatalogReconciliationReport>): Promise<IAgentHostCatalogReconciliationReport> {
		this._rerunRequested = false;
		const running = run().finally(() => {
			if (this._running === running) {
				this._running = undefined;
				this._scheduleNextPass();
			}
		});
		this._running = running;
		return running;
	}

	private async _runPassLoop(initialPass: () => Promise<IAgentHostCatalogReconciliationReport>): Promise<IAgentHostCatalogReconciliationReport> {
		let report = await initialPass();
		const outcomes = [...report.outcomes];
		while (this._rerunRequested && !this._cancellation.token.isCancellationRequested) {
			this._rerunRequested = false;
			report = await this._runSinglePass(this._cancellation.token);
			outcomes.push(...report.outcomes);
		}
		return { outcomes, cursor: report.cursor };
	}

	private async _runSinglePass(token: CancellationToken): Promise<IAgentHostCatalogReconciliationReport> {
		await this._ensureInitialPayloadDirtyMark();
		if (this._now() - this._lastFullVerification >= this._fullVerificationIntervalMs) {
			await this._markAllPayloadsDirty();
			this._lastFullVerification = this._now();
		}
		const { sessions, receiptBySession } = await this._listDirtySessions();
		if (sessions.length === 0) {
			this._storageService.delete(this._cursorStorageKey);
			return { outcomes: [], cursor: undefined };
		}

		const selected = this._selectBatch(sessions, this._readCursor());
		const outcomes = await this._runBatch(selected, receiptBySession, token);
		const cursor = selected.at(-1)?.session.toString();
		if (cursor && !token.isCancellationRequested) {
			this._storageService.set(this._cursorStorageKey, cursor);
		}
		return { outcomes, cursor };
	}

	private async _runFullPass(token: CancellationToken): Promise<IAgentHostCatalogReconciliationReport> {
		const { sessions, receiptBySession } = await this._listDirtySessions();
		const outcomes: AgentHostCatalogReconciliationOutcome[] = [];
		let cursor: string | undefined;
		for (let index = 0; index < sessions.length && !token.isCancellationRequested; index += this._batchSize) {
			const selected = sessions.slice(index, index + this._batchSize);
			outcomes.push(...await this._runBatch(selected, receiptBySession, token));
			cursor = selected.at(-1)?.session.toString();
			if (cursor && !token.isCancellationRequested) {
				this._storageService.set(this._cursorStorageKey, cursor);
			}
		}
		if (sessions.length === 0) {
			this._storageService.delete(this._cursorStorageKey);
		}
		return { outcomes, cursor };
	}

	private async _listDirtySessions(): Promise<{
		readonly sessions: readonly IRegisteredSession[];
		readonly receiptBySession: ReadonlyMap<string, IAgentHostDatabaseSessionV2Receipt>;
	}> {
		const [listedSessions, initialReceipts] = await Promise.all([
			this._listSessions(),
			this._catalogDatabase.listSessionsV2Receipts(),
		]);
		const receiptBySession = new Map(initialReceipts.map(receipt => [receipt.session, receipt]));
		const sessions = [...listedSessions]
			.filter(session => receiptBySession.get(session.session.toString())?.payloadDirty !== 0)
			.sort((first, second) => compareSessionKeys(first.session.toString(), second.session.toString()));
		return { sessions, receiptBySession };
	}

	private _runBatch(
		selected: readonly IRegisteredSession[],
		receiptBySession: ReadonlyMap<string, IAgentHostDatabaseSessionV2Receipt>,
		token: CancellationToken,
	): Promise<readonly AgentHostCatalogReconciliationOutcome[]> {
		const limiter = new Limiter<AgentHostCatalogReconciliationOutcome>(this._concurrency);
		return Promise.all(selected.map(registered => limiter.queue(() => this._reconcileSession(
			registered,
			receiptBySession.get(registered.session.toString()),
			token,
		))));
	}

	private async _reconcileSession(registered: IRegisteredSession, receipt: IAgentHostDatabaseSessionV2Receipt | undefined, token: CancellationToken): Promise<AgentHostCatalogReconciliationOutcome> {
		const session = registered.session;
		const sessionKey = session.toString();
		try {
			if (token.isCancellationRequested) {
				return { session: sessionKey, status: 'retry', reason: 'cancelled' };
			}
			if (await this._catalogDatabase.isSessionTombstoned(sessionKey)) {
				return { session: sessionKey, status: 'retry', reason: 'tombstoned' };
			}
			const observedDirty = receipt?.payloadDirty ?? await this._catalogDatabase.getSessionV2PayloadDirty(sessionKey);

			return await this._catalogSyncService.runMigrationExclusive(session, async (database, synchronize) => {
				if (!database) {
					let result: AgentHostCatalogSyncResult;
					const validate = async (): Promise<void> => {
						if (!receiptsEqual(receipt, await this._catalogDatabase.getSessionV2(sessionKey))
							|| await this._catalogDatabase.getSessionV2PayloadDirty(sessionKey) !== observedDirty) {
							throw new CatalogReconciliationSupersededError();
						}
					};
					try {
						await validate();
						const sourceResult = await this._resolveSource(registered, database);
						if (sourceResult.status === 'providerUnavailable') {
							throw new CatalogReconciliationProviderUnavailableError();
						}
						await validate();
						result = await synchronize(sourceResult.request, validate);
					} catch (error) {
						if (error instanceof CatalogReconciliationSupersededError) {
							return { session: sessionKey, status: 'retry', reason: 'superseded' };
						}
						if (error instanceof CatalogReconciliationProviderUnavailableError) {
							return { session: sessionKey, status: 'retry', reason: 'providerUnavailable' };
						}
						throw error;
					}
					if (result.status === 'pending') {
						return { session: sessionKey, status: 'pending', reason: result.reason, sourceRevision: result.sourceRevision };
					}
					if (!await this._markPayloadClean(sessionKey, receipt, observedDirty)) {
						return { session: sessionKey, status: 'retry', reason: 'superseded' };
					}
					return { session: sessionKey, status: 'succeeded', reason: 'synchronized', sourceRevision: result.sourceRevision };
				}
				const replay = await (async (): Promise<AgentHostCatalogReconciliationOutcome | undefined> => {
					const latestReceipt = await this._catalogDatabase.getSessionV2(sessionKey);
					if (!receiptsEqual(receipt, latestReceipt)
						|| await this._catalogDatabase.getSessionV2PayloadDirty(sessionKey) !== observedDirty) {
						return { session: sessionKey, status: 'retry', reason: 'superseded' };
					}
					const snapshot = await database.object.getCatalogSyncSnapshot();
					// A pending snapshot written by a *different* build carries that
					// build's projection, which this build cannot replay verbatim.
					// It is still evidence that the central row is stale, so the
					// session falls through to a full re-projection from its own
					// metadata instead of being reported as malformed — otherwise a
					// downgrade would leave the older build's writes unreachable
					// forever, since the central row it could not update stays
					// valid and keeps serving the pre-downgrade values.
					const replayable = snapshot?.state === 'pending' && snapshot.projectionVersion === AGENT_HOST_CATALOG_PAYLOAD_VERSION;
					if (snapshot?.state === 'pending' && !replayable) {
						this._logService.trace(`[AgentHostCatalogReconciliation] Pending snapshot for ${sessionKey} uses projection version ${snapshot.projectionVersion}; re-projecting instead of replaying`);
					}
					if (replayable) {
						const current = await database.object.getCatalogSyncSnapshot();
						const outcome = current?.state !== 'pending'
							? {
								session: sessionKey,
								status: 'succeeded',
								reason: 'pendingReplayed',
								sourceRevision: current?.sourceRevision ?? snapshot.sourceRevision,
							} satisfies Extract<AgentHostCatalogReconciliationOutcome, { status: 'succeeded' }>
							: await this._replayPending(session, current, acknowledgement => database.object.acknowledgeCatalogSyncSnapshot(acknowledgement), token);
						if (outcome.status === 'succeeded') {
							if (!await this._markPayloadClean(sessionKey, latestReceipt, observedDirty)) {
								return { session: sessionKey, status: 'retry', reason: 'superseded' };
							}
							return outcome;
						}
						if (outcome.status !== 'retry' || (outcome.reason !== 'staleIncarnation' && outcome.reason !== 'missingCatalog')) {
							return outcome;
						}
					}
					return undefined;
				})();
				if (replay) {
					return replay;
				}

				if (token.isCancellationRequested) {
					return { session: sessionKey, status: 'retry', reason: 'cancelled' };
				}
				const sourceResult = await this._resolveSource(registered, database);
				if (sourceResult.status === 'providerUnavailable') {
					return { session: sessionKey, status: 'retry', reason: 'providerUnavailable' };
				}
				if (token.isCancellationRequested) {
					return { session: sessionKey, status: 'retry', reason: 'cancelled' };
				}
				const legacyMetadataMatches = await catalogLegacyMetadataMatches(database.object, sourceResult.request.legacyMetadata);
				const expected = encodeAgentHostCatalogPayload(sourceResult.request.data);
				return await (async (): Promise<AgentHostCatalogReconciliationOutcome> => {
					const latestReceipt = await this._catalogDatabase.getSessionV2(sessionKey);
					if (!receiptsEqual(receipt, latestReceipt)
						|| await this._catalogDatabase.getSessionV2PayloadDirty(sessionKey) !== observedDirty) {
						return { session: sessionKey, status: 'retry', reason: 'superseded' };
					}
					const currentSnapshot = await database.object.getCatalogSyncSnapshot();
					if (token.isCancellationRequested) {
						return { session: sessionKey, status: 'retry', reason: 'cancelled' };
					}

					const central = await this._catalogDatabase.getSessionV2(sessionKey);
					if (legacyMetadataMatches
						&& expected.ok
						&& currentSnapshot?.payloadHash === expected.value.payloadHash
						&& matchesAcknowledgedCatalogReceipt(currentSnapshot, central)
						&& this._isValidCentralPayload(central)) {
						if (!await this._markPayloadClean(sessionKey, receipt, observedDirty)) {
							return { session: sessionKey, status: 'retry', reason: 'superseded' };
						}
						return { session: sessionKey, status: 'skipped', reason: 'synchronized' };
					}
					if (legacyMetadataMatches
						&& expected.ok
						&& currentSnapshot?.payloadHash === expected.value.payloadHash
						&& matchesAcknowledgedCatalogReceipt(currentSnapshot, central)
						&& central) {
						const replacement: ISessionCatalogSyncPendingSnapshot = {
							sessionGeneration: central.sessionGeneration,
							sourceRevision: central.sourceRevision + 1,
							projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
							payload: expected.value.payload,
							payloadHash: expected.value.payloadHash,
							state: 'pending',
						};
						await database.object.setMetadataValuesAndCatalogSyncSnapshot(sourceResult.request.legacyMetadata, replacement);
						const pending = await database.object.getCatalogSyncSnapshot();
						if (pending?.state !== 'pending'
							|| pending.sessionGeneration !== replacement.sessionGeneration
							|| pending.sourceRevision !== replacement.sourceRevision
							|| pending.projectionVersion !== replacement.projectionVersion
							|| pending.payloadHash !== replacement.payloadHash
							|| pending.payload !== replacement.payload) {
							return { session: sessionKey, status: 'retry', reason: 'superseded' };
						}
						const outcome = await this._replayPending(session, pending, acknowledgement => database.object.acknowledgeCatalogSyncSnapshot(acknowledgement), token);
						if (outcome.status !== 'succeeded') {
							return outcome;
						}
						if (!await this._markPayloadClean(sessionKey, latestReceipt, observedDirty)) {
							return { session: sessionKey, status: 'retry', reason: 'superseded' };
						}
						return { session: sessionKey, status: 'succeeded', reason: 'synchronized', sourceRevision: outcome.sourceRevision };
					}

					if (token.isCancellationRequested) {
						return { session: sessionKey, status: 'retry', reason: 'cancelled' };
					}
					if (await this._catalogDatabase.isSessionTombstoned(sessionKey)) {
						return { session: sessionKey, status: 'retry', reason: 'tombstoned' };
					}
					const synchronized = await synchronize(sourceResult.request);
					if (synchronized.status !== 'acknowledged') {
						return { session: sessionKey, status: 'pending', reason: synchronized.reason, sourceRevision: synchronized.sourceRevision };
					}
					if (!await this._markPayloadClean(sessionKey, receipt, observedDirty)) {
						return { session: sessionKey, status: 'retry', reason: 'superseded' };
					}
					return { session: sessionKey, status: 'succeeded', reason: 'synchronized', sourceRevision: synchronized.sourceRevision };
				})();
			});
		} catch (error) {
			if (error instanceof AgentHostCatalogDeletionFencedError) {
				return { session: sessionKey, status: 'retry', reason: 'tombstoned' };
			}
			this._logService.warn(`[AgentHostCatalogReconciliation] Failed to reconcile ${sessionKey}`, error);
			return { session: sessionKey, status: 'failed', reason: 'unexpected', error: error instanceof Error ? error.message : String(error) };
		}
	}

	private _isValidCentralPayload(central: IAgentHostDatabaseSessionV2 | undefined): boolean {
		if (!central || central.payloadVersion !== AGENT_HOST_CATALOG_PAYLOAD_VERSION) {
			return false;
		}
		const decoded = decodeAgentHostCatalogPayload(central.payload);
		return decoded.ok
			&& decoded.value.payload === central.payload
			&& hashAgentHostCatalogPayload(central.payload) === central.payloadHash;
	}

	private async _replayPending(
		session: URI,
		snapshot: ISessionCatalogSyncPendingSnapshot,
		acknowledge: (acknowledgement: ISessionCatalogSyncAcknowledgement) => Promise<boolean>,
		token: CancellationToken,
	): Promise<Extract<AgentHostCatalogReconciliationOutcome, { status: 'succeeded' | 'pending' | 'retry' | 'failed' }>> {
		const sessionKey = session.toString();
		const decoded = decodeAgentHostCatalogPayload(snapshot.payload);
		if (!decoded.ok || snapshot.projectionVersion !== AGENT_HOST_CATALOG_PAYLOAD_VERSION) {
			return { session: sessionKey, status: 'failed', reason: 'malformedPayload', error: decoded.ok ? 'Unsupported payload version' : decoded.error };
		}
		if (decoded.value.payload !== snapshot.payload || hashAgentHostCatalogPayload(snapshot.payload) !== snapshot.payloadHash) {
			return { session: sessionKey, status: 'failed', reason: 'payloadMismatch', error: 'Pending payload is not canonical or its hash does not match' };
		}
		let central = await this._catalogDatabase.getSessionV2(sessionKey);
		if (central && central.sessionGeneration !== snapshot.sessionGeneration) {
			return { session: sessionKey, status: 'retry', reason: 'staleIncarnation' };
		}
		if (token.isCancellationRequested) {
			return { session: sessionKey, status: 'retry', reason: 'cancelled' };
		}
		if (await this._catalogDatabase.isSessionTombstoned(sessionKey)) {
			return { session: sessionKey, status: 'retry', reason: 'tombstoned' };
		}
		central = await this._catalogDatabase.getSessionV2(sessionKey);
		if (central && central.sessionGeneration !== snapshot.sessionGeneration) {
			return { session: sessionKey, status: 'retry', reason: 'staleIncarnation' };
		}
		if (token.isCancellationRequested) {
			return { session: sessionKey, status: 'retry', reason: 'cancelled' };
		}

		let applyResult: AgentHostDatabaseSessionV2UpsertResult;
		try {
			applyResult = await this._catalogDatabase.upsertSessionV2({
				session: sessionKey,
				sessionGeneration: snapshot.sessionGeneration,
				sourceRevision: snapshot.sourceRevision,
				payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
				payloadHash: snapshot.payloadHash,
				verified: true,
				payload: snapshot.payload,
			}, central?.sessionGeneration);
		} catch (error) {
			return { session: sessionKey, status: 'pending', reason: 'upsertFailed', sourceRevision: snapshot.sourceRevision };
		}
		if (applyResult !== 'applied' && applyResult !== 'replayed') {
			return this._applyFailure(sessionKey, applyResult);
		}
		if (token.isCancellationRequested) {
			return { session: sessionKey, status: 'retry', reason: 'cancelled' };
		}
		if (!await acknowledge(snapshot)) {
			return { session: sessionKey, status: 'failed', reason: 'acknowledgementSuperseded' };
		}
		return { session: sessionKey, status: 'succeeded', reason: 'pendingReplayed', sourceRevision: snapshot.sourceRevision };
	}

	private _applyFailure(session: string, result: AgentHostDatabaseSessionV2UpsertResult): Extract<AgentHostCatalogReconciliationOutcome, { status: 'retry' | 'failed' }> {
		if (result === 'tombstoned') {
			return { session, status: 'retry', reason: 'tombstoned' };
		}
		if (result === 'generationMismatch') {
			return { session, status: 'retry', reason: 'staleIncarnation' };
		}
		if (result === 'missingSession') {
			return { session, status: 'retry', reason: 'missingCatalog' };
		}
		if (result === 'stale' || result === 'conflict') {
			return { session, status: 'retry', reason: 'superseded' };
		}
		return { session, status: 'failed', reason: 'centralApplyFailed', error: result };
	}

	private async _markPayloadClean(session: string, receipt: IAgentHostDatabaseSessionV2Receipt | undefined, expectedDirty = receipt?.payloadDirty): Promise<boolean> {
		const current = await this._catalogDatabase.getSessionV2(session);
		if (!current) {
			return false;
		}
		if (expectedDirty === undefined || expectedDirty === 0) {
			return current.payloadDirty === 0;
		}
		return this._catalogDatabase.markSessionV2PayloadClean(session, expectedDirty);
	}

	private async _ensureInitialPayloadDirtyMark(): Promise<void> {
		if (!this._initialPayloadDirtyMarkPending) {
			return;
		}
		await this._markAllPayloadsDirty();
		this._initialPayloadDirtyMarkPending = false;
		this._lastFullVerification = this._now();
	}

	private async _prepareFullVerification(): Promise<void> {
		await this._markAllPayloadsDirty();
		this._initialPayloadDirtyMarkPending = false;
		this._lastFullVerification = this._now();
	}

	private _markAllPayloadsDirty(): Promise<void> {
		if (!this._payloadDirtyMark) {
			const operation = this._catalogDatabase.markAllSessionsV2PayloadsDirty();
			const tracked = operation.finally(() => {
				if (this._payloadDirtyMark === tracked) {
					this._payloadDirtyMark = undefined;
				}
			});
			this._payloadDirtyMark = tracked;
		}
		return this._payloadDirtyMark;
	}

	private _selectBatch(sessions: readonly IRegisteredSession[], cursor: string | undefined): readonly IRegisteredSession[] {
		const start = cursor === undefined ? 0 : Math.max(0, sessions.findIndex(session => compareSessionKeys(session.session.toString(), cursor) > 0));
		const ordered = start === 0 ? sessions : [...sessions.slice(start), ...sessions.slice(0, start)];
		return ordered.slice(0, this._batchSize);
	}

	private _readCursor(): string | undefined {
		const cursor = this._storageService.get<string>(this._cursorStorageKey);
		return typeof cursor === 'string' ? cursor : undefined;
	}

	private _scheduleNextPass(): void {
		if (!this._periodic || this._running || this._scheduledPassKind || this._cancellation.token.isCancellationRequested) {
			return;
		}
		this._schedulePass('periodic', this._intervalMs);
	}

	private _schedulePass(kind: ScheduledPassKind, delay: number): void {
		this._scheduledPass.clear();
		this._scheduledPassKind = kind;
		this._scheduledPass.value = this._schedule(() => {
			this._scheduledPass.clear();
			this._scheduledPassKind = undefined;
			this.start();
		}, delay);
	}

	private _logOutcomes(outcomes: readonly AgentHostCatalogReconciliationOutcome[]): void {
		for (const outcome of outcomes) {
			if (outcome.status === 'failed') {
				this._logService.warn(`[AgentHostCatalogReconciliation] ${outcome.session} failed: ${outcome.reason}${outcome.error ? ` (${outcome.error})` : ''}`);
			} else if (outcome.status === 'pending' || outcome.status === 'retry') {
				this._logService.info(`[AgentHostCatalogReconciliation] ${outcome.session} will be retried: ${outcome.reason}`);
			}
		}
	}

	private _positiveInteger(value: number | undefined, fallback: number, name: string): number {
		if (value === undefined) {
			return fallback;
		}
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new Error(`Catalog reconciliation ${name} must be a positive safe integer`);
		}
		return value;
	}

	private _nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
		if (value === undefined) {
			return fallback;
		}
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error(`Catalog reconciliation ${name} must be a non-negative safe integer`);
		}
		return value;
	}
}
