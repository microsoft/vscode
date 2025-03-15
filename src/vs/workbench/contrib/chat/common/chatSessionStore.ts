/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { revive } from '../../../../base/common/marshalling.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ChatModel, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, normalizeSerializableChatData } from './chatModel.js';

const maxPersistedSessions = 25;

const ChatIndexStorageKey = 'ChatSessionStore.index';

export class ChatSessionStore {
	private readonly storageRoot: URI;

	private readonly storeQueue = new Sequencer();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = isEmptyWindow ?
			'no-workspace' :
			this.workspaceContextService.getWorkspace().id;
		this.storageRoot = joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'chatSessions');
	}

	async storeSessions(sessions: ChatModel[]): Promise<void> {
		await this.storeQueue.queue(async () => {
			try {
				await Promise.all(sessions.map(session => this.writeSession(session)));
				await this.trimEntries();
				await this.flushIndex();
			} catch (e) {
				this.reportError('storeSessions', 'Error storing chat sessions', e);
			}
		});
	}

	private async writeSession(session: ChatModel | ISerializableChatData): Promise<void> {
		try {
			const index = this.getIndex();
			const storageLocation = this.getStorageLocation(session.sessionId);
			const content = JSON.stringify(session, undefined, 2);
			await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));

			// Write succeeded, update index
			index.entries[session.sessionId] = getSessionMetadata(session);
		} catch (e) {
			this.reportError('sessionWrite', 'Error writing chat session', e);
		}
	}

	private async flushIndex(): Promise<void> {
		const index = this.getIndex();
		try {
			this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), StorageTarget.MACHINE);
		} catch (e) {
			// Only if JSON.stringify fails, AFAIK
			this.reportError('indexWrite', 'Error writing index', e);
		}
	}

	private getIndexStorageScope(): StorageScope {
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		return isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE;
	}

	private async trimEntries(): Promise<void> {
		const index = this.getIndex();
		const entries = Object.entries(index.entries)
			.sort((a, b) => b[1].lastMessageDate - a[1].lastMessageDate)
			.map(([id]) => id);

		if (entries.length > maxPersistedSessions) {
			const entriesToDelete = entries.slice(maxPersistedSessions);
			for (const entry of entriesToDelete) {
				delete index.entries[entry];
			}

			this.logService.trace(`ChatSessionStore: Trimmed ${entriesToDelete.length} old chat sessions from index`);
		}
	}

	private async internalDeleteSession(sessionId: string): Promise<void> {
		const index = this.getIndex();
		const storageLocation = this.getStorageLocation(sessionId);
		try {
			await this.fileService.del(storageLocation);
		} catch (e) {
			this.reportError('sessionDelete', 'Error deleting chat session', e);
		} finally {
			delete index.entries[sessionId];
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.storeQueue.queue(async () => {
			await this.internalDeleteSession(sessionId);
		});
	}

	private reportError(reasonForTelemetry: string, message: string, error?: Error): void {
		this.logService.error(`ChatSessionStore: ` + message, toErrorMessage(error));

		const fileOperationReason = error && toFileOperationResult(error);
		type ChatSessionStoreErrorData = {
			reason: string;
			fileOperationReason: number;
			// error: Error;
		};
		type ChatSessionStoreErrorClassification = {
			owner: 'roblourens';
			comment: 'Detect issues related to managing chat sessions';
			reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Info about the error that occurred' };
			fileOperationReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'An error code from the file service' };
			// error: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Info about the error that occurred' };
		};
		this.telemetryService.publicLog2<ChatSessionStoreErrorData, ChatSessionStoreErrorClassification>('chatSessionStoreError', {
			reason: reasonForTelemetry,
			fileOperationReason: fileOperationReason ?? -1
		});
	}

	private indexCache: IChatSessionIndexData | undefined;
	private getIndex(): IChatSessionIndexData {
		if (this.indexCache) {
			return this.indexCache;
		}

		const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
		if (!data) {
			this.indexCache = { version: 1, entries: {} };
			return this.indexCache;
		}

		try {
			const index = JSON.parse(data) as unknown;
			if (isChatSessionIndex(index)) {
				// Success
				this.indexCache = index;
			} else {
				this.reportError('invalidIndexFormat', `Invalid index format: ${data}`);
				this.indexCache = { version: 1, entries: {} };
			}

			return this.indexCache;
		} catch (e) {
			// Only if JSON.parse fails
			this.reportError('invalidIndexJSON', `Index corrupt: ${data}`, e);
			this.indexCache = { version: 1, entries: {} };
			return this.indexCache;
		}
	}

	async getSessionIndex(initialData?: ISerializableChatsData): Promise<IChatSessionIndex> {
		const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
		const needsMigrationFromStorageService = !data && initialData;
		if (needsMigrationFromStorageService) {
			await this.migrate(initialData);
		}

		return this.getIndex().entries;
	}

	private async migrate(initialData: ISerializableChatsData): Promise<void> {
		const numSessions = Object.keys(initialData).length;
		this.logService.info(`ChatSessionStore: Migrating ${numSessions} chat sessions from storage service to file system`);

		await Promise.all(Object.values(initialData).map(async session => {
			await this.writeSession(session);
		}));

		await this.flushIndex();
	}

	public async readSession(sessionId: string): Promise<ISerializableChatData | undefined> {
		return await this.storeQueue.queue(async () => {
			let rawData: string;
			const storageLocation = this.getStorageLocation(sessionId);
			try {
				rawData = (await this.fileService.readFile(storageLocation)).value.toString();
			} catch (e) {
				this.reportError('sessionReadFile', `Error reading chat session file ${sessionId}`, e);
				return undefined;
			}

			try {
				// TODO Copied from ChatService.ts, cleanup
				const session: ISerializableChatDataIn = revive(JSON.parse(rawData)); // Revive serialized URIs in session data
				// Revive serialized markdown strings in response data
				for (const request of session.requests) {
					if (Array.isArray(request.response)) {
						request.response = request.response.map((response) => {
							if (typeof response === 'string') {
								return new MarkdownString(response);
							}
							return response;
						});
					} else if (typeof request.response === 'string') {
						request.response = [new MarkdownString(request.response)];
					}
				}

				return normalizeSerializableChatData(session);
			} catch (err) {
				this.reportError('malformedSession', `Malformed session data in ${storageLocation.fsPath}: [${rawData.substring(0, 20)}${rawData.length > 20 ? '...' : ''}]`, err);
				return undefined;
			}
		});
	}

	private getStorageLocation(chatSessionId: string): URI {
		return joinPath(this.storageRoot, `${chatSessionId}.json`);
	}
}

