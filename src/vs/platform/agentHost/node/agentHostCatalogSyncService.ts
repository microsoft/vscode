/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { URI } from '../../../base/common/uri.js';
import { SequencerByKey } from '../../../base/common/async.js';
import type { IReference } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionCatalogSyncSnapshot, ISessionDataService, ISessionDatabase } from '../common/sessionDataService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, AgentHostCatalogData, encodeAgentHostCatalogPayload, IAgentHostCatalogEncodedPayload } from './agentHostCatalogProjection.js';
import type { AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabase, IAgentHostDatabaseSessionV2, IAgentHostDatabaseSessionV2Envelope, IAgentHostDatabaseSessionV2Receipt } from './agentHostDatabase.js';

const INITIAL_SOURCE_REVISION = 0;
const MAX_GENERATION_RETRIES = 3;

export interface IAgentHostCatalogSyncRequest {
	readonly data: AgentHostCatalogData;
	readonly legacyMetadata: Readonly<Record<string, string>>;
}

export type AgentHostCatalogDatabaseReference = IReference<ISessionDatabase>;

export type AgentHostCatalogSyncResult =
	| { readonly status: 'acknowledged'; readonly sourceRevision: number }
	| { readonly status: 'pending'; readonly sourceRevision: number; readonly reason: AgentHostDatabaseSessionV2UpsertResult | 'upsertFailed' | 'acknowledgementSuperseded' };

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

export class AgentHostCatalogSyncService {

	private readonly _sequencer = new SequencerByKey<string>();

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _catalogDatabase: IAgentHostDatabase,
		private readonly _logService: ILogService,
	) { }

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
			const result = await synchronize(await requestFactory(database));
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
			const request = await requestFactory(database);
			if (database) {
				await this._markPayloadDirty(session);
			}
			const result = await synchronize(request, validate);
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
		return this._sequencer.queue(
			session.toString(),
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
		return this._sequencer.queue(session.toString(), async () => {
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

	private async _synchronizeWithDatabaseNow(
		session: URI,
		request: IAgentHostCatalogSyncRequest,
		ref: ReturnType<ISessionDataService['openDatabase']>,
	): Promise<AgentHostCatalogSyncResult> {
		const sessionKey = session.toString();
		const encoded = this._encode(request.data);
		for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
			const existing = await ref.object.getCatalogSyncSnapshot();
			let central: IAgentHostDatabaseSessionV2 | undefined;
			try {
				central = await this._catalogDatabase.getSessionV2(sessionKey);
			} catch (error) {
				this._logService.warn(`[AgentHostCatalogSync] Failed to read sessions_v2 row for ${sessionKey}`, error);
				const legacyMetadataMatches = await catalogLegacyMetadataMatches(ref.object, request.legacyMetadata);
				const pending = await this._storePending(ref.object, request, encoded, existing, legacyMetadataMatches);
				return { status: 'pending', sourceRevision: pending.sourceRevision, reason: 'upsertFailed' };
			}

			const sessionGeneration = central?.sessionGeneration
				?? (existing?.state === 'pending' ? existing.sessionGeneration : generateUuid());
			const legacyMetadataMatches = await catalogLegacyMetadataMatches(ref.object, request.legacyMetadata);
			const sourceRevision = this._sourceRevision(existing, central, sessionGeneration, encoded.payloadHash, legacyMetadataMatches);
			const snapshot = this._pendingSnapshot(sessionGeneration, sourceRevision, encoded);

			if (existing && existing.sessionGeneration !== sessionGeneration) {
				const transitioned = await ref.object.transitionMetadataValuesAndCatalogSyncSnapshot(
					request.legacyMetadata,
					existing.sessionGeneration,
					snapshot,
				);
				if (!transitioned) {
					continue;
				}
			} else {
				const writeResult = await ref.object.setMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, snapshot);
				if (writeResult === 'replayed'
					&& matchesAcknowledgedCatalogReceipt(existing, central)
					&& legacyMetadataMatches) {
					return { status: 'acknowledged', sourceRevision };
				}
			}

			let upsertResult: AgentHostDatabaseSessionV2UpsertResult;
			try {
				upsertResult = await this._catalogDatabase.upsertSessionV2(
					this._envelope(sessionKey, sessionGeneration, sourceRevision, encoded),
					central?.sessionGeneration,
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
			if (!await ref.object.acknowledgeCatalogSyncSnapshot(acknowledgement)) {
				return { status: 'pending', sourceRevision, reason: 'acknowledgementSuperseded' };
			}
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
			if (central && matches) {
				return { status: 'acknowledged', sourceRevision: central.sourceRevision };
			}
			const sourceRevision = central ? central.sourceRevision + 1 : INITIAL_SOURCE_REVISION;
			pendingRevision = sourceRevision;
			let result: AgentHostDatabaseSessionV2UpsertResult;
			try {
				await validate?.();
				result = await this._catalogDatabase.upsertSessionV2(
					this._envelope(sessionKey, sessionGeneration, sourceRevision, encoded),
					central?.sessionGeneration,
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
		try {
			return await this._catalogDatabase.markSessionV2PayloadDirty(session.toString());
		} catch (error) {
			this._logService.warn(`[AgentHostCatalogSync] Failed to mark sessions_v2 payload dirty for ${session.toString()}`, error);
			return undefined;
		}
	}

}
