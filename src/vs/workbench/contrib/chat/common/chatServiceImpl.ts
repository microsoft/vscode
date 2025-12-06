/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { revive } from '../../../../base/common/marshalling.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { InlineChatConfigKeys } from '../../inlineChat/common/inlineChat.js';
import { IMcpService } from '../../mcp/common/mcpTypes.js';
import { awaitStatsForSession } from './chat.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentResult, IChatAgentService } from './chatAgents.js';
import { chatEditingSessionIsReady } from './chatEditingService.js';
import { ChatModel, ChatRequestModel, ChatRequestRemovalReason, IChatModel, IChatRequestModel, IChatRequestVariableData, IChatResponseModel, IExportableChatData, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, normalizeSerializableChatData, toChatHistoryContent, updateRanges } from './chatModel.js';
import { ChatModelStore, IStartSessionProps } from './chatModelStore.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText, IParsedChatRequest } from './chatParserTypes.js';
import { ChatRequestParser } from './chatRequestParser.js';
import { ChatMcpServersStarting, IChatCompleteResponse, IChatDetail, IChatFollowup, IChatModelReference, IChatProgress, IChatSendRequestData, IChatSendRequestOptions, IChatSendRequestResponseState, IChatService, IChatSessionContext, IChatSessionStartOptions, IChatTransferredSessionData, IChatUserActionEvent } from './chatService.js';
import { ChatRequestTelemetry, ChatServiceTelemetry } from './chatServiceTelemetry.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { ChatSessionStore, IChatSessionEntryMetadata, IChatTransfer2 } from './chatSessionStore.js';
import { IChatSlashCommandService } from './chatSlashCommands.js';
import { IChatTransferService } from './chatTransferService.js';
import { LocalChatSessionUri } from './chatUri.js';
import { IChatRequestVariableEntry } from './chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from './constants.js';
import { ChatMessageRole, IChatMessage } from './languageModels.js';
import { ILanguageModelToolsService } from './languageModelToolsService.js';

const serializedChatKey = 'interactive.sessions';

const TransferredGlobalChatKey = 'chat.workspaceTransfer';

const SESSION_TRANSFER_EXPIRATION_IN_MILLISECONDS = 1000 * 60;

class CancellableRequest implements IDisposable {
	constructor(
		public readonly cancellationTokenSource: CancellationTokenSource,
		public requestId: string | undefined,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService
	) { }

	dispose() {
		this.cancellationTokenSource.dispose();
	}

	cancel() {
		if (this.requestId) {
			this.toolsService.cancelToolCallsForRequest(this.requestId);
		}

		this.cancellationTokenSource.cancel();
	}
}

export class ChatService extends Disposable implements IChatService {
	declare _serviceBrand: undefined;

	private readonly _sessionModels: ChatModelStore;
	private readonly _pendingRequests = this._register(new DisposableResourceMap<CancellableRequest>());
	private _persistedSessions: ISerializableChatsData;
	private _saveModelsEnabled = true;

	private _transferredSessionData: IChatTransferredSessionData | undefined;
	public get transferredSessionData(): IChatTransferredSessionData | undefined {
		return this._transferredSessionData;
	}

	private readonly _onDidSubmitRequest = this._register(new Emitter<{ readonly chatSessionResource: URI }>());
	public readonly onDidSubmitRequest = this._onDidSubmitRequest.event;

	private readonly _onDidPerformUserAction = this._register(new Emitter<IChatUserActionEvent>());
	public readonly onDidPerformUserAction: Event<IChatUserActionEvent> = this._onDidPerformUserAction.event;

	private readonly _onDidDisposeSession = this._register(new Emitter<{ readonly sessionResource: URI; reason: 'cleared' }>());
	public readonly onDidDisposeSession = this._onDidDisposeSession.event;

	private readonly _sessionFollowupCancelTokens = this._register(new DisposableResourceMap<CancellationTokenSource>());
	private readonly _chatServiceTelemetry: ChatServiceTelemetry;
	private readonly _chatSessionStore: ChatSessionStore;

	readonly requestInProgressObs: IObservable<boolean>;

	readonly chatModels: IObservable<Iterable<IChatModel>>;

	/**
	 * For test use only
	 */
	setSaveModelsEnabled(enabled: boolean): void {
		this._saveModelsEnabled = enabled;
	}

	/**
	 * For test use only
	 */
	waitForModelDisposals(): Promise<void> {
		return this._sessionModels.waitForModelDisposals();
	}

	public get edits2Enabled(): boolean {
		return this.configurationService.getValue(ChatConfiguration.Edits2Enabled);
	}

	private get isEmptyWindow(): boolean {
		const workspace = this.workspaceContextService.getWorkspace();
		return !workspace.configuration && workspace.folders.length === 0;
	}

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatTransferService private readonly chatTransferService: IChatTransferService,
		@IChatSessionsService private readonly chatSessionService: IChatSessionsService,
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super();

		this._sessionModels = this._register(instantiationService.createInstance(ChatModelStore, {
			createModel: (props: IStartSessionProps) => this._startSession(props),
			willDisposeModel: async (model: ChatModel) => {
				const localSessionId = LocalChatSessionUri.parseLocalSessionId(model.sessionResource);
				if (localSessionId && this.shouldStoreSession(model)) {
					// Always preserve sessions that have custom titles, even if empty
					if (model.getRequests().length === 0 && !model.customTitle) {
						await this._chatSessionStore.deleteSession(localSessionId);
					} else if (this._saveModelsEnabled) {
						await this._chatSessionStore.storeSessions([model]);
					}
				} else if (!localSessionId && model.getRequests().length > 0) {
					await this._chatSessionStore.storeSessionsMetadataOnly([model]);
				}
			}
		}));
		this._register(this._sessionModels.onDidDisposeModel(model => {
			this._onDidDisposeSession.fire({ sessionResource: model.sessionResource, reason: 'cleared' });
		}));

