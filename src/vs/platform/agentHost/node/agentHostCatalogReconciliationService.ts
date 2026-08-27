/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, Limiter } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionDataService } from '../common/sessionDataService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, decodeAgentHostCatalogPayload, encodeAgentHostCatalogPayload, hashAgentHostCatalogPayload } from './agentHostCatalogProjection.js';
import { AgentHostCatalogSyncResult, AgentHostCatalogSyncService, catalogLegacyMetadataMatches, IAgentHostCatalogSyncRequest, matchesAcknowledgedCatalogReceipt } from './agentHostCatalogSyncService.js';
import type { AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabase, IAgentHostDatabaseSessionV2Receipt } from './agentHostDatabase.js';
import type { IRegisteredSession } from './agentSessionRegistry.js';
import type { IAgentHostStorageService } from './agentHostStorageService.js';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FULL_VERIFICATION_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BACKGROUND_DELAY_MS = 1000;
const RECONCILIATION_CURSOR_STORAGE_KEY = 'agentHost.catalogReconciliation.cursor';
type AgentHostCatalogSyncPendingReason = Extract<AgentHostCatalogSyncResult, { status: 'pending' }>['reason'];

export type AgentHostCatalogReconciliationOutcome =
	| { readonly session: string; readonly status: 'skipped'; readonly reason: 'synchronized' }
	| { readonly session: string; readonly status: 'succeeded'; readonly reason: 'pendingReplayed' | 'synchronized'; readonly sourceRevision: number }
	| { readonly session: string; readonly status: 'pending'; readonly reason: AgentHostCatalogSyncPendingReason; readonly sourceRevision: number }
	| { readonly session: string; readonly status: 'retry'; readonly reason: 'missingDatabase' | 'providerUnavailable' | 'missingCatalog' | 'staleIncarnation' | 'superseded' | 'tombstoned' | 'cancelled' }
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
	private _payloadDirtyMark: Promise<void> | undefined;
	private _initialPayloadDirtyMarkPending = true;
	private _lastFullVerification = 0;
	private _scheduledBackgroundPass = false;
	private _running: Promise<IAgentHostCatalogReconciliationReport> | undefined;
	private _rerunRequested = false;
	private _periodic = false;

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _catalogDatabase: IAgentHostDatabase,
		private readonly _catalogSyncService: AgentHostCatalogSyncService,
		private readonly _storageService: IAgentHostStorageService,
		private readonly _listSessions: () => Promise<readonly IRegisteredSession[]>,
		private readonly _resolveSource: (registered: IRegisteredSession) => Promise<AgentHostCatalogReconciliationSourceResult>,
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
		if (this._scheduledPass.value) {
			return;
		}
		this._scheduledBackgroundPass = true;
		this._scheduledPass.value = this._schedule(() => {
			this._scheduledPass.clear();
			this._scheduledBackgroundPass = false;
			this.start();
		}, this._backgroundDelayMs);
	}

	start(): void {
		if (this._cancellation.token.isCancellationRequested) {
			return;
		}
		this._periodic = true;
		this._scheduledPass.clear();
		this._scheduledBackgroundPass = false;
		const wasRunning = this._running !== undefined;
		const pass = this.runPass();
		if (wasRunning) {
			return;
		}
		void pass.then(
			report => this._logOutcomes(report.outcomes),
			error => this._logService.error('[AgentHostCatalogReconciliation] Background pass failed', error),
		).finally(() => this._scheduleNextPass());
	}

	runPass(): Promise<IAgentHostCatalogReconciliationReport> {
		if (this._cancellation.token.isCancellationRequested) {
			return Promise.resolve({ outcomes: [], cursor: this._readCursor() });
		}
		if (this._running) {
			this._rerunRequested = true;
			return this._running;
		}
		this._running = this._runPassLoop().finally(() => {
			this._running = undefined;
		});
		return this._running;
	}

	async runFullPass(): Promise<IAgentHostCatalogReconciliationReport> {
		await this._prepareFullVerification();
		return this.runPass();
	}

	async whenIdle(): Promise<void> {
		await this._prepareFullVerification();
		if (this._scheduledBackgroundPass) {
			this._scheduledPass.clear();
			this._scheduledBackgroundPass = false;
			this.start();
		} else {
			await this.runPass();
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

	private async _runPassLoop(): Promise<IAgentHostCatalogReconciliationReport> {
		let report = await this._runSinglePass(this._cancellation.token);
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
		const [listedSessions, initialReceipts] = await Promise.all([
			this._listSessions(),
			this._catalogDatabase.listSessionsV2Receipts(),
		]);
		const receiptBySession = new Map(initialReceipts.map(receipt => [receipt.session, receipt]));
		const sessions = [...listedSessions]
			.filter(session => receiptBySession.get(session.session.toString())?.payloadDirty !== 0)
			.sort((a, b) => a.session.toString().localeCompare(b.session.toString()));
		if (sessions.length === 0) {
			this._storageService.delete(this._cursorStorageKey);
			return { outcomes: [], cursor: undefined };
		}

		const selected = this._selectBatch(sessions, this._readCursor());
		const limiter = new Limiter<AgentHostCatalogReconciliationOutcome>(this._concurrency);
		const outcomes = await Promise.all(selected.map(registered => limiter.queue(() => this._reconcileSession(
			registered,
			receiptBySession.get(registered.session.toString()),
			token,
		))));
		const cursor = selected.at(-1)?.session.toString();
		if (cursor && !token.isCancellationRequested) {
			this._storageService.set(this._cursorStorageKey, cursor);
		}
		return { outcomes, cursor };
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

			const database = await this._sessionDataService.tryOpenDatabase(session);
			if (!database) {
				return { session: sessionKey, status: 'retry', reason: 'missingDatabase' };
			}
			try {
				const sourceResult = await this._resolveSource(registered);
				if (sourceResult.status === 'providerUnavailable') {
					return { session: sessionKey, status: 'retry', reason: 'providerUnavailable' };
				}
				if (token.isCancellationRequested) {
					return { session: sessionKey, status: 'retry', reason: 'cancelled' };
				}
				const legacyMetadataMatches = await catalogLegacyMetadataMatches(database.object, sourceResult.request.legacyMetadata);
				const expected = encodeAgentHostCatalogPayload(sourceResult.request.data);
				return await this._catalogSyncService.runExclusive(session, async synchronize => {
					const latestReceipt = await this._catalogDatabase.getSessionV2(sessionKey);
					if (receipt ? latestReceipt?.payloadDirty !== receipt.payloadDirty : latestReceipt !== undefined) {
						return { session: sessionKey, status: 'retry', reason: 'superseded' };
					}
					const snapshot = await database.object.getCatalogSyncSnapshot();
					let replayedRevision: number | undefined;
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
						const replay = current?.state !== 'pending'
							? {
								session: sessionKey,
								status: 'succeeded',
								reason: 'pendingReplayed',
								sourceRevision: current?.sourceRevision ?? snapshot.sourceRevision,
							} satisfies Extract<AgentHostCatalogReconciliationOutcome, { status: 'succeeded' }>
							: await this._replayPending(session, current, acknowledgement => database.object.acknowledgeCatalogSyncSnapshot(acknowledgement), token);
						if (replay.status !== 'succeeded') {
							if (replay.status !== 'retry' || (replay.reason !== 'staleIncarnation' && replay.reason !== 'missingCatalog')) {
								return replay;
							}
						} else {
							replayedRevision = replay.sourceRevision;
						}
					}

					if (token.isCancellationRequested) {
						return { session: sessionKey, status: 'retry', reason: 'cancelled' };
					}
					const currentSnapshot = await database.object.getCatalogSyncSnapshot();
					if (token.isCancellationRequested) {
						return { session: sessionKey, status: 'retry', reason: 'cancelled' };
					}

					const central = await this._catalogDatabase.getSessionV2(sessionKey);
					if (legacyMetadataMatches
						&& expected.ok
						&& currentSnapshot?.payloadHash === expected.value.payloadHash
						&& matchesAcknowledgedCatalogReceipt(currentSnapshot, central)) {
						if (!await this._markPayloadClean(sessionKey, receipt)) {
							return { session: sessionKey, status: 'retry', reason: 'superseded' };
						}
						return replayedRevision === undefined
							? { session: sessionKey, status: 'skipped', reason: 'synchronized' }
							: { session: sessionKey, status: 'succeeded', reason: 'pendingReplayed', sourceRevision: replayedRevision };
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
					if (!await this._markPayloadClean(sessionKey, receipt)) {
						return { session: sessionKey, status: 'retry', reason: 'superseded' };
					}
					return { session: sessionKey, status: 'succeeded', reason: 'synchronized', sourceRevision: synchronized.sourceRevision };
				});
			} finally {
				database.dispose();
			}
		} catch (error) {
			this._logService.warn(`[AgentHostCatalogReconciliation] Failed to reconcile ${sessionKey}`, error);
			return { session: sessionKey, status: 'failed', reason: 'unexpected', error: error instanceof Error ? error.message : String(error) };
		}
	}

	private async _replayPending(
		session: URI,
		snapshot: ISessionCatalogSyncPendingSnapshot,
		acknowledge: (acknowledgement: ISessionCatalogSyncAcknowledgement) => Promise<boolean>,
		token: CancellationToken,
	): Promise<Extract<AgentHostCatalogReconciliationOutcome, { status: 'succeeded' | 'retry' | 'failed' }>> {
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
			return { session: sessionKey, status: 'failed', reason: 'centralApplyFailed', error: error instanceof Error ? error.message : String(error) };
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

	private async _markPayloadClean(session: string, receipt: IAgentHostDatabaseSessionV2Receipt | undefined): Promise<boolean> {
		const current = receipt ?? await this._catalogDatabase.getSessionV2(session);
		if (!current) {
			return false;
		}
		if (!receipt) {
			return current.payloadDirty === 0;
		}
		if (current.payloadDirty === 0) {
			return false;
		}
		return this._catalogDatabase.markSessionV2PayloadClean(session, current.payloadDirty);
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
		const start = cursor === undefined ? 0 : Math.max(0, sessions.findIndex(session => session.session.toString() > cursor));
		const ordered = start === 0 ? sessions : [...sessions.slice(start), ...sessions.slice(0, start)];
		return ordered.slice(0, this._batchSize);
	}

	private _readCursor(): string | undefined {
		const cursor = this._storageService.get<string>(this._cursorStorageKey);
		return typeof cursor === 'string' ? cursor : undefined;
	}

	private _scheduleNextPass(): void {
		if (!this._periodic || this._cancellation.token.isCancellationRequested) {
			return;
		}
		this._scheduledPass.value = this._schedule(() => {
			this._scheduledPass.clear();
			this.start();
		}, this._intervalMs);
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
