/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionCatalogSyncSnapshot, ISessionDataService } from '../common/sessionDataService.js';
import { AGENT_HOST_CATALOG_PROJECTION_VERSION, IAgentHostCatalogSource, projectAgentHostCatalog } from './agentHostCatalogProjection.js';
import type { AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabase, IAgentHostDatabaseSessionV2 } from './agentHostDatabase.js';

const INITIAL_SOURCE_REVISION = 0;
const MAX_GENERATION_RETRIES = 3;

export interface IAgentHostCatalogSyncRequest {
	readonly source: IAgentHostCatalogSource;
	readonly legacyMetadata: Readonly<Record<string, string>>;
}

export type AgentHostCatalogSyncResult =
	| { readonly status: 'acknowledged'; readonly sourceRevision: number }
	| { readonly status: 'pending'; readonly sourceRevision: number; readonly reason: AgentHostDatabaseSessionV2UpsertResult | 'upsertFailed' | 'acknowledgementSuperseded' };

interface IQueuedOperation {
	readonly run: () => Promise<void>;
}

interface ISessionSyncQueue {
	running: boolean;
	readonly pending: IQueuedOperation[];
}

export class AgentHostCatalogSyncService {

	private readonly _queues = new Map<string, ISessionSyncQueue>();

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _catalogDatabase: IAgentHostDatabase,
		private readonly _logService: ILogService,
	) { }

	synchronize(session: URI, request: IAgentHostCatalogSyncRequest): Promise<AgentHostCatalogSyncResult> {
		return this.runExclusive(session, () => this._synchronizeNow(session, request));
	}

	synchronizeWithFactory(session: URI, requestFactory: () => Promise<IAgentHostCatalogSyncRequest>): Promise<AgentHostCatalogSyncResult> {
		return this.runExclusive(session, async () => this._synchronizeNow(session, await requestFactory()));
	}

	runExclusive<T>(session: URI, operation: () => Promise<T>): Promise<T> {
		const sessionKey = session.toString();
		return new Promise((resolve, reject) => {
			let queue = this._queues.get(sessionKey);
			if (!queue) {
				queue = { running: false, pending: [] };
				this._queues.set(sessionKey, queue);
			}

			queue.pending.push({
				run: async () => {
					try {
						resolve(await operation());
					} catch (error) {
						reject(error instanceof Error ? error : new Error(String(error)));
					}
				},
			});

			if (!queue.running) {
				queue.running = true;
				void this._drain(sessionKey, queue);
			}
		});
	}

	private async _drain(sessionKey: string, queue: ISessionSyncQueue): Promise<void> {
		while (queue.pending.length > 0) {
			await queue.pending.shift()!.run();
		}
		queue.running = false;
		this._queues.delete(sessionKey);
	}

	private async _synchronizeNow(session: URI, request: IAgentHostCatalogSyncRequest): Promise<AgentHostCatalogSyncResult> {
		const sessionKey = session.toString();
		const ref = this._sessionDataService.openDatabase(session);
		try {
			for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
				const existing = await ref.object.getCatalogSyncSnapshot();
				let central: IAgentHostDatabaseSessionV2 | undefined;
				try {
					central = await this._catalogDatabase.getSessionV2(sessionKey);
				} catch (error) {
					this._logService.warn(`[AgentHostCatalogSync] Failed to read sessions_v2 row for ${sessionKey}`, error);
					const legacyMetadataMatches = await this._legacyMetadataMatches(ref.object, request.legacyMetadata);
					const pending = await this._storePending(ref.object, sessionKey, request, existing, legacyMetadataMatches);
					return { status: 'pending', sourceRevision: pending.sourceRevision, reason: 'upsertFailed' };
				}

				const sessionGeneration = central?.sessionGeneration
					?? (existing?.state === 'pending' ? existing.sessionGeneration : generateUuid());
				const legacyMetadataMatches = await this._legacyMetadataMatches(ref.object, request.legacyMetadata);
				const candidate = this._project(request.source, sessionKey, sessionGeneration, INITIAL_SOURCE_REVISION);
				const sourceRevision = this._sourceRevision(existing, central, sessionGeneration, candidate.catalog.sourceHash, legacyMetadataMatches);
				const projection = sourceRevision === INITIAL_SOURCE_REVISION
					? candidate
					: this._project(request.source, sessionKey, sessionGeneration, sourceRevision);
				const snapshot: ISessionCatalogSyncPendingSnapshot = {
					sessionGeneration,
					sourceRevision,
					projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
					payload: projection.sourcePayload,
					payloadHash: projection.catalog.sourceHash,
					state: 'pending',
				};

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
						&& existing?.state === 'acknowledged'
						&& this._matchesReceipt(central, existing)
						&& legacyMetadataMatches) {
						return { status: 'acknowledged', sourceRevision };
					}
				}

				let upsertResult: AgentHostDatabaseSessionV2UpsertResult;
				try {
					upsertResult = await this._catalogDatabase.upsertSessionV2(projection.catalog, central?.sessionGeneration);
				} catch (error) {
					this._logService.warn(`[AgentHostCatalogSync] Failed to upsert sessions_v2 row for ${sessionKey}`, error);
					return { status: 'pending', sourceRevision, reason: 'upsertFailed' };
				}
				if (upsertResult === 'generationMismatch') {
					continue;
				}
				if (upsertResult !== 'applied' && upsertResult !== 'replayed') {
					this._logService.warn(`[AgentHostCatalogSync] sessions_v2 projection for ${sessionKey} remains pending: ${upsertResult}`);
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
		} finally {
			ref.dispose();
		}
	}

	private async _storePending(
		database: ReturnType<ISessionDataService['openDatabase']>['object'],
		session: string,
		request: IAgentHostCatalogSyncRequest,
		existing: ISessionCatalogSyncSnapshot | undefined,
		legacyMetadataMatches: boolean,
	): Promise<ISessionCatalogSyncPendingSnapshot> {
		const sessionGeneration = existing?.sessionGeneration ?? generateUuid();
		const candidate = this._project(request.source, session, sessionGeneration, INITIAL_SOURCE_REVISION);
		const sourceRevision = this._sourceRevision(existing, undefined, sessionGeneration, candidate.catalog.sourceHash, legacyMetadataMatches);
		const projection = sourceRevision === INITIAL_SOURCE_REVISION
			? candidate
			: this._project(request.source, session, sessionGeneration, sourceRevision);
		const snapshot: ISessionCatalogSyncPendingSnapshot = {
			sessionGeneration,
			sourceRevision,
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			payload: projection.sourcePayload,
			payloadHash: projection.catalog.sourceHash,
			state: 'pending',
		};
		if (existing && existing.sessionGeneration !== sessionGeneration) {
			await database.transitionMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, existing.sessionGeneration, snapshot);
		} else {
			await database.setMetadataValuesAndCatalogSyncSnapshot(request.legacyMetadata, snapshot);
		}
		return snapshot;
	}

	private async _legacyMetadataMatches(
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

	private _sourceRevision(
		existing: ISessionCatalogSyncSnapshot | undefined,
		central: IAgentHostDatabaseSessionV2 | undefined,
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
		const localMatches = local?.projectionVersion === AGENT_HOST_CATALOG_PROJECTION_VERSION
			&& local.payloadHash === payloadHash;
		const centralMatches = current?.projectionVersion === AGENT_HOST_CATALOG_PROJECTION_VERSION
			&& current.sourceHash === payloadHash;
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

	private _matchesReceipt(central: IAgentHostDatabaseSessionV2 | undefined, receipt: ISessionCatalogSyncSnapshot): boolean {
		return central?.sessionGeneration === receipt.sessionGeneration
			&& central.sourceRevision === receipt.sourceRevision
			&& central.projectionVersion === receipt.projectionVersion
			&& central.sourceHash === receipt.payloadHash;
	}

	private _project(source: IAgentHostCatalogSource, session: string, sessionGeneration: string, sourceRevision: number) {
		const result = projectAgentHostCatalog(source, {
			session,
			sessionGeneration,
			sourceRevision,
		});
		if (!result.ok) {
			throw new Error(`Invalid catalog source at ${result.error.field}: ${result.error.message}`);
		}
		return result.value;
	}
}