		this._chatServiceTelemetry = this.instantiationService.createInstance(ChatServiceTelemetry);

		const sessionData = storageService.get(serializedChatKey, this.isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE, '');
		if (sessionData) {
			this._persistedSessions = this.deserializeChats(sessionData);
			const countsForLog = Object.keys(this._persistedSessions).length;
			if (countsForLog > 0) {
				this.trace('constructor', `Restored ${countsForLog} persisted sessions`);
			}
		} else {
			this._persistedSessions = {};
		}

		const transferredData = this.getTransferredSessionData();
		const transferredChat = transferredData?.chat;
		if (transferredChat) {
			this.trace('constructor', `Transferred session ${transferredChat.sessionId}`);
			this._persistedSessions[transferredChat.sessionId] = transferredChat;
			this._transferredSessionData = {
				sessionId: transferredChat.sessionId,
				location: transferredData.location,
				inputState: transferredData.inputState
			};
		}

		this._chatSessionStore = this._register(this.instantiationService.createInstance(ChatSessionStore));
		this._chatSessionStore.migrateDataIfNeeded(() => this._persistedSessions);

		// When using file storage, populate _persistedSessions with session metadata from the index
		// This ensures that getPersistedSessionTitle() can find titles for inactive sessions
		this.initializePersistedSessionsFromFileStorage().then(() => {
			this.reviveSessionsWithEdits();
		});

		this._register(storageService.onWillSaveState(() => this.saveState()));

		this.chatModels = derived(this, reader => [...this._sessionModels.observable.read(reader).values()]);