interface IChatSessionEntryMetadata {
	sessionId: string;
	title: string;
	lastMessageDate: number;
}

function isChatSessionEntryMetadata(obj: unknown): obj is IChatSessionEntryMetadata {
	return (
		!!obj &&
		typeof obj === 'object' &&
		typeof (obj as IChatSessionEntryMetadata).sessionId === 'string' &&
		typeof (obj as IChatSessionEntryMetadata).title === 'string' &&
		typeof (obj as IChatSessionEntryMetadata).lastMessageDate === 'number'
	);
}

export type IChatSessionIndex = Record<string, IChatSessionEntryMetadata>;

interface IChatSessionIndexData {
	version: 1;
	entries: IChatSessionIndex;
}

// TODO if we update the index version:
// Don't throw away index when moving backwards in VS Code version. Try to recover it. But this scenario is hard.
function isChatSessionIndex(data: unknown): data is IChatSessionIndexData {
	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const index = data as IChatSessionIndexData;
	if (index.version !== 1) {
		return false;
	}

	if (typeof index.entries !== 'object' || index.entries === null) {
		return false;
	}

	for (const key in index.entries) {
		if (!isChatSessionEntryMetadata(index.entries[key])) {
			return false;
		}
	}

	return true;
}

function getSessionMetadata(session: ChatModel | ISerializableChatData): IChatSessionEntryMetadata {
	const title = session instanceof ChatModel ?
		(session.title ?? localize('newChat', "New Chat")) :
		session.customTitle ?? ChatModel.getDefaultTitle(session.requests);
	return {
		sessionId: session.sessionId,
		title,
		lastMessageDate: session.lastMessageDate
	};
}
