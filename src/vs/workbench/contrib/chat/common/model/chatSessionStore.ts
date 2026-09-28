/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, Sequencer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { awaitStatsForSession } from '../chat.js';
import { IChatSessionStats, IChatSessionTiming, ResponseModelState } from '../chatService/chatService.js';
import { ChatAgentLocation, ChatPermissionLevel } from '../constants.js';
import { ModifiedFileEntryState } from '../editing/chatEditingService.js';
import { ChatModel, ISerializableChatData, ISerializableChatDataIn, ISerializableChatModelInputState, ISerializableChatsData, ISerializedChatDataReference, normalizeSerializableChatData } from './chatModel.js';
import { ChatSessionOperationLog } from './chatSessionOperationLog.js';
import { getChatSessionStorageResource, LocalChatSessionUri } from './chatUri.js';
import { stringifyEntryWithFallback } from './objectMutationLog.js';

const maxPersistedSessions = 400;

const ChatIndexStorageKey = 'chat.ChatSessionStore.index';
const ChatIndexEntryStorageKeyPrefix = `${ChatIndexStorageKey}.entry.`;
const ChatPinnedStorageKeyPrefix = `${ChatIndexStorageKey}.pinned.`;
const ChatSerializedMigrationStorageKeyPrefix = `${ChatIndexStorageKey}.serializedMigration.`;
const DeletedChatIndexEntry = '{"deleted":true}';
const ChatTransferIndexStorageKey = 'ChatSessionStore.transferIndex';
const LegacyAgentSessionsStateStorageKey = 'agentSessions.state.cache';
const AgentSessionsPinnedFieldStorageKeyPrefix = 'agentSessions.state.cache.field.pinned.';

export class ChatSessionStore extends Disposable {
	private readonly _onDidDeleteSession = this._register(new Emitter<string>());
	readonly onDidDeleteSession = this._onDidDeleteSession.event;
	private profileStorageHome: URI;
	private changingProfile = false;
	private profileStorageChanging = false;
	private workspaceChangedDuringProfileChange = false;
	private storageRoot: URI;
	private legacyStorageRoot: URI;
	private workspaceId: string;
	private workspaceLabel: string | undefined;
	private isEmptyWindow = false;
	private previousEmptyWindowStorageRoot: URI | undefined;
	private readonly transferredSessionStorageRoot: URI;

	private readonly storeQueue = new Sequencer();

	private storeTask: Promise<void> | undefined;
	private shuttingDown = false;
	private readonly pendingIndexEntries = new Map<string, IChatSessionEntryMetadata>();
	private readonly deletedSessionIds = new Set<string>();
	private readonly pinnedSessionIds = new Set<string>();
	private isWritingIndex = false;
	private needsProfileIndexMigration = false;
	private getInitialData: (() => ISerializableChatsData | undefined) | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.profileStorageHome = this.userDataProfileService.currentProfile.globalStorageHome;
		const workspace = this.workspaceContextService.getWorkspace();
		this.storageRoot = this.getProfileStorageRoot(workspace.id);
		this.workspaceId = '';
		this.legacyStorageRoot = this.storageRoot;
		this.updateWorkspaceAssociation();

