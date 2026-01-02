/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { awaitStatsForSession } from '../chat.js';
import { ModifiedFileEntryState } from '../editing/chatEditingService.js';
import { ChatModel, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, normalizeSerializableChatData } from './chatModel.js';
import { IChatSessionStats, IChatSessionTiming, ResponseModelState } from '../chatService/chatService.js';
import { LocalChatSessionUri } from './chatUri.js';
import { ChatAgentLocation } from '../constants.js';

const maxPersistedSessions = 25;

const ChatIndexStorageKey = 'chat.ChatSessionStore.index';
const ChatTransferIndexStorageKey = 'ChatSessionStore.transferIndex';

export class ChatSessionStore extends Disposable {
	private readonly storageRoot: URI;
	private readonly previousEmptyWindowStorageRoot: URI | undefined;
	private readonly transferredSessionStorageRoot: URI;

	private readonly storeQueue = new Sequencer();

	private storeTask: Promise<void> | undefined;
	private shuttingDown = false;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();

		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = this.workspaceContextService.getWorkspace().id;
		this.storageRoot = isEmptyWindow ?
			joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions') :
			joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'chatSessions');

		this.previousEmptyWindowStorageRoot = isEmptyWindow ?
			joinPath(this.environmentService.workspaceStorageHome, 'no-workspace', 'chatSessions') :
			undefined;

		this.transferredSessionStorageRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'transferredChatSessions');

		this._register(this.lifecycleService.onWillShutdown(e => {
			this.shuttingDown = true;
			if (!this.storeTask) {
				return;
			}

			e.join(this.storeTask, {
				id: 'join.chatSessionStore',
				label: localize('join.chatSessionStore', "Saving chat history")
			});
		}));
	}

	async storeSessions(sessions: ChatModel[]): Promise<void> {
		if (this.shuttingDown) {
			// Don't start this task if we missed the chance to block shutdown
			return;
		}

		try {
			this.storeTask = this.storeQueue.queue(async () => {
				try {
					await Promise.all(sessions.map(session => this.writeSession(session)));
					await this.trimEntries();
					await this.flushIndex();
				} catch (e) {
					this.reportError('storeSessions', 'Error storing chat sessions', e);
				}
			});
			await this.storeTask;
		} finally {
			this.storeTask = undefined;
		}
	}

	async storeSessionsMetadataOnly(sessions: ChatModel[]): Promise<void> {
		if (this.shuttingDown) {
			// Don't start this task if we missed the chance to block shutdown
			return;
		}

		try {
			this.storeTask = this.storeQueue.queue(async () => {
				try {
					await Promise.all(sessions.map(session => this.writeSessionMetadataOnly(session)));
					await this.flushIndex();
				} catch (e) {
					this.reportError('storeSessions', 'Error storing chat sessions', e);
				}
			});
			await this.storeTask;
		} finally {
			this.storeTask = undefined;
		}
	}

	async storeTransferSession(transferData: IChatTransfer, session: ChatModel): Promise<void> {
		const index = this.getTransferredSessionIndex();
		const workspaceKey = transferData.toWorkspace.toString();

		// Clean up any preexisting transferred session for this workspace
		const existingTransfer = index[workspaceKey];
		if (existingTransfer) {
			try {
				const existingSessionResource = URI.revive(existingTransfer.sessionResource);
				if (existingSessionResource && LocalChatSessionUri.parseLocalSessionId(existingSessionResource)) {
					const existingStorageLocation = this.getTransferredSessionStorageLocation(existingSessionResource);
					await this.fileService.del(existingStorageLocation);
				}
			} catch (e) {
				if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
					this.reportError('storeTransferSession', 'Error deleting old transferred session file', e);
				}
			}
		}

		try {
			const content = JSON.stringify(session, undefined, 2);
			const storageLocation = this.getTransferredSessionStorageLocation(session.sessionResource);
			await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));
		} catch (e) {
			this.reportError('sessionWrite', 'Error writing chat session', e);
			return;
		}

		index[workspaceKey] = transferData;
		try {
			this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
		} catch (e) {
			this.reportError('storeTransferSession', 'Error storing chat transfer session', e);
		}
	}

	private getTransferredSessionIndex(): IChatTransferIndex {
		try {
			const data: IChatTransferIndex = this.storageService.getObject(ChatTransferIndexStorageKey, StorageScope.PROFILE, {});
			return data;
		} catch (e) {
			this.reportError('getTransferredSessionIndex', 'Error reading chat transfer index', e);
			return {};
		}
	}

	private static readonly TRANSFER_EXPIRATION_MS = 60 * 1000 * 5;

	getTransferredSessionData(): URI | undefined {
		try {
			const index = this.getTransferredSessionIndex();
			const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
			if (workspaceFolders.length !== 1) {
				// Can only transfer sessions to single-folder workspaces
				return undefined;
			}

			const workspaceKey = workspaceFolders[0].uri.toString();
			const transferredSessionForWorkspace: IChatTransferDto = index[workspaceKey];
			if (!transferredSessionForWorkspace) {
				return undefined;
			}

			// Check if the transfer has expired
			const revivedTransferData = revive(transferredSessionForWorkspace);
			if (Date.now() - transferredSessionForWorkspace.timestampInMilliseconds > ChatSessionStore.TRANSFER_EXPIRATION_MS) {
				this.logService.info('ChatSessionStore: Transferred session has expired');
				this.cleanupTransferredSession(revivedTransferData.sessionResource);
				return undefined;
			}
			return !!LocalChatSessionUri.parseLocalSessionId(revivedTransferData.sessionResource) && revivedTransferData.sessionResource;
		} catch (e) {
			this.reportError('getTransferredSession', 'Error getting transferred chat session URI', e);
			return undefined;
		}
	}

	async readTransferredSession(sessionResource: URI): Promise<ISerializableChatData | undefined> {
		try {
			const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
			const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
			if (!sessionId) {
				return undefined;
			}

			const sessionData = await this.readSessionFromLocation(storageLocation, sessionId);

			// Clean up the transferred session after reading
			await this.cleanupTransferredSession(sessionResource);

			return sessionData;
		} catch (e) {
			this.reportError('getTransferredSession', 'Error getting transferred chat session', e);
			return undefined;
		}
	}

	private async cleanupTransferredSession(sessionResource: URI): Promise<void> {
		try {
			// Remove from index
			const index = this.getTransferredSessionIndex();
			const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
			if (workspaceFolders.length === 1) {
				const workspaceKey = workspaceFolders[0].uri.toString();
				delete index[workspaceKey];
				this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
			}

			// Delete the transferred session file
			const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
			await this.fileService.del(storageLocation);
		} catch (e) {
			if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
				this.reportError('cleanupTransferredSession', 'Error cleaning up transferred session', e);
			}
		}
	}

	private async writeSession(session: ChatModel | ISerializableChatData): Promise<void> {
		try {
			const index = this.internalGetIndex();
			const storageLocation = this.getStorageLocation(session.sessionId);
			const content = JSON.stringify(session, undefined, 2);
			await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));

			// Write succeeded, update index
			index.entries[session.sessionId] = await getSessionMetadata(session);
		} catch (e) {
			this.reportError('sessionWrite', 'Error writing chat session', e);
		}
	}

	private async writeSessionMetadataOnly(session: ChatModel): Promise<void> {
		// Only to be used for external sessions
		if (LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
			return;
		}

		try {
			const index = this.internalGetIndex();

			// TODO get this class on sessionResource
			const externalSessionId = session.sessionResource.toString();
			index.entries[externalSessionId] = await getSessionMetadata(session);
		} catch (e) {
			this.reportError('sessionMetadataWrite', 'Error writing chat session metadata', e);
		}
	}

	private async flushIndex(): Promise<void> {
		const index = this.internalGetIndex();
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
		const index = this.internalGetIndex();
		const entries = Object.entries(index.entries)
			.filter(([_id, entry]) => !entry.isExternal)
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
		const index = this.internalGetIndex();
		if (!index.entries[sessionId]) {
			return;
		}

		const storageLocation = this.getStorageLocation(sessionId);
		try {
			await this.fileService.del(storageLocation);
		} catch (e) {
			if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
				this.reportError('sessionDelete', 'Error deleting chat session', e);
			}
		} finally {
			delete index.entries[sessionId];
		}
	}

	hasSessions(): boolean {
		return Object.keys(this.internalGetIndex().entries).length > 0;
	}

	isSessionEmpty(sessionId: string): boolean {
		const index = this.internalGetIndex();
		return index.entries[sessionId]?.isEmpty ?? true;
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.storeQueue.queue(async () => {
			await this.internalDeleteSession(sessionId);
			await this.flushIndex();
		});
	}

	async clearAllSessions(): Promise<void> {
		await this.storeQueue.queue(async () => {
			const index = this.internalGetIndex();
			const entries = Object.keys(index.entries);
			this.logService.info(`ChatSessionStore: Clearing ${entries.length} chat sessions`);
			await Promise.all(entries.map(entry => this.internalDeleteSession(entry)));
			await this.flushIndex();
		});
	}

	public async setSessionTitle(sessionId: string, title: string): Promise<void> {
		await this.storeQueue.queue(async () => {
			const index = this.internalGetIndex();
			if (index.entries[sessionId]) {
				index.entries[sessionId].title = title;
			}
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
	private internalGetIndex(): IChatSessionIndexData {
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

	async getIndex(): Promise<IChatSessionIndex> {
		return this.storeQueue.queue(async () => {
			return this.internalGetIndex().entries;
		});
	}

	getMetadataForSessionSync(sessionResource: URI): IChatSessionEntryMetadata | undefined {
		const index = this.internalGetIndex();
		return index.entries[this.getIndexKey(sessionResource)];
	}

	private getIndexKey(sessionResource: URI): string {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		return sessionId ?? sessionResource.toString();
	}

	logIndex(): void {
		const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
		this.logService.info('ChatSessionStore index: ', data);
	}

	async migrateDataIfNeeded(getInitialData: () => ISerializableChatsData | undefined): Promise<void> {
		await this.storeQueue.queue(async () => {
			const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
			const needsMigrationFromStorageService = !data;
			if (needsMigrationFromStorageService) {
				const initialData = getInitialData();
				if (initialData) {
					await this.migrate(initialData);
				}
			}
		});
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
			const storageLocation = this.getStorageLocation(sessionId);
			return this.readSessionFromLocation(storageLocation, sessionId);
		});
	}

	private async readSessionFromLocation(storageLocation: URI, sessionId: string): Promise<ISerializableChatData | undefined> {
		let rawData: string | undefined;
		try {
			rawData = (await this.fileService.readFile(storageLocation)).value.toString();
		} catch (e) {
			this.reportError('sessionReadFile', `Error reading chat session file ${sessionId}`, e);

			if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND && this.previousEmptyWindowStorageRoot) {
				rawData = await this.readSessionFromPreviousLocation(sessionId);
			}

			if (!rawData) {
				return undefined;
			}
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
	}

	private async readSessionFromPreviousLocation(sessionId: string): Promise<string | undefined> {
		let rawData: string | undefined;

		if (this.previousEmptyWindowStorageRoot) {
			const storageLocation2 = joinPath(this.previousEmptyWindowStorageRoot, `${sessionId}.json`);
			try {
				rawData = (await this.fileService.readFile(storageLocation2)).value.toString();
				this.logService.info(`ChatSessionStore: Read chat session ${sessionId} from previous location`);
			} catch (e) {
				this.reportError('sessionReadFile', `Error reading chat session file ${sessionId} from previous location`, e);
				return undefined;
			}
		}

		return rawData;
	}

	private getStorageLocation(chatSessionId: string): URI {
		return joinPath(this.storageRoot, `${chatSessionId}.json`);
	}

	private getTransferredSessionStorageLocation(sessionResource: URI): URI {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		return joinPath(this.transferredSessionStorageRoot, `${sessionId}.json`);
	}

	public getChatStorageFolder(): URI {
		return this.storageRoot;
	}
}

export interface IChatSessionEntryMetadata {
	sessionId: string;
	title: string;
	lastMessageDate: number;
	timing?: IChatSessionTiming;
	initialLocation?: ChatAgentLocation;
	hasPendingEdits?: boolean;
	stats?: IChatSessionStats;
	lastResponseState?: ResponseModelState;

	/**
	 * This only exists because the migrated data from the storage service had empty sessions persisted, and it's impossible to know which ones are
	 * currently in use. Now, `clearSession` deletes empty sessions, so old ones shouldn't take up space in the store anymore, but we still need to
	 * filter the old ones out of history.
	 */
	isEmpty?: boolean;

	/**
	 * Whether this session was loaded from an external provider (eg background/cloud sessions).
	 */
	isExternal?: boolean;
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

async function getSessionMetadata(session: ChatModel | ISerializableChatData): Promise<IChatSessionEntryMetadata> {
	const title = session.customTitle || (session instanceof ChatModel ? session.title : undefined);

	let stats: IChatSessionStats | undefined;
	if (session instanceof ChatModel) {
		stats = await awaitStatsForSession(session);
	}

	const timing = session instanceof ChatModel ?
		session.timing :
		// session is only ISerializableChatData in the old pre-fs storage data migration scenario
		{
			startTime: session.creationDate,
			endTime: session.lastMessageDate
		};

	return {
		sessionId: session.sessionId,
		title: title || localize('newChat', "New Chat"),
		lastMessageDate: session.lastMessageDate,
		timing,
		initialLocation: session.initialLocation,
		hasPendingEdits: session instanceof ChatModel ? (session.editingSession?.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified)) : false,
		isEmpty: session instanceof ChatModel ? session.getRequests().length === 0 : session.requests.length === 0,
		stats,
		isExternal: session instanceof ChatModel && !LocalChatSessionUri.parseLocalSessionId(session.sessionResource),
		lastResponseState: session instanceof ChatModel ?
			(session.lastRequest?.response?.state ?? ResponseModelState.Complete) :
			ResponseModelState.Complete
	};
}

export interface IChatTransfer {
	toWorkspace: URI;
	sessionResource: URI;
	timestampInMilliseconds: number;
}

export interface IChatTransfer2 extends IChatTransfer {
	chat: ISerializableChatData;
}

type IChatTransferDto = Dto<IChatTransfer>;

/**
 * Map of destination workspace URI to chat transfer data
 */
type IChatTransferIndex = Record<string, IChatTransferDto>;
