/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import type { IDiffComputeService, IDiffCountResult } from '../../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord, ILocalTurnRecord, IReviewedFileRecord, ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import type { Message } from '../../common/state/sessionState.js';

export class TestSessionDatabase implements ISessionDatabase {
	private readonly _edits: (IFileEditRecord & IFileEditContent)[] = [];
	private readonly _metadata = new Map<string, string>();
	private readonly _drafts = new Map<string, Message>();
	private readonly _reviewedFiles: IReviewedFileRecord[] = [];
	private readonly _localTurns = new Map<string, ILocalTurnRecord>();

	getAllFileEditsCalls = 0;
	getFileEditsByTurnCalls = 0;
	deleteTurnsAfterCalls: string[] = [];
	deleteAllTurnsCalls = 0;
	setTurnEventIdCalls: Array<{ turnId: string; eventId: string }> = [];

	addEdit(edit: IFileEditRecord & IFileEditContent): void {
		this._edits.push(edit);
	}

	async createTurn(): Promise<void> { }

	async deleteTurn(turnId: string): Promise<void> {
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
		this._metadata.set(key, value);
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
	}

	async getTurnEventId(_turnId: string): Promise<string | undefined> { return undefined; }

	async getNextTurnEventId(_turnId: string): Promise<string | undefined> { return undefined; }

	async getFirstTurnEventId(): Promise<string | undefined> { return undefined; }

	async truncateFromTurn(_turnId: string): Promise<void> { }

	async deleteTurnsAfter(turnId: string): Promise<void> {
		this.deleteTurnsAfterCalls.push(turnId);
	}

	async deleteAllTurns(): Promise<void> {
		this.deleteAllTurnsCalls++;
		this._edits.length = 0;
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
	async remapTurnIds(_mapping: ReadonlyMap<string, string>): Promise<void> { }

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

	private _toEditRecords(edits: (IFileEditRecord & IFileEditContent)[]): IFileEditRecord[] {
		return edits.map(({ beforeContent: _, afterContent: _2, ...metadata }) => metadata);
	}
}

export class TestDiffComputeService implements IDiffComputeService {
	declare readonly _serviceBrand: undefined;

	callCount = 0;

	constructor(private readonly _result?: IDiffCountResult) { }

	async computeDiffCounts(original: string, modified: string): Promise<IDiffCountResult> {
		this.callCount++;
		if (this._result) {
			return this._result;
		}

		const originalLines = original ? original.split('\n') : [];
		const modifiedLines = modified ? modified.split('\n') : [];
		return {
			added: Math.max(0, modifiedLines.length - originalLines.length),
			removed: Math.max(0, originalLines.length - modifiedLines.length),
		};
	}
}

export function createZeroDiffComputeService(): IDiffComputeService {
	return new TestDiffComputeService({ added: 0, removed: 0 });
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

function createReference<T>(object: T): IReference<T> {
	return {
		object,
		dispose: () => { },
	};
}