		this.transferredSessionStorageRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'transferredChatSessions');

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(e => {
			if (!this.profileStorageChanging && !this.isWritingIndex && (e.key === ChatIndexStorageKey || e.key.startsWith(ChatIndexEntryStorageKeyPrefix) || e.key.startsWith(ChatPinnedStorageKeyPrefix))) {
if (e.key.startsWith(ChatIndexEntryStorageKeyPrefix) && this.storageService.get(e.key, StorageScope.PROFILE) === DeletedChatIndexEntry) {
					const sessionId = decodeURIComponent(e.key.slice(ChatIndexEntryStorageKeyPrefix.length));
					this.pendingIndexEntries.delete(sessionId);
					this.deletedSessionIds.add(sessionId);
					this._onDidDeleteSession.fire(sessionId);
				}
				this.indexCache = undefined;
			}
		}));

		this._register(this.userDataProfileService.onWillChangeCurrentProfile(e => {
			if (!isEqual(e.previous.globalStorageHome, e.profile.globalStorageHome)) {
				this.changingProfile = true;
				e.join(this.storeQueue.queue(async () => { }));
			}
		}));

		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => {
			this.profileStorageChanging = !isEqual(e.previous.globalStorageHome, e.profile.globalStorageHome);
		}));

		this._register(this.userDataProfileService.onDidFailCurrentProfileChange(() => {
			this.changingProfile = false;
			if (this.workspaceChangedDuringProfileChange) {
				this.updateWorkspaceAfterProfileChange();
			}
		}));

		this._register(this.userDataProfileService.onDidUpdateCurrentProfile(profile => {
			const profileChanged = !isEqual(this.profileStorageHome, profile.globalStorageHome);
			if (profileChanged) {
				this.profileStorageHome = profile.globalStorageHome;
				this.storageRoot = this.getProfileStorageRoot(this.workspaceId);
				this.resetProfileState();
			}
			this.changingProfile = false;
			this.profileStorageChanging = false;
			if (profileChanged || this.workspaceChangedDuringProfileChange) {
				this.updateWorkspaceAfterProfileChange();
			}
		}));

		this._register(this.workspaceEditingService.onDidEnterWorkspace(e => {
			if (this.changingProfile) {
				this.workspaceChangedDuringProfileChange = true;
				return;
			}
			e.join(this.storeQueue.queue(async () => {
				this.updateWorkspaceAssociation();
				this.storageRoot = this.getProfileStorageRoot(this.workspaceId);
				await this.migrateLegacyWorkspaceSessions();
				await this.migrateSerializedDataIfNeeded();
			}));
		}));

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

	private updateWorkspaceAssociation(): void {
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		this.isEmptyWindow = isEmptyWindow;
		this.workspaceId = workspace.id;
		this.workspaceLabel = workspace.name ?? workspace.folders[0]?.name;
		this.legacyStorageRoot = isEmptyWindow
			? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions')
			: joinPath(this.environmentService.workspaceStorageHome, this.workspaceId, 'chatSessions');
		this.previousEmptyWindowStorageRoot = isEmptyWindow
			? joinPath(this.environmentService.workspaceStorageHome, 'no-workspace', 'chatSessions')
			: undefined;
	}

	private updateWorkspaceAfterProfileChange(): void {
		this.workspaceChangedDuringProfileChange = false;
		this.updateWorkspaceAssociation();
		this.storageRoot = this.getProfileStorageRoot(this.workspaceId);
		void this.storeQueue.queue(async () => {
			await this.migrateLegacyWorkspaceSessions();
			await this.migrateSerializedDataIfNeeded();
		}).catch(error => this.reportError('profileMigration', 'Error migrating chat sessions after profile change', error));
	}

	private getStorageRoot(metadata?: IChatSessionEntryMetadata): URI {
		return metadata?.workspaceId ? this.getProfileStorageRoot(metadata.workspaceId) : this.storageRoot;
	}

	private getProfileStorageRoot(workspaceId: string): URI {
		return getChatSessionStorageResource(joinPath(this.profileStorageHome, 'chatSessions'), workspaceId);
	}

	private throwIfChangingProfile(): void {
		if (this.changingProfile) {
			throw new CancellationError();
		}
	}

	private resetProfileState(): void {
		this.indexCache = undefined;
		this.pendingIndexEntries.clear();
		this.deletedSessionIds.clear();
		this.pinnedSessionIds.clear();
		this.needsProfileIndexMigration = false;
	}

	private getWorkspaceLabel(existing: IChatSessionEntryMetadata | undefined): string | undefined {
		return existing?.workspaceLabel ?? (existing?.workspaceId === undefined || existing.workspaceId === this.workspaceId ? this.workspaceLabel : undefined);
	}

	private async migrateLegacyWorkspaceSessions(): Promise<void> {
		try {
			const legacyScope = this.isEmptyWindow
				? StorageScope.APPLICATION
				: StorageScope.WORKSPACE;
			const legacyData = this.storageService.get(ChatIndexStorageKey, legacyScope);
			if (!legacyData) {
				return;
			}

			const parsedLegacyIndex = JSON.parse(legacyData) as unknown;
			if (!isChatSessionIndex(parsedLegacyIndex)) {
				this.reportError('legacyIndexFormat', 'Unable to migrate invalid legacy chat session index');
				return;
			}

			const oldStorageExists = await this.fileService.exists(this.legacyStorageRoot);
			let migrationComplete = true;

			const index = this.internalGetIndex();
			for (const [sessionId, metadata] of Object.entries(parsedLegacyIndex.entries)) {
				const existing = index.entries[sessionId];
				if (!metadata.isExternal && existing && legacyScope !== StorageScope.APPLICATION && existing.workspaceId !== this.workspaceId) {
					const migratedSessionId = generateUuid();
					const oldFlatPath = getChatSessionStorageResource(this.legacyStorageRoot, sessionId, '.json');
					const oldLogPath = getChatSessionStorageResource(this.legacyStorageRoot, sessionId, '.jsonl');
					const session = oldStorageExists ? await this.readSessionFromLocation(oldFlatPath, oldLogPath, sessionId) : undefined;
					if (!session || !hasKey(session.value, { sessionId: true })) {
						migrationComplete = false;
						this.reportError('migrateWorkspaceCollision', `Unable to preserve colliding legacy chat session ${sessionId}`);
						continue;
					}

					const migratedSession = session.value as ISerializableChatData;
					await this.writeSession({ ...migratedSession, sessionId: migratedSessionId });
					const migratedLocation = this.getStorageLocation(migratedSessionId);
					const persistedSession = await this.readSessionFromLocation(migratedLocation.flat, migratedLocation.log, migratedSessionId);
					if (!persistedSession) {
						migrationComplete = false;
						this.deleteIndexEntry(migratedSessionId);
						continue;
					}
					this.setIndexEntry(migratedSessionId, {
						...metadata,
						sessionId: migratedSessionId,
						workspaceId: this.workspaceId,
						workspaceLabel: this.workspaceLabel,
						isEmptyWindow: this.isEmptyWindow,
						legacySessionId: sessionId,
					});
					continue;
				}

				if (!metadata.isExternal && oldStorageExists) {
					for (const suffix of ['.json', '.jsonl']) {
						const oldFilePath = getChatSessionStorageResource(this.legacyStorageRoot, sessionId, suffix);
						if (!await this.fileService.exists(oldFilePath)) {
							continue;
						}
						try {
							await this.fileService.copy(oldFilePath, getChatSessionStorageResource(this.storageRoot, sessionId, suffix), false);
						} catch (error) {
							if (toFileOperationResult(error) !== FileOperationResult.FILE_MOVE_CONFLICT) {
								throw error;
							}
						}
					}
				}

				if (!existing || (legacyScope === StorageScope.APPLICATION && existing.workspaceId === undefined)) {
					this.setIndexEntry(sessionId, {
						...metadata,
						workspaceId: metadata.workspaceId ?? this.workspaceId,
						workspaceLabel: metadata.workspaceLabel ?? this.workspaceLabel,
						isEmptyWindow: metadata.isEmptyWindow ?? this.isEmptyWindow,
					});
				}
			}

			this.flushIndexSync();
			if (migrationComplete) {
				this.storageService.remove(ChatIndexStorageKey, legacyScope);
			}
			this.logService.info(`ChatSessionStore: Migrated chat sessions for workspace ${this.workspaceId} to profile storage`);
		} catch (e) {
			this.reportError('migrateWorkspace', 'Error migrating chat sessions to profile storage', e);
		}
	}

	async storeSessions(sessions: ChatModel[]): Promise<void> {
		this.throwIfChangingProfile();
		if (this.shuttingDown) {
			// Don't start this task if we missed the chance to block shutdown
			return;
		}

		await this.trackStoreTask(this.storeQueue.queue(async () => {
			try {
				await Promises.settled(sessions.map(session => this.writeSession(session)));
				await this.trimEntries();
				await this.flushIndex();
			} catch (e) {
				this.reportError('storeSessions', 'Error storing chat sessions', e);
			}
		}));
	}

	/** Saves the outgoing profile before either its file root or storage backend changes. */
	async saveSessionsBeforeProfileChange(localSessions: ChatModel[], externalSessions: ChatModel[]): Promise<void> {
		await this.trackStoreTask(this.storeQueue.queue(async () => {
			// Sequential writes ensure no outstanding work can outlive a failed save.
			for (const session of localSessions) {
				await this.writeSession(session, true);
			}
			for (const session of externalSessions) {
				await this.writeSessionMetadataOnly(session, true);
			}
			await this.trimEntries();
			this.flushIndexSync();
			await this.storageService.flush();
		}));
	}

	async storeSessionsMetadataOnly(sessions: ChatModel[]): Promise<void> {
		this.throwIfChangingProfile();
		if (this.shuttingDown) {
			// Don't start this task if we missed the chance to block shutdown
			return;
		}

		await this.trackStoreTask(this.storeQueue.queue(async () => {
			try {
				await Promises.settled(sessions.map(session => this.writeSessionMetadataOnly(session)));
				await this.flushIndex();
			} catch (e) {
				this.reportError('storeSessions', 'Error storing chat sessions', e);
			}
		}));
	}

	private async trackStoreTask(task: Promise<void>): Promise<void> {
		this.storeTask = task;
		try {
			await task;
		} finally {
			if (this.storeTask === task) {
				this.storeTask = undefined;
			}
		}
	}

	async storeTransferSession(transferData: IChatTransfer, session: ChatModel): Promise<void> {
		this.throwIfChangingProfile();
		await this.storeQueue.queue(() => this.internalStoreTransferSession(transferData, session));
	}

	private async internalStoreTransferSession(transferData: IChatTransfer, session: ChatModel): Promise<void> {
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
			const content = stringifyEntryWithFallback(session);
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
		if (this.changingProfile) {
			return undefined;
		}
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
				void this.storeQueue.queue(() => this.cleanupTransferredSession(revivedTransferData.sessionResource));
				return undefined;
			}
			return !!LocalChatSessionUri.parseLocalSessionId(revivedTransferData.sessionResource) && revivedTransferData.sessionResource;
		} catch (e) {
			this.reportError('getTransferredSession', 'Error getting transferred chat session URI', e);
			return undefined;
		}
	}

	async readTransferredSession(sessionResource: URI): Promise<ISerializedChatDataReference | undefined> {
		if (this.changingProfile) {
			return undefined;
		}
		return this.storeQueue.queue(() => this.internalReadTransferredSession(sessionResource));
	}

	private async internalReadTransferredSession(sessionResource: URI): Promise<ISerializedChatDataReference | undefined> {
		try {
			const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
			const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
			if (!sessionId) {
				return undefined;
			}

			const sessionData = await this.readSessionFromLocation(storageLocation, undefined, sessionId);

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

	private _didReportIssue = false;

	private async writeSession(session: ChatModel | ISerializableChatData, throwOnError = false): Promise<void> {
		if (this.isSessionDeleted(session.sessionId)) {
			return;
		}
		try {
			const storageLocation = this.getStorageLocation(session.sessionId);
			if (storageLocation.log) {
				if (session instanceof ChatModel) {
					if (!session.dataSerializer) {
						session.dataSerializer = new ChatSessionOperationLog();
					}

					let op: 'append' | 'replace';
					let data: VSBuffer;
					try {
						({ op, data } = session.dataSerializer.write(session));
					} catch (e) {
						// This is a big of an ugly prompt, but there is _something_ going on with
						// missing sessions. Unfortunately it's hard to root cause because users would
						// not notice an error until they reload the window, at which point any error
						// is gone. Throw a very verbose dialog here so we can get some quality
						// bug reports, if the issue is indeed in the serialized.
						// todo@connor4312: remove after a little bit
						if (!this._didReportIssue) {
							this._didReportIssue = true;
							this.dialogService.prompt({
								custom: true, // so text is copyable
								title: localize('chatSessionStore.serializationError', 'Error saving chat session'),
								message: localize('chatSessionStore.writeError', 'Error serializing chat session for storage. The session will be lost if the window is closed. Please report this issue to the VS Code team:\n\n{0}', e.stack || toErrorMessage(e)),
								buttons: [
									{ label: localize('reportIssue', 'Report Issue'), run: () => this.openerService.open('https://github.com/microsoft/vscode/issues/new?template=bug_report.md') }
								]
							});
						}

						throw e;
					}

					if (data.byteLength > 0) {
						await this.fileService.writeFile(storageLocation.log, data, { append: op === 'append' });
					}
					session.dataSerializer.confirmWrite();
				} else {
					const content = new ChatSessionOperationLog().createInitialFromSerialized(session);
					await this.fileService.writeFile(storageLocation.log, content);
				}
			} else {
				await this.fileService.writeFile(storageLocation.flat, VSBuffer.fromString(stringifyEntryWithFallback(session)));
			}

			// Write succeeded, update index
			const existingMetadata = this.internalGetIndex().entries[session.sessionId];
			const newMetadata = await getSessionMetadata(session, existingMetadata?.workspaceId ?? this.workspaceId, this.getWorkspaceLabel(existingMetadata), existingMetadata?.isEmptyWindow ?? this.isEmptyWindow);
			newMetadata.isPinned = existingMetadata?.isPinned ?? this.pinnedSessionIds.has(session.sessionId);
			this.setIndexEntry(session.sessionId, newMetadata);
		} catch (e) {
			this.reportError('sessionWrite', 'Error writing chat session', e);
			if (throwOnError) {
				throw e;
			}
		}
	}

	private async writeSessionMetadataOnly(session: ChatModel, throwOnError = false): Promise<void> {
		// Only to be used for external sessions
		if (LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
			return;
		}

		try {
			// TODO get this class on sessionResource
			const externalSessionId = session.sessionResource.toString();
			const existingMetadata = this.internalGetIndex().entries[externalSessionId];
			const newMetadata = await getSessionMetadata(session, existingMetadata?.workspaceId ?? this.workspaceId, this.getWorkspaceLabel(existingMetadata), existingMetadata?.isEmptyWindow ?? this.isEmptyWindow);
			newMetadata.isPinned = existingMetadata?.isPinned ?? this.pinnedSessionIds.has(externalSessionId);
			this.setIndexEntry(externalSessionId, newMetadata);
		} catch (e) {
			this.reportError('sessionMetadataWrite', 'Error writing chat session metadata', e);
			if (throwOnError) {
				throw e;
			}
		}
	}

	private async flushIndex(): Promise<void> {
		try {
			this.flushIndexSync();
		} catch (e) {
			// Only if JSON.stringify fails, AFAIK
			this.reportError('indexWrite', 'Error writing index', e);
		}
	}

	private getIndexStorageScope(): StorageScope {
		return StorageScope.PROFILE;
	}

	private async trimEntries(): Promise<void> {
		this.hydrateLegacyPinnedState();
		const index = this.internalGetIndex();
		const entries = Object.entries(index.entries)
			.filter(([_id, entry]) => !entry.isExternal && !entry.isPinned)
			.sort((a, b) => b[1].lastMessageDate - a[1].lastMessageDate)
			.map(([id]) => id);

		if (entries.length > maxPersistedSessions) {
			const entriesToDelete = entries.slice(maxPersistedSessions);
			for (const entry of entriesToDelete) {
				this.deleteIndexEntry(entry);
			}

			this.logService.trace(`ChatSessionStore: Trimmed ${entriesToDelete.length} old chat sessions from index`);
		}
	}

	private hydrateLegacyPinnedState(): void {
		const index = this.internalGetIndex();
		for (const scope of [StorageScope.PROFILE, StorageScope.WORKSPACE]) {
			const serialized = this.storageService.get(LegacyAgentSessionsStateStorageKey, scope);
			if (serialized) {
				try {
					const states = JSON.parse(serialized) as Array<{ resource?: string | { scheme: string }; pinned?: boolean }>;
					for (const state of states) {
						const resource = typeof state.resource === 'string' ? URI.parse(state.resource) : URI.revive(state.resource);
						const sessionId = resource && LocalChatSessionUri.parseLocalSessionId(resource);
						if (sessionId && state.pinned === true && index.entries[sessionId]) {
							index.entries[sessionId].isPinned = true;
						}
					}
				} catch {
					// Invalid legacy state is ignored by the owning cache as well.
				}
			}
		}

		for (const key of this.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
			if (!key.startsWith(AgentSessionsPinnedFieldStorageKeyPrefix) || !this.storageService.getBoolean(key, StorageScope.PROFILE, false)) {
				continue;
			}
			try {
				const resource = URI.parse(decodeURIComponent(key.slice(AgentSessionsPinnedFieldStorageKeyPrefix.length)));
				const sessionId = LocalChatSessionUri.parseLocalSessionId(resource);
				if (sessionId && index.entries[sessionId]) {
					index.entries[sessionId].isPinned = true;
				}
			} catch {
				// Ignore malformed legacy keys.
			}
		}
	}

	private async internalDeleteSession(sessionId: string): Promise<void> {
		const index = this.internalGetIndex();
		if (!index.entries[sessionId]) {
			return;
		}

		let storageLocation: ReturnType<ChatSessionStore['getStorageLocation']>;
		try {
			storageLocation = this.getStorageLocation(sessionId);
		} catch (e) {
			this.reportError('invalidSessionId', `Removing invalid chat session from index: ${sessionId}`, e);
			this.deleteIndexEntry(sessionId);
			return;
		}
		for (const uri of [storageLocation.flat, storageLocation.log]) {
			try {
				if (uri) {
					await this.fileService.del(uri);
				}
			} catch (e) {
				if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
					this.reportError('sessionDelete', 'Error deleting chat session', e);
				}
			}

			this.deleteIndexEntry(sessionId);
		}
	}

	hasSessions(): boolean {
		if (this.changingProfile) {
			return false;
		}
		return Object.keys(this.internalGetIndex().entries).length > 0;
	}

	isSessionEmpty(sessionId: string): boolean {
		if (this.changingProfile) {
			return true;
		}
		const index = this.internalGetIndex();
		return index.entries[sessionId]?.isEmpty ?? true;
	}

	async deleteSession(sessionId: string): Promise<void> {
		this.throwIfChangingProfile();
		await this.storeQueue.queue(async () => {
			await this.internalDeleteSession(sessionId);
			await this.flushIndex();
		});
	}

	async clearAllSessions(): Promise<void> {
		this.throwIfChangingProfile();
		await this.storeQueue.queue(async () => {
			const index = this.internalGetIndex();
			const entries = Object.entries(index.entries)
				.filter(([, metadata]) => metadata.workspaceId === this.workspaceId)
				.map(([sessionId]) => sessionId);
			this.logService.info(`ChatSessionStore: Clearing ${entries.length} chat sessions for workspace ${this.workspaceId}`);
			await Promises.settled(entries.map(entry => this.internalDeleteSession(entry)));
			await this.flushIndex();
		});
	}

	public async setSessionTitle(sessionId: string, title: string): Promise<void> {
		this.throwIfChangingProfile();
		await this.storeQueue.queue(async () => {
			const index = this.internalGetIndex();
			if (index.entries[sessionId]) {
				index.entries[sessionId].title = title;
				this.setIndexEntry(sessionId, index.entries[sessionId]);
				await this.flushIndex();
			}
		});
	}

	public async setSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
		this.throwIfChangingProfile();
		if (pinned) {
			this.pinnedSessionIds.add(sessionId);
		} else {
			this.pinnedSessionIds.delete(sessionId);
		}
		await this.storeQueue.queue(async () => {
			const index = this.internalGetIndex();
			if (index.entries[sessionId]) {
				index.entries[sessionId].isPinned = pinned;
			}
			this.storageService.store(ChatPinnedStorageKeyPrefix + encodeURIComponent(sessionId), pinned, this.getIndexStorageScope(), StorageTarget.MACHINE);
		});
	}

	private reportError(reasonForTelemetry: string, message: string, error?: Error): void {
		const fileOperationReason = error && toFileOperationResult(error);

		if (fileOperationReason === FileOperationResult.FILE_NOT_FOUND) {
			// Expected case (e.g. reading a non-existent session); keep noise low
			this.logService.trace(`ChatSessionStore: ` + message, toErrorMessage(error));
		} else {
			// Unexpected or serious error; surface at error level
			this.logService.error(`ChatSessionStore: ` + message, toErrorMessage(error));
		}
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

	private setIndexEntry(sessionId: string, metadata: IChatSessionEntryMetadata): void {
		if (this.isSessionDeleted(sessionId)) {
			delete this.internalGetIndex().entries[sessionId];
			this.pendingIndexEntries.delete(sessionId);
			return;
		}
		this.internalGetIndex().entries[sessionId] = metadata;
		this.pendingIndexEntries.set(sessionId, metadata);
		this.deletedSessionIds.delete(sessionId);
	}

	/** Whether the active profile contains a persisted deletion for this session. */
	isSessionDeleted(sessionId: string): boolean {
		return this.storageService.get(ChatIndexEntryStorageKeyPrefix + encodeURIComponent(sessionId), this.getIndexStorageScope()) === DeletedChatIndexEntry;
	}

	private deleteIndexEntry(sessionId: string): void {
		delete this.internalGetIndex().entries[sessionId];
		this.pendingIndexEntries.delete(sessionId);
		this.deletedSessionIds.add(sessionId);
	}

	private internalGetIndex(): IChatSessionIndexData {
		if (this.indexCache) {
			return this.indexCache;
		}

		this.indexCache = { version: 1, entries: {} };
		const legacyData = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
		if (legacyData) {
			try {
				const index = JSON.parse(legacyData) as unknown;
				if (isChatSessionIndex(index)) {
					Object.assign(this.indexCache.entries, index.entries);
					this.needsProfileIndexMigration = true;
				} else {
					this.reportError('invalidIndexFormat', `Invalid index format: ${legacyData}`);
				}
			} catch (e) {
				// Only if JSON.parse fails
				this.reportError('invalidIndexJSON', `Index corrupt: ${legacyData}`, e);
			}
		}

		for (const key of this.storageService.keys(this.getIndexStorageScope(), StorageTarget.MACHINE)) {
			if (!key.startsWith(ChatIndexEntryStorageKeyPrefix)) {
				continue;
			}
			const data = this.storageService.get(key, this.getIndexStorageScope());
			if (!data) {
				continue;
			}
			if (data === DeletedChatIndexEntry) {
				delete this.indexCache.entries[decodeURIComponent(key.slice(ChatIndexEntryStorageKeyPrefix.length))];
				continue;
			}
			try {
				const entry = JSON.parse(data) as unknown;
				if (isChatSessionEntryMetadata(entry)) {
					this.indexCache.entries[decodeURIComponent(key.slice(ChatIndexEntryStorageKeyPrefix.length))] = entry;
				} else {
					this.reportError('invalidIndexEntryFormat', `Invalid index entry format: ${data}`);
				}
			} catch (e) {
				this.reportError('invalidIndexEntryJSON', `Index entry corrupt: ${data}`, e);
			}
		}
		for (const key of this.storageService.keys(this.getIndexStorageScope(), StorageTarget.MACHINE)) {
			if (!key.startsWith(ChatPinnedStorageKeyPrefix)) {
				continue;
			}
			const sessionId = decodeURIComponent(key.slice(ChatPinnedStorageKeyPrefix.length));
			const entry = this.indexCache.entries[sessionId];
			if (entry) {
				entry.isPinned = this.storageService.getBoolean(key, this.getIndexStorageScope(), false);
			}
		}

		// Convert from pre-1.109 format which lacks timing
		for (const entry of Object.values(this.indexCache.entries)) {
			entry.timing ??= {
				created: entry.lastMessageDate,
				lastRequestStarted: undefined,
				lastRequestEnded: entry.lastMessageDate,
			};

			// TODO@connor4312: the check for Pending/NeedsInput guards old sessions from Insiders pre PR #288161 and it can be safely removed after a transition period, to only backfill the "complete" state when missing.
			entry.lastResponseState ??= entry.lastResponseState === ResponseModelState.Pending || entry.lastResponseState === ResponseModelState.NeedsInput ? ResponseModelState.Complete : entry.lastResponseState || ResponseModelState.Complete;
		}

		for (const [sessionId, metadata] of this.pendingIndexEntries) {
			this.indexCache.entries[sessionId] = metadata;
		}
		for (const sessionId of this.deletedSessionIds) {
			delete this.indexCache.entries[sessionId];
		}

		return this.indexCache;
	}

	async getIndex(): Promise<IChatSessionIndex> {
		if (this.changingProfile) {
			return {};
		}
		return this.storeQueue.queue(async () => {
			return this.internalGetIndex().entries;
		});
	}

	getMetadataForSessionSync(sessionResource: URI): IChatSessionEntryMetadata | undefined {
		if (this.changingProfile) {
			return undefined;
		}
		const index = this.internalGetIndex();
		return index.entries[this.getIndexKey(sessionResource)];
	}

	private getIndexKey(sessionResource: URI): string {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		return sessionId ?? sessionResource.toString();
	}

	logIndex(): void {
		this.logService.info('ChatSessionStore index: ', JSON.stringify(this.internalGetIndex()));
	}

	async migrateDataIfNeeded(getInitialData: () => ISerializableChatsData | undefined): Promise<void> {
		this.throwIfChangingProfile();
		this.getInitialData = getInitialData;
		await this.storeQueue.queue(async () => {
			await this.migrateLegacyWorkspaceSessions();
			this.internalGetIndex();
			await this.flushIndex();
			await this.migrateSerializedDataIfNeeded();
		});
	}

	private async migrateSerializedDataIfNeeded(): Promise<void> {
		if (!this.getInitialData) {
			return;
		}
		// The legacy payload belongs to the workspace, so only the first profile
		// opening it should claim that data.
		const migrationScope = this.isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE;
		const migrationId = this.isEmptyWindow ? 'empty-window' : this.workspaceId;
		const migrationKey = ChatSerializedMigrationStorageKeyPrefix + encodeURIComponent(migrationId);
		if (this.storageService.getBoolean(migrationKey, migrationScope, false)) {
			return;
		}
		if (!this.isEmptyWindow && this.storageService.getBoolean(migrationKey, StorageScope.PROFILE, false)) {
			// Preserve completion recorded by earlier versions of profile-wide history.
			this.storageService.store(migrationKey, true, migrationScope, StorageTarget.MACHINE);
			return;
		}
		const initialData = this.getInitialData();
		if (initialData && !await this.migrate(initialData)) {
			return;
		}
		this.storageService.store(migrationKey, true, migrationScope, StorageTarget.MACHINE);
	}

	private async migrate(initialData: ISerializableChatsData): Promise<boolean> {
		const numSessions = Object.keys(initialData).length;
		this.logService.info(`ChatSessionStore: Migrating ${numSessions} chat sessions from storage service to file system`);

		let migrationComplete = true;
		for (const session of Object.values(initialData)) {
			const existing = this.internalGetIndex().entries[session.sessionId];
			if (existing?.workspaceId === this.workspaceId) {
				continue;
			}
			if (existing) {
				const migratedSessionId = generateUuid();
				await this.writeSession({ ...session, sessionId: migratedSessionId });
				const migrated = this.internalGetIndex().entries[migratedSessionId];
				if (migrated) {
					this.setIndexEntry(migratedSessionId, { ...migrated, legacySessionId: session.sessionId });
				} else {
					migrationComplete = false;
				}
			} else {
				await this.writeSession(session);
				migrationComplete &&= this.internalGetIndex().entries[session.sessionId]?.workspaceId === this.workspaceId;
			}
		}

		try {
			this.flushIndexSync();
			return migrationComplete;
		} catch (error) {
			this.reportError('indexWrite', 'Error writing migrated chat session index', error);
			return false;
		}
	}

	public async readSession(sessionId: string): Promise<ISerializedChatDataReference | undefined> {
		if (this.changingProfile) {
			return undefined;
		}
		return await this.storeQueue.queue(async () => {
			let storageLocation: ReturnType<ChatSessionStore['getStorageLocation']>;
			try {
				storageLocation = this.getStorageLocation(sessionId);
			} catch (e) {
				this.reportError('invalidSessionId', `Ignoring invalid chat session from index: ${sessionId}`, e);
				const index = this.internalGetIndex();
				if (index.entries[sessionId]) {
					this.deleteIndexEntry(sessionId);
					await this.flushIndex();
				}
				return undefined;
			}
			return this.readSessionFromLocation(storageLocation.flat, storageLocation.log, sessionId);
		});
	}

	private async readSessionFromLocation(flatStorageLocation: URI, logStorageLocation: URI | undefined, sessionId: string): Promise<ISerializedChatDataReference | undefined> {
		let fromLocation = flatStorageLocation;
		let rawData: VSBuffer | undefined;

		if (logStorageLocation) {
			try {
				rawData = (await this.fileService.readFile(logStorageLocation)).value;
				fromLocation = logStorageLocation;
			} catch (e) {
				this.reportError('sessionReadFile', `Error reading log chat session file ${sessionId}`, e);
			}
		}

		if (!rawData) {
			try {
				rawData = (await this.fileService.readFile(flatStorageLocation)).value;
				fromLocation = flatStorageLocation;
			} catch (e) {
				this.reportError('sessionReadFile', `Error reading flat chat session file ${sessionId}`, e);

				if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND && this.previousEmptyWindowStorageRoot) {
					rawData = await this.readSessionFromPreviousLocation(sessionId);
				}
			}
		}

		if (!rawData) {
			return undefined;
		}

		try {
			let session: ISerializableChatDataIn;
			const log = new ChatSessionOperationLog();
			if (fromLocation === logStorageLocation) {
				session = revive(log.read(rawData));
			} else {
				session = revive(JSON.parse(rawData.toString()));
			}

			// TODO Copied from ChatService.ts, cleanup
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

			return { value: normalizeSerializableChatData(session), serializer: log };
		} catch (err) {
			this.reportError('malformedSession', `Malformed session data in ${fromLocation.fsPath}: [${rawData.slice(0, 20).toString()}${rawData.byteLength > 20 ? '...' : ''}]`, err);
			return undefined;
		}
	}

	private async readSessionFromPreviousLocation(sessionId: string): Promise<VSBuffer | undefined> {
		let rawData: VSBuffer | undefined;

		if (this.previousEmptyWindowStorageRoot) {
			const storageLocation2 = getChatSessionStorageResource(this.previousEmptyWindowStorageRoot, sessionId, '.json');
			try {
				rawData = (await this.fileService.readFile(storageLocation2)).value;
				this.logService.info(`ChatSessionStore: Read chat session ${sessionId} from previous location`);
			} catch (e) {
				this.reportError('sessionReadFile', `Error reading chat session file ${sessionId} from previous location`, e);
				return undefined;
			}
		}

		return rawData;
	}

	private getStorageLocation(chatSessionId: string): {
		/** <1.109 flat JSON file */
		flat: URI;
		/** >=1.109 append log */
		log?: URI;
	} {
		const storageRoot = this.getStorageRoot(this.internalGetIndex().entries[chatSessionId]);
		return {
			flat: getChatSessionStorageResource(storageRoot, chatSessionId, '.json'),
			// todo@connor4312: remove after stabilizing
			log: this.configurationService.getValue('chat.useLogSessionStorage') !== false ? getChatSessionStorageResource(storageRoot, chatSessionId, '.jsonl') : undefined,
		};
	}

	private getTransferredSessionStorageLocation(sessionResource: URI): URI {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (!sessionId) {
			throw new Error(`Invalid local chat session resource: ${sessionResource.toString()}`);
		}
		return getChatSessionStorageResource(this.transferredSessionStorageRoot, sessionId, '.json');
	}

	/**
	 * Synchronously update the in-memory index entries for the given sessions
	 * and flush the index to storage. This ensures the index is persisted
	 * even when called from a synchronous `onWillSaveState` handler where
	 * async file-write work would complete after the storage service has
	 * already flushed.
	 */
	updateAndFlushIndexSync(localSessions: ChatModel[], externalSessions: ChatModel[]): void {
		if (this.changingProfile) {
			return;
		}
		for (const session of localSessions) {
			if (this.isSessionDeleted(session.sessionId)) {
				continue;
			}
			const existing = this.internalGetIndex().entries[session.sessionId];
			this.setIndexEntry(session.sessionId, {
				...getSessionMetadataSync(session, existing?.workspaceId ?? this.workspaceId, this.getWorkspaceLabel(existing), existing?.isEmptyWindow ?? this.isEmptyWindow),
				isPinned: existing?.isPinned ?? this.pinnedSessionIds.has(session.sessionId),
			});
		}
		for (const session of externalSessions) {
			const externalSessionId = session.sessionResource.toString();
			if (this.isSessionDeleted(externalSessionId)) {
				continue;
			}
			const existing = this.internalGetIndex().entries[externalSessionId];
			this.setIndexEntry(externalSessionId, {
				...getSessionMetadataSync(session, existing?.workspaceId ?? this.workspaceId, this.getWorkspaceLabel(existing), existing?.isEmptyWindow ?? this.isEmptyWindow),
				isPinned: existing?.isPinned ?? this.pinnedSessionIds.has(externalSessionId),
			});
		}
		try {
			this.flushIndexSync();
		} catch (e) {
			this.reportError('indexWrite', 'Error writing index synchronously', e);
		}
	}

	private flushIndexSync(): void {
		this.indexCache = undefined;
		const index = this.internalGetIndex();
		const entriesToStore = this.needsProfileIndexMigration ? Object.entries(index.entries) : Array.from(this.pendingIndexEntries);
		if (entriesToStore.length === 0 && this.deletedSessionIds.size === 0 && !this.needsProfileIndexMigration) {
			return;
		}
		this.isWritingIndex = true;
		try {
			this.storageService.storeAll([
				...entriesToStore.map(([sessionId, metadata]) => ({
					key: ChatIndexEntryStorageKeyPrefix + encodeURIComponent(sessionId),
					value: JSON.stringify(metadata),
					scope: this.getIndexStorageScope(),
					target: StorageTarget.MACHINE,
				})),
				...Array.from(this.deletedSessionIds, sessionId => ({
					key: ChatIndexEntryStorageKeyPrefix + encodeURIComponent(sessionId),
					value: DeletedChatIndexEntry,
					scope: this.getIndexStorageScope(),
					target: StorageTarget.MACHINE,
				})),
				...Array.from(this.deletedSessionIds, sessionId => ({
					key: ChatPinnedStorageKeyPrefix + encodeURIComponent(sessionId),
					value: undefined,
					scope: this.getIndexStorageScope(),
					target: StorageTarget.MACHINE,
				})),
				...(this.needsProfileIndexMigration ? [{
					key: ChatIndexStorageKey,
					value: undefined,
					scope: this.getIndexStorageScope(),
					target: StorageTarget.MACHINE,
				}] : []),
			], false);
			this.pendingIndexEntries.clear();
			this.deletedSessionIds.clear();
			this.needsProfileIndexMigration = false;
			this.indexCache = index;
		} finally {
			this.isWritingIndex = false;
		}
	}

	public getChatStorageFolder(): URI {
		return this.storageRoot;
	}
}