		this.requestInProgressObs = derived(reader => {
			const models = this._sessionModels.observable.read(reader).values();
			return Iterable.some(models, model => model.requestInProgress.read(reader));
		});
	}

	public get editingSessions() {
		return [...this._sessionModels.values()].map(v => v.editingSession).filter(isDefined);
	}

	isEnabled(location: ChatAgentLocation): boolean {
		return this.chatAgentService.getContributedDefaultAgent(location) !== undefined;
	}

	private saveState(): void {
		if (!this._saveModelsEnabled) {
			return;
		}

		const liveLocalChats = Array.from(this._sessionModels.values())
			.filter(session => this.shouldStoreSession(session));

		this._chatSessionStore.storeSessions(liveLocalChats);

		const liveNonLocalChats = Array.from(this._sessionModels.values())
			.filter(session => !LocalChatSessionUri.parseLocalSessionId(session.sessionResource));
		this._chatSessionStore.storeSessionsMetadataOnly(liveNonLocalChats);
	}

	/**
	 * Only persist local sessions from chat that are not imported.
	 */
	private shouldStoreSession(session: ChatModel): boolean {
		if (!LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
			return false;
		}
		return session.initialLocation === ChatAgentLocation.Chat && !session.isImported;
	}

	notifyUserAction(action: IChatUserActionEvent): void {
		this._chatServiceTelemetry.notifyUserAction(action);
		this._onDidPerformUserAction.fire(action);
		if (action.action.kind === 'chatEditingSessionAction') {
			const model = this._sessionModels.get(action.sessionResource);
			if (model) {
				model.notifyEditingAction(action.action);
			}
		}
	}

	async setChatSessionTitle(sessionResource: URI, title: string): Promise<void> {
		const model = this._sessionModels.get(sessionResource);
		if (model) {
			model.setCustomTitle(title);
		}

		// Update the title in the file storage
		const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (localSessionId) {
			await this._chatSessionStore.setSessionTitle(localSessionId, title);
			// Trigger immediate save to ensure consistency
			this.saveState();
		}
	}

	private trace(method: string, message?: string): void {
		if (message) {
			this.logService.trace(`ChatService#${method}: ${message}`);
		} else {
			this.logService.trace(`ChatService#${method}`);
		}
	}

	private error(method: string, message: string): void {
		this.logService.error(`ChatService#${method} ${message}`);
	}

	private deserializeChats(sessionData: string): ISerializableChatsData {
		try {
			const arrayOfSessions: ISerializableChatDataIn[] = revive(JSON.parse(sessionData)); // Revive serialized URIs in session data
			if (!Array.isArray(arrayOfSessions)) {
				throw new Error('Expected array');
			}

			const sessions = arrayOfSessions.reduce<ISerializableChatsData>((acc, session) => {
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

				acc[session.sessionId] = normalizeSerializableChatData(session);
				return acc;
			}, {});
			return sessions;
		} catch (err) {
			this.error('deserializeChats', `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? '...' : ''}]`);
			return {};
		}
	}

	private getTransferredSessionData(): IChatTransfer2 | undefined {
		const data: IChatTransfer2[] = this.storageService.getObject(TransferredGlobalChatKey, StorageScope.PROFILE, []);
		const workspaceUri = this.workspaceContextService.getWorkspace().folders[0]?.uri;
		if (!workspaceUri) {
			return;
		}

		const thisWorkspace = workspaceUri.toString();
		const currentTime = Date.now();
		// Only use transferred data if it was created recently
		const transferred = data.find(item => URI.revive(item.toWorkspace).toString() === thisWorkspace && (currentTime - item.timestampInMilliseconds < SESSION_TRANSFER_EXPIRATION_IN_MILLISECONDS));
		// Keep data that isn't for the current workspace and that hasn't expired yet
		const filtered = data.filter(item => URI.revive(item.toWorkspace).toString() !== thisWorkspace && (currentTime - item.timestampInMilliseconds < SESSION_TRANSFER_EXPIRATION_IN_MILLISECONDS));
		this.storageService.store(TransferredGlobalChatKey, JSON.stringify(filtered), StorageScope.PROFILE, StorageTarget.MACHINE);
		return transferred;
	}

	/**
	 * todo@connor4312 This will be cleaned up with the globalization of edits.
	 */
	private async reviveSessionsWithEdits(): Promise<void> {
		await Promise.all(Object.values(this._persistedSessions).map(async session => {
			if (!session.hasPendingEdits) {
				return;
			}

			const sessionResource = LocalChatSessionUri.forSession(session.sessionId);
			const sessionRef = await this.getOrRestoreSession(sessionResource);
			if (sessionRef?.object.editingSession) {
				await chatEditingSessionIsReady(sessionRef.object.editingSession);
				// the session will hold a self-reference as long as there are modified files
				sessionRef.dispose();
			}
		}));
	}

	private async initializePersistedSessionsFromFileStorage(): Promise<void> {

		const index = await this._chatSessionStore.getIndex();
		const sessionIds = Object.keys(index);

		for (const sessionId of sessionIds) {
			const metadata = index[sessionId];
			if (metadata && !this._persistedSessions[sessionId]) {
				// Create a minimal session entry with the title information
				// This allows getPersistedSessionTitle() to find the title without loading the full session
				const minimalSession: ISerializableChatData = {
					version: 3,
					sessionId: sessionId,
					customTitle: metadata.title,
					creationDate: Date.now(), // Use current time as fallback
					lastMessageDate: metadata.lastMessageDate,
					initialLocation: metadata.initialLocation,
					requests: [], // Empty requests array - this is just for title lookup
					responderUsername: '',
					responderAvatarIconUri: undefined,
					hasPendingEdits: metadata.hasPendingEdits,
				};

				this._persistedSessions[sessionId] = minimalSession;
			}
		}
	}

	/**
	 * Returns an array of chat details for all persisted chat sessions that have at least one request.
	 * Chat sessions that have already been loaded into the chat view are excluded from the result.
	 * Imported chat sessions are also excluded from the result.
	 * TODO this is only used by the old "show chats" command which can be removed when the pre-agents view
	 * options are removed.
	 */
	async getLocalSessionHistory(): Promise<IChatDetail[]> {
		const liveSessionItems = await this.getLiveSessionItems();
		const historySessionItems = await this.getHistorySessionItems();

		return [...liveSessionItems, ...historySessionItems];
	}

	/**
	 * Returns an array of chat details for all local live chat sessions.
	 */
	async getLiveSessionItems(): Promise<IChatDetail[]> {
		return await Promise.all(Array.from(this._sessionModels.values())
			.filter(session => this.shouldBeInHistory(session))
			.map(async (session): Promise<IChatDetail> => {
				const title = session.title || localize('newChat', "New Chat");
				return {
					sessionResource: session.sessionResource,
					title,
					lastMessageDate: session.lastMessageDate,
					isActive: true,
					stats: await awaitStatsForSession(session),
				};
			}));
	}

	/**
	 * Returns an array of chat details for all local chat sessions in history (not currently loaded).
	 */
	async getHistorySessionItems(): Promise<IChatDetail[]> {
		const index = await this._chatSessionStore.getIndex();
		return Object.values(index)
			.filter(entry => !entry.isExternal)
			.filter(entry => !this._sessionModels.has(LocalChatSessionUri.forSession(entry.sessionId)) && entry.initialLocation === ChatAgentLocation.Chat && !entry.isEmpty)
			.map((entry): IChatDetail => {
				const sessionResource = LocalChatSessionUri.forSession(entry.sessionId);
				return ({
					...entry,
					sessionResource,
					isActive: this._sessionModels.has(sessionResource),
				});
			});
	}

	async getMetadataForSession(sessionResource: URI): Promise<IChatDetail | undefined> {
		const index = await this._chatSessionStore.getIndex();
		const metadata: IChatSessionEntryMetadata | undefined = index[sessionResource.toString()];
		if (metadata) {
			return {
				...metadata,
				sessionResource,
				isActive: this._sessionModels.has(sessionResource),
			};
		}

		return undefined;
	}

	private shouldBeInHistory(entry: ChatModel): boolean {
		return !entry.isImported && !!LocalChatSessionUri.parseLocalSessionId(entry.sessionResource) && entry.initialLocation === ChatAgentLocation.Chat;
	}

	async removeHistoryEntry(sessionResource: URI): Promise<void> {
		await this._chatSessionStore.deleteSession(this.toLocalSessionId(sessionResource));
	}

	async clearAllHistoryEntries(): Promise<void> {
		await this._chatSessionStore.clearAllSessions();
	}

	startSession(location: ChatAgentLocation, options?: IChatSessionStartOptions): IChatModelReference {
		this.trace('startSession');
		const sessionId = generateUuid();
		const sessionResource = LocalChatSessionUri.forSession(sessionId);
		return this._sessionModels.acquireOrCreate({
			initialData: undefined,
			location,
			sessionResource,
			sessionId,
			canUseTools: options?.canUseTools ?? true,
			disableBackgroundKeepAlive: options?.disableBackgroundKeepAlive
		});
	}

	private _startSession(props: IStartSessionProps): ChatModel {
		const { initialData, location, sessionResource, sessionId, canUseTools, transferEditingSession, disableBackgroundKeepAlive } = props;
		const model = this.instantiationService.createInstance(ChatModel, initialData, { initialLocation: location, canUseTools, resource: sessionResource, sessionId, disableBackgroundKeepAlive });
		if (location === ChatAgentLocation.Chat) {
			model.startEditingSession(true, transferEditingSession);
		}

		this.initializeSession(model);
		return model;
	}

	private initializeSession(model: ChatModel): void {
		this.trace('initializeSession', `Initialize session ${model.sessionResource}`);

		// Activate the default extension provided agent but do not wait
		// for it to be ready so that the session can be used immediately
		// without having to wait for the agent to be ready.
		this.activateDefaultAgent(model.initialLocation).catch(e => this.logService.error(e));
	}

	async activateDefaultAgent(location: ChatAgentLocation): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		const defaultAgentData = this.chatAgentService.getContributedDefaultAgent(location) ?? this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Chat);
		if (!defaultAgentData) {
			throw new ErrorNoTelemetry('No default agent contributed');
		}

		// Await activation of the extension provided agent
		// Using `activateById` as workaround for the issue
		// https://github.com/microsoft/vscode/issues/250590
		if (!defaultAgentData.isCore) {
			await this.extensionService.activateById(defaultAgentData.extensionId, {
				activationEvent: `onChatParticipant:${defaultAgentData.id}`,
				extensionId: defaultAgentData.extensionId,
				startup: false
			});
		}

		const defaultAgent = this.chatAgentService.getActivatedAgents().find(agent => agent.id === defaultAgentData.id);
		if (!defaultAgent) {
			throw new ErrorNoTelemetry('No default agent registered');
		}
	}

	getSession(sessionResource: URI): IChatModel | undefined {
		return this._sessionModels.get(sessionResource);
	}

	getActiveSessionReference(sessionResource: URI): IChatModelReference | undefined {
		return this._sessionModels.acquireExisting(sessionResource);
	}

	async getOrRestoreSession(sessionResource: URI): Promise<IChatModelReference | undefined> {
		this.trace('getOrRestoreSession', `${sessionResource}`);
		const existingRef = this._sessionModels.acquireExisting(sessionResource);
		if (existingRef) {
			return existingRef;
		}

		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (!sessionId) {
			throw new Error(`Cannot restore non-local session ${sessionResource}`);
		}

		let sessionData: ISerializableChatData | undefined;
		if (this.transferredSessionData?.sessionId === sessionId) {
			sessionData = revive(this._persistedSessions[sessionId]);
		} else {
			sessionData = revive(await this._chatSessionStore.readSession(sessionId));
		}

		if (!sessionData) {
			return undefined;
		}

		const sessionRef = this._sessionModels.acquireOrCreate({
			initialData: sessionData,
			location: sessionData.initialLocation ?? ChatAgentLocation.Chat,
			sessionResource,
			sessionId,
			canUseTools: true,
		});

		const isTransferred = this.transferredSessionData?.sessionId === sessionId;
		if (isTransferred) {
			this._transferredSessionData = undefined;
		}

		return sessionRef;
	}

	/**
	 * This is really just for migrating data from the edit session location to the panel.
	 */
	isPersistedSessionEmpty(sessionResource: URI): boolean {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (!sessionId) {
			throw new Error(`Cannot restore non-local session ${sessionResource}`);
		}

		const session = this._persistedSessions[sessionId];
		if (session) {
			return session.requests.length === 0;
		}

		return this._chatSessionStore.isSessionEmpty(sessionId);
	}

	getPersistedSessionTitle(sessionResource: URI): string | undefined {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (!sessionId) {
			return undefined;
		}

		// First check the memory cache (_persistedSessions)
		const session = this._persistedSessions[sessionId];
		if (session) {
			const title = session.customTitle || ChatModel.getDefaultTitle(session.requests);
			return title;
		}

		// Try to read directly from file storage index
		// This handles the case where getName() is called before initialization completes
		// Access the internal synchronous index method via reflection
		// This is a workaround for the timing issue where initialization hasn't completed
		// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
		const internalGetIndex = (this._chatSessionStore as any).internalGetIndex;
		if (typeof internalGetIndex === 'function') {
			const indexData = internalGetIndex.call(this._chatSessionStore);
			const metadata = indexData.entries[sessionId];
			if (metadata && metadata.title) {
				return metadata.title;
			}
		}

		return undefined;
	}

	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModelReference | undefined {
		const sessionId = 'sessionId' in data && data.sessionId ? data.sessionId : generateUuid();
		const sessionResource = LocalChatSessionUri.forSession(sessionId);
		return this._sessionModels.acquireOrCreate({
			initialData: data,
			location: data.initialLocation ?? ChatAgentLocation.Chat,
			sessionResource,
			sessionId,
			canUseTools: true,
		});
	}

	async loadSessionForResource(chatSessionResource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModelReference | undefined> {
		// TODO: Move this into a new ChatModelService

		if (chatSessionResource.scheme === Schemas.vscodeLocalChatSession) {
			return this.getOrRestoreSession(chatSessionResource);
		}

		const existingRef = this._sessionModels.acquireExisting(chatSessionResource);
		if (existingRef) {
			return existingRef;
		}

		const providedSession = await this.chatSessionService.getOrCreateChatSession(chatSessionResource, CancellationToken.None);
		const chatSessionType = chatSessionResource.scheme;

		// Contributed sessions do not use UI tools
		const modelRef = this._sessionModels.acquireOrCreate({
			initialData: undefined,
			location,
			sessionResource: chatSessionResource,
			canUseTools: false,
			transferEditingSession: providedSession.initialEditingSession,
		});

		modelRef.object.setContributedChatSession({
			chatSessionResource,
			chatSessionType,
			isUntitled: chatSessionResource.path.startsWith('/untitled-')  //TODO(jospicer)
		});

		const model = modelRef.object;
		const disposables = new DisposableStore();
		disposables.add(modelRef.object.onDidDispose(() => {
			disposables.dispose();
			providedSession.dispose();
		}));

		let lastRequest: ChatRequestModel | undefined;
		for (const message of providedSession.history) {
			if (message.type === 'request') {
				if (lastRequest) {
					lastRequest.response?.complete();
				}

				const requestText = message.prompt;

				const parsedRequest: IParsedChatRequest = {
					text: requestText,
					parts: [new ChatRequestTextPart(
						new OffsetRange(0, requestText.length),
						{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: requestText.length + 1 },
						requestText
					)]
				};
				const agent =
					message.participant
						? this.chatAgentService.getAgent(message.participant) // TODO(jospicer): Remove and always hardcode?
						: this.chatAgentService.getAgent(chatSessionType);
				lastRequest = model.addRequest(parsedRequest,
					message.variableData ?? { variables: [] },
					0, // attempt
					undefined,
					agent,
					undefined, // slashCommand
					undefined, // confirmation
					undefined, // locationData
					undefined, // attachments
					false, // Do not treat as requests completed, else edit pills won't show.
					undefined,
					undefined,
					message.id
				);
			} else {
				// response
				if (lastRequest) {
					for (const part of message.parts) {
						model.acceptResponseProgress(lastRequest, part);
					}
				}
			}
		}

		if (providedSession.progressObs && lastRequest && providedSession.interruptActiveResponseCallback) {
			const initialCancellationRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined);
			this._pendingRequests.set(model.sessionResource, initialCancellationRequest);
			const cancellationListener = disposables.add(new MutableDisposable());

			const createCancellationListener = (token: CancellationToken) => {
				return token.onCancellationRequested(() => {
					providedSession.interruptActiveResponseCallback?.().then(userConfirmedInterruption => {
						if (!userConfirmedInterruption) {
							// User cancelled the interruption
							const newCancellationRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined);
							this._pendingRequests.set(model.sessionResource, newCancellationRequest);
							cancellationListener.value = createCancellationListener(newCancellationRequest.cancellationTokenSource.token);
						}
					});
				});
			};

			cancellationListener.value = createCancellationListener(initialCancellationRequest.cancellationTokenSource.token);

			let lastProgressLength = 0;
			disposables.add(autorun(reader => {
				const progressArray = providedSession.progressObs?.read(reader) ?? [];
				const isComplete = providedSession.isCompleteObs?.read(reader) ?? false;

				// Process only new progress items
				if (progressArray.length > lastProgressLength) {
					const newProgress = progressArray.slice(lastProgressLength);
					for (const progress of newProgress) {
						model?.acceptResponseProgress(lastRequest, progress);
					}
					lastProgressLength = progressArray.length;
				}

				// Handle completion
				if (isComplete) {
					lastRequest.response?.complete();
					cancellationListener.clear();
				}
			}));
		} else {
			if (lastRequest && model.editingSession) {
				// wait for timeline to load so that a 'changes' part is added when the response completes
				await chatEditingSessionIsReady(model.editingSession);
				lastRequest.response?.complete();
			}
		}

		return modelRef;
	}

	getChatSessionFromInternalUri(sessionResource: URI): IChatSessionContext | undefined {
		const model = this._sessionModels.get(sessionResource);
		if (!model) {
			return;
		}
		const { contributedChatSession } = model;
		return contributedChatSession;
	}

	async resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void> {
		const model = this._sessionModels.get(request.session.sessionResource);
		if (!model && model !== request.session) {
			throw new Error(`Unknown session: ${request.session.sessionResource}`);
		}

		const cts = this._pendingRequests.get(request.session.sessionResource);
		if (cts) {
			this.trace('resendRequest', `Session ${request.session.sessionResource} already has a pending request, cancelling...`);
			cts.cancel();
		}

		const location = options?.location ?? model.initialLocation;
		const attempt = options?.attempt ?? 0;
		const enableCommandDetection = !options?.noCommandDetection;
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind)!;

		model.removeRequest(request.id, ChatRequestRemovalReason.Resend);

		const resendOptions: IChatSendRequestOptions = {
			...options,
			locationData: request.locationData,
			attachedContext: request.attachedContext,
		};
		await this._sendRequestAsync(model, model.sessionResource, request.message, attempt, enableCommandDetection, defaultAgent, location, resendOptions).responseCompletePromise;
	}

	async sendRequest(sessionResource: URI, request: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined> {
		this.trace('sendRequest', `sessionResource: ${sessionResource.toString()}, message: ${request.substring(0, 20)}${request.length > 20 ? '[...]' : ''}}`);


		if (!request.trim() && !options?.slashCommand && !options?.agentId && !options?.agentIdSilent) {
			this.trace('sendRequest', 'Rejected empty message');
			return;
		}

		const model = this._sessionModels.get(sessionResource);
		if (!model) {
			throw new Error(`Unknown session: ${sessionResource}`);
		}

		if (this._pendingRequests.has(sessionResource)) {
			this.trace('sendRequest', `Session ${sessionResource} already has a pending request`);
			return;
		}

		const requests = model.getRequests();
		for (let i = requests.length - 1; i >= 0; i -= 1) {
			const request = requests[i];
			if (request.shouldBeRemovedOnSend) {
				if (request.shouldBeRemovedOnSend.afterUndoStop) {
					request.response?.finalizeUndoState();
				} else {
					await this.removeRequest(sessionResource, request.id);
				}
			}
		}

		const location = options?.location ?? model.initialLocation;
		const attempt = options?.attempt ?? 0;
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind)!;

		const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
		const silentAgent = options?.agentIdSilent ? this.chatAgentService.getAgent(options.agentIdSilent) : undefined;
		const agent = silentAgent ?? parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
		const agentSlashCommandPart = parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);

		// This method is only returning whether the request was accepted - don't block on the actual request
		return {
			...this._sendRequestAsync(model, sessionResource, parsedRequest, attempt, !options?.noCommandDetection, silentAgent ?? defaultAgent, location, options),
			agent,
			slashCommand: agentSlashCommandPart?.command,
		};
	}

	private parseChatRequest(sessionResource: URI, request: string, location: ChatAgentLocation, options: IChatSendRequestOptions | undefined): IParsedChatRequest {
		let parserContext = options?.parserContext;
		if (options?.agentId) {
			const agent = this.chatAgentService.getAgent(options.agentId);
			if (!agent) {
				throw new Error(`Unknown agent: ${options.agentId}`);
			}
			parserContext = { selectedAgent: agent, mode: options.modeInfo?.kind };
			const commandPart = options.slashCommand ? ` ${chatSubcommandLeader}${options.slashCommand}` : '';
			request = `${chatAgentLeader}${agent.name}${commandPart} ${request}`;
		}

		const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, request, location, parserContext);
		return parsedRequest;
	}

	private refreshFollowupsCancellationToken(sessionResource: URI): CancellationToken {
		this._sessionFollowupCancelTokens.get(sessionResource)?.cancel();
		const newTokenSource = new CancellationTokenSource();
		this._sessionFollowupCancelTokens.set(sessionResource, newTokenSource);

		return newTokenSource.token;
	}

	private _sendRequestAsync(model: ChatModel, sessionResource: URI, parsedRequest: IParsedChatRequest, attempt: number, enableCommandDetection: boolean, defaultAgent: IChatAgentData, location: ChatAgentLocation, options?: IChatSendRequestOptions): IChatSendRequestResponseState {
		const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionResource);
		let request: ChatRequestModel;
		const agentPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
		const agentSlashCommandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);
		const commandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestSlashCommandPart => r instanceof ChatRequestSlashCommandPart);
		const requests = [...model.getRequests()];
		const requestTelemetry = this.instantiationService.createInstance(ChatRequestTelemetry, {
			agent: agentPart?.agent ?? defaultAgent,
			agentSlashCommandPart,
			commandPart,
			sessionId: model.sessionId,
			location: model.initialLocation,
			options,
			enableCommandDetection
		});

		let gotProgress = false;
		const requestType = commandPart ? 'slashCommand' : 'string';

		const responseCreated = new DeferredPromise<IChatResponseModel>();
		let responseCreatedComplete = false;
		function completeResponseCreated(): void {
			if (!responseCreatedComplete && request?.response) {
				responseCreated.complete(request.response);
				responseCreatedComplete = true;
			}
		}

		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource());
		const token = source.token;
		const sendRequestInternal = async () => {
			const progressCallback = (progress: IChatProgress[]) => {
				if (token.isCancellationRequested) {
					return;
				}

				gotProgress = true;

				for (let i = 0; i < progress.length; i++) {
					const isLast = i === progress.length - 1;
					const progressItem = progress[i];

					if (progressItem.kind === 'markdownContent') {
						this.trace('sendRequest', `Provider returned progress for session ${model.sessionResource}, ${progressItem.content.value.length} chars`);
					} else {
						this.trace('sendRequest', `Provider returned progress: ${JSON.stringify(progressItem)}`);
					}

					model.acceptResponseProgress(request, progressItem, !isLast);
				}
				completeResponseCreated();
			};

			let detectedAgent: IChatAgentData | undefined;
			let detectedCommand: IChatAgentCommand | undefined;

			const stopWatch = new StopWatch(false);
			store.add(token.onCancellationRequested(() => {
				this.trace('sendRequest', `Request for session ${model.sessionResource} was cancelled`);
				if (!request) {
					return;
				}

				requestTelemetry.complete({
					timeToFirstProgress: undefined,
					result: 'cancelled',
					// Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
					totalTime: stopWatch.elapsed(),
					requestType,
					detectedAgent,
					request,
				});

				model.cancelRequest(request);
			}));

			try {
				let rawResult: IChatAgentResult | null | undefined;
				let agentOrCommandFollowups: Promise<IChatFollowup[] | undefined> | undefined = undefined;
				let chatTitlePromise: Promise<string | undefined> | undefined;

				if (agentPart || (defaultAgent && !commandPart)) {
					const prepareChatAgentRequest = (agent: IChatAgentData, command?: IChatAgentCommand, enableCommandDetection?: boolean, chatRequest?: ChatRequestModel, isParticipantDetected?: boolean): IChatAgentRequest => {
						const initVariableData: IChatRequestVariableData = { variables: [] };
						request = chatRequest ?? model.addRequest(parsedRequest, initVariableData, attempt, options?.modeInfo, agent, command, options?.confirmation, options?.locationData, options?.attachedContext, undefined, options?.userSelectedModelId, options?.userSelectedTools?.get());

						let variableData: IChatRequestVariableData;
						let message: string;
						if (chatRequest) {
							variableData = chatRequest.variableData;
							message = getPromptText(request.message).message;
						} else {
							variableData = { variables: this.prepareContext(request.attachedContext) };
							model.updateRequest(request, variableData);

							const promptTextResult = getPromptText(request.message);
							variableData = updateRanges(variableData, promptTextResult.diff); // TODO bit of a hack
							message = promptTextResult.message;
						}

						const agentRequest: IChatAgentRequest = {
							sessionResource: model.sessionResource,
							requestId: request.id,
							agentId: agent.id,
							message,
							command: command?.name,
							variables: variableData,
							enableCommandDetection,
							isParticipantDetected,
							attempt,
							location,
							locationData: request.locationData,
							acceptedConfirmationData: options?.acceptedConfirmationData,
							rejectedConfirmationData: options?.rejectedConfirmationData,
							userSelectedModelId: options?.userSelectedModelId,
							userSelectedTools: options?.userSelectedTools?.get(),
							modeInstructions: options?.modeInfo?.modeInstructions,
							editedFileEvents: request.editedFileEvents,
						};

						let isInitialTools = true;

						store.add(autorun(reader => {
							const tools = options?.userSelectedTools?.read(reader);
							if (isInitialTools) {
								isInitialTools = false;
								return;
							}

							if (tools) {
								this.chatAgentService.setRequestTools(agent.id, request.id, tools);
								// in case the request has not been sent out yet:
								agentRequest.userSelectedTools = tools;
							}
						}));

						return agentRequest;
					};

					if (
						this.configurationService.getValue('chat.detectParticipant.enabled') !== false &&
						this.chatAgentService.hasChatParticipantDetectionProviders() &&
						!agentPart &&
						!commandPart &&
						!agentSlashCommandPart &&
						enableCommandDetection &&
						(location !== ChatAgentLocation.EditorInline || !this.configurationService.getValue(InlineChatConfigKeys.EnableV2)) &&
						options?.modeInfo?.kind !== ChatModeKind.Agent &&
						options?.modeInfo?.kind !== ChatModeKind.Edit &&
						!options?.agentIdSilent
					) {
						// We have no agent or command to scope history with, pass the full history to the participant detection provider
						const defaultAgentHistory = this.getHistoryEntriesFromModel(requests, location, defaultAgent.id);

						// Prepare the request object that we will send to the participant detection provider
						const chatAgentRequest = prepareChatAgentRequest(defaultAgent, undefined, enableCommandDetection, undefined, false);

						const result = await this.chatAgentService.detectAgentOrCommand(chatAgentRequest, defaultAgentHistory, { location }, token);
						if (result && this.chatAgentService.getAgent(result.agent.id)?.locations?.includes(location)) {
							// Update the response in the ChatModel to reflect the detected agent and command
							request.response?.setAgent(result.agent, result.command);
							detectedAgent = result.agent;
							detectedCommand = result.command;
						}
					}

					const agent = (detectedAgent ?? agentPart?.agent ?? defaultAgent)!;
					const command = detectedCommand ?? agentSlashCommandPart?.command;

					await this.extensionService.activateByEvent(`onChatParticipant:${agent.id}`);

					// Recompute history in case the agent or command changed
					const history = this.getHistoryEntriesFromModel(requests, location, agent.id);
					const requestProps = prepareChatAgentRequest(agent, command, enableCommandDetection, request /* Reuse the request object if we already created it for participant detection */, !!detectedAgent);
					const pendingRequest = this._pendingRequests.get(sessionResource);
					if (pendingRequest && !pendingRequest.requestId) {
						pendingRequest.requestId = requestProps.requestId;
					}
					completeResponseCreated();

					// MCP autostart: only run for native VS Code sessions (sidebar, new editors) but not for extension contributed sessions that have inputType set.
					if (model.canUseTools) {
						const autostartResult = new ChatMcpServersStarting(this.mcpService.autostart(token));
						if (!autostartResult.isEmpty) {
							progressCallback([autostartResult]);
							await autostartResult.wait();
						}
					}

					const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
					rawResult = agentResult;
					agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, history, followupsCancelToken);

					// Use LLM to generate the chat title
					if (model.getRequests().length === 1 && !model.customTitle) {
						const chatHistory = this.getHistoryEntriesFromModel(model.getRequests(), location, agent.id);
						chatTitlePromise = this.chatAgentService.getChatTitle(agent.id, chatHistory, CancellationToken.None).then(
							(title) => {
								// Since not every chat agent implements title generation, we can fallback to the default agent
								// which supports it
								if (title === undefined) {
									const defaultAgentForTitle = this.chatAgentService.getDefaultAgent(location);
									if (defaultAgentForTitle) {
										return this.chatAgentService.getChatTitle(defaultAgentForTitle.id, chatHistory, CancellationToken.None);
									}
								}
								return title;
							});
					}
				} else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command)) {
					if (commandPart.slashCommand.silent !== true) {
						request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
						completeResponseCreated();
					}
					// contributed slash commands
					// TODO: spell this out in the UI
					const history: IChatMessage[] = [];
					for (const modelRequest of model.getRequests()) {
						if (!modelRequest.response) {
							continue;
						}
						history.push({ role: ChatMessageRole.User, content: [{ type: 'text', value: modelRequest.message.text }] });
						history.push({ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: modelRequest.response.response.toString() }] });
					}
					const message = parsedRequest.text;
					const commandResult = await this.chatSlashCommandService.executeCommand(commandPart.slashCommand.command, message.substring(commandPart.slashCommand.command.length + 1).trimStart(), new Progress<IChatProgress>(p => {
						progressCallback([p]);
					}), history, location, model.sessionResource, token);
					agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
					rawResult = {};

				} else {
					throw new Error(`Cannot handle request`);
				}

				if (token.isCancellationRequested && !rawResult) {
					return;
				} else {
					if (!rawResult) {
						this.trace('sendRequest', `Provider returned no response for session ${model.sessionResource}`);
						rawResult = { errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
					}

					const result = rawResult.errorDetails?.responseIsFiltered ? 'filtered' :
						rawResult.errorDetails && gotProgress ? 'errorWithOutput' :
							rawResult.errorDetails ? 'error' :
								'success';

					requestTelemetry.complete({
						timeToFirstProgress: rawResult.timings?.firstProgress,
						totalTime: rawResult.timings?.totalElapsed,
						result,
						requestType,
						detectedAgent,
						request,
					});

					model.setResponse(request, rawResult);
					completeResponseCreated();
					this.trace('sendRequest', `Provider returned response for session ${model.sessionResource}`);

					request.response?.complete();
					if (agentOrCommandFollowups) {
						agentOrCommandFollowups.then(followups => {
							model.setFollowups(request, followups);
							const commandForTelemetry = agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command;
							this._chatServiceTelemetry.retrievedFollowups(agentPart?.agent.id ?? '', commandForTelemetry, followups?.length ?? 0);
						});
					}
					chatTitlePromise?.then(title => {
						if (title) {
							model.setCustomTitle(title);
						}
					});
				}
			} catch (err) {
				this.logService.error(`Error while handling chat request: ${toErrorMessage(err, true)}`);
				requestTelemetry.complete({
					timeToFirstProgress: undefined,
					totalTime: undefined,
					result: 'error',
					requestType,
					detectedAgent,
					request,
				});
				if (request) {
					const rawResult: IChatAgentResult = { errorDetails: { message: err.message } };
					model.setResponse(request, rawResult);
					completeResponseCreated();
					request.response?.complete();
				}
			} finally {
				store.dispose();
			}
		};
		const rawResponsePromise = sendRequestInternal();
		// Note- requestId is not known at this point, assigned later
		this._pendingRequests.set(model.sessionResource, this.instantiationService.createInstance(CancellableRequest, source, undefined));
		rawResponsePromise.finally(() => {
			this._pendingRequests.deleteAndDispose(model.sessionResource);
		});
		this._onDidSubmitRequest.fire({ chatSessionResource: model.sessionResource });
		return {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};
	}

	private prepareContext(attachedContextVariables: IChatRequestVariableEntry[] | undefined): IChatRequestVariableEntry[] {
		attachedContextVariables ??= [];

		// "reverse", high index first so that replacement is simple
		attachedContextVariables.sort((a, b) => {
			// If either range is undefined, sort it to the back
			if (!a.range && !b.range) {
				return 0; // Keep relative order if both ranges are undefined
			}
			if (!a.range) {
				return 1; // a goes after b
			}
			if (!b.range) {
				return -1; // a goes before b
			}
			return b.range.start - a.range.start;
		});

		return attachedContextVariables;
	}

	private getHistoryEntriesFromModel(requests: IChatRequestModel[], location: ChatAgentLocation, forAgentId: string): IChatAgentHistoryEntry[] {
		const history: IChatAgentHistoryEntry[] = [];
		const agent = this.chatAgentService.getAgent(forAgentId);
		for (const request of requests) {
			if (!request.response) {
				continue;
			}

			if (forAgentId !== request.response.agent?.id && !agent?.isDefault && !agent?.canAccessPreviousChatHistory) {
				// An agent only gets to see requests that were sent to this agent.
				// The default agent (the undefined case), or agents with 'canAccessPreviousChatHistory', get to see all of them.
				continue;
			}

			// Do not save to history inline completions
			if (location === ChatAgentLocation.EditorInline) {
				continue;
			}

			const promptTextResult = getPromptText(request.message);
			const historyRequest: IChatAgentRequest = {
				sessionResource: request.session.sessionResource,
				requestId: request.id,
				agentId: request.response.agent?.id ?? '',
				message: promptTextResult.message,
				command: request.response.slashCommand?.name,
				variables: updateRanges(request.variableData, promptTextResult.diff), // TODO bit of a hack
				location: ChatAgentLocation.Chat,
				editedFileEvents: request.editedFileEvents,
			};
			history.push({ request: historyRequest, response: toChatHistoryContent(request.response.response.value), result: request.response.result ?? {} });
		}

		return history;
	}

	async removeRequest(sessionResource: URI, requestId: string): Promise<void> {
		const model = this._sessionModels.get(sessionResource);
		if (!model) {
			throw new Error(`Unknown session: ${sessionResource}`);
		}

		const pendingRequest = this._pendingRequests.get(sessionResource);
		if (pendingRequest?.requestId === requestId) {
			pendingRequest.cancel();
			this._pendingRequests.deleteAndDispose(sessionResource);
		}

		model.removeRequest(requestId);
	}

	async adoptRequest(sessionResource: URI, request: IChatRequestModel) {
		if (!(request instanceof ChatRequestModel)) {
			throw new TypeError('Can only adopt requests of type ChatRequestModel');
		}
		const target = this._sessionModels.get(sessionResource);
		if (!target) {
			throw new Error(`Unknown session: ${sessionResource}`);
		}

		const oldOwner = request.session;
		target.adoptRequest(request);

		if (request.response && !request.response.isComplete) {
			const cts = this._pendingRequests.deleteAndLeak(oldOwner.sessionResource);
			if (cts) {
				cts.requestId = request.id;
				this._pendingRequests.set(target.sessionResource, cts);
			}
		}
	}

	async addCompleteRequest(sessionResource: URI, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): Promise<void> {
		this.trace('addCompleteRequest', `message: ${message}`);

		const model = this._sessionModels.get(sessionResource);
		if (!model) {
			throw new Error(`Unknown session: ${sessionResource}`);
		}

		const parsedRequest = typeof message === 'string' ?
			this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, message) :
			message;
		const request = model.addRequest(parsedRequest, variableData || { variables: [] }, attempt ?? 0, undefined, undefined, undefined, undefined, undefined, undefined, true);
		if (typeof response.message === 'string') {
			// TODO is this possible?
			model.acceptResponseProgress(request, { content: new MarkdownString(response.message), kind: 'markdownContent' });
		} else {
			for (const part of response.message) {
				model.acceptResponseProgress(request, part, true);
			}
		}
		model.setResponse(request, response.result || {});
		if (response.followups !== undefined) {
			model.setFollowups(request, response.followups);
		}
		request.response?.complete();
	}

	cancelCurrentRequestForSession(sessionResource: URI): void {
		this.trace('cancelCurrentRequestForSession', `session: ${sessionResource}`);
		this._pendingRequests.get(sessionResource)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionResource);
	}

	public hasSessions(): boolean {
		return this._chatSessionStore.hasSessions();
	}

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void {
		const model = Iterable.find(this._sessionModels.values(), model => model.sessionId === transferredSessionData.sessionId);
		if (!model) {
			throw new Error(`Failed to transfer session. Unknown session ID: ${transferredSessionData.sessionId}`);
		}

		const existingRaw: IChatTransfer2[] = this.storageService.getObject(TransferredGlobalChatKey, StorageScope.PROFILE, []);
		existingRaw.push({
			chat: model.toJSON(),
			timestampInMilliseconds: Date.now(),
			toWorkspace: toWorkspace,
			inputState: transferredSessionData.inputState,
			location: transferredSessionData.location,
		});

		this.storageService.store(TransferredGlobalChatKey, JSON.stringify(existingRaw), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.chatTransferService.addWorkspaceToTransferred(toWorkspace);
		this.trace('transferChatSession', `Transferred session ${model.sessionResource} to workspace ${toWorkspace.toString()}`);
	}

	getChatStorageFolder(): URI {
		return this._chatSessionStore.getChatStorageFolder();
	}

	logChatIndex(): void {
		this._chatSessionStore.logIndex();
	}

	setTitle(sessionResource: URI, title: string): void {
		this._sessionModels.get(sessionResource)?.setCustomTitle(title);
	}

	appendProgress(request: IChatRequestModel, progress: IChatProgress): void {
		const model = this._sessionModels.get(request.session.sessionResource);
		if (!(request instanceof ChatRequestModel)) {
			throw new BugIndicatingError('Can only append progress to requests of type ChatRequestModel');
		}

		model?.acceptResponseProgress(request, progress);
	}

	private toLocalSessionId(sessionResource: URI) {
		const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (!localSessionId) {
			throw new Error(`Invalid local chat session resource: ${sessionResource}`);
		}
		return localSessionId;
	}
}
