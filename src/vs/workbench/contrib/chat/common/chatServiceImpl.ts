/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { memoize } from '../../../../base/common/decorators.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { revive } from '../../../../base/common/marshalling.js';
import { autorun, derived, IObservable, ObservableMap } from '../../../../base/common/observable.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IMcpService } from '../../mcp/common/mcpTypes.js';
import { IChatAgent, IChatAgentCommand, IChatAgentData, IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentResult, IChatAgentService } from './chatAgents.js';
import { ChatModel, ChatRequestModel, ChatRequestRemovalReason, IChatModel, IChatRequestModel, IChatRequestVariableData, IChatResponseModel, IExportableChatData, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, normalizeSerializableChatData, toChatHistoryContent, updateRanges } from './chatModel.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText, IParsedChatRequest } from './chatParserTypes.js';
import { ChatRequestParser } from './chatRequestParser.js';
import { IChatCompleteResponse, IChatDetail, IChatFollowup, IChatProgress, IChatSendRequestData, IChatSendRequestOptions, IChatSendRequestResponseState, IChatService, IChatTransferredSessionData, IChatUserActionEvent } from './chatService.js';
import { ChatServiceTelemetry } from './chatServiceTelemetry.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { ChatSessionStore, IChatTransfer2 } from './chatSessionStore.js';
import { IChatSlashCommandService } from './chatSlashCommands.js';
import { IChatTransferService } from './chatTransferService.js';
import { ChatSessionUri } from './chatUri.js';
import { IChatRequestVariableEntry, isImageVariableEntry } from './chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from './constants.js';
import { ChatMessageRole, IChatMessage, ILanguageModelsService } from './languageModels.js';
import { ILanguageModelToolsService } from './languageModelToolsService.js';

const serializedChatKey = 'interactive.sessions';

const globalChatKey = 'chat.workspaceTransfer';

const SESSION_TRANSFER_EXPIRATION_IN_MILLISECONDS = 1000 * 60;

type ChatProviderInvokedEvent = {
	timeToFirstProgress: number | undefined;
	totalTime: number | undefined;
	result: 'success' | 'error' | 'errorWithOutput' | 'cancelled' | 'filtered';
	requestType: 'string' | 'followup' | 'slashCommand';
	chatSessionId: string;
	agent: string;
	agentExtensionId: string | undefined;
	slashCommand: string | undefined;
	location: ChatAgentLocation;
	citations: number;
	numCodeBlocks: number;
	isParticipantDetected: boolean;
	enableCommandDetection: boolean;
	attachmentKinds: string[];
	model: string | undefined;
};

type ChatProviderInvokedClassification = {
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The time in milliseconds from invoking the provider to getting the first data.' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The total time it took to run the provider\'s `provideResponseWithProgress`.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the ChatProvider resulted in an error.' };
	requestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of request that the user made.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random ID for the session.' };
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of agent used.' };
	agentExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the agent.' };
	slashCommand?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of slashCommand used.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location at which chat request was made.' };
	citations: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of public code citations that were returned with the response.' };
	numCodeBlocks: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of code blocks in the response.' };
	isParticipantDetected: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the participant was automatically detected.' };
	enableCommandDetection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether participation detection was disabled for this invocation.' };
	attachmentKinds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The types of variables/attachments that the user included with their query.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model used to generate the response.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of Chat agents.';
};