export interface IChatSessionEntryMetadata {
	sessionId: string;
	title: string;
	lastMessageDate: number;
	timing: IChatSessionTiming;
	initialLocation?: ChatAgentLocation;
	hasPendingEdits?: boolean;
	stats?: IChatSessionStats;
	lastResponseState: ResponseModelState;
	isPinned?: boolean;
	/** Workspace in which the session was created. */
	workspaceId?: string;
	/** Whether the session originated in an empty window. */
	isEmptyWindow?: boolean;
	/** Display name of the workspace in which the session was created. */
	workspaceLabel?: string;
	/** Previous local ID retained so session state can follow an ID re-keyed during migration. */
	legacySessionId?: string;

	/**
	 * The working directory URI string associated with this session.
	 * Persisted so it survives window reload in the agents/sessions window.
	 */
	workingDirectory?: string;

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

	/**
	 * The permission level for tool auto-approval, if not default.
	 */
	permissionLevel?: ChatPermissionLevel;

	/**
	 * Serialized draft input state (text, attachments, mode, selected model, ...) for
	 * external sessions, so that unsent input is preserved when switching away and
	 * back. Local sessions instead persist their full state via storeSessions.
	 */
	inputState?: ISerializableChatModelInputState;
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

/**
 * Builds session metadata synchronously from a live ChatModel.
 * Used both by {@link updateAndFlushIndexSync} (where async work is not
 * possible) and by {@link getSessionMetadata} (which layers on async stats).
 */
function getSessionMetadataSync(session: ChatModel, workspaceId?: string, workspaceLabel?: string, isEmptyWindow?: boolean): IChatSessionEntryMetadata {
	const title = session.customTitle || session.title;

	let lastResponseState = session.lastRequest?.response?.state ?? ResponseModelState.Complete;
	if (lastResponseState === ResponseModelState.Pending || lastResponseState === ResponseModelState.NeedsInput) {
		lastResponseState = ResponseModelState.Cancelled;
	}

	const isExternal = !LocalChatSessionUri.parseLocalSessionId(session.sessionResource);
	const rawInputState = isExternal ? session.inputModel.toJSON() : undefined;
	const inputState = rawInputState ? { ...rawInputState, attachments: [] } : undefined;

	return {
		sessionId: session.sessionId,
		title: title || localize('newChat', "New Chat"),
		lastMessageDate: session.lastMessageDate,
		timing: session.timing,
		initialLocation: session.initialLocation,
		hasPendingEdits: session.editingSession?.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified) ?? false,
		isEmpty: session.getRequests().length === 0,
		isExternal,
		lastResponseState,
		workspaceId,
		workspaceLabel,
		isEmptyWindow,
		permissionLevel: session.inputModel.state.get()?.permissionLevel,
		inputState,
		workingDirectory: session.workingDirectory?.toString(),
	};
}

async function getSessionMetadata(session: ChatModel | ISerializableChatData, workspaceId?: string, workspaceLabel?: string, isEmptyWindow?: boolean): Promise<IChatSessionEntryMetadata> {
	if (session instanceof ChatModel) {
		const metadata = getSessionMetadataSync(session, workspaceId, workspaceLabel, isEmptyWindow);
		metadata.stats = await awaitStatsForSession(session);
		return metadata;
	}

	// ISerializableChatData — only used in the old pre-fs storage data migration scenario
	const lastMessageDate = session.requests.at(-1)?.timestamp ?? session.creationDate;

	return {
		sessionId: session.sessionId,
		title: session.customTitle || localize('newChat', "New Chat"),
		lastMessageDate,
		timing: {
			created: session.creationDate,
			lastRequestStarted: session.requests.at(-1)?.timestamp,
			lastRequestEnded: lastMessageDate,
		},
		initialLocation: session.initialLocation,
		hasPendingEdits: false,
		isEmpty: session.requests.length === 0,
		isExternal: false,
		lastResponseState: ResponseModelState.Complete,
		workspaceId,
		workspaceLabel,
		isEmptyWindow,
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
