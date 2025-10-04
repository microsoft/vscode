/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { revive } from '../../../../base/common/marshalling.js';
import { autorun, derived, IObservable, ObservableMap } from '../../../../base/common/observable.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IMcpService } from '../../mcp/common/mcpTypes.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentResult, IChatAgentService } from './chatAgents.js';
import { ChatModel, ChatRequestModel, ChatRequestRemovalReason, IChatModel, IChatRequestModel, IChatRequestVariableData, IChatResponseModel, IExportableChatData, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, normalizeSerializableChatData, toChatHistoryContent, updateRanges } from './chatModel.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText, IParsedChatRequest } from './chatParserTypes.js';
import { ChatRequestParser } from './chatRequestParser.js';
import { IChatCompleteResponse, IChatDetail, IChatFollowup, IChatProgress, IChatSendRequestData, IChatSendRequestOptions, IChatSendRequestResponseState, IChatService, IChatTransferredSessionData, IChatUserActionEvent } from './chatService.js';
import { ChatRequestTelemetry, ChatServiceTelemetry } from './chatServiceTelemetry.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { ChatSessionStore, IChatTransfer2 } from './chatSessionStore.js';
import { IChatSlashCommandService } from './chatSlashCommands.js';
import { IChatTransferService } from './chatTransferService.js';
import { ChatSessionUri } from './chatUri.js';
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

	private readonly _sessionModels = new ObservableMap<string, ChatModel>();
	private readonly _contentProviderSessionModels = new Map<string, Map<string, { readonly model: IChatModel; readonly disposables: DisposableStore }>>();
	private readonly _modelToExternalSession = new Map<string /* internal model sessionId */, { chatSessionType: string; chatSessionId: string }>();
	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellableRequest>());
	private _persistedSessions: ISerializableChatsData;

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

	private _mcpServersInteractionMessageShown = new WeakSet<ChatModel>();

	readonly requestInProgressObs: IObservable<boolean>;

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
		this._chatSessionStore.migrateDataIfNeeded(() => this._persistedSessions);

		// When using file storage, populate _persistedSessions with session metadata from the index
		// This ensures that getPersistedSessionTitle() can find titles for inactive sessions
		this.initializePersistedSessionsFromFileStorage();

		this._register(storageService.onWillSaveState(() => this.saveState()));

		this.requestInProgressObs = derived(reader => {
			const models = this._sessionModels.observable.read(reader).values();
			return Array.from(models).some(model => model.requestInProgressObs.read(reader));
		});
	}

	public get editingSessions() {
		return [...this._sessionModels.values()].map(v => v.editingSession).filter(isDefined);
	}

	isEnabled(location: ChatAgentLocation): boolean {
		return this.chatAgentService.getContributedDefaultAgent(location) !== undefined;
	}

	private saveState(): void {
		const liveChats = Array.from(this._sessionModels.values())
			.filter(session =>
				!session.inputType && (session.initialLocation === ChatAgentLocation.Chat || session.initialLocation === ChatAgentLocation.EditorInline));

		this._chatSessionStore.storeSessions(liveChats);
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
		}

		// Update the title in the file storage
		await this._chatSessionStore.setSessionTitle(sessionId, title);
		// Trigger immediate save to ensure consistency
		this.saveState();
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
					isImported: metadata.isImported || false,
					initialLocation: metadata.initialLocation,
					requests: [], // Empty requests array - this is just for title lookup
					requesterUsername: '',
					responderUsername: '',
					requesterAvatarIconUri: undefined,
					responderAvatarIconUri: undefined,
				};

				this._persistedSessions[sessionId] = minimalSession;
			}
		}
	}

	/**
	 * Returns an array of chat details for all persisted chat sessions that have at least one request.
	 * Chat sessions that have already been loaded into the chat view are excluded from the result.
	 * Imported chat sessions are also excluded from the result.
	 */
	async getHistory(): Promise<IChatDetail[]> {
		const liveSessionItems = Array.from(this._sessionModels.values())
			.filter(session => !session.isImported && !session.inputType)
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

	async removeHistoryEntry(sessionId: string): Promise<void> {
		await this._chatSessionStore.deleteSession(sessionId);
	}

	async clearAllHistoryEntries(): Promise<void> {
		await this._chatSessionStore.clearAllSessions();
	}

	startSession(location: ChatAgentLocation, token: CancellationToken, isGlobalEditingSession: boolean = true, inputType?: string): ChatModel {
		this.trace('startSession');
		return this._startSession(undefined, location, isGlobalEditingSession, token, inputType);
	}

	private _startSession(someSessionHistory: IExportableChatData | ISerializableChatData | undefined, location: ChatAgentLocation, isGlobalEditingSession: boolean, token: CancellationToken, inputType?: string): ChatModel {
		const model = this.instantiationService.createInstance(ChatModel, someSessionHistory, { initialLocation: location, inputType });
		if (location === ChatAgentLocation.Chat) {
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
		if (this.transferredSessionData?.sessionId === sessionId) {
			sessionData = revive(this._persistedSessions[sessionId]);
		} else {
			sessionData = revive(await this._chatSessionStore.readSession(sessionId));
		}

		if (!sessionData) {
			return undefined;
		}

		const session = this._startSession(sessionData, sessionData.initialLocation ?? ChatAgentLocation.Chat, true, CancellationToken.None);

		const isTransferred = this.transferredSessionData?.sessionId === sessionId;
		if (isTransferred) {
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

	getPersistedSessionTitle(sessionId: string): string | undefined {
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
		// eslint-disable-next-line local/code-no-any-casts
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

	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModel | undefined {
		return this._startSession(data, data.initialLocation ?? ChatAgentLocation.Chat, true, CancellationToken.None);
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

		if (parsed.chatSessionType === 'local') {
			return this.getOrRestoreSession(parsed.sessionId);
		}

		const chatSessionType = parsed.chatSessionType;
		const content = await this.chatSessionService.provideChatSessionContent(chatSessionType, parsed.sessionId, CancellationToken.None);

		const model = this._startSession(undefined, location, true, CancellationToken.None, chatSessionType);
		// Record mapping from internal model session id to external contributed chat session identity
		this._modelToExternalSession.set(model.sessionId, { chatSessionType, chatSessionId: parsed.sessionId });
		if (!this._contentProviderSessionModels.has(chatSessionType)) {
			this._contentProviderSessionModels.set(chatSessionType, new Map());
		}
		const disposables = new DisposableStore();
		this._contentProviderSessionModels.get(chatSessionType)!.set(parsed.sessionId, { model, disposables });

		disposables.add(model.onDidDispose(() => {
			this._contentProviderSessionModels?.get(chatSessionType)?.delete(parsed.sessionId);
			this._modelToExternalSession.delete(model.sessionId);
			content.dispose();
		}));

		let lastRequest: ChatRequestModel | undefined;
		for (const message of content.history) {
			if (message.type === 'request') {
				if (lastRequest) {
					model.completeResponse(lastRequest);
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
					{ variables: [] }, // variableData
					0, // attempt
					undefined,
					agent,
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

		if (content.progressObs && lastRequest && content.interruptActiveResponseCallback) {
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

			let lastProgressLength = 0;
			disposables.add(autorun(reader => {
				const progressArray = content.progressObs?.read(reader) ?? [];
				const isComplete = content.isCompleteObs?.read(reader) ?? false;

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
					model?.completeResponse(lastRequest);
					cancellationListener.clear();
				}
			}));
		} else {
			if (lastRequest) {
				model.completeResponse(lastRequest);
			}
		}

		return model;
	}

	getChatSessionFromInternalId(modelSessionId: string): { chatSessionType: string; chatSessionId: string; isUntitled: boolean } | undefined {
		const data = this._modelToExternalSession.get(modelSessionId);
		if (!data) {
			return;
		}
		return {
			...data,
			isUntitled: data.chatSessionId.startsWith('untitled-'), // TODO(jospicer)
		};
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
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind)!;

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


		if (!request.trim() && !options?.slashCommand && !options?.agentId && !options?.agentIdSilent) {
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
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind)!;

		const parsedRequest = this.parseChatRequest(sessionId, request, location, options);
		const silentAgent = options?.agentIdSilent ? this.chatAgentService.getAgent(options.agentIdSilent) : undefined;
		const agent = silentAgent ?? parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
		const agentSlashCommandPart = parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);

		// This method is only returning whether the request was accepted - don't block on the actual request
		return {
			...this._sendRequestAsync(model, sessionId, parsedRequest, attempt, !options?.noCommandDetection, silentAgent ?? defaultAgent, location, options),
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
			parserContext = { selectedAgent: agent, mode: options.modeInfo?.kind };
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

	private _sendRequestAsync(model: ChatModel, sessionId: string, parsedRequest: IParsedChatRequest, attempt: number, enableCommandDetection: boolean, defaultAgent: IChatAgentData, location: ChatAgentLocation, options?: IChatSendRequestOptions): IChatSendRequestResponseState {
		const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionId);
		let request: ChatRequestModel;
		const agentPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
		const agentSlashCommandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);
		const commandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestSlashCommandPart => r instanceof ChatRequestSlashCommandPart);
		const requests = [...model.getRequests()];
		const requestTelemetry = this.instantiationService.createInstance(ChatRequestTelemetry, {
			agentPart,
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
						request = chatRequest ?? model.addRequest(parsedRequest, initVariableData, attempt, options?.modeInfo, agent, command, options?.confirmation, options?.locationData, options?.attachedContext, undefined, options?.userSelectedModelId);

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
								this.chatAgentService.setRequestTools(agent.id, request.id, tools);
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
							modeInstructions: options?.modeInfo?.modeInstructions,
							editedFileEvents: request.editedFileEvents,
							chatSummary: options?.chatSummary
						} satisfies IChatAgentRequest;
					};

					if (
						this.configurationService.getValue('chat.detectParticipant.enabled') !== false &&
						this.chatAgentService.hasChatParticipantDetectionProviders() &&
						!agentPart &&
						!commandPart &&
						!agentSlashCommandPart &&
						enableCommandDetection &&
						options?.modeInfo?.kind !== ChatModeKind.Agent &&
						options?.modeInfo?.kind !== ChatModeKind.Edit &&
						!options?.agentIdSilent
					) {
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

					const [, autostartResult] = await Promise.all([
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

					// Check if there are MCP servers requiring interaction and show message if not shown yet
					if (!this._mcpServersInteractionMessageShown.has(model) && autostartResult.serversRequiringInteraction.length > 0) {
						this._mcpServersInteractionMessageShown.add(model);
						progressCallback([{
							kind: 'mcpServersInteractionRequired',
							servers: autostartResult.serversRequiringInteraction,
							startCommand: {
								id: 'mcp.startServersWithInteraction',
								title: localize('chat.startMcpServers', 'Start MCP Servers'),
								arguments: []
							}
						}]);
					}

					const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
					rawResult = agentResult;
					agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, history, followupsCancelToken);

					// Use LLM to generate the chat title
					if (model.getRequests().length === 1 && !model.customTitle) {
						const chatHistory = this.getHistoryEntriesFromModel(model.getRequests(), model.sessionId, location, agent.id);
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
					this.trace('sendRequest', `Provider returned response for session ${model.sessionId}`);

					model.completeResponse(request);
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
				location: ChatAgentLocation.Chat,
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
		this.trace(`Model input type: ${model.inputType}`);
		if (!model.inputType && (model.initialLocation === ChatAgentLocation.Chat || model.initialLocation === ChatAgentLocation.EditorInline)) {
			// Always preserve sessions that have custom titles, even if empty
			if (model.getRequests().length === 0 && !model.customTitle) {
				await this._chatSessionStore.deleteSession(sessionId);
			} else {
				await this._chatSessionStore.storeSessions([model]);
			}
		}

		this._sessionModels.delete(sessionId);
		model.dispose();
		this._pendingRequests.get(sessionId)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionId);
		this._onDidDisposeSession.fire({ sessionId, reason: 'cleared' });
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
			inputValue: transferredSessionData.inputValue,
			location: transferredSessionData.location,
			mode: transferredSessionData.mode,
		});

		this.storageService.store(TransferredGlobalChatKey, JSON.stringify(existingRaw), StorageScope.PROFILE, StorageTarget.MACHINE);
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
