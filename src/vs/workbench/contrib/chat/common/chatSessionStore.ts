/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { revive } from '../../../../base/common/marshalling.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ChatModel, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, normalizeSerializableChatData } from './chatModel.js';

const maxPersistedSessions = 25;

export class ChatSessionStore {
	private readonly storageRoot: URI;
	private readonly indexPath: URI;

	private readonly storeQueue = new Sequencer();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = isEmptyWindow ?
			'no-workspace' :
			this.workspaceContextService.getWorkspace().id;
		this.storageRoot = joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'chatSessions');
		this.indexPath = joinPath(this.storageRoot, 'index.json');
	}

	async storeSessions(sessions: ChatModel[]): Promise<void> {
		await this.storeQueue.queue(async () => {
			try {
				const { index } = await this.getIndex();
				await Promise.all(sessions.map(session => this.writeSession(session, index)));
				await this.trimEntries(index);
				await this.flushIndex(index);
			} catch (e) {
				this.reportError('storeSessions', 'Error storing chat sessions', e);
			}
		});
	}

	private async writeSession(session: ChatModel | ISerializableChatData, index: IChatSessionIndexData): Promise<void> {
		try {
			const storageLocation = this.getStorageLocation(session.sessionId);
			const content = JSON.stringify(session, undefined, 2);
			await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));

			// Write succeeded, update index
			index.entries[session.sessionId] = getSessionMetadata(session);
		} catch (e) {
			this.reportError('sessionWrite', 'Error writing chat session', e);
		}
	}

	private async flushIndex(index: IChatSessionIndexData): Promise<void> {
		try {
			await this.fileService.writeFile(this.indexPath, VSBuffer.fromString(JSON.stringify(index, undefined, 2)));
		} catch (e) {
			this.reportError('indexWrite', 'Error writing index', e);
		}
	}

	private async trimEntries(index: IChatSessionIndexData): Promise<void> {
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

	private reportError(reasonForTelemetry: string, message: string, error: Error): void {
		this.logService.error(`ChatSessionStore: ` + message, error);

		const fileOperationReason = toFileOperationResult(error);
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
			fileOperationReason: fileOperationReason
		});
	}

	private indexSequencer = new Sequencer();
	private indexCache: IChatSessionIndexData | undefined;
	private async getIndex(): Promise<{ index: IChatSessionIndexData; isFresh: boolean }> {
		if (this.indexCache) {
			return { index: this.indexCache, isFresh: false };
		}

		return await this.indexSequencer.queue(async () => {
			if (this.indexCache) {
				return { index: this.indexCache, isFresh: false };
			}

			try {
				const content = await this.fileService.readFile(this.indexPath);
				const data = JSON.parse(content.value.toString());
				if (isChatSessionIndex(data)) {
					this.indexCache = data;
				} else {
					// TODO Don't throw away index when moving backwards in VS Code version. Could rebuild it from data. But this scenario is hard anyway
					this.reportError('invalidIndex', 'Invalid index format', data);
					this.indexCache = { version: 1, entries: {} };
				}

				return { index: this.indexCache, isFresh: false };
			} catch (e) {
				const isFresh = await this.handleIndexReadError(e);
				this.indexCache = { version: 1, entries: {} };
				return { index: this.indexCache, isFresh };
			}
		});
	}

	private async handleIndexReadError(error: Error): Promise<boolean> {
		if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			try {
				const stat = await this.fileService.resolve(this.storageRoot);
				if (stat.children?.length === 0) {
					this.logService.info(`ChatSessionStore: Initializing chat index in ${this.storageRoot.fsPath}`);
					return true;
				} else {
					this.reportError('indexMissing', `Chats exist in ${this.storageRoot.fsPath} but index is missing`, error);
				}
			} catch (e2) {
				if (toFileOperationResult(e2) === FileOperationResult.FILE_NOT_FOUND) {
					this.logService.info(`ChatSessionStore: Initializing chat index in ${this.storageRoot.fsPath}`);
					return true;
				} else {
					this.reportError('statStorageRoot', `Chat index missing, could not stat ${this.storageRoot.fsPath}`, e2);
				}
			}
		} else {
			this.reportError('indexRead', 'Error reading index', error);
		}

		return false;
	}

	async getSessionIndex(initialData?: ISerializableChatsData): Promise<IChatSessionIndex> {
		const indexResult = await this.getIndex();

		const needsMigrationFromStorageService = indexResult.isFresh && !Object.keys(indexResult.index.entries).length && initialData;
		if (needsMigrationFromStorageService) {
			await this.migrate(initialData);
		}

		return indexResult.index.entries;
	}

	private async migrate(initialData: ISerializableChatsData): Promise<void> {
		const index: IChatSessionIndexData = {
			version: 1,
			entries: {}
		};

		await Promise.all(Object.values(initialData).map(async session => {
			await this.writeSession(session, index);
		}));

		this.indexCache = index;
		await this.flushIndex(index);
	}

	public async readSession(sessionId: string): Promise<ISerializableChatData | undefined> {
		let rawData: string;
		const storageLocation = this.getStorageLocation(sessionId);
		try {
			rawData = (await this.fileService.readFile(storageLocation)).value.toString();
		} catch (e) {
			this.reportError('sessionReadFile', `Error reading chat session file ${sessionId}`, e);
			return undefined;
		}

		try {
			// Copied from ChatService.ts, cleanup
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
		(session.title || localize('newChat', "New Chat")) :
		session.customTitle ?? ChatModel.getDefaultTitle(session.requests);
	return {
		sessionId: session.sessionId,
		title,
		lastMessageDate: session.lastMessageDate
	};
}
