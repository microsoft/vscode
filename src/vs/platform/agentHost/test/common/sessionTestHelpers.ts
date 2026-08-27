/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import type { IDetailedDiffResult, IDiffComputeService, IDiffCountResult } from '../../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord, ILocalTurnRecord, IReviewedFileRecord, ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, ISessionCatalogSyncSnapshot, ISessionDatabase, ISessionDataService, SessionCatalogSyncWriteResult } from '../../common/sessionDataService.js';
import type { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import type { ISessionGitHubState, Message } from '../../common/state/sessionState.js';

export class TestSessionDatabase implements ISessionDatabase {
	private readonly _edits: (IFileEditRecord & IFileEditContent)[] = [];
	private readonly _metadata = new Map<string, string>();
	private _catalogSyncSnapshot: ISessionCatalogSyncSnapshot | undefined;
	private readonly _drafts = new Map<string, Message>();
	private readonly _reviewedFiles: IReviewedFileRecord[] = [];
	private readonly _localTurns = new Map<string, ILocalTurnRecord>();
	private readonly _turnUsages = new Map<string, string>();
	private readonly _turnDelegations = new Map<string, string>();
	private readonly _turnEventIds = new Map<string, string>();

	getAllFileEditsCalls = 0;
	getFileEditsByTurnCalls = 0;
	deleteTurnsAfterCalls: string[] = [];
	deleteAllTurnsCalls = 0;
	setTurnEventIdCalls: Array<{ turnId: string; eventId: string }> = [];
	setMetadataCalls: Array<{ key: string; value: string }> = [];

	addEdit(edit: IFileEditRecord & IFileEditContent): void {
		this._edits.push(edit);
	}

	async createTurn(): Promise<void> { }

	async deleteTurn(turnId: string): Promise<void> {
		this._turnDelegations.delete(turnId);
		this._turnEventIds.delete(turnId);
		for (let i = this._edits.length - 1; i >= 0; i--) {
			if (this._edits[i].turnId === turnId) {
				this._edits.splice(i, 1);
			}
		}
	}

	async storeFileEdit(edit: IFileEditRecord & IFileEditContent): Promise<void> {
		const existingIndex = this._edits.findIndex(e => e.toolCallId === edit.toolCallId && e.filePath === edit.filePath);
		if (existingIndex >= 0) {
			this._edits[existingIndex] = edit;
		} else {
			this._edits.push(edit);
		}
	}

	async getFileEdits(toolCallIds: string[]): Promise<IFileEditRecord[]> {
		const toolCallIdsSet = new Set(toolCallIds);
		return this._toEditRecords(this._edits.filter(e => toolCallIdsSet.has(e.toolCallId)));
	}

	async getAllFileEdits(): Promise<IFileEditRecord[]> {
		this.getAllFileEditsCalls++;
		return this._toEditRecords(this._edits);
	}

	async getFileEditsByTurn(turnId: string): Promise<IFileEditRecord[]> {
		this.getFileEditsByTurnCalls++;
		return this._toEditRecords(this._edits.filter(e => e.turnId === turnId));
	}

	async readFileEditContent(toolCallId: string, filePath: string): Promise<IFileEditContent | undefined> {
		return this._edits.find(e => e.toolCallId === toolCallId && e.filePath === filePath);
	}

	async getMetadata(key: string): Promise<string | undefined> {
		return this._metadata.get(key);
	}

	async getMetadataObject<T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }> {
		return Object.fromEntries(Object.keys(obj).map(key => [key, this._metadata.get(key)])) as { [K in keyof T]: string | undefined };
	}

	async setMetadata(key: string, value: string): Promise<void> {
		this.setMetadataCalls.push({ key, value });
		this._metadata.set(key, value);
	}

	async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
		for (const [key, value] of Object.entries(values)) {
			this.setMetadataCalls.push({ key, value });
			this._metadata.set(key, value);
		}
	}

	async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<SessionCatalogSyncWriteResult> {
		this._validateCatalogSyncSnapshot(snapshot);
		const existing = this._catalogSyncSnapshot;
		if (existing && snapshot.sessionGeneration !== existing.sessionGeneration) {
			throw new Error(`Catalog sync snapshot generation ${snapshot.sessionGeneration} does not match stored generation ${existing.sessionGeneration}`);
		}
		if (existing && snapshot.sourceRevision < existing.sourceRevision) {
			throw new Error(`Catalog sync snapshot revision ${snapshot.sourceRevision} is stale; current revision is ${existing.sourceRevision}`);
		}
		if (existing && snapshot.sourceRevision === existing.sourceRevision) {
			const isExactReplay = snapshot.sessionGeneration === existing.sessionGeneration
				&& snapshot.projectionVersion === existing.projectionVersion
				&& snapshot.payloadHash === existing.payloadHash
				&& (existing.state === 'acknowledged' || snapshot.payload === existing.payload);
			if (!isExactReplay) {
				throw new Error(`Catalog sync snapshot revision ${snapshot.sourceRevision} conflicts with the stored snapshot`);
			}
		}

		if (existing?.sourceRevision === snapshot.sourceRevision) {
			return 'replayed';
		}
		for (const [key, value] of Object.entries(values)) {
			this.setMetadataCalls.push({ key, value });
			this._metadata.set(key, value);
		}
		this._catalogSyncSnapshot = { ...snapshot, acknowledgedHash: existing?.acknowledgedHash };
		return 'applied';
	}

	async transitionMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, expectedSessionGeneration: string, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<boolean> {
		this._validateCatalogSyncIdentity('expectedSessionGeneration', expectedSessionGeneration);
		this._validateCatalogSyncSnapshot(snapshot);
		if (snapshot.sessionGeneration === expectedSessionGeneration) {
			throw new Error(`Catalog sync generation transition must change the session generation`);
		}
		if (this._catalogSyncSnapshot?.sessionGeneration !== expectedSessionGeneration) {
			return false;
		}
		for (const [key, value] of Object.entries(values)) {
			this.setMetadataCalls.push({ key, value });
			this._metadata.set(key, value);
		}
		this._catalogSyncSnapshot = { ...snapshot, acknowledgedHash: undefined };
		return true;
	}

	async getCatalogSyncSnapshot(): Promise<ISessionCatalogSyncSnapshot | undefined> {
		return this._catalogSyncSnapshot ? { ...this._catalogSyncSnapshot } : undefined;
	}

	async acknowledgeCatalogSyncSnapshot(acknowledgement: ISessionCatalogSyncAcknowledgement): Promise<boolean> {
		this._validateCatalogSyncAcknowledgement(acknowledgement);
		const snapshot = this._catalogSyncSnapshot;
		if (!snapshot
			|| snapshot.state !== 'pending'
			|| acknowledgement.sessionGeneration !== snapshot.sessionGeneration
			|| acknowledgement.sourceRevision !== snapshot.sourceRevision
			|| acknowledgement.projectionVersion !== snapshot.projectionVersion
			|| acknowledgement.payloadHash !== snapshot.payloadHash
		) {
			return false;
		}
		this._catalogSyncSnapshot = {
			sessionGeneration: snapshot.sessionGeneration,
			sourceRevision: snapshot.sourceRevision,
			projectionVersion: snapshot.projectionVersion,
			payload: undefined,
			payloadHash: snapshot.payloadHash,
			acknowledgedHash: snapshot.payloadHash,
			state: 'acknowledged',
		};
		return true;
	}

	async setMetadataValuesIfAbsent(key: string, values: Readonly<Record<string, string>>, copies: Readonly<Record<string, string>> = {}): Promise<boolean> {
		if (this._metadata.has(key)) {
			return false;
		}
		for (const [targetKey, value] of Object.entries(values)) {
			this.setMetadataCalls.push({ key: targetKey, value });
			this._metadata.set(targetKey, value);
		}
		for (const [targetKey, sourceKey] of Object.entries(copies)) {
			const value = this._metadata.get(sourceKey);
			if (value !== undefined) {
				this.setMetadataCalls.push({ key: targetKey, value });
				this._metadata.set(targetKey, value);
			}
		}
		return true;
	}

	async setChatDraft(chat: URI, draft: Message | undefined): Promise<void> {
		const key = chat.toString();
		if (draft) {
			this._drafts.set(key, draft);
		} else {
			this._drafts.delete(key);
		}
	}

	async getChatDraft(chat: URI): Promise<Message | undefined> {
		return this._drafts.get(chat.toString());
	}

	async close(): Promise<void> { }

	async vacuumInto(_targetPath: string): Promise<void> { }

	dispose(): void { }

	async setTurnEventId(turnId: string, eventId: string): Promise<void> {
		this.setTurnEventIdCalls.push({ turnId, eventId });
		this._turnEventIds.set(turnId, eventId);
	}

	async getTurnEventId(turnId: string): Promise<string | undefined> {
		return this._turnEventIds.get(turnId) ?? [...this._turnEventIds].find(([, eventId]) => eventId === turnId)?.[1];
	}

	async getNextTurnEventId(_turnId: string): Promise<string | undefined> { return undefined; }

	async getFirstTurnEventId(): Promise<string | undefined> { return undefined; }

	async setTurnUsage(turnId: string, usage: string): Promise<void> {
		this._turnUsages.set(turnId, usage);
	}

	async getTurnUsages(): Promise<Map<string, string>> { return new Map(this._turnUsages); }

	async setTurnDelegation(turnId: string, delegation: string): Promise<void> {
		this._turnDelegations.set(turnId, delegation);
	}

	async getTurnDelegations(): Promise<Map<string, string>> {
		const result = new Map(this._turnDelegations);
		for (const [turnId, eventId] of this._turnEventIds) {
			const delegation = this._turnDelegations.get(turnId);
			if (delegation) {
				result.set(eventId, delegation);
			}
		}
		return result;
	}

	async truncateFromTurn(_turnId: string): Promise<void> { }

	async deleteTurnsAfter(turnId: string): Promise<void> {
		this.deleteTurnsAfterCalls.push(turnId);
	}

	async deleteAllTurns(): Promise<void> {
		this.deleteAllTurnsCalls++;
		this._edits.length = 0;
		this._turnDelegations.clear();
		this._turnEventIds.clear();
	}

	async insertLocalTurn(record: ILocalTurnRecord): Promise<void> {
		this._localTurns.set(record.turnId, record);
	}

	async getLocalTurns(): Promise<ILocalTurnRecord[]> {
		return [...this._localTurns.values()].sort((a, b) => a.seq - b.seq);
	}

	async deleteLocalTurns(turnIds: readonly string[]): Promise<void> {
		for (const id of turnIds) {
			this._localTurns.delete(id);
		}
	}
	async remapTurnIds(mapping: ReadonlyMap<string, string>, eventIds?: ReadonlyMap<string, string>): Promise<void> {
		for (const turnId of [...this._turnDelegations.keys()]) {
			if (!mapping.has(turnId)) {
				this._turnDelegations.delete(turnId);
			}
		}
		for (const [oldId, newId] of mapping) {
			const delegation = this._turnDelegations.get(oldId);
			if (delegation) {
				this._turnDelegations.delete(oldId);
				this._turnDelegations.set(newId, delegation);
			}
			const eventId = eventIds?.get(newId) ?? this._turnEventIds.get(oldId);
			this._turnEventIds.delete(oldId);
			if (eventId) {
				this._turnEventIds.set(newId, eventId);
			}
		}
	}

	async markFileReviewed(uri: URI, nonce: string): Promise<void> {
		if (!this._reviewedFiles.some(r => r.uri.toString() === uri.toString() && r.nonce === nonce)) {
			this._reviewedFiles.push({ uri, nonce });
		}
	}

	async unmarkFileReviewed(uri: URI, nonce: string): Promise<void> {
		const index = this._reviewedFiles.findIndex(r => r.uri.toString() === uri.toString() && r.nonce === nonce);
		if (index >= 0) {
			this._reviewedFiles.splice(index, 1);
		}
	}

	async getReviewedFiles(): Promise<IReviewedFileRecord[]> {
		return [...this._reviewedFiles];
	}

	async getReviewedFilesForUri(uri: URI): Promise<IReviewedFileRecord[]> {
		return this._reviewedFiles.filter(r => r.uri.toString() === uri.toString());
	}

	async isFileReviewed(uri: URI, nonce: string): Promise<boolean> {
		return this._reviewedFiles.some(r => r.uri.toString() === uri.toString() && r.nonce === nonce);
	}

	async setTurnCheckpointRef(_turnId: string, _ref: string): Promise<void> { }

	async getTurnCheckpointRef(_turnId: string): Promise<string | undefined> { return undefined; }

	async getPreviousCheckpointRef(_turnId: string): Promise<string | undefined> { return undefined; }

	async getAllCheckpointRefs(): Promise<string[]> { return []; }

	async whenIdle(): Promise<void> { }

	private _validateCatalogSyncSnapshot(snapshot: ISessionCatalogSyncPendingSnapshot): void {
		this._validateCatalogSyncIdentity('sessionGeneration', snapshot.sessionGeneration);
		this._validateCatalogSyncInteger('sourceRevision', snapshot.sourceRevision);
		this._validateCatalogSyncInteger('projectionVersion', snapshot.projectionVersion);
		this._validateCatalogSyncIdentity('payload', snapshot.payload);
		this._validateCatalogSyncIdentity('payloadHash', snapshot.payloadHash);
	}

	private _validateCatalogSyncAcknowledgement(acknowledgement: ISessionCatalogSyncAcknowledgement): void {
		this._validateCatalogSyncIdentity('sessionGeneration', acknowledgement.sessionGeneration);
		this._validateCatalogSyncInteger('sourceRevision', acknowledgement.sourceRevision);
		this._validateCatalogSyncInteger('projectionVersion', acknowledgement.projectionVersion);
		this._validateCatalogSyncIdentity('payloadHash', acknowledgement.payloadHash);
	}

	private _validateCatalogSyncInteger(name: string, value: number): void {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error(`Catalog sync ${name} must be a non-negative safe integer`);
		}
	}

	private _validateCatalogSyncIdentity(name: string, value: string): void {
		if (value.length === 0) {
			throw new Error(`Catalog sync ${name} must be nonempty`);
		}
	}

	private _toEditRecords(edits: (IFileEditRecord & IFileEditContent)[]): IFileEditRecord[] {
		return edits.map(({ beforeContent: _, afterContent: _2, ...metadata }) => metadata);
	}
}

