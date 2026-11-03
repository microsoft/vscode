/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { hashAsync } from '../../../../../base/common/hash.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IReference } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { basename, dirname, extUriBiasedIgnorePathCase, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { isObject } from '../../../../../base/common/types.js';
import { isUriComponents, URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IAnyWorkspaceIdentifier, isEmptyWorkspaceIdentifier, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { getStatsForSession } from '../chat.js';
import { IChatSessionStats, IChatSessionTiming, ResponseModelState } from '../chatService/chatService.js';
import { ChatAgentLocation, ChatPermissionLevel } from '../constants.js';
import { ChatEditingSessionState, ModifiedFileEntryState } from '../editing/chatEditingService.js';
import { ChatModel, IChatModelInputState, ISerializableChatData, ISerializableChatDataIn, ISerializableChatModelInputState, ISerializableChatsData, ISerializedChatDataReference, isSerializableSessionData, normalizeSerializableChatData } from './chatModel.js';
import { ChatSessionOperationLog } from './chatSessionOperationLog.js';
import { getChatSessionStorageResource, LocalChatSessionUri } from './chatUri.js';
import { stringifyEntryWithFallback } from './objectMutationLog.js';
import { ChatBinaryUnavailableError, ChatSessionResources, ChatStorageCorruptionError, cloneChatData, getStoredChatBinaryDescriptors, hasChatBinaryPayload, IStoredBinary, markStoredChatBinaryResourcesUnavailable, retainChatBinaryReferences, writeChatSessionFile } from './chatSessionResources.js';
import { chatResourceLockKey, IChatSessionResourceLocks } from './chatSessionResourceLocks.js';
import type { IChatDraft } from '../attachments/chatDraft.js';
import type { IChatRequestVariableEntry } from '../attachments/chatVariableEntries.js';

const maxPersistedSessions = 400;

const ChatIndexStorageKey = 'chat.ChatSessionStore.index';
const ChatTransferIndexStorageKey = 'ChatSessionStore.transferIndex';

export const IChatSessionStore = createDecorator<IChatSessionStore>('chatSessionStore');

export const enum ChatStorageOwner {
	InputHistory = 'inputHistory',
	EmptyDraftAttachments = 'emptyDraftAttachments',
	NewSessionDraft = 'newSessionDraft',
}

export interface IChatOwnedStorageData {
	[ChatStorageOwner.InputHistory]: { history?: Record<string, IChatModelInputState[]> };
	[ChatStorageOwner.EmptyDraftAttachments]: readonly IChatRequestVariableEntry[];
	[ChatStorageOwner.NewSessionDraft]: IChatDraft;
}

function isChatOwnedStorageValue(owner: ChatStorageOwner, value: unknown): boolean {
	if (owner === ChatStorageOwner.EmptyDraftAttachments) {
		return Array.isArray(value) && value.every(isObject);
	}
	if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	if (owner === ChatStorageOwner.NewSessionDraft) {
		return typeof record.inputText === 'string' && Array.isArray(record.attachments) && record.attachments.every(isObject);
	}
	if (record.history === undefined) {
		return true;
	}
	return isObject(record.history) && Object.values(record.history).every((entries: unknown) => Array.isArray(entries) && entries.every((entry: unknown) => {
		if (!isObject(entry)) {
			return false;
		}
		const item = entry as Record<string, unknown>;
		return item.inputText !== undefined
			? typeof item.inputText === 'string' && Array.isArray(item.attachments) && item.attachments.every(isObject)
			: typeof item.text === 'string';
	}));
}

export interface IChatSessionStore {
	readonly _serviceBrand: undefined;
	readonly onDidInvalidateOwnedData: Event<ChatStorageOwner>;
	storeSessions(sessions: ChatModel[]): Promise<void>;
	storeSessionsMetadataOnly(sessions: ChatModel[]): Promise<void>;
	storeTransferSession(transferData: IChatTransfer, session: ChatModel): Promise<void>;
	getTransferredSessionData(): URI | undefined;
	readTransferredSession(sessionResource: URI): Promise<ISerializedChatDataReference | undefined>;
	hasSessions(): boolean;
	isSessionEmpty(sessionId: string): boolean;
	deleteSession(sessionId: string): Promise<void>;
	clearAllSessions(): Promise<void>;
	setSessionTitle(sessionId: string, title: string): Promise<void>;
	getIndex(): Promise<IChatSessionIndex>;
	getMetadataForSessionSync(sessionResource: URI): IChatSessionEntryMetadata | undefined;
	logIndex(): void;
	migrateDataIfNeeded(getInitialData: () => ISerializableChatsData | undefined): Promise<void>;
	readSession(sessionId: string): Promise<ISerializedChatDataReference | undefined>;
	updateAndFlushIndexSync(localSessions: ChatModel[], externalSessions: ChatModel[]): void;
	getChatStorageFolder(): URI;
	readOwnedData<K extends ChatStorageOwner>(owner: K): Promise<IReference<IChatOwnedStorageData[K]> | undefined>;
	writeOwnedData<K extends ChatStorageOwner>(owner: K, value: IChatOwnedStorageData[K]): Promise<IReference<IChatOwnedStorageData[K]>>;
}

export class ChatSessionStore extends Disposable implements IChatSessionStore {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidInvalidateOwnedData = this._register(new Emitter<ChatStorageOwner>());
	readonly onDidInvalidateOwnedData = this._onDidInvalidateOwnedData.event;
	private storageRoot: URI;
	private inputStorageRoot: URI;
	private readonly pendingInputMigrations = new Map<ChatStorageOwner, URI>();
	private readonly previousEmptyWindowStorageRoot: URI | undefined;
	private readonly transferredSessionStorageRoot: URI;

	private readonly storeQueue = new Sequencer();

	private storeTask: Promise<void> | undefined;
	private readonly pendingOperations = new Set<Promise<unknown>>();
	private shuttingDown = false;
	private readonly resources: ChatSessionResources;
	private readonly cleanupRoot: URI;
	private synchronization: readonly string[] = [];
	private synchronizedRoots: readonly URI[] = [];
	private readonly cleanupTickets = new Set<string>();
	private readonly cleanupScheduler = this._register(new RunOnceScheduler(() => {
		void this.recoverResources().catch(error => this.reportError('sessionResourceCleanup', 'Error recovering chat resources', error));
	}, 5000));

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IChatSessionResourceLocks private readonly resourceLocks: IChatSessionResourceLocks,
	) {
		super();

		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = this.workspaceContextService.getWorkspace().id;
		this.storageRoot = this.workspaceStorageRoot(workspaceId, isEmptyWindow);
		this.inputStorageRoot = this.workspaceInputStorageRoot(workspaceId);

		this.previousEmptyWindowStorageRoot = isEmptyWindow ?
			joinPath(this.environmentService.workspaceStorageHome, 'no-workspace', 'chatSessions') :
			undefined;

		this.transferredSessionStorageRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'transferredChatSessions');
		this.cleanupRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'chatResourceCleanup');
		this.resources = this._register(new ChatSessionResources({
			beforeWrite: directory => this.markForCleanup(directory),
			onUnused: () => {
				if (!this.shuttingDown && !this._store.isDisposed) {
					this.cleanupScheduler.schedule(0);
				}
			},
			synchronization: () => this.synchronization,
		}, this.fileService, this.logService, this.resourceLocks));

		// Listen to workspace transitions to migrate chat sessions
		this._register(this.workspaceEditingService.onDidEnterWorkspace(event => {
			const nextRoot = this.workspaceStorageRoot(event.newWorkspace.id, isEmptyWorkspaceIdentifier(event.newWorkspace));
			const transitionPromise = this.queueOperation(() => this.handleWorkspaceTransition(event.oldWorkspace, event.newWorkspace), [nextRoot, this.workspaceInputStorageRoot(event.newWorkspace.id)]);
			event.join(transitionPromise);
		}));
		this._register(this.storageService.onWillSaveState(() => this.retryOwnedInputMigrations()));

		this._register(this.lifecycleService.onWillShutdown(e => {
			this.retryOwnedInputMigrations();
			this.shuttingDown = true;
			if (!this.storeTask && !this.pendingOperations.size) {
				return;
			}
			e.join(Promise.all([...this.pendingOperations]).then(() => { }), {
				id: 'join.chatSessionStore',
				label: localize('join.chatSessionStore', "Saving chat history")
			});
		}));
	}

	private workspaceStorageRoot(id: string, empty: boolean): URI {
		return empty ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions')
			: joinPath(this.environmentService.workspaceStorageHome, id, 'chatSessions');
	}

	private workspaceInputStorageRoot(id: string): URI {
		return joinPath(this.environmentService.workspaceStorageHome, id, 'chatSessions', '.input');
	}

	private queueOperation<T>(task: () => Promise<T>, additionalRoots: readonly URI[] = []): Promise<T> {
		const operation = this.storeQueue.queue(() => this.resourceLocks.exclusive(chatResourceLockKey('mutation', this.environmentService.workspaceStorageHome), async () => {
			const roots = [this.storageRoot, this.inputStorageRoot, this.transferredSessionStorageRoot, this.cleanupRoot, ...additionalRoots, ...(this.previousEmptyWindowStorageRoot ? [this.previousEmptyWindowStorageRoot] : [])]
				.filter((root, index, all) => !all.some((other, otherIndex) => otherIndex !== index && extUriBiasedIgnorePathCase.isEqualOrParent(root, other) && (otherIndex < index || !isEqual(root, other))));
			const tokens: string[] = [];
			for (const root of roots) {
				const token = await this.fileService.synchronize(root);
				if (token) {
					tokens.push(token);
				}
			}
			this.synchronization = tokens;
			this.synchronizedRoots = roots;
			this.cleanupTickets.clear();
			try {
				return await task();
			} finally {
				this.synchronization = [];
				this.synchronizedRoots = [];
			}
		}));
		this.pendingOperations.add(operation);
		void operation.then(() => this.pendingOperations.delete(operation), () => this.pendingOperations.delete(operation));
		return operation;
	}

	private async synchronizeAdditionalRoot(root: URI): Promise<void> {
		if (!this.synchronizedRoots.some(scope => extUriBiasedIgnorePathCase.isEqualOrParent(root, scope))) {
			const token = await this.fileService.synchronize(root);
			this.synchronizedRoots = [...this.synchronizedRoots, root];
			if (token) {
				this.synchronization = [...this.synchronization, token];
			}
		}
	}

	async readOwnedData<K extends ChatStorageOwner>(owner: K): Promise<IReference<IChatOwnedStorageData[K]> | undefined> {
		return this.queueOperation(async () => {
			const source = this.pendingInputMigrations.get(owner);
			if (source && !await this.migrateOwnedInputOwner(owner, source)) {
				throw new Error(localize('chat.inputMigrationFailed', "Could not move the saved chat input. The original data has been retained."));
			}
			const root = this.inputStorageRoot;
			let content: VSBuffer;
			try {
				content = (await this.fileService.readFile(getChatSessionStorageResource(root, owner, '.json'))).value;
			} catch (error) {
				if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
					return undefined;
				}
				throw error;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(content.toString());
			} catch (error) {
				if (error instanceof SyntaxError) {
					throw new ChatStorageCorruptionError('Invalid owned chat input JSON');
				}
				throw error;
			}
			const data = revive(parsed) as { version?: number; value?: IChatOwnedStorageData[K] } | undefined;
			if (data && Object.hasOwn(data, 'version') && data.version !== 1) {
				throw new Error('Unsupported owned chat input version');
			}
			if (!data || data.version !== 1 || !Object.hasOwn(data, 'value') || !isChatOwnedStorageValue(owner, data.value)) {
				throw new ChatStorageCorruptionError('Invalid owned chat input data');
			}
			const value = this.resources.restore(data.value!, getChatSessionStorageResource(root, owner, '.resources'));
			const lease = await this.resources.pinForRead(value);
			return Object.assign(lease, { object: value });
		});
	}

	async writeOwnedData<K extends ChatStorageOwner>(owner: K, value: IChatOwnedStorageData[K]): Promise<IReference<IChatOwnedStorageData[K]>> {
		const snapshot = cloneChatData({ version: 1, value });
		const lease = retainChatBinaryReferences(snapshot);
		try {
			return await this.queueOperation(async () => {
				const root = this.inputStorageRoot;
				const directory = getChatSessionStorageResource(root, owner, '.resources');
				let committed = false;
				try {
					const prepared = await this.resources.prepare(snapshot, directory);
					await this.markForCleanup(directory);
					await writeChatSessionFile(this.fileService, getChatSessionStorageResource(root, owner, '.json'), VSBuffer.fromString(stringifyEntryWithFallback(prepared.value)), this.synchronization);
					committed = true;
					this.pendingInputMigrations.delete(owner);
					this.resources.confirmWrite(directory, prepared.hashes);
					const stored = this.resources.restore(prepared.value.value, directory);
					const resultLease = await this.resources.pinForRead(stored);
					try {
						await this.collectResources(directory);
					} catch (error) {
						resultLease.dispose();
						throw error;
					}
					return Object.assign(resultLease, { object: stored });
				} catch (error) {
					this.reportError('inputWrite', 'Error writing owned chat input data', error);
					if (!committed) {
						await this.collectResources(directory, true);
					}
					throw error;
				}
			});
		} finally {
			lease.dispose();
		}
	}

	private async markForCleanup(directory: URI): Promise<void> {
		const key = directory.toString();
		if (this.cleanupTickets.has(key)) {
			return;
		}
		await writeChatSessionFile(this.fileService, await this.cleanupTicket(directory), VSBuffer.fromString(JSON.stringify(directory)), this.synchronization);
		this.cleanupTickets.add(key);
		this.cleanupScheduler.schedule();
	}

	private async cleanupTicket(directory: URI): Promise<URI> {
		return joinPath(this.cleanupRoot, `${await hashAsync(directory.toString())}.json`);
	}

	private validateResourceDirectory(directory: URI): void {
		const directoryRoot = dirname(directory);
		let root = directoryRoot;
		const id = basename(directory).slice(0, -'.resources'.length);
		if (basename(root) === '.input') {
			if (id !== ChatStorageOwner.InputHistory && id !== ChatStorageOwner.EmptyDraftAttachments && id !== ChatStorageOwner.NewSessionDraft) {
				throw new Error('Invalid chat input storage owner');
			}
			root = dirname(root);
		}
		const workspaceRoot = dirname(dirname(root));
		const workspaceDirectory = dirname(root);
		if ((!isEqual(root, joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions'))
			&& !isEqual(root, this.transferredSessionStorageRoot)
			&& (!isEqual(workspaceRoot, this.environmentService.workspaceStorageHome) || basename(root) !== 'chatSessions' || !basename(workspaceDirectory)))
			|| !basename(directory).endsWith('.resources') || directory.query || directory.fragment) {
			throw new Error('Invalid chat resource cleanup directory');
		}
		if (!isEqual(directory, getChatSessionStorageResource(directoryRoot, id, '.resources'))) {
			throw new Error('Invalid chat resource cleanup directory');
		}
	}

	private async storedResourceDescriptors(directory: URI): Promise<ReadonlyMap<string, IStoredBinary>> {
		this.validateResourceDirectory(directory);
		const descriptors = new Map<string, IStoredBinary>();
		const sessionId = basename(directory).slice(0, -'.resources'.length);
		for (const extension of ['.json', '.jsonl'] as const) {
			const location = getChatSessionStorageResource(dirname(directory), sessionId, extension);
			let content: VSBuffer;
			try {
				content = (await this.fileService.readFile(location)).value;
			} catch (error) {
				if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
					continue;
				}
				throw error;
			}
			const data = extension === '.jsonl' ? new ChatSessionOperationLog().read(content) : JSON.parse(content.toString());
			for (const [hash, info] of getStoredChatBinaryDescriptors(data)) {
				const previous = descriptors.get(hash);
				if (previous && previous.size !== info.size) {
					throw new ChatStorageCorruptionError('Inconsistent chat binary descriptor');
				}
				descriptors.set(hash, info);
			}
		}
		return descriptors;
	}

	private async collectResources(directory: URI, rollback = false): Promise<void> {
		this.validateResourceDirectory(directory);
		await this.synchronizeAdditionalRoot(dirname(directory));
		if (rollback) {
			this.resources.cancelWrite(directory);
		}
		const hashes = new Set((await this.storedResourceDescriptors(directory)).keys());
		const complete = await this.resources.collect(directory, hashes);
		const id = basename(directory).slice(0, -'.resources'.length);
		for (const extension of ['.json', '.jsonl'] as const) {
			const metadata = getChatSessionStorageResource(dirname(directory), id, extension);
			const temporary = metadata.with({ path: `${metadata.path}.tmp` });
			try {
				await this.fileService.del(temporary, { synchronization: this.synchronization });
			} catch (error) {
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					throw error;
				}
			}
		}
		if (complete) {
			const ticket = await this.cleanupTicket(directory);
			if (await this.fileService.exists(ticket)) {
				await this.fileService.del(ticket, { synchronization: this.synchronization });
			}
			this.cleanupTickets.delete(directory.toString());
		} else {
			await this.markForCleanup(directory);
		}
	}

	private async recoverResources(): Promise<void> {
		if (!this.resourceLocks.available) {
			return;
		}
		const tickets = await this.queueOperation(async () => {
			try {
				return (await this.fileService.resolve(this.cleanupRoot)).children ?? [];
			} catch (error) {
				if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
					return [];
				}
				throw error;
			}
		});
		for (const ticket of tickets) {
			if (this.shuttingDown || this._store.isDisposed) {
				return;
			}
			await this.queueOperation(async () => {
				try {
					if (!ticket.isDirectory && /^[a-f0-9]+\.json$/.test(ticket.name)) {
						const components: unknown = JSON.parse((await this.fileService.readFile(ticket.resource)).value.toString());
						if (!isUriComponents(components)) {
							throw new Error('Invalid chat resource cleanup directory');
						}
						const directory = URI.from(components, true);
						this.validateResourceDirectory(directory);
						if (!isEqual(ticket.resource, await this.cleanupTicket(directory))) {
							throw new Error('Invalid chat resource cleanup ticket');
						}
						if (isEqual(dirname(directory), this.transferredSessionStorageRoot)) {
							const sessionId = basename(directory).slice(0, -'.resources'.length);
							const index = await this.readTransferIndex();
							if (!Object.values(index).some(entry => LocalChatSessionUri.parseLocalSessionId(URI.revive(entry.sessionResource)) === sessionId)) {
								const metadata = getChatSessionStorageResource(this.transferredSessionStorageRoot, sessionId, '.json');
								if (await this.fileService.exists(metadata)) {
									await this.fileService.del(metadata, { synchronization: this.synchronization });
								}
							}
						}
						await this.collectResources(directory);
					}
				} catch (error) {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
						this.reportError('sessionResourceCleanup', 'Error recovering chat resources', error);
					}
				}
			});
		}
		if (tickets.length && !this.shuttingDown && !this._store.isDisposed) {
			this.cleanupScheduler.schedule(30000);
		}
	}

	private async handleWorkspaceTransition(oldWorkspace: IAnyWorkspaceIdentifier, newWorkspace: IAnyWorkspaceIdentifier): Promise<void> {
		if (!this.resourceLocks.available) {
			throw new Error(localize('chat.storageMigrationLocksUnavailable', "Moving saved chat sessions requires a secure browser context with cross-window storage locks."));
		}
		const wasEmptyWindow = isEmptyWorkspaceIdentifier(oldWorkspace);
		const isNewWorkspaceEmpty = isEmptyWorkspaceIdentifier(newWorkspace);
		const oldWorkspaceId = oldWorkspace.id;
		const newWorkspaceId = newWorkspace.id;

		this.logService.info(`ChatSessionStore: Workspace transition from ${oldWorkspaceId} to ${newWorkspaceId}`);

		// Determine the old storage location based on the old workspace
		const oldStorageRoot = this.workspaceStorageRoot(oldWorkspaceId, wasEmptyWindow);
		await this.synchronizeAdditionalRoot(oldStorageRoot);
		const oldInputRoot = this.workspaceInputStorageRoot(oldWorkspaceId);
		await this.synchronizeAdditionalRoot(oldInputRoot);

		// Determine the new storage location based on the new workspace
		const newStorageRoot = this.workspaceStorageRoot(newWorkspaceId, isNewWorkspaceEmpty);

		this.storageRoot = newStorageRoot;
		this.inputStorageRoot = this.workspaceInputStorageRoot(newWorkspaceId);
		this.indexCache = undefined;

		if (!isEqual(oldStorageRoot, newStorageRoot)) {
			await this.migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty);
		}
		await this.migrateOwnedInput(oldInputRoot);
	}

	private async migrateOwnedInput(oldInput: URI): Promise<void> {
		for (const owner of [ChatStorageOwner.InputHistory, ChatStorageOwner.EmptyDraftAttachments, ChatStorageOwner.NewSessionDraft]) {
			await this.migrateOwnedInputOwner(owner, this.pendingInputMigrations.get(owner) ?? oldInput);
		}
	}

	private async migrateOwnedInputOwner(owner: ChatStorageOwner, oldInput: URI): Promise<boolean> {
		try {
			if (!isEqual(oldInput, this.inputStorageRoot)) {
				await this.synchronizeAdditionalRoot(oldInput);
				const source = getChatSessionStorageResource(oldInput, owner, '.json');
				const target = getChatSessionStorageResource(this.inputStorageRoot, owner, '.json');
				if (await this.fileService.exists(source) && !await this.fileService.exists(target)) {
					const directory = getChatSessionStorageResource(this.inputStorageRoot, owner, '.resources');
					await this.markForCleanup(directory);
					const sourceDirectory = getChatSessionStorageResource(oldInput, owner, '.resources');
					const unavailable = await this.copyResourceDirectory(sourceDirectory, directory);
					await this.copyMigratedMetadata(source, target, unavailable);
				}
			}
			this.pendingInputMigrations.delete(owner);
			return true;
		} catch (error) {
			this.pendingInputMigrations.set(owner, oldInput);
			this.reportError('inputMigration', 'Error migrating owned chat input data', error);
			this._onDidInvalidateOwnedData.fire(owner);
			return false;
		}
	}

	private retryOwnedInputMigrations(): void {
		if (this.pendingInputMigrations.size) {
			void this.queueOperation(async () => {
				for (const [owner, source] of this.pendingInputMigrations) {
					await this.migrateOwnedInputOwner(owner, source);
				}
			}).catch(error => this.reportError('inputMigration', 'Error retrying owned chat input migration', error));
		}
	}

	private async copyResourceDirectory(source: URI, target: URI): Promise<ReadonlyMap<string, ChatBinaryUnavailableError['reason']>> {
		const unavailable = new Map<string, ChatBinaryUnavailableError['reason']>();
		for (const info of (await this.storedResourceDescriptors(source)).values()) {
			const reason = await this.resources.copyStoredBlob(info, source, target);
			if (reason) {
				unavailable.set(info.sha256, reason);
			}
		}
		return unavailable;
	}

	private async copyMigratedMetadata(source: URI, target: URI, unavailable: ReadonlyMap<string, ChatBinaryUnavailableError['reason']>): Promise<void> {
		const temporary = target.with({ path: `${target.path}.tmp` });
		const options = { synchronization: this.synchronization };
		if (unavailable.size) {
			const content = (await this.fileService.readFile(source)).value;
			let serialized: VSBuffer;
			if (source.path.endsWith('.jsonl')) {
				const data = new ChatSessionOperationLog().read(content);
				markStoredChatBinaryResourcesUnavailable(data, unavailable);
				serialized = new ChatSessionOperationLog().createInitialFromSerialized(data);
			} else {
				const data: unknown = JSON.parse(content.toString());
				markStoredChatBinaryResourcesUnavailable(data, unavailable);
				serialized = VSBuffer.fromString(stringifyEntryWithFallback(data));
			}
			await this.fileService.writeFile(temporary, serialized, options);
		} else {
			await this.fileService.copy(source, temporary, true, options);
		}
		await this.fileService.move(temporary, target, false, options);
	}

	private async migrateSessionsToNewWorkspace(oldStorageRoot: URI, wasEmptyWindow: boolean, isNewWorkspaceEmpty: boolean): Promise<void> {
		try {
			// Check if old storage location exists
			const oldStorageExists = await this.fileService.exists(oldStorageRoot);
			if (!oldStorageExists) {
				this.logService.info(`ChatSessionStore: Old storage location does not exist, skipping migration`);
				return;
			}

			// Read all session files from old location
			const oldDirectory = await this.fileService.resolve(oldStorageRoot);
			if (!oldDirectory.children) {
				this.logService.info(`ChatSessionStore: No children in old storage location, skipping migration`);
				return;
			}

			this.logService.info(`ChatSessionStore: Found ${oldDirectory.children.length} files in old storage location`);

			// Copy each file to the new location
			let migratedCount = 0;
			const destinationChildren = await this.fileService.exists(this.storageRoot) ? (await this.fileService.resolve(this.storageRoot)).children ?? [] : [];
			const existingSessions = new Set(destinationChildren.filter(child => !child.isDirectory && /\.jsonl?$/.test(child.name)).map(child => child.name.replace(/\.jsonl?$/, '')));
			const copiedResources = new Map<string, ReadonlyMap<string, ChatBinaryUnavailableError['reason']>>();
			for (const child of oldDirectory.children) {
				if (!child.isDirectory && (child.name.endsWith('.json') || child.name.endsWith('.jsonl'))) {
					try {
						const sessionId = child.name.replace(/\.jsonl?$/, '');
						if (existingSessions.has(sessionId)) {
							continue;
						}
						const directory = getChatSessionStorageResource(this.storageRoot, sessionId, '.resources');
						await this.markForCleanup(directory);
						let unavailable = copiedResources.get(sessionId);
						if (!unavailable) {
							const previousDirectory = getChatSessionStorageResource(oldStorageRoot, sessionId, '.resources');
							unavailable = await this.copyResourceDirectory(previousDirectory, directory);
							copiedResources.set(sessionId, unavailable);
						}
						const target = joinPath(this.storageRoot, child.name);
						await this.copyMigratedMetadata(child.resource, target, unavailable);
						migratedCount++;
					} catch (e) {
						if (toFileOperationResult(e) === FileOperationResult.FILE_MOVE_CONFLICT) {
							// File already exists at target - skip as a no-op
							this.logService.trace(`ChatSessionStore: Session file ${child.name} already exists at target, skipping`);
						} else {
							this.reportError('sessionMigration', `Error migrating chat session file ${child.name}`, e);
						}
					}
				}
			}

			this.logService.info(`ChatSessionStore: Copied ${migratedCount} chat session files from ${wasEmptyWindow ? 'empty window' : oldStorageRoot.toString()} to ${isNewWorkspaceEmpty ? 'empty window' : this.storageRoot.toString()} (originals preserved at old location)`);

			try {
				await this.flushIndex();
				await this.storageService.flush();
			} catch (e) {
				this.reportError('migrateWorkspace', 'Error flushing chat session index after workspace migration', e);
			}

		} catch (e) {
			this.reportError('migrateWorkspace', 'Error migrating chat sessions to new workspace', e);
		}
	}

	async storeSessions(sessions: ChatModel[]): Promise<void> {
		if (this.shuttingDown) {
			// Don't start this task if we missed the chance to block shutdown
			return;
		}

		try {
			this.storeTask = this.queueOperation(async () => {
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
			this.storeTask = this.queueOperation(async () => {
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
		await this.queueOperation(async () => {
			const index = await this.readTransferIndex();
			const workspaceKey = transferData.toWorkspace.toString();
			const existingTransfer = index[workspaceKey];
			const resourceDirectory = getChatSessionStorageResource(this.transferredSessionStorageRoot, session.sessionId, '.resources');
			let committed = false;
			try {
				const snapshot = session instanceof ChatModel ? ChatSessionOperationLog.snapshot(session, false) : session;
				const prepared = hasChatBinaryPayload(snapshot)
					? await this.resources.prepare(cloneChatData(snapshot), resourceDirectory)
					: { value: session instanceof ChatModel ? ChatSessionOperationLog.serialize(session) : cloneChatData(snapshot), hashes: new Set<string>() };
				const storageLocation = this.getTransferredSessionStorageLocation(session.sessionResource);
				await this.markForCleanup(resourceDirectory);
				await writeChatSessionFile(this.fileService, storageLocation, VSBuffer.fromString(stringifyEntryWithFallback(prepared.value)), this.synchronization);
				committed = true;
				this.resources.confirmWrite(resourceDirectory, prepared.hashes);
				index[workspaceKey] = transferData;
				await this.writeTransferIndex(index);
				await this.collectResources(resourceDirectory);
				const existingResource = existingTransfer && URI.revive(existingTransfer.sessionResource);
				const existingId = existingResource && LocalChatSessionUri.parseLocalSessionId(existingResource);
				if (existingId && existingId !== session.sessionId && !Object.values(index).some(transfer => isEqual(URI.revive(transfer.sessionResource), existingResource))) {
					const existingDirectory = getChatSessionStorageResource(this.transferredSessionStorageRoot, existingId, '.resources');
					await this.markForCleanup(existingDirectory);
					await this.fileService.del(this.getTransferredSessionStorageLocation(existingResource), { synchronization: this.synchronization });
					await this.collectResources(existingDirectory);
				}
			} catch (e) {
				this.reportError('storeTransferSession', 'Error storing chat transfer session', e);
				if (!committed) {
					try {
						await this.collectResources(resourceDirectory, true);
					} catch (cleanupError) {
						this.reportError('sessionResourceCleanup', 'Error cleaning up uncommitted chat transfer resources', cleanupError);
					}
				}
				throw e;
			}
		});
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

	private async readTransferIndex(): Promise<IChatTransferIndex> {
		try {
			const index: unknown = revive(JSON.parse((await this.fileService.readFile(joinPath(this.transferredSessionStorageRoot, 'index.json'))).value.toString()));
			if (!index || typeof index !== 'object' || Array.isArray(index)) {
				throw new Error('Invalid chat transfer index');
			}
			const result: IChatTransferIndex = Object.create(null);
			for (const [key, value] of Object.entries(index)) {
				if (!value || typeof value !== 'object' || Array.isArray(value)) {
					throw new Error('Invalid chat transfer index entry');
				}
				const entry = value as Record<string, unknown>;
				if (!URI.isUri(entry.toWorkspace) || !URI.isUri(entry.sessionResource) || typeof entry.timestampInMilliseconds !== 'number'
					|| !Number.isFinite(entry.timestampInMilliseconds) || !LocalChatSessionUri.parseLocalSessionId(entry.sessionResource)) {
					throw new Error('Invalid chat transfer index entry');
				}
				result[key] = { toWorkspace: URI.from(entry.toWorkspace), sessionResource: URI.from(entry.sessionResource), timestampInMilliseconds: entry.timestampInMilliseconds };
			}
			return result;
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
			return this.getTransferredSessionIndex();
		}
	}

	private async writeTransferIndex(index: IChatTransferIndex): Promise<void> {
		await writeChatSessionFile(this.fileService, joinPath(this.transferredSessionStorageRoot, 'index.json'), VSBuffer.fromString(JSON.stringify(index)), this.synchronization);
		this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
		await this.storageService.flush();
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
				void this.queueOperation(() => this.cleanupExpiredTransfers()).catch(error => this.reportError('cleanupTransferredSession', 'Error cleaning up expired chat transfer', error));
				return undefined;
			}
			return !!LocalChatSessionUri.parseLocalSessionId(revivedTransferData.sessionResource) && revivedTransferData.sessionResource;
		} catch (e) {
			this.reportError('getTransferredSession', 'Error getting transferred chat session URI', e);
			return undefined;
		}
	}

	async readTransferredSession(sessionResource: URI): Promise<ISerializedChatDataReference | undefined> {
		return this.queueOperation(() => this.doReadTransferredSession(sessionResource));
	}

	private async doReadTransferredSession(sessionResource: URI): Promise<ISerializedChatDataReference | undefined> {
		try {
			const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
			const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
			if (!sessionId) {
				return undefined;
			}

			const sessionData = await this.readSessionFromLocation(storageLocation, undefined, sessionId);
			try {
				if (!sessionData || !isSerializableSessionData(sessionData.value) || !await this.writeSession(sessionData.value)) {
					throw new Error('Unable to persist transferred chat session');
				}
			} finally {
				sessionData?.resources?.dispose();
			}
			await this.flushIndex();
			await this.storageService.flush();
			const target = this.getStorageLocation(sessionId);
			const result = await this.readSessionFromLocation(target.flat, target.log, sessionId);
			if (!result) {
				throw new Error('Unable to reload transferred chat session');
			}
			await this.cleanupTransferredSession(sessionResource);
			return result;
		} catch (e) {
			this.reportError('getTransferredSession', 'Error getting transferred chat session', e);
			return undefined;
		}
	}

	private async cleanupTransferredSession(sessionResource: URI): Promise<void> {
		try {
			// Remove from index
			const index = await this.readTransferIndex();
			const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
			if (workspaceFolders.length === 1) {
				const workspaceKey = workspaceFolders[0].uri.toString();
				if (isEqual(URI.revive(index[workspaceKey]?.sessionResource), sessionResource)) {
					delete index[workspaceKey];
					await this.writeTransferIndex(index);
				}
			}
			if (Object.values(index).some(transfer => isEqual(URI.revive(transfer.sessionResource), sessionResource))) {
				return;
			}

			// Delete the transferred session file
			const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
			const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource)!;
			const directory = getChatSessionStorageResource(this.transferredSessionStorageRoot, sessionId, '.resources');
			await this.markForCleanup(directory);
			await this.fileService.del(storageLocation, { synchronization: this.synchronization });
			await this.collectResources(directory);
		} catch (e) {
			if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
				this.reportError('cleanupTransferredSession', 'Error cleaning up transferred session', e);
			}
		}
	}

	private _didReportIssue = false;

	private async writeSession(session: ChatModel | ISerializableChatData): Promise<boolean> {
		let committed = false;
		try {
			const index = this.internalGetIndex();
			const storageLocation = this.getStorageLocation(session.sessionId);
			const resourceDirectory = getChatSessionStorageResource(this.storageRoot, session.sessionId, '.resources');
			const snapshot = session instanceof ChatModel ? ChatSessionOperationLog.snapshot(session, false) : session;
			const prepared = hasChatBinaryPayload(snapshot)
				? await this.resources.prepare(cloneChatData(snapshot), resourceDirectory)
				: { value: session instanceof ChatModel ? ChatSessionOperationLog.serialize(session) : cloneChatData(snapshot), hashes: new Set<string>() };
			prepared.value.binaryResourcesVersion = 1;
			let replaced = true;
			if (storageLocation.log) {
				if (session instanceof ChatModel) {
					if (!session.dataSerializer || !await this.fileService.exists(storageLocation.log)) {
						session.dataSerializer = new ChatSessionOperationLog();
					}

					let op: 'append' | 'replace';
					let data: VSBuffer;
					try {
						({ op, data } = session.dataSerializer.writeSerialized(prepared.value));
						replaced = op === 'replace';
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
						if (prepared.hashes.size > 0 || await this.fileService.exists(resourceDirectory)) {
							// Binary sessions commit a complete reference snapshot atomically.
							const replacement = new ChatSessionOperationLog();
							data = replacement.createInitialFromSerialized(prepared.value);
							op = 'replace';
							replaced = true;
							await this.markForCleanup(resourceDirectory);
							await writeChatSessionFile(this.fileService, storageLocation.log, data, this.synchronization);
							session.dataSerializer = replacement;
						} else {
							if (op === 'append') {
								await this.fileService.writeFile(storageLocation.log, data, { append: true, synchronization: this.synchronization });
							} else {
								await writeChatSessionFile(this.fileService, storageLocation.log, data, this.synchronization);
							}
						}
					}
					session.dataSerializer.confirmWrite();
				} else {
					const content = new ChatSessionOperationLog().createInitialFromSerialized(prepared.value);
					await this.markForCleanup(resourceDirectory);
					await writeChatSessionFile(this.fileService, storageLocation.log, content, this.synchronization);
				}
			} else {
				await this.markForCleanup(resourceDirectory);
				await writeChatSessionFile(this.fileService, storageLocation.flat, VSBuffer.fromString(stringifyEntryWithFallback(prepared.value)), this.synchronization);
				if (session instanceof ChatModel) {
					session.dataSerializer = undefined;
				}
			}
			committed = true;
			this.resources.confirmWrite(resourceDirectory, prepared.hashes);

			// Write succeeded, update index
			const newMetadata = getSessionMetadata(session, index.entries[session.sessionId]?.stats);
			index.entries[session.sessionId] = newMetadata;
			if (replaced) {
				const obsolete = storageLocation.log ? storageLocation.flat : getChatSessionStorageResource(this.storageRoot, session.sessionId, '.jsonl');
				if (await this.fileService.exists(obsolete)) {
					await this.markForCleanup(resourceDirectory);
					await this.fileService.del(obsolete, { synchronization: this.synchronization });
				}
				await this.collectResources(resourceDirectory);
			}
			return true;
		} catch (e) {
			if (session instanceof ChatModel) {
				session.dataSerializer = undefined;
			}
			this.reportError('sessionWrite', 'Error writing chat session', e);
			try {
				if (!committed) {
					await this.collectResources(getChatSessionStorageResource(this.storageRoot, session.sessionId, '.resources'), true);
				}
			} catch (cleanupError) {
				this.reportError('sessionResourceCleanup', 'Error cleaning up uncommitted chat resources', cleanupError);
			}
			return false;
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
			index.entries[externalSessionId] = getSessionMetadata(session, index.entries[externalSessionId]?.stats);
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
			throw e;
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
		let storageLocation: ReturnType<ChatSessionStore['getStorageLocation']>;
		try {
			storageLocation = this.getStorageLocation(sessionId);
		} catch (e) {
			this.reportError('invalidSessionId', `Removing invalid chat session from index: ${sessionId}`, e);
			delete index.entries[sessionId];
			return;
		}
		let deleted = true;
		const directory = getChatSessionStorageResource(this.storageRoot, sessionId, '.resources');
		await this.markForCleanup(directory);
		for (const uri of [storageLocation.flat, getChatSessionStorageResource(this.storageRoot, sessionId, '.jsonl')]) {
			try {
				if (uri) {
					await this.fileService.del(uri, { synchronization: this.synchronization });
				}
			} catch (e) {
				if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
					this.reportError('sessionDelete', 'Error deleting chat session', e);
					deleted = false;
				}
			}
		}
		if (deleted) {
			await this.collectResources(directory);
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
		await this.queueOperation(async () => {
			await this.internalDeleteSession(sessionId);
			await this.flushIndex();
		});
	}

	async clearAllSessions(): Promise<void> {
		await this.queueOperation(async () => {
			const index = this.internalGetIndex();
			const entries = Object.keys(index.entries);
			this.logService.info(`ChatSessionStore: Clearing ${entries.length} chat sessions`);
			await Promise.all(entries.map(entry => this.internalDeleteSession(entry)));
			await this.flushIndex();
		});
	}

	public async setSessionTitle(sessionId: string, title: string): Promise<void> {
		await this.queueOperation(async () => {
			const index = this.internalGetIndex();
			if (index.entries[sessionId]) {
				index.entries[sessionId].title = title;
			}
		});
	}

	private reportError(reasonForTelemetry: string, message: string, error?: Error): void {
		const fileOperationReason = error && toFileOperationResult(error);

		if (fileOperationReason === FileOperationResult.FILE_NOT_FOUND) {
			// Expected case (e.g. reading a non-existent session); keep noise low
			this.logService.trace(`ChatSessionStore: ` + message, toErrorMessage(error));
		} else {
			// Unexpected or serious error; surface at error level
			this.logService.error(`ChatSessionStore: ` + message, error);
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

		} catch (e) {
			// Only if JSON.parse fails
			this.reportError('invalidIndexJSON', `Index corrupt: ${data}`, e);
			this.indexCache = { version: 1, entries: {} };
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

		return this.indexCache;
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
		await this.queueOperation(async () => {
			const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
			const needsMigrationFromStorageService = !data;
			if (needsMigrationFromStorageService) {
				const initialData = getInitialData();
				if (initialData) {
					await this.migrate(initialData);
				}
			}
			try {
				await this.cleanupExpiredTransfers();
			} catch (error) {
				this.reportError('cleanupTransferredSession', 'Error recovering expired chat transfers', error);
			}
		});
		this.cleanupScheduler.schedule();
	}

	private async cleanupExpiredTransfers(): Promise<void> {
		const index = await this.readTransferIndex();
		let changed = false;
		for (const [workspace, transfer] of Object.entries(index)) {
			if (Date.now() - transfer.timestampInMilliseconds <= ChatSessionStore.TRANSFER_EXPIRATION_MS) {
				continue;
			}
			try {
				const sessionResource = URI.revive(transfer.sessionResource);
				const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
				if (sessionId && !Object.entries(index).some(([key, other]) => key !== workspace && isEqual(URI.revive(other.sessionResource), sessionResource))) {
					const location = this.getTransferredSessionStorageLocation(sessionResource);
					const directory = getChatSessionStorageResource(this.transferredSessionStorageRoot, sessionId, '.resources');
					await this.markForCleanup(directory);
					if (await this.fileService.exists(location)) {
						await this.fileService.del(location, { synchronization: this.synchronization });
					}
					await this.collectResources(directory);
				}
				delete index[workspace];
				changed = true;
			} catch (error) {
				this.reportError('cleanupTransferredSession', 'Error cleaning up expired chat transfer', error);
			}
		}
		if (changed) {
			await this.writeTransferIndex(index);
		}
	}

	private async migrate(initialData: ISerializableChatsData): Promise<void> {
		const numSessions = Object.keys(initialData).length;
		this.logService.info(`ChatSessionStore: Migrating ${numSessions} chat sessions from storage service to file system`);

		await Promise.all(Object.values(initialData).map(async session => {
			await this.writeSession(session);
		}));

		await this.flushIndex();
	}

	public async readSession(sessionId: string): Promise<ISerializedChatDataReference | undefined> {
		return await this.queueOperation(async () => {
			let storageLocation: ReturnType<ChatSessionStore['getStorageLocation']>;
			try {
				storageLocation = this.getStorageLocation(sessionId);
			} catch (e) {
				this.reportError('invalidSessionId', `Ignoring invalid chat session from index: ${sessionId}`, e);
				const index = this.internalGetIndex();
				if (index.entries[sessionId]) {
					delete index.entries[sessionId];
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
					const previous = await this.readSessionFromPreviousLocation(sessionId);
					rawData = previous?.data;
					if (previous) {
						fromLocation = previous.location;
					}
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
				session = revive(cloneChatData(log.read(rawData)));
			} else {
				session = revive(JSON.parse(rawData.toString()));
			}

			const resourceDirectory = getChatSessionStorageResource(dirname(fromLocation), sessionId, '.resources');
			session = this.resources.restore(session, resourceDirectory);

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

			const normalized = normalizeSerializableChatData(session);
			return {
				value: normalized,
				serializer: normalized.binaryResourcesVersion === 1 && fromLocation === logStorageLocation ? log : new ChatSessionOperationLog(),
				resources: await this.resources.pinForRead(normalized),
			};
		} catch (err) {
			this.reportError('malformedSession', `Malformed session data in ${fromLocation.fsPath}: [${rawData.slice(0, 20).toString()}${rawData.byteLength > 20 ? '...' : ''}]`, err);
			return undefined;
		}
	}

	private async readSessionFromPreviousLocation(sessionId: string): Promise<{ data: VSBuffer; location: URI } | undefined> {
		if (this.previousEmptyWindowStorageRoot) {
			const storageLocation2 = getChatSessionStorageResource(this.previousEmptyWindowStorageRoot, sessionId, '.json');
			try {
				const data = (await this.fileService.readFile(storageLocation2)).value;
				this.logService.info(`ChatSessionStore: Read chat session ${sessionId} from previous location`);
				return { data, location: storageLocation2 };
			} catch (e) {
				this.reportError('sessionReadFile', `Error reading chat session file ${sessionId} from previous location`, e);
				return undefined;
			}
		}

		return undefined;
	}

	private getStorageLocation(chatSessionId: string): {
		/** <1.109 flat JSON file */
		flat: URI;
		/** >=1.109 append log */
		log?: URI;
	} {
		return {
			flat: getChatSessionStorageResource(this.storageRoot, chatSessionId, '.json'),
			// todo@connor4312: remove after stabilizing
			log: this.configurationService.getValue('chat.useLogSessionStorage') !== false ? getChatSessionStorageResource(this.storageRoot, chatSessionId, '.jsonl') : undefined,
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
		const index = this.internalGetIndex();
		for (const session of localSessions) {
			index.entries[session.sessionId] = getSessionMetadataSync(session, index.entries[session.sessionId]?.stats);
		}
		for (const session of externalSessions) {
			const externalSessionId = session.sessionResource.toString();
			index.entries[externalSessionId] = getSessionMetadataSync(session, index.entries[externalSessionId]?.stats);
		}
		try {
			this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), StorageTarget.MACHINE);
		} catch (e) {
			this.reportError('indexWrite', 'Error writing index synchronously', e);
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
 * Retains the last persisted stats while the editing session is still initializing.
 */
function getSessionMetadataSync(session: ChatModel, previousStats: IChatSessionStats | undefined): IChatSessionEntryMetadata {
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
		permissionLevel: session.inputModel.state.get()?.permissionLevel,
		inputState,
		workingDirectory: session.workingDirectory?.toString(),
		stats: session.editingSession?.state.get() === ChatEditingSessionState.Initial ? previousStats : getStatsForSession(session),
	};
}

function getSessionMetadata(session: ChatModel | ISerializableChatData, previousStats?: IChatSessionStats): IChatSessionEntryMetadata {
	if (session instanceof ChatModel) {
		return getSessionMetadataSync(session, previousStats);
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