const maxPersistedSessions = 25;

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

	private readonly _sessionModels = new ObservableMap<string, ChatModel>();
	private readonly _contentProviderSessionModels = new Map<string, Map<string, { readonly model: IChatModel; readonly disposables: DisposableStore }>>();
	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellableRequest>());
	private _persistedSessions: ISerializableChatsData;

	/** Just for empty windows, need to enforce that a chat was deleted, even though other windows still have it */
	private _deletedChatIds = new Set<string>();

	private _transferredSessionData: IChatTransferredSessionData | undefined;
	public get transferredSessionData(): IChatTransferredSessionData | undefined {
		return this._transferredSessionData;
	}

	private readonly _onDidSubmitRequest = this._register(new Emitter<{ chatSessionId: string }>());
	public readonly onDidSubmitRequest: Event<{ chatSessionId: string }> = this._onDidSubmitRequest.event;

	private readonly _onDidPerformUserAction = this._register(new Emitter<IChatUserActionEvent>());
	public readonly onDidPerformUserAction: Event<IChatUserActionEvent> = this._onDidPerformUserAction.event;

	private readonly _onDidDisposeSession = this._register(new Emitter<{ sessionId: string; reason: 'cleared' }>());
	public readonly onDidDisposeSession = this._onDidDisposeSession.event;

	private readonly _sessionFollowupCancelTokens = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly _chatServiceTelemetry: ChatServiceTelemetry;
	private readonly _chatSessionStore: ChatSessionStore;

	readonly requestInProgressObs: IObservable<boolean>;

	@memoize
	private get useFileStorage(): boolean {
		return this.configurationService.getValue(ChatConfiguration.UseFileStorage);
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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatTransferService private readonly chatTransferService: IChatTransferService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatSessionsService private readonly chatSessionService: IChatSessionsService,
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super();

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
				inputValue: transferredData.inputValue,
				location: transferredData.location,
				mode: transferredData.mode,
			};
		}

		this._chatSessionStore = this._register(this.instantiationService.createInstance(ChatSessionStore));
		if (this.useFileStorage) {
			this._chatSessionStore.migrateDataIfNeeded(() => this._persistedSessions);
		}

		this._register(storageService.onWillSaveState(() => this.saveState()));

		this.requestInProgressObs = derived(reader => {
			const models = this._sessionModels.observable.read(reader).values();
			return Array.from(models).some(model => model.requestInProgressObs.read(reader));
		});
	}

	isEnabled(location: ChatAgentLocation): boolean {
		return this.chatAgentService.getContributedDefaultAgent(location) !== undefined;
	}

	private saveState(): void {
		const liveChats = Array.from(this._sessionModels.values())
			.filter(session => session.initialLocation === ChatAgentLocation.Panel);

		if (this.useFileStorage) {
			this._chatSessionStore.storeSessions(liveChats);
		} else {
			if (this.isEmptyWindow) {
				this.syncEmptyWindowChats(liveChats);
			} else {
				let allSessions: (ChatModel | ISerializableChatData)[] = liveChats;
				allSessions = allSessions.concat(
					Object.values(this._persistedSessions)
						.filter(session => !this._sessionModels.has(session.sessionId))
						.filter(session => session.requests.length));
				allSessions.sort((a, b) => (b.creationDate ?? 0) - (a.creationDate ?? 0));

				allSessions = allSessions.slice(0, maxPersistedSessions);

				if (allSessions.length) {
					this.trace('onWillSaveState', `Persisting ${allSessions.length} sessions`);
				}

				const serialized = JSON.stringify(allSessions);

				if (allSessions.length) {
					this.trace('onWillSaveState', `Persisting ${serialized.length} chars`);
				}

				this.storageService.store(serializedChatKey, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}

		}

		this._deletedChatIds.clear();
	}

	private syncEmptyWindowChats(thisWindowChats: ChatModel[]): void {
		// Note- an unavoidable race condition exists here. If there are multiple empty windows open, and the user quits the application, then the focused
		// window may lose active chats, because all windows are reading and writing to storageService at the same time. This can't be fixed without some
		// kind of locking, but in reality, the focused window will likely have run `saveState` at some point, like on a window focus change, and it will
		// generally be fine.
		const sessionData = this.storageService.get(serializedChatKey, StorageScope.APPLICATION, '');

		const originalPersistedSessions = this._persistedSessions;
		let persistedSessions: ISerializableChatsData;
		if (sessionData) {
			persistedSessions = this.deserializeChats(sessionData);
			const countsForLog = Object.keys(persistedSessions).length;
			if (countsForLog > 0) {
				this.trace('constructor', `Restored ${countsForLog} persisted sessions`);
			}
		} else {
			persistedSessions = {};
		}

		this._deletedChatIds.forEach(id => delete persistedSessions[id]);

		// Has the chat in this window been updated, and then closed? Overwrite the old persisted chats.
		Object.values(originalPersistedSessions).forEach(session => {
			const persistedSession = persistedSessions[session.sessionId];
			if (persistedSession && session.requests.length > persistedSession.requests.length) {
				// We will add a 'modified date' at some point, but comparing the number of requests is good enough
				persistedSessions[session.sessionId] = session;
			} else if (!persistedSession && session.isNew) {
				// This session was created in this window, and hasn't been persisted yet
				session.isNew = false;
				persistedSessions[session.sessionId] = session;
			}
		});

		this._persistedSessions = persistedSessions;

		// Add this window's active chat models to the set to persist.
		// Having the same session open in two empty windows at the same time can lead to data loss, this is acceptable
		const allSessions: Record<string, ISerializableChatData | ChatModel> = { ...this._persistedSessions };
		for (const chat of thisWindowChats) {
			allSessions[chat.sessionId] = chat;
		}

		let sessionsList = Object.values(allSessions);
		sessionsList.sort((a, b) => (b.creationDate ?? 0) - (a.creationDate ?? 0));
		sessionsList = sessionsList.slice(0, maxPersistedSessions);
		const data = JSON.stringify(sessionsList);
		this.storageService.store(serializedChatKey, data, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	notifyUserAction(action: IChatUserActionEvent): void {
		this._chatServiceTelemetry.notifyUserAction(action);
		this._onDidPerformUserAction.fire(action);
		if (action.action.kind === 'chatEditingSessionAction') {
			const model = this._sessionModels.get(action.sessionId);
			if (model) {
				model.notifyEditingAction(action.action);
			}
		}
	}

	async setChatSessionTitle(sessionId: string, title: string): Promise<void> {
		const model = this._sessionModels.get(sessionId);
		if (model) {
			model.setCustomTitle(title);
			return;
		}

		if (this.useFileStorage) {
			await this._chatSessionStore.setSessionTitle(sessionId, title);
			return;
		}

		const session = this._persistedSessions[sessionId];
		if (session) {
			session.customTitle = title;
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
		const data: IChatTransfer2[] = this.storageService.getObject(globalChatKey, StorageScope.PROFILE, []);
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
		this.storageService.store(globalChatKey, JSON.stringify(filtered), StorageScope.PROFILE, StorageTarget.MACHINE);
		return transferred;
	}

	/**
	 * Returns an array of chat details for all persisted chat sessions that have at least one request.
	 * Chat sessions that have already been loaded into the chat view are excluded from the result.
	 * Imported chat sessions are also excluded from the result.
	 */
	async getHistory(): Promise<IChatDetail[]> {
		if (this.useFileStorage) {
			const liveSessionItems = Array.from(this._sessionModels.values())
				.filter(session => !session.isImported)
				.map(session => {
					const title = session.title || localize('newChat', "New Chat");
					return {
						sessionId: session.sessionId,
						title,
						lastMessageDate: session.lastMessageDate,
						isActive: true,
					} satisfies IChatDetail;
				});

			const index = await this._chatSessionStore.getIndex();
			const entries = Object.values(index)
				.filter(entry => !this._sessionModels.has(entry.sessionId) && !entry.isImported && !entry.isEmpty)
				.map((entry): IChatDetail => ({
					...entry,
					isActive: this._sessionModels.has(entry.sessionId),
				}));
			return [...liveSessionItems, ...entries];
		}

		const persistedSessions = Object.values(this._persistedSessions)
			.filter(session => session.requests.length > 0)
			.filter(session => !this._sessionModels.has(session.sessionId));

		const persistedSessionItems = persistedSessions
			.filter(session => !session.isImported)
			.map(session => {
				const title = session.customTitle ?? ChatModel.getDefaultTitle(session.requests);
				return {
					sessionId: session.sessionId,
					title,
					lastMessageDate: session.lastMessageDate,
					isActive: false,
				} satisfies IChatDetail;
			});
		const liveSessionItems = Array.from(this._sessionModels.values())
			.filter(session => !session.isImported)
			.map(session => {
				const title = session.title || localize('newChat', "New Chat");
				return {
					sessionId: session.sessionId,
					title,
					lastMessageDate: session.lastMessageDate,
					isActive: true,
				} satisfies IChatDetail;
			});
		return [...liveSessionItems, ...persistedSessionItems];
	}

	async removeHistoryEntry(sessionId: string): Promise<void> {
		if (this.useFileStorage) {
			await this._chatSessionStore.deleteSession(sessionId);
			return;
		}

		if (this._persistedSessions[sessionId]) {
			this._deletedChatIds.add(sessionId);
			delete this._persistedSessions[sessionId];
			this.saveState();
		}
	}

	async clearAllHistoryEntries(): Promise<void> {
		if (this.useFileStorage) {
			await this._chatSessionStore.clearAllSessions();
			return;
		}

		Object.values(this._persistedSessions).forEach(session => this._deletedChatIds.add(session.sessionId));
		this._persistedSessions = {};
		this.saveState();
	}

	startSession(location: ChatAgentLocation, token: CancellationToken, isGlobalEditingSession: boolean = true): ChatModel {
		this.trace('startSession');
		return this._startSession(undefined, location, isGlobalEditingSession, token);
	}

	private _startSession(someSessionHistory: IExportableChatData | ISerializableChatData | undefined, location: ChatAgentLocation, isGlobalEditingSession: boolean, token: CancellationToken): ChatModel {
		const model = this.instantiationService.createInstance(ChatModel, someSessionHistory, location);
		if (location === ChatAgentLocation.Panel) {
			model.startEditingSession(isGlobalEditingSession);
		}

		this._sessionModels.set(model.sessionId, model);
		this.initializeSession(model, token);
		return model;
	}

	private initializeSession(model: ChatModel, token: CancellationToken): void {
		this.trace('initializeSession', `Initialize session ${model.sessionId}`);

		// Activate the default extension provided agent but do not wait
		// for it to be ready so that the session can be used immediately
		// without having to wait for the agent to be ready.
		this.activateDefaultAgent(model.initialLocation).catch(e => this.logService.error(e));
	}

	async activateDefaultAgent(location: ChatAgentLocation): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		const defaultAgentData = this.chatAgentService.getContributedDefaultAgent(location) ?? this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Panel);
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

	getSession(sessionId: string): IChatModel | undefined {
		return this._sessionModels.get(sessionId);
	}

	async getOrRestoreSession(sessionId: string): Promise<ChatModel | undefined> {
		this.trace('getOrRestoreSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (model) {
			return model;
		}

		let sessionData: ISerializableChatData | undefined;
		if (!this.useFileStorage || this.transferredSessionData?.sessionId === sessionId) {
			sessionData = revive(this._persistedSessions[sessionId]);
		} else {
			sessionData = revive(await this._chatSessionStore.readSession(sessionId));
		}

		if (!sessionData) {
			return undefined;
		}

		const session = this._startSession(sessionData, sessionData.initialLocation ?? ChatAgentLocation.Panel, true, CancellationToken.None);

		const isTransferred = this.transferredSessionData?.sessionId === sessionId;
		if (isTransferred) {
			// TODO
			// this.chatAgentService.toggleToolsAgentMode(this.transferredSessionData.toolsAgentModeEnabled);
			this._transferredSessionData = undefined;
		}

		return session;
	}

	/**
	 * This is really just for migrating data from the edit session location to the panel.
	 */
	isPersistedSessionEmpty(sessionId: string): boolean {
		const session = this._persistedSessions[sessionId];
		if (session) {
			return session.requests.length === 0;
		}

		return this._chatSessionStore.isSessionEmpty(sessionId);
	}

	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModel | undefined {
		return this._startSession(data, data.initialLocation ?? ChatAgentLocation.Panel, true, CancellationToken.None);
	}

	async loadSessionForResource(resource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModel | undefined> {
		// TODO: Move this into a new ChatModelService
		const parsed = ChatSessionUri.parse(resource);
		if (!parsed) {
			throw new Error('Invalid chat session URI');
		}

		const existing = this._contentProviderSessionModels.get(parsed.chatSessionType)?.get(parsed.sessionId);
		if (existing) {
			return existing.model;
		}

		const chatSessionType = parsed.chatSessionType;
		const content = await this.chatSessionService.provideChatSessionContent(chatSessionType, parsed.sessionId, CancellationToken.None);

		const model = this._startSession(undefined, location, true, CancellationToken.None);
		if (!this._contentProviderSessionModels.has(chatSessionType)) {
			this._contentProviderSessionModels.set(chatSessionType, new Map());
		}
		const disposables = new DisposableStore();
		this._contentProviderSessionModels.get(chatSessionType)!.set(parsed.sessionId, { model, disposables });

		disposables.add(model.onDidDispose(() => {
			this._contentProviderSessionModels?.get(chatSessionType)?.delete(parsed.sessionId);
			content.dispose();
		}));

		let lastRequest: ChatRequestModel | undefined;
		for (const message of content.history) {
			if (message.type === 'request') {
				const requestText = message.prompt;

				const parsedRequest: IParsedChatRequest = {
					text: requestText,
					parts: [new ChatRequestTextPart(
						new OffsetRange(0, requestText.length),
						{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: requestText.length + 1 },
						requestText
					)]
				};
				lastRequest = model.addRequest(parsedRequest,
					{ variables: [] }, // variableData
					0, // attempt
					undefined, // chatAgent - will use default
					undefined, // slashCommand
					undefined, // confirmation
					undefined, // locationData
					undefined, // attachments
					true // isCompleteAddedRequest - this indicates it's a complete request, not user input
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

		if (content.progressEvent && lastRequest) {
			const initialCancellationRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined);
			this._pendingRequests.set(model.sessionId, initialCancellationRequest);
			const cancellationListener = new MutableDisposable();

			const createCancellationListener = (token: CancellationToken) => {
				return token.onCancellationRequested(() => {
					content.interruptActiveResponseCallback?.().then(userConfirmedInterruption => {
						if (!userConfirmedInterruption) {
							// User cancelled the interruption
							const newCancellationRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined);
							this._pendingRequests.set(model.sessionId, newCancellationRequest);
							cancellationListener.value = createCancellationListener(newCancellationRequest.cancellationTokenSource.token);
						}
					});
				});
			};

			cancellationListener.value = createCancellationListener(initialCancellationRequest.cancellationTokenSource.token);
			disposables.add(cancellationListener);

			disposables.add(content.progressEvent(e => {
				for (const progress of e) {
					if (progress.kind === 'progressMessage' && progress.content.value === 'Session completed') {
						model?.completeResponse(lastRequest);
						cancellationListener.clear();
					} else {
						model?.acceptResponseProgress(lastRequest, progress);
					}
				}
			}));
		} else {
			if (lastRequest) {
				model.completeResponse(lastRequest);
			}
		}

		return model;
	}

	async resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void> {
		const model = this._sessionModels.get(request.session.sessionId);
		if (!model && model !== request.session) {
			throw new Error(`Unknown session: ${request.session.sessionId}`);
		}

		const cts = this._pendingRequests.get(request.session.sessionId);
		if (cts) {
			this.trace('resendRequest', `Session ${request.session.sessionId} already has a pending request, cancelling...`);
			cts.cancel();
		}

		const location = options?.location ?? model.initialLocation;
		const attempt = options?.attempt ?? 0;
		const enableCommandDetection = !options?.noCommandDetection;
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.mode)!;

		model.removeRequest(request.id, ChatRequestRemovalReason.Resend);

		const resendOptions: IChatSendRequestOptions = {
			...options,
			locationData: request.locationData,
			attachedContext: request.attachedContext,
		};
		await this._sendRequestAsync(model, model.sessionId, request.message, attempt, enableCommandDetection, defaultAgent, location, resendOptions).responseCompletePromise;
	}

	async sendRequest(sessionId: string, request: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined> {
		this.trace('sendRequest', `sessionId: ${sessionId}, message: ${request.substring(0, 20)}${request.length > 20 ? '[...]' : ''}}`);


		if (!request.trim() && !options?.slashCommand && !options?.agentId) {
			this.trace('sendRequest', 'Rejected empty message');
			return;
		}

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		if (this._pendingRequests.has(sessionId)) {
			this.trace('sendRequest', `Session ${sessionId} already has a pending request`);
			return;
		}

		const requests = model.getRequests();
		for (let i = requests.length - 1; i >= 0; i -= 1) {
			const request = requests[i];
			if (request.shouldBeRemovedOnSend) {
				if (request.shouldBeRemovedOnSend.afterUndoStop) {
					request.response?.finalizeUndoState();
				} else {
					await this.removeRequest(sessionId, request.id);
				}
			}
		}

		const location = options?.location ?? model.initialLocation;
		const attempt = options?.attempt ?? 0;
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.mode)!;

		const parsedRequest = this.parseChatRequest(sessionId, request, location, options);
		const agent = parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
		const agentSlashCommandPart = parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);

		// This method is only returning whether the request was accepted - don't block on the actual request
		return {
			...this._sendRequestAsync(model, sessionId, parsedRequest, attempt, !options?.noCommandDetection, defaultAgent, location, options),
			agent,
			slashCommand: agentSlashCommandPart?.command,
		};
	}

	private parseChatRequest(sessionId: string, request: string, location: ChatAgentLocation, options: IChatSendRequestOptions | undefined): IParsedChatRequest {
		let parserContext = options?.parserContext;
		if (options?.agentId) {
			const agent = this.chatAgentService.getAgent(options.agentId);
			if (!agent) {
				throw new Error(`Unknown agent: ${options.agentId}`);
			}
			parserContext = { selectedAgent: agent, mode: options.mode };
			const commandPart = options.slashCommand ? ` ${chatSubcommandLeader}${options.slashCommand}` : '';
			request = `${chatAgentLeader}${agent.name}${commandPart} ${request}`;
		}

		const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionId, request, location, parserContext);
		return parsedRequest;
	}

	private refreshFollowupsCancellationToken(sessionId: string): CancellationToken {
		this._sessionFollowupCancelTokens.get(sessionId)?.cancel();
		const newTokenSource = new CancellationTokenSource();
		this._sessionFollowupCancelTokens.set(sessionId, newTokenSource);

		return newTokenSource.token;
	}

	private _sendRequestAsync(model: ChatModel, sessionId: string, parsedRequest: IParsedChatRequest, attempt: number, enableCommandDetection: boolean, defaultAgent: IChatAgent, location: ChatAgentLocation, options?: IChatSendRequestOptions): IChatSendRequestResponseState {
		const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionId);
		let request: ChatRequestModel;
		const agentPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
		const agentSlashCommandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);
		const commandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestSlashCommandPart => r instanceof ChatRequestSlashCommandPart);
		const requests = [...model.getRequests()];

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
						this.trace('sendRequest', `Provider returned progress for session ${model.sessionId}, ${progressItem.content.value.length} chars`);
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
				this.trace('sendRequest', `Request for session ${model.sessionId} was cancelled`);
				if (!request) {
					return;
				}

				this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					timeToFirstProgress: undefined,
					// Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
					totalTime: stopWatch.elapsed(),
					result: 'cancelled',
					requestType,
					agent: detectedAgent?.id ?? agentPart?.agent.id ?? '',
					agentExtensionId: detectedAgent?.extensionId.value ?? agentPart?.agent.extensionId.value ?? '',
					slashCommand: agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command,
					chatSessionId: model.sessionId,
					location,
					citations: request?.response?.codeCitations.length ?? 0,
					numCodeBlocks: getCodeBlocks(request.response?.response.toString() ?? '').length,
					isParticipantDetected: !!detectedAgent,
					enableCommandDetection,
					attachmentKinds: this.attachmentKindsForTelemetry(request.variableData),
					model: this.resolveModelId(options?.userSelectedModelId),
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
						request = chatRequest ?? model.addRequest(parsedRequest, initVariableData, attempt, agent, command, options?.confirmation, options?.locationData, options?.attachedContext, undefined, options?.userSelectedModelId);

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

						let isInitialTools = true;

						store.add(autorun(reader => {
							const tools = options?.userSelectedTools?.read(reader);
							if (isInitialTools) {
								isInitialTools = false;
								return;
							}

							if (tools) {
								this.chatAgentService.setRequestTools(agent.id, request.id, { userSelectedTools: tools });
							}
						}));

						return {
							sessionId,
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
							modeInstructions: options?.modeInstructions,
							editedFileEvents: request.editedFileEvents
						} satisfies IChatAgentRequest;
					};

					if (this.configurationService.getValue('chat.detectParticipant.enabled') !== false && this.chatAgentService.hasChatParticipantDetectionProviders() && !agentPart && !commandPart && !agentSlashCommandPart && enableCommandDetection && options?.mode !== ChatModeKind.Agent && options?.mode !== ChatModeKind.Edit) {
						// We have no agent or command to scope history with, pass the full history to the participant detection provider
						const defaultAgentHistory = this.getHistoryEntriesFromModel(requests, model.sessionId, location, defaultAgent.id);

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
					await Promise.all([
						this.extensionService.activateByEvent(`onChatParticipant:${agent.id}`),
						this.mcpService.autostart(token),
					]);

					// Recompute history in case the agent or command changed
					const history = this.getHistoryEntriesFromModel(requests, model.sessionId, location, agent.id);
					const requestProps = prepareChatAgentRequest(agent, command, enableCommandDetection, request /* Reuse the request object if we already created it for participant detection */, !!detectedAgent);
					const pendingRequest = this._pendingRequests.get(sessionId);
					if (pendingRequest && !pendingRequest.requestId) {
						pendingRequest.requestId = requestProps.requestId;
					}
					completeResponseCreated();
					const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
					rawResult = agentResult;
					agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, history, followupsCancelToken);
					chatTitlePromise = model.getRequests().length === 1 && !model.customTitle ? this.chatAgentService.getChatTitle(defaultAgent.id, this.getHistoryEntriesFromModel(model.getRequests(), model.sessionId, location, agent.id), CancellationToken.None) : undefined;
				} else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command)) {
					if (commandPart.slashCommand.silent !== true) {
						request = model.addRequest(parsedRequest, { variables: [] }, attempt);
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
					}), history, location, token);
					agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
					rawResult = {};

				} else {
					throw new Error(`Cannot handle request`);
				}

				if (token.isCancellationRequested && !rawResult) {
					return;
				} else {
					if (!rawResult) {
						this.trace('sendRequest', `Provider returned no response for session ${model.sessionId}`);
						rawResult = { errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
					}

					const result = rawResult.errorDetails?.responseIsFiltered ? 'filtered' :
						rawResult.errorDetails && gotProgress ? 'errorWithOutput' :
							rawResult.errorDetails ? 'error' :
								'success';
					const commandForTelemetry = agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command;
					this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
						timeToFirstProgress: rawResult.timings?.firstProgress,
						totalTime: rawResult.timings?.totalElapsed,
						result,
						requestType,
						agent: detectedAgent?.id ?? agentPart?.agent.id ?? '',
						agentExtensionId: detectedAgent?.extensionId.value ?? agentPart?.agent.extensionId.value ?? '',
						slashCommand: commandForTelemetry,
						chatSessionId: model.sessionId,
						enableCommandDetection,
						isParticipantDetected: !!detectedAgent,
						location,
						citations: request.response?.codeCitations.length ?? 0,
						numCodeBlocks: getCodeBlocks(request.response?.response.toString() ?? '').length,
						attachmentKinds: this.attachmentKindsForTelemetry(request.variableData),
						model: this.resolveModelId(options?.userSelectedModelId),
					});
					model.setResponse(request, rawResult);
					completeResponseCreated();
					this.trace('sendRequest', `Provider returned response for session ${model.sessionId}`);

					model.completeResponse(request);
					if (agentOrCommandFollowups) {
						agentOrCommandFollowups.then(followups => {
							model.setFollowups(request, followups);
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
				const result = 'error';
				this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					timeToFirstProgress: undefined,
					totalTime: undefined,
					result,
					requestType,
					agent: detectedAgent?.id ?? agentPart?.agent.id ?? '',
					agentExtensionId: detectedAgent?.extensionId.value ?? agentPart?.agent.extensionId.value ?? '',
					slashCommand: agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command,
					chatSessionId: model.sessionId,
					location,
					citations: 0,
					numCodeBlocks: 0,
					enableCommandDetection,
					isParticipantDetected: !!detectedAgent,
					attachmentKinds: request ? this.attachmentKindsForTelemetry(request.variableData) : [],
					model: this.resolveModelId(options?.userSelectedModelId)
				});
				if (request) {
					const rawResult: IChatAgentResult = { errorDetails: { message: err.message } };
					model.setResponse(request, rawResult);
					completeResponseCreated();
					model.completeResponse(request);
				}
			} finally {
				store.dispose();
			}
		};
		const rawResponsePromise = sendRequestInternal();
		// Note- requestId is not known at this point, assigned later
		this._pendingRequests.set(model.sessionId, this.instantiationService.createInstance(CancellableRequest, source, undefined));
		rawResponsePromise.finally(() => {
			this._pendingRequests.deleteAndDispose(model.sessionId);
		});
		this._onDidSubmitRequest.fire({ chatSessionId: model.sessionId });
		return {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};
	}

	private resolveModelId(userSelectedModelId: string | undefined): string | undefined {
		return userSelectedModelId && this.languageModelsService.lookupLanguageModel(userSelectedModelId)?.id;
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

	private attachmentKindsForTelemetry(variableData: IChatRequestVariableData): string[] {
		// TODO this shows why attachments still have to be cleaned up somewhat
		return variableData.variables.map(v => {
			if (v.kind === 'implicit') {
				return 'implicit';
			} else if (v.range) {
				// 'range' is range within the prompt text
				if (v.kind === 'tool') {
					return 'toolInPrompt';
				} else if (v.kind === 'toolset') {
					return 'toolsetInPrompt';
				} else {
					return 'fileInPrompt';
				}
			} else if (v.kind === 'command') {
				return 'command';
			} else if (v.kind === 'symbol') {
				return 'symbol';
			} else if (isImageVariableEntry(v)) {
				return 'image';
			} else if (v.kind === 'directory') {
				return 'directory';
			} else if (v.kind === 'tool') {
				return 'tool';
			} else if (v.kind === 'toolset') {
				return 'toolset';
			} else {
				if (URI.isUri(v.value)) {
					return 'file';
				} else if (isLocation(v.value)) {
					return 'location';
				} else {
					return 'otherAttachment';
				}
			}
		});
	}

	private getHistoryEntriesFromModel(requests: IChatRequestModel[], sessionId: string, location: ChatAgentLocation, forAgentId: string): IChatAgentHistoryEntry[] {
		const history: IChatAgentHistoryEntry[] = [];
		const agent = this.chatAgentService.getAgent(forAgentId);
		for (const request of requests) {
			if (!request.response) {
				continue;
			}

			if (forAgentId !== request.response.agent?.id && !agent?.isDefault) {
				// An agent only gets to see requests that were sent to this agent.
				// The default agent (the undefined case) gets to see all of them.
				continue;
			}

			const promptTextResult = getPromptText(request.message);
			const historyRequest: IChatAgentRequest = {
				sessionId: sessionId,
				requestId: request.id,
				agentId: request.response.agent?.id ?? '',
				message: promptTextResult.message,
				command: request.response.slashCommand?.name,
				variables: updateRanges(request.variableData, promptTextResult.diff), // TODO bit of a hack
				location: ChatAgentLocation.Panel,
				editedFileEvents: request.editedFileEvents,
			};
			history.push({ request: historyRequest, response: toChatHistoryContent(request.response.response.value), result: request.response.result ?? {} });
		}

		return history;
	}

	async removeRequest(sessionId: string, requestId: string): Promise<void> {
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		const pendingRequest = this._pendingRequests.get(sessionId);
		if (pendingRequest?.requestId === requestId) {
			pendingRequest.cancel();
			this._pendingRequests.deleteAndDispose(sessionId);
		}

		model.removeRequest(requestId);
	}

	async adoptRequest(sessionId: string, request: IChatRequestModel) {
		if (!(request instanceof ChatRequestModel)) {
			throw new TypeError('Can only adopt requests of type ChatRequestModel');
		}
		const target = this._sessionModels.get(sessionId);
		if (!target) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		const oldOwner = request.session;
		target.adoptRequest(request);

		if (request.response && !request.response.isComplete) {
			const cts = this._pendingRequests.deleteAndLeak(oldOwner.sessionId);
			if (cts) {
				cts.requestId = request.id;
				this._pendingRequests.set(target.sessionId, cts);
			}
		}
	}

	async addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): Promise<void> {
		this.trace('addCompleteRequest', `message: ${message}`);

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		const parsedRequest = typeof message === 'string' ?
			this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionId, message) :
			message;
		const request = model.addRequest(parsedRequest, variableData || { variables: [] }, attempt ?? 0, undefined, undefined, undefined, undefined, undefined, true);
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
		model.completeResponse(request);
	}

	cancelCurrentRequestForSession(sessionId: string): void {
		this.trace('cancelCurrentRequestForSession', `sessionId: ${sessionId}`);
		this._pendingRequests.get(sessionId)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionId);
	}

	async clearSession(sessionId: string): Promise<void> {
		this.trace('clearSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		if (model.initialLocation === ChatAgentLocation.Panel) {
			if (this.useFileStorage) {
				if (model.getRequests().length === 0) {
					await this._chatSessionStore.deleteSession(sessionId);
				} else {
					await this._chatSessionStore.storeSessions([model]);
				}
			} else {
				if (model.getRequests().length === 0) {
					delete this._persistedSessions[sessionId];
				} else {
					// Turn all the real objects into actual JSON, otherwise, calling 'revive' may fail when it tries to
					// assign values to properties that are getters- microsoft/vscode-copilot-release#1233
					const sessionData: ISerializableChatData = JSON.parse(JSON.stringify(model));
					sessionData.isNew = true;
					this._persistedSessions[sessionId] = sessionData;
				}
			}
		}

		this._sessionModels.delete(sessionId);
		model.dispose();
		this._pendingRequests.get(sessionId)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionId);
		this._onDidDisposeSession.fire({ sessionId, reason: 'cleared' });
	}

	public hasSessions(): boolean {
		if (this.useFileStorage) {
			return this._chatSessionStore.hasSessions();
		} else {
			return Object.values(this._persistedSessions).length > 0;
		}
	}

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void {
		const model = Iterable.find(this._sessionModels.values(), model => model.sessionId === transferredSessionData.sessionId);
		if (!model) {
			throw new Error(`Failed to transfer session. Unknown session ID: ${transferredSessionData.sessionId}`);
		}

		const existingRaw: IChatTransfer2[] = this.storageService.getObject(globalChatKey, StorageScope.PROFILE, []);
		existingRaw.push({
			chat: model.toJSON(),
			timestampInMilliseconds: Date.now(),
			toWorkspace: toWorkspace,
			inputValue: transferredSessionData.inputValue,
			location: transferredSessionData.location,
			mode: transferredSessionData.mode,
		});

		this.storageService.store(globalChatKey, JSON.stringify(existingRaw), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.chatTransferService.addWorkspaceToTransferred(toWorkspace);
		this.trace('transferChatSession', `Transferred session ${model.sessionId} to workspace ${toWorkspace.toString()}`);
	}

	getChatStorageFolder(): URI {
		return this._chatSessionStore.getChatStorageFolder();
	}

	logChatIndex(): void {
		this._chatSessionStore.logIndex();
	}
}

function getCodeBlocks(text: string): string[] {
	const lines = text.split('\n');
	const codeBlockLanguages: string[] = [];

	let codeBlockState: undefined | { readonly delimiter: string; readonly languageId: string };
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (codeBlockState) {
			if (new RegExp(`^\\s*${codeBlockState.delimiter}\\s*$`).test(line)) {
				codeBlockLanguages.push(codeBlockState.languageId);
				codeBlockState = undefined;
			}
		} else {
			const match = line.match(/^(\s*)(`{3,}|~{3,})(\w*)/);
			if (match) {
				codeBlockState = { delimiter: match[2], languageId: match[3] };
			}
		}
	}
	return codeBlockLanguages;
}