export class TestDiffComputeService implements IDiffComputeService {
	declare readonly _serviceBrand: undefined;

	callCount = 0;
	detailedCallCount = 0;

	constructor(private readonly _result?: IDiffCountResult) { }

	async computeDiffCounts(original: string, modified: string): Promise<IDiffCountResult> {
		this.callCount++;
		return this._computeDiffCounts(original, modified);
	}

	async computeDetailedDiff(original: string, modified: string): Promise<IDetailedDiffResult> {
		this.detailedCallCount++;
		const counts = this._computeDiffCounts(original, modified);
		return {
			added: counts.added,
			removed: counts.removed,
			replacements: original === modified ? [] : [{ start: 0, endExclusive: original.length, text: modified }],
			hitTimeout: false,
		};
	}

	private _computeDiffCounts(original: string, modified: string): IDiffCountResult {
		if (this._result) {
			return this._result;
		}

		const originalLines = original ? original.split('\n') : [];
		const modifiedLines = modified ? modified.split('\n') : [];
		return {
			added: Math.max(0, modifiedLines.length - originalLines.length),
			removed: Math.max(0, originalLines.length - modifiedLines.length),
			changes: original === modified ? [] : [{
				startOffset: 0,
				endOffsetExclusive: original.length,
				newText: modified,
			}],
		};
	}
}

