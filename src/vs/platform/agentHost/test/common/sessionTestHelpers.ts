/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import type { IDiffComputeService, IDiffCountResult } from '../../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';

export class TestSessionDatabase implements ISessionDatabase {
	private readonly _edits: (IFileEditRecord & IFileEditContent)[] = [];
	private readonly _metadata = new Map<string, string>();

	getAllFileEditsCalls = 0;
	getFileEditsByTurnCalls = 0;

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

	async close(): Promise<void> { }

	dispose(): void { }

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
		cleanupOrphanedData: async () => { },
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
		cleanupOrphanedData: async () => { },
	};
}

export function encodeString(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function createReference<T>(object: T): IReference<T> {
	return {
		object,
		dispose: () => { },
	};
}