export function createZeroDiffComputeService(): IDiffComputeService {
	return new TestDiffComputeService({ added: 0, removed: 0, changes: [] });
}

export function createSessionDataService(database: ISessionDatabase = new TestSessionDatabase()): ISessionDataService {
	return {
		_serviceBrand: undefined,
		getSessionDataDir: session => URI.from({ scheme: Schemas.inMemory, path: `/session-data${session.path}` }),
		getSessionDataDirById: sessionId => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${sessionId}` }),
		openDatabase: () => createReference(database),
		tryOpenDatabase: async () => createReference(database),
		deleteSessionData: async () => { },
		onWillDeleteSessionData: Event.None,
		cleanupOrphanedData: async () => { },
		whenIdle: async () => { },
	};
}

export function createNullSessionDataService(): ISessionDataService {
	return {
		_serviceBrand: undefined,
		getSessionDataDir: session => URI.from({ scheme: Schemas.inMemory, path: `/session-data${session.path}` }),
		getSessionDataDirById: sessionId => URI.from({ scheme: Schemas.inMemory, path: `/session-data/${sessionId}` }),
		openDatabase: () => { throw new Error('not implemented'); },
		tryOpenDatabase: async () => undefined,
		deleteSessionData: async () => { },
		onWillDeleteSessionData: Event.None,
		cleanupOrphanedData: async () => { },
		whenIdle: async () => { },
	};
}

export function encodeString(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

/**
 * Returns a no-op {@link IAgentHostGitService} suitable for tests that
 * exercise the {@link AgentService} but don't care about git state.
 * Tests that DO care about git state should pass their own implementation.
 */
export function createNoopGitService(): import('../../common/agentHostGitService.js').IAgentHostGitService {
	return {
		_serviceBrand: undefined,
		getCurrentBranch: async () => undefined,
		getDefaultBranch: async () => undefined,
		getBranch: async () => undefined,
		getRefs: async () => [],
		getBranches: async () => [],
		getRepositoryRoot: async () => undefined,
		getWorktreeRoots: async () => [],
		addWorktree: async () => { },
		copyWorktreeIncludeFiles: async () => { },
		addExistingWorktree: async () => { },
		removeWorktree: async () => { },
		branchExists: async () => false,
		hasUncommittedChanges: async () => false,
		commitAll: async () => { },
		mergeBranch: async () => '',
		restore: async () => { },
		hasUpstream: async () => false,
		pull: async () => { },
		push: async () => { },
		getSessionGitState: async () => undefined,
		computeSessionFileDiffs: async () => undefined,
		resolveBranchBaselineCommit: async () => undefined,
		showBlob: async () => undefined,
		captureWorkingTreeAsTree: async () => undefined,
		commitTree: async () => undefined,
		updateRef: async () => { },
		deleteRefs: async () => { },
		revParse: async () => undefined,
		overlayPathIntoTree: async () => undefined,
		diffTreePaths: async () => undefined,
		computeFileDiffsBetweenRefs: async () => undefined,
		getFetchRemoteUrls: async () => undefined,
		getUntrackedPaths: async () => [],
		getBranchDiffSafetyInfo: async () => undefined,
		getDiffPatchBetweenRefs: async () => undefined,
	};
}

/**
 * Returns a no-op {@link IAgentHostChangesetService} for tests that need to
 * inject the changeset service but don't exercise changeset computation.
 * Individual methods can be reassigned by callers that want to spy on them.
 */
export function createNoopChangesetService(): import('../../common/agentHostChangesetService.js').IAgentHostChangesetService {
	return {
		_serviceBrand: undefined,
		registerStaticChangesets: () => { },
		restoreStaticChangeset: () => { },
		parsePersistedStaticChangesets: () => ({}),
		applyPersistedStaticChangesets: () => { },
		restorePersistedStaticChangesets: () => ({}),
		persistChangesSummary: () => { },
		getListMetadataKeys: () => undefined,
		computeListEntryChanges: () => undefined,
		isStaticChangesetComputeActive: () => false,
		refreshChangesetCatalog: () => { },
		refreshBranchChangeset: () => { },
		refreshSessionChangeset: () => { },
		onWorkingDirectoryAvailable: () => { },
		recomputeSubscribedChangesets: () => { },
		onSessionDisposed: () => { },
		computeTurnChangeset: async session => session,
		computeCompareTurnsChangeset: async session => session,
		computeUncommittedChangeset: async session => session,
		onToolCallEditsApplied: () => { },
		onTurnComplete: () => { },
		onSessionTruncated: () => { },
	};
}

export function createNoopGitStateService(): IAgentHostGitStateService {
	return {
		_serviceBrand: undefined,
		onDidRefreshSessionGitState: Event.None,
		onDidChangeSessionGitHubState: Event.None,
		refreshSessionGitState: async (_sessionKey: string, _workingDirectory?: URI) => { },
		resolveSessionBaseBranchName: async (_sessionKey: string) => undefined,
		setSessionGitHubState: async (_sessionKey: string, _state: ISessionGitHubState) => { },
		recordSessionMerge: async (_sessionKey: string, _commit: string) => { },
		attachSessionGitHubPullRequest: async (_sessionKey: string, _workingDirectory?: URI) => { },
	};
}

function createReference<T>(object: T): IReference<T> {
	return {
		object,
		dispose: () => { },
	};
}

/**
 * Recording {@link IAgentHostCheckpointService} double that captures
 * {@link captureBaselineCheckpoint} invocations (session + resolved working
 * directories) so tests can assert baseline capture on the fresh materialize
 * path — and its absence on resume / subsequent sends. All other methods are
 * no-ops, mirroring `NULL_CHECKPOINT_SERVICE`.
 */
export class RecordingCheckpointService implements IAgentHostCheckpointService {
	declare readonly _serviceBrand: undefined;
	readonly baselineCalls: { readonly session: string; readonly workingDirectories: readonly string[] | undefined }[] = [];
	async captureBaselineCheckpoint(sessionUri: URI, workingDirectories: readonly URI[] | undefined): Promise<void> {
		this.baselineCalls.push({ session: sessionUri.toString(), workingDirectories: workingDirectories?.map(w => w.toString()) });
	}
	async captureTurnStartCheckpoint(): Promise<void> { }
	async captureTurnCheckpoint(): Promise<void> { }
	async discardTurnStartCheckpoint(): Promise<void> { }
	async discardChatTurnStartCheckpoints(): Promise<void> { }
	async getTurnCheckpointPair(): Promise<{ parent: string; current: string } | undefined> { return undefined; }
	async getBaselineCheckpoint(): Promise<string | undefined> { return undefined; }
	async deleteCheckpoints(): Promise<void> { }
}
