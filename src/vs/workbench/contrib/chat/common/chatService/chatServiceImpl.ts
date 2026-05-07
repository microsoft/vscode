/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatDebugService } from '../chatDebugService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { awaitStatsForSession } from '../chat.js';
import { ChatPerfMark, clearChatMarks, markChat } from '../chatPerf.js';
import { IChatAgentAttachmentCapabilities, IChatAgentCommand, IChatAgentData, IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../participants/chatAgents.js';
import { chatEditingSessionIsReady } from '../editing/chatEditingService.js';
import { ChatModel, ChatRequestModel, ChatRequestRemovalReason, IChatModel, IChatRequestModel, IChatRequestModeInfo, IChatRequestVariableData, IChatResponseModel, IExportableChatData, ISerializableChatData, ISerializableChatDataIn, ISerializableChatsData, ISerializedChatDataReference, normalizeSerializableChatData, toChatHistoryContent, updateRanges, ISerializableChatModelInputState } from '../model/chatModel.js';
import { ChatModelStore, IStartSessionProps } from '../model/chatModelStore.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText, IParsedChatRequest } from '../requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../requestParser/chatRequestParser.js';
import { ChatMcpServersStarting, ChatPendingRequestChangeClassification, ChatPendingRequestChangeEvent, ChatPendingRequestChangeEventName, ChatRequestQueueKind, ChatSendResult, ChatSendResultQueued, ChatSendResultSent, ChatStopCancellationNoopClassification, ChatStopCancellationNoopEvent, ChatStopCancellationNoopEventName, IChatCompleteResponse, IChatDetail, IChatFollowup, IChatModelReference, IChatProgress, IChatQuestionAnswers, IChatSendRequestOptions, IChatSendRequestResponseState, IChatService, IChatSessionStartOptions, IChatUserActionEvent, ResponseModelState } from './chatService.js';
import { ChatRequestTelemetry, ChatServiceTelemetry } from './chatServiceTelemetry.js';
import { IChatSessionsService, isAgentHostTarget, localChatSessionType } from '../chatSessionsService.js';
import { ChatSessionStore, IChatSessionEntryMetadata } from '../model/chatSessionStore.js';
import { IChatSlashCommandService } from '../participants/chatSlashCommands.js';
import { IChatTransferService } from '../model/chatTransferService.js';
import { chatSessionResourceToId, getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from '../model/chatUri.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, isPromptTextVariableEntry } from '../attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { ChatMessageRole, IChatMessage, ILanguageModelsService } from '../languageModels.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap } from '../tools/languageModelToolsService.js';
import { ChatSessionOperationLog } from '../model/chatSessionOperationLog.js';
import { IPromptsService } from '../promptSyntax/service/promptsService.js';
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, TROUBLESHOOT_COMMAND_NAME, TROUBLESHOOT_SKILL_PATH, COPILOT_SKILL_URI_SCHEME } from '../promptSyntax/promptTypes.js';
import { ChatRequestHooks, mergeHooks } from '../promptSyntax/hookSchema.js';
import { ComputeAutomaticInstructions } from '../promptSyntax/computeAutomaticInstructions.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { ChatMode } from '../chatModes.js';

const serializedChatKey = 'interactive.sessions';

/**
 * True when the user has typed text or attached non-trivial context to the input
 * but not yet sent it. Used to decide whether an external session needs metadata
 * persisted on dispose so the draft survives switching sessions.
 */
function hasDraftInput(model: ChatModel): boolean {
	const state = model.inputModel.state.get();
	if (!state) {
		return false;
	}
	if (state.inputText.trim().length > 0) {
		return true;
	}
	return state.attachments.length > 0;
}

class CancellableRequest implements IDisposable {
	private readonly _yieldRequested: ISettableObservable<boolean> = observableValue(this, false);

	get yieldRequested(): IObservable<boolean> {
		return this._yieldRequested;
	}


	constructor(
		public readonly cancellationTokenSource: CancellationTokenSource,
		public requestId: string | undefined,
		public readonly responseCompletePromise: Promise<void> | undefined,
		public sendOptions: IChatSendRequestOptions | undefined,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService
	) { }

	dispose() {
		if (this.requestId) {
			this.toolsService.cancelToolCallsForRequest(this.requestId);
		}
		this.cancellationTokenSource.dispose();
	}

	cancel() {
		if (this.requestId) {
			this.toolsService.cancelToolCallsForRequest(this.requestId);
		}

		this.cancellationTokenSource.cancel();
	}

	setYieldRequested(): void {
		this._yieldRequested.set(true, undefined);
	}

	resetYieldRequested(): void {
		this._yieldRequested.set(false, undefined);
	}
}

const EMPTY_REFERENCES: ReadonlyArray<IDynamicVariable> = Object.freeze([]);
const EMPTY_TOOL_ENABLEMENT_MAP: IToolAndToolSetEnablementMap = new Map();

export class ChatService extends Disposable implements IChatService {
	declare _serviceBrand: undefined;

	private readonly _sessionModels: ChatModelStore;
	private readonly _pendingRequests = this._register(new DisposableResourceMap<CancellableRequest>());
	private readonly _queuedRequestDeferreds = new Map<string, DeferredPromise<ChatSendResult>>();
	private _saveModelsEnabled = true;

	private _transferredSessionResource: URI | undefined;
	public get transferredSessionResource(): URI | undefined {
		return this._transferredSessionResource;
	}

	private readonly _onDidSubmitRequest = this._register(new Emitter<{ readonly chatSessionResource: URI; readonly message?: IParsedChatRequest }>());
	public readonly onDidSubmitRequest = this._onDidSubmitRequest.event;

	public get onDidCreateModel() { return this._sessionModels.onDidCreateModel; }

	private readonly _onDidPerformUserAction = this._register(new Emitter<IChatUserActionEvent>());
	public readonly onDidPerformUserAction: Event<IChatUserActionEvent> = this._onDidPerformUserAction.event;

	private readonly _onDidReceiveQuestionCarouselAnswer = this._register(new Emitter<{ requestId: string; resolveId: string; answers: IChatQuestionAnswers | undefined }>());
	public readonly onDidReceiveQuestionCarouselAnswer = this._onDidReceiveQuestionCarouselAnswer.event;

	private readonly _onDidDisposeSession = this._register(new Emitter<{ readonly sessionResources: URI[]; reason: 'cleared' }>());
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

	private get isEmptyWindow(): boolean {
		const workspace = this.workspaceContextService.getWorkspace();
		return !workspace.configuration && workspace.folders.length === 0;
	}

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatTransferService private readonly chatTransferService: IChatTransferService,
		@IChatSessionsService private readonly chatSessionService: IChatSessionsService,
		@IMcpService private readonly mcpService: IMcpService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
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
				} else if (!localSessionId && (model.getRequests().length > 0 || hasDraftInput(model))) {
					// External sessions: persist metadata when there are requests, OR when the
					// user has typed/attached unsent input we need to restore on next open.
					await this._chatSessionStore.storeSessionsMetadataOnly([model]);
				}
			}
		}));
		this._register(this._sessionModels.onDidDisposeModel(model => {
			clearChatMarks(model.sessionResource);
			this.chatDebugService.endSession(model.sessionResource);
			this._onDidDisposeSession.fire({ sessionResources: [model.sessionResource], reason: 'cleared' });
		}));

		this._chatServiceTelemetry = this.instantiationService.createInstance(ChatServiceTelemetry);
		this._chatSessionStore = this._register(this.instantiationService.createInstance(ChatSessionStore));
		this._chatSessionStore.migrateDataIfNeeded(() => this.migrateData());

		const transferredData = this._chatSessionStore.getTransferredSessionData();
		if (transferredData) {
			this.trace('constructor', `Transferred session ${transferredData}`);
			this._transferredSessionResource = transferredData;
		}

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

	private migrateData(): ISerializableChatsData | undefined {
		const sessionData = this.storageService.get(serializedChatKey, this.isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE, '');
		if (sessionData) {
			const persistedSessions = this.deserializeChats(sessionData);
			const countsForLog = Object.keys(persistedSessions).length;
			if (countsForLog > 0) {
				this.info('migrateData', `Restored ${countsForLog} persisted sessions`);
			}

			return persistedSessions;
		}

		return;
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

	notifyQuestionCarouselAnswer(requestId: string, resolveId: string, answers: IChatQuestionAnswers | undefined): void {
		this._onDidReceiveQuestionCarouselAnswer.fire({ requestId, resolveId, answers });
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

	private info(method: string, message?: string): void {
		if (message) {
			this.logService.info(`ChatService#${method}: ${message}`);
		} else {
			this.logService.info(`ChatService#${method}`);
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
			.map(chatModelToChatDetail));
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
		this._onDidDisposeSession.fire({ sessionResources: [sessionResource], reason: 'cleared' });
	}

	async clearAllHistoryEntries(): Promise<void> {
		await this._chatSessionStore.clearAllSessions();
	}

	startNewLocalSession(location: ChatAgentLocation, options?: IChatSessionStartOptions): IChatModelReference {
		this.trace('startNewLocalSession');
		const sessionResource = LocalChatSessionUri.forSession(generateUuid());
		return this._sessionModels.acquireOrCreate({
			initialData: undefined,
			location,
			sessionResource,
			canUseTools: options?.canUseTools ?? true,
			disableBackgroundKeepAlive: options?.disableBackgroundKeepAlive
		}, options?.debugOwner ?? 'ChatService#startNewLocalSession');
	}

	private _startSession(props: IStartSessionProps): ChatModel {
		const { initialData, location, sessionResource, canUseTools, transferEditingSession, disableBackgroundKeepAlive, inputState } = props;
		const model = this.instantiationService.createInstance(ChatModel, initialData, { initialLocation: location, canUseTools, resource: sessionResource, disableBackgroundKeepAlive, inputState });
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

	acquireExistingSession(sessionResource: URI, debugOwner?: string): IChatModelReference | undefined {
		return this._sessionModels.acquireExisting(sessionResource, debugOwner ?? 'ChatService#acquireExistingSession');
	}

	getChatModelReferenceDebugInfo() {
		return this._sessionModels.getReferenceDebugSnapshot();
	}

	private async acquireOrRestoreLocalSession(sessionResource: URI, debugOwner?: string): Promise<IChatModelReference | undefined> {
		this.trace('acquireOrRestoreSession', `${sessionResource}`);
		const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
		if (existingRef) {
			return existingRef;
		}

		let sessionData: ISerializedChatDataReference | undefined;
		if (isEqual(this.transferredSessionResource, sessionResource)) {
			this._transferredSessionResource = undefined;
			sessionData = await this._chatSessionStore.readTransferredSession(sessionResource);
		} else {
			const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
			if (localSessionId) {
				sessionData = await this._chatSessionStore.readSession(localSessionId);
			}
		}

		if (!sessionData) {
			return undefined;
		}

		const sessionRef = this._sessionModels.acquireOrCreate({
			initialData: sessionData,
			location: sessionData.value.initialLocation ?? ChatAgentLocation.Chat,
			sessionResource,
			canUseTools: true,
		}, debugOwner ?? 'ChatService#acquireOrRestoreLocalSession');

		return sessionRef;
	}

	// There are some cases where this returns a real string. What happens if it doesn't?
	// This had titles restored from the index, so just return titles from index instead, sync.
	getSessionTitle(sessionResource: URI): string | undefined {
		const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
		if (!sessionId) {
			return undefined;
		}

		return this._sessionModels.get(sessionResource)?.title ??
			this._chatSessionStore.getMetadataForSessionSync(sessionResource)?.title;
	}

	loadSessionFromData(data: IExportableChatData | ISerializableChatData, debugOwner?: string): IChatModelReference {
		const sessionId = (data as ISerializableChatData).sessionId ?? generateUuid();
		const sessionResource = LocalChatSessionUri.forSession(sessionId);
		return this._sessionModels.acquireOrCreate({
			initialData: { value: data, serializer: new ChatSessionOperationLog() },
			location: data.initialLocation ?? ChatAgentLocation.Chat,
			sessionResource,
			canUseTools: true,
		}, debugOwner ?? 'ChatService#loadSessionFromData');
	}

	async acquireOrLoadSession(sessionResource: URI, location: ChatAgentLocation, token: CancellationToken, debugOwner?: string): Promise<IChatModelReference | undefined> {
		if (LocalChatSessionUri.isLocalSession(sessionResource)) {
			return this.acquireOrRestoreLocalSession(sessionResource, debugOwner);
		} else {
			return this.loadRemoteSession(sessionResource, location, token, debugOwner);
		}
	}

	private async loadRemoteSession(sessionResource: URI, location: ChatAgentLocation, token: CancellationToken, debugOwner?: string): Promise<IChatModelReference | undefined> {
		// Check if session already exists before resolving the provider,
		// so we can return a cached model even if the provider was unregistered.
		{
			const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
			if (existingRef) {
				return existingRef;
			}
		}

		if (!await this.chatSessionService.canResolveChatSession(getChatSessionType(sessionResource))) {
			return undefined;
		}

		const providedSession = await this.chatSessionService.getOrCreateChatSession(sessionResource, token);

		// Make sure we haven't created this in the meantime
		{
			const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
			if (existingRef) {
				providedSession.dispose();
				return existingRef;
			}
		}
		const chatSessionType = getChatSessionType(sessionResource);
		const modelId = findLast(providedSession.history.filter(m => m.type === 'request'), req => req.modelId)?.modelId;
		const agentUri = findLast(providedSession.history.filter(m => m.type === 'request'), req => req.modeInstructions?.uri)?.modeInstructions?.uri;
		const storedMetadata = this._chatSessionStore.getMetadataForSessionSync(sessionResource);
		const storedPermissionLevel = storedMetadata?.permissionLevel;
		const storedInputState = storedMetadata?.inputState;
		let initialData: ISerializedChatDataReference | undefined = undefined;
		if ((modelId || agentUri)) {
			const mode: ISerializableChatModelInputState['mode'] = agentUri ? { kind: ChatModeKind.Agent, id: agentUri.toString() } : { kind: ChatModeKind.Agent, id: ChatMode.Agent.id };
			const modelMetadata = modelId ? this.languageModelsService.lookupLanguageModel(modelId) : undefined;
			const selectedModel: ISerializableChatModelInputState['selectedModel'] = modelId && modelMetadata ? { identifier: modelId, metadata: modelMetadata } : undefined;
			// This is used to initialize the state of the chat input box, with the selected model, mode, etc
			initialData = {
				serializer: new ChatSessionOperationLog(),
				value: {
					creationDate: Date.now(),
					initialLocation: undefined,
					customTitle: undefined,
					requests: [],
					responderUsername: '',
					sessionId: '',
					version: 3,
					inputState: {
						attachments: [],
						contrib: {},
						inputText: '',
						mode,
						selectedModel: selectedModel,
						selections: [],
						permissionLevel: storedPermissionLevel,
					},
					pendingRequests: undefined,
					repoData: undefined
				}
			};
		}

		// Contributed sessions do not use UI tools.
		// Prefer (in order): a transferred draft, a persisted draft from metadata,
		// otherwise let the constructor fall back to initialData.value.inputState.
		const modelRef = this._sessionModels.acquireOrCreate({
			initialData,
			location,
			sessionResource: sessionResource,
			canUseTools: false,
			transferEditingSession: providedSession.transferredState?.editingSession,
			inputState: providedSession.transferredState?.inputState ?? storedInputState,
		}, debugOwner ?? 'ChatService#loadRemoteSession');

		// Restore permission level from metadata even when initialData was not constructed
		// and no inputState carried it through.
		if (storedPermissionLevel && !initialData && !storedInputState) {
			modelRef.object.inputModel.setState({ permissionLevel: storedPermissionLevel });
		}

		if (providedSession.title) {
			modelRef.object.setCustomTitle(providedSession.title);
		}

		const model = modelRef.object;
		const disposables = new DisposableStore();
		disposables.add(modelRef.object.onDidDispose(() => {
			disposables.dispose();
			providedSession.dispose();
		}));

		const isAgentHostSession = isAgentHostTarget(chatSessionType);
		const requestParser = isAgentHostSession ? this.instantiationService.createInstance(ChatRequestParser) : undefined;
		const parseAgentHostHistoryPrompt = (text: string, agent: IChatAgentData | undefined): IParsedChatRequest => {
			if (requestParser) {
				try {
					const attachmentCapabilities = this.getAttachmentCapabilitiesForParser(chatSessionType, agent);
					const parsed = requestParser.parseChatRequestWithReferences(
						EMPTY_REFERENCES,
						EMPTY_TOOL_ENABLEMENT_MAP,
						text,
						location,
						{ sessionType: chatSessionType, forcedAgent: agent, attachmentCapabilities },
					);
					if (parsed.parts.length > 0) {
						return parsed;
					}
				} catch (e) {
					this.logService.warn(`ChatService#loadRemoteSession: failed to re-parse historical prompt for ${chatSessionType}`, e);
				}
			}
			return {
				text,
				parts: [new ChatRequestTextPart(
					new OffsetRange(0, text.length),
					{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: text.length + 1 },
					text
				)]
			};
		};

		let lastRequest: ChatRequestModel | undefined;
		for (const message of providedSession.history) {
			if (message.type === 'request') {
				if (lastRequest) {
					lastRequest.response?.complete();
				}

				const requestText = message.prompt;
				const agent =
					message.participant
						? this.chatAgentService.getAgent(message.participant) // TODO(jospicer): Remove and always hardcode?
						: this.chatAgentService.getAgent(chatSessionType);
				const parsedRequest = parseAgentHostHistoryPrompt(requestText, agent);
				const modeInfo = message.modeInstructions ? {
					kind: ChatModeKind.Agent,
					isBuiltin: message.modeInstructions.isBuiltin ?? false,
					modeInstructions: message.modeInstructions,
					modeId: 'custom',
					applyCodeBlockSuggestionId: undefined,
				} satisfies IChatRequestModeInfo : undefined;
				lastRequest = model.addRequest(parsedRequest,
					message.variableData ?? { variables: [] },
					0, // attempt
					modeInfo,
					agent,
					undefined, // slashCommand
					undefined, // confirmation
					undefined, // locationData
					undefined, // attachments
					false, // Do not treat as requests completed, else edit pills won't show.
					message.modelId,
					undefined,
					message.id
				);
			} else {
				// response
				if (lastRequest) {
					for (const part of message.parts) {
						model.acceptResponseProgress(lastRequest, part);
					}
					if (message.details && lastRequest.response) {
						lastRequest.response.setResult({ details: message.details });
					}
				}
			}
		}

		// Set up progress streaming and cancellation for contributed sessions.
		// This handles both the initial in-flight response (from session load)
		// and any subsequent server-initiated turns (e.g. consumed queued messages).
		const hasProgressStreaming = providedSession.progressObs && providedSession.interruptActiveResponseCallback;
		if (hasProgressStreaming) {
			let lastProgressLength = 0;

			const cancellationListener = disposables.add(new MutableDisposable());
			const createCancellationListener = (token: CancellationToken) => {
				return token.onCancellationRequested(() => {
					providedSession.interruptActiveResponseCallback?.().then(userConfirmedInterruption => {
						if (!userConfirmedInterruption) {
							trackNewCancellableRequest();
						}
					});
				});
			};

			const trackNewCancellableRequest = () => {
				const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined, undefined, undefined);
				this._pendingRequests.set(model.sessionResource, cancellableRequest);
				this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'add', source: 'remoteSession', chatSessionId: chatSessionResourceToId(model.sessionResource) });
				cancellationListener.value = createCancellationListener(cancellableRequest.cancellationTokenSource.token);
			};

			const ensureCancellationTracking = () => {
				if (!this._pendingRequests.has(model.sessionResource)) {
					trackNewCancellableRequest();
				}
			};

			if (lastRequest && !providedSession.isCompleteObs?.get()) {
				trackNewCancellableRequest();
			}

			// Handle server-initiated requests (e.g. consumed queued messages).
			if (providedSession.onDidStartServerRequest) {
				disposables.add(providedSession.onDidStartServerRequest(({ prompt }) => {
					// Complete any in-flight request
					if (lastRequest?.response && !lastRequest.response.isComplete) {
						lastRequest.response.complete();
					}

					// Create a new request in the model
					const agent = this.chatAgentService.getAgent(chatSessionType);
					const parsedRequest = parseAgentHostHistoryPrompt(prompt, agent);
					lastRequest = model.addRequest(parsedRequest, { variables: [] }, 0, undefined, agent);

					// Reset progress tracking for the new turn
					lastProgressLength = 0;

					// Ensure cancellation tracking is active
					ensureCancellationTracking();
				}));
			}

			// Single autorun that streams progress for whichever request is current.
			disposables.add(autorun(reader => {
				const progressArray = providedSession.progressObs?.read(reader) ?? [];
				const isComplete = providedSession.isCompleteObs?.read(reader) ?? false;

				// Process only new progress items
				if (lastRequest && progressArray.length > lastProgressLength) {
					const newProgress = progressArray.slice(lastProgressLength);
					for (const progress of newProgress) {
						model?.acceptResponseProgress(lastRequest, progress);
					}
					lastProgressLength = progressArray.length;
				}

				// Handle completion
				if (isComplete && lastRequest) {
					this._pendingRequests.deleteAndDispose(model.sessionResource);
					cancellationListener.clear();
					lastRequest.response?.complete();
				}
			}));
		} else {
			if (providedSession.isCompleteObs?.get()) {
				lastRequest?.response?.complete();
			}

			this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'notCancelable', source: 'remoteSession', chatSessionId: chatSessionResourceToId(model.sessionResource) });
			if (lastRequest && model.editingSession) {
				// wait for timeline to load so that a 'changes' part is added when the response completes
				await chatEditingSessionIsReady(model.editingSession);
				lastRequest.response?.complete();
			}
		}

		return modelRef;
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

	private queuePendingRequest(model: ChatModel, sessionResource: URI, request: string, options: IChatSendRequestOptions): ChatSendResultQueued {
		const location = options.location ?? model.initialLocation;
		const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
		const requestModel = new ChatRequestModel({
			session: model,
			message: parsedRequest,
			variableData: { variables: options.attachedContext ?? [] },
			timestamp: Date.now(),
			modeInfo: options.modeInfo,
			locationData: options.locationData,
			attachedContext: options.attachedContext,
			modelId: options.userSelectedModelId,
			userSelectedTools: options.userSelectedTools?.get(),
			isSystemInitiated: options.isSystemInitiated,
			systemInitiatedLabel: options.systemInitiatedLabel,
			terminalExecutionId: options.terminalExecutionId,
		});

		const deferred = new DeferredPromise<ChatSendResult>();
		this._queuedRequestDeferreds.set(requestModel.id, deferred);

		model.addPendingRequest(requestModel, options.queue ?? ChatRequestQueueKind.Queued, { ...options, queue: undefined });

		if (options.queue === ChatRequestQueueKind.Steering) {
			this.setYieldRequested(sessionResource);
		}

		this.trace('sendRequest', `Queued message for session ${sessionResource}`);
		return { kind: 'queued', deferred: deferred.p };
	}

	async sendRequest(sessionResource: URI, request: string, options?: IChatSendRequestOptions): Promise<ChatSendResult> {
		this.trace('sendRequest', `sessionResource: ${sessionResource.toString()}, message: ${request.substring(0, 20)}${request.length > 20 ? '[...]' : ''}}`);

		if (!request.trim() && !options?.slashCommand && !options?.agentId && !options?.agentIdSilent) {
			this.trace('sendRequest', 'Rejected empty message');
			return { kind: 'rejected', reason: 'Empty message' };
		}

		let model = this._sessionModels.get(sessionResource);
		if (!model) {
			throw new Error(`Unknown session: ${sessionResource}`);
		}

		let tempRef: IChatModelReference | undefined;
		let newSessionResource: URI | undefined;
		try {
			// Workaround for the contributed chat sessions
			//
			// Internally blank widgets uses special sessions with an untitled- path. We do not want these leaking out
			// to the rest of code. Instead use `createNewChatSessionItem` to make sure the session gets properly initialized with a real resource before processing the first request.
			if (!model.hasRequests && isUntitledChatSession(sessionResource) && getChatSessionType(sessionResource) !== localChatSessionType) {

				const parsedRequest = this.parseChatRequest(sessionResource, request, options?.location ?? model.initialLocation, options);
				const commandPart = parsedRequest.parts.find((r): r is ChatRequestSlashCommandPart => r instanceof ChatRequestSlashCommandPart);
				const requestText = getPromptText(parsedRequest).message;

				// Capture session options before loading the remote session,
				// since the alias registration below may change the lookup.
				const initialSessionOptions = this.chatSessionService.getSessionOptions(sessionResource);

				const newItem = await this.chatSessionService.createNewChatSessionItem(getChatSessionType(sessionResource), { prompt: requestText, command: commandPart?.text, initialSessionOptions }, CancellationToken.None);
				if (newItem) {
					// Register alias so session-option lookups work with the new resource
					this.chatSessionService.registerSessionResourceAlias(sessionResource, newItem.resource);

					tempRef = await this.loadRemoteSession(newItem.resource, model.initialLocation, CancellationToken.None);
					model = tempRef?.object as ChatModel | undefined;
					if (!model) {
						throw new Error(`Failed to load session for resource: ${newItem.resource}`);
					}


					// Update the new model's contributed session with initialSessionOptions
					// so that the agent receives them when invoked.
					if (initialSessionOptions) {
						this.chatSessionService.updateSessionOptions(model.sessionResource, initialSessionOptions);
					}

					// this.chatSessionService.fireSessionCommitted(sessionResource, newItem.resource);

					sessionResource = newItem.resource;
					newSessionResource = newItem.resource;
				}
			}

			const hasPendingRequest = this._pendingRequests.has(sessionResource);

			if (options?.queue) {
				const queued = this.queuePendingRequest(model, sessionResource, request, options);
				if (!options.pauseQueue) {
					this.processPendingRequests(sessionResource);
				}
				return queued;
			} else if (hasPendingRequest) {
				this.trace('sendRequest', `Session ${sessionResource} already has a pending request`);
				return { kind: 'rejected', reason: 'Request already in progress' };
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
				kind: 'sent',
				newSessionResource,
				data: {
					...this._sendRequestAsync(model, sessionResource, parsedRequest, attempt, !options?.noCommandDetection, silentAgent ?? defaultAgent, location, options),
					agent,
					slashCommand: agentSlashCommandPart?.command,
				},
			};
		} finally {
			// tempRef?.dispose();
		}
	}

	private getAttachmentCapabilitiesForParser(chatSessionType: string, agent: IChatAgentData | undefined): IChatAgentAttachmentCapabilities | undefined {
		return this.chatSessionService.getCapabilitiesForSessionType(chatSessionType) ?? agent?.capabilities;
	}

	private parseChatRequest(sessionResource: URI, request: string, location: ChatAgentLocation, options: IChatSendRequestOptions | undefined): IParsedChatRequest {
		let parserContext = options?.parserContext;
		let contextAgent = parserContext?.forcedAgent ?? parserContext?.selectedAgent;
		if (options?.agentId) {
			const agent = this.chatAgentService.getAgent(options.agentId);
			if (!agent) {
				throw new Error(`Unknown agent: ${options.agentId}`);
			}
			contextAgent = agent;
			parserContext = { ...parserContext, selectedAgent: agent, mode: options.modeInfo?.kind };
			const commandPart = options.slashCommand ? ` ${chatSubcommandLeader}${options.slashCommand}` : '';
			request = `${chatAgentLeader}${agent.name}${commandPart} ${request}`;
		} else if (options?.agentIdSilent && !parserContext?.forcedAgent) {
			// Resolve slash commands in the context of locked participant so its subcommands take precedence over global
			// slash commands with the same name.
			const silentAgent = this.chatAgentService.getAgent(options.agentIdSilent);
			if (silentAgent) {
				contextAgent = silentAgent;
				parserContext = { ...parserContext, forcedAgent: silentAgent };
			}
		}

		const attachmentCapabilities = parserContext?.attachmentCapabilities ?? this.getAttachmentCapabilitiesForParser(getChatSessionType(sessionResource), contextAgent);
		if (attachmentCapabilities) {
			parserContext = { ...parserContext, attachmentCapabilities };
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
		let request: ChatRequestModel | undefined;
		const agentPart = parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
		const agentSlashCommandPart = parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);
		const commandPart = parsedRequest.parts.find((r): r is ChatRequestSlashCommandPart => r instanceof ChatRequestSlashCommandPart);
		const requests = [...model.getRequests()];
		const requestTelemetry = this.instantiationService.createInstance(ChatRequestTelemetry, {
			agent: agentPart?.agent ?? defaultAgent,
			agentSlashCommandPart,
			commandPart,
			sessionResource: model.sessionResource,
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

				if (!gotProgress) {
					markChat(sessionResource, ChatPerfMark.FirstToken);
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

					if (request) {
						model.acceptResponseProgress(request, progressItem, !isLast);
					}
				}
				completeResponseCreated();
			};

			let detectedAgent: IChatAgentData | undefined;
			let detectedCommand: IChatAgentCommand | undefined;

			// Gate /troubleshoot and the troubleshoot skill behind the file logging flag.
			// agentDebugLog.enabled is deprecated; only fileLogging.enabled is authoritative.
			{
				const fileLoggingEnabled = this.configurationService.getValue<boolean>(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
				if (!fileLoggingEnabled) {
					const isTroubleshootCommand = agentSlashCommandPart?.command.name === TROUBLESHOOT_COMMAND_NAME;
					const hasTroubleshootSkill = options?.attachedContext?.some(v => {
						const uri = IChatRequestVariableEntry.toUri(v);
						return uri && (uri.scheme === COPILOT_SKILL_URI_SCHEME || uri.path.includes(TROUBLESHOOT_SKILL_PATH));
					});
					if (isTroubleshootCommand || hasTroubleshootSkill) {
						request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
						completeResponseCreated();

						const settingsArg = encodeURIComponent(JSON.stringify(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING));
						model.acceptResponseProgress(request, {
							kind: 'markdownContent',
							content: new MarkdownString(localize(
								'agentDebugLog.troubleshootDisabled',
								"The `{0}` skill requires `{1}` to be enabled. After enabling, reload the window to apply. [Enable in Settings](command:workbench.action.openSettings?{2})",
								TROUBLESHOOT_COMMAND_NAME,
								AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING,
								settingsArg
							), { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }),
						});
						model.setResponse(request, {});
						request.response?.complete();
						store.dispose();
						return;
					}
				}
			}

			// Collect hooks from hook .json files
			const collectHooks = async (): Promise<{ hooks: ChatRequestHooks | undefined; hasDisabledClaudeHooks: boolean }> => {
				let collectedHooks: ChatRequestHooks | undefined;
				let hasDisabledClaudeHooks = false;
				try {
					const hooksInfo = await this.promptsService.getHooks(token);
					if (hooksInfo) {
						collectedHooks = hooksInfo.hooks;
						hasDisabledClaudeHooks = hooksInfo.hasDisabledClaudeHooks;
					}
				} catch (error) {
					this.logService.warn('[ChatService] Failed to collect hooks:', error);
				}

				// Merge hooks from the selected custom agent's frontmatter (if any)
				const agentName = options?.modeInfo?.modeInstructions?.name;
				if (agentName) {
					try {
						const agents = await this.promptsService.getCustomAgents(token);
						const customAgent = agents.find(a => a.name === agentName && a.enabled);
						if (customAgent?.hooks) {
							collectedHooks = mergeHooks(collectedHooks, customAgent.hooks);
						}
					} catch (error) {
						this.logService.warn('[ChatService] Failed to collect agent hooks:', error);
					}
				}
				return { hooks: collectedHooks, hasDisabledClaudeHooks };
			};

			// Collect automatic instructions (.instructions.md, skills, etc.)
			const collectInstructions = async (): Promise<IChatRequestVariableEntry[]> => {
				const ctx = options?.instructionContext;
				if (!ctx) {
					return [];
				}
				markChat(sessionResource, ChatPerfMark.WillCollectInstructions);
				try {
					// Seed the variable set with existing attachments so that
					// applyTo pattern matching and referenced-instruction
					// resolution can see them. We filter them back out below
					// to return only the entries that were newly added.
					const variableSet = new ChatRequestVariableSet(options?.attachedContext);
					const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ctx.modeKind, ctx.enabledTools, ctx.enabledSubAgents, getChatSessionType(sessionResource));
					await computer.collect(variableSet, token);
					// Return only the entries that were added by instruction collection
					const originalIds = new Set((options?.attachedContext ?? []).map(v => v.id));
					return variableSet.asArray().filter(v => !originalIds.has(v.id));
				} catch (err) {
					this.logService.error('[ChatService] Failed to collect instructions:', err);
					return [];
				} finally {
					markChat(sessionResource, ChatPerfMark.DidCollectInstructions);
				}
			};

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
				if (agentPart || (defaultAgent && !commandPart)) {
					// --- Step 1: Create the request model immediately (before any awaits) ---
					// This fires RequestUiUpdated synchronously so the user sees their message right away.
					const initialAgent = agentPart?.agent ?? defaultAgent;
					const initialCommand = agentSlashCommandPart?.command;
					const initVariableData: IChatRequestVariableData = { variables: [] };
					request = model.addRequest(parsedRequest, initVariableData, attempt, options?.modeInfo, initialAgent, initialCommand, options?.confirmation, options?.locationData, options?.attachedContext, undefined, options?.userSelectedModelId, options?.userSelectedTools?.get(), undefined, options?.isSystemInitiated, options?.systemInitiatedLabel, options?.terminalExecutionId);
					const thisRequest = request;
					completeResponseCreated();

					// --- Step 2: Collect hooks + instructions in parallel (after UI is shown) ---
					const [hooksResult, instructionEntries] = await Promise.all([
						collectHooks(),
						collectInstructions(),
					]);
					const collectedHooks = hooksResult.hooks;
					const hasDisabledClaudeHooks = hooksResult.hasDisabledClaudeHooks;

					// --- Step 3: Merge instructions and resolved variables into variableData ---
					const allContext = this.prepareContext(request.attachedContext);
					if (instructionEntries.length > 0) {
						allContext.push(...instructionEntries);
					}

					// Store only non-instruction variables on the model.
					// Automatically-added promptText entries (~33 KB each) are
					// ephemeral — re-collected every turn, never rendered in
					// the UI, and not needed in serialized session history.
					const storedVariables = allContext.filter(v => !(isPromptTextVariableEntry(v) && v.automaticallyAdded));
					model.updateRequest(request, { variables: storedVariables });

					// The full set (including instructions) is passed to the
					// agent request only — not stored on the request model.
					let variableData: IChatRequestVariableData = { variables: allContext };

					// Merge resolved variables (e.g. images from directories) for the
					// agent request only - they are not stored on the request model.
					if (options?.resolvedVariables?.length) {
						variableData = { variables: [...variableData.variables, ...options.resolvedVariables] };
					}

					const promptTextResult = getPromptText(request.message);
					variableData = updateRanges(variableData, promptTextResult.diff); // TODO bit of a hack
					const message = promptTextResult.message;

					// --- Step 4: Build the agent request object ---
					const buildAgentRequest = (agent: IChatAgentData, command?: IChatAgentCommand, enableCommandDetection?: boolean, isParticipantDetected?: boolean): IChatAgentRequest => {
						const agentRequest: IChatAgentRequest = {
							sessionResource: model.sessionResource,
							requestId: thisRequest.id,
							agentId: agent.id,
							message,
							command: command?.name,
							variables: variableData,
							enableCommandDetection,
							isParticipantDetected,
							attempt,
							location,
							locationData: thisRequest.locationData,
							acceptedConfirmationData: options?.acceptedConfirmationData,
							rejectedConfirmationData: options?.rejectedConfirmationData,
							agentHostSessionConfig: options?.agentHostSessionConfig,
							userSelectedModelId: options?.userSelectedModelId,
							modelConfiguration: options?.userSelectedModelId ? this.languageModelsService.getModelConfiguration(options.userSelectedModelId) : undefined,
							userSelectedTools: options?.userSelectedTools?.get(),
							modeInstructions: options?.modeInfo?.modeInstructions,
							permissionLevel: options?.modeInfo?.permissionLevel,
							editedFileEvents: thisRequest.editedFileEvents,
							hooks: collectedHooks,
							hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some(arr => arr.length > 0),
							isSystemInitiated: options?.isSystemInitiated,
						};

						let isInitialTools = true;

						store.add(autorun(reader => {
							const tools = options?.userSelectedTools?.read(reader);
							if (isInitialTools) {
								isInitialTools = false;
								return;
							}

							if (tools && request) {
								this.chatAgentService.setRequestTools(agent.id, request.id, tools);
								// in case the request has not been sent out yet:
								agentRequest.userSelectedTools = tools;
							}
						}));

						return agentRequest;
					};

					// --- Step 5: Participant detection ---
					if (
						this.configurationService.getValue('chat.detectParticipant.enabled') !== false &&
						this.chatAgentService.hasChatParticipantDetectionProviders() &&
						!agentPart &&
						!commandPart &&
						!agentSlashCommandPart &&
						enableCommandDetection &&
						location !== ChatAgentLocation.EditorInline &&
						options?.modeInfo?.kind !== ChatModeKind.Agent &&
						options?.modeInfo?.kind !== ChatModeKind.Edit &&
						!options?.agentIdSilent
					) {
						// We have no agent or command to scope history with, pass the full history to the participant detection provider
						const defaultAgentHistory = this.getHistoryEntriesFromModel(requests, location, defaultAgent.id);
						const chatAgentRequest = buildAgentRequest(defaultAgent, undefined, enableCommandDetection, false);

						const result = await this.chatAgentService.detectAgentOrCommand(chatAgentRequest, defaultAgentHistory, { location }, token);
						if (result && this.chatAgentService.getAgent(result.agent.id)?.locations?.includes(location)) {
							// Update the response in the ChatModel to reflect the detected agent and command
							request?.response?.setAgent(result.agent, result.command);
							detectedAgent = result.agent;
							detectedCommand = result.command;
						}
					}

					const agent = (detectedAgent ?? agentPart?.agent ?? defaultAgent)!;
					const command = detectedCommand ?? agentSlashCommandPart?.command;

					await this.extensionService.activateByEvent(`onChatParticipant:${agent.id}`);

					// Recompute history in case the agent or command changed
					const history = this.getHistoryEntriesFromModel(requests, location, agent.id);
					const requestProps = buildAgentRequest(agent, command, enableCommandDetection, !!detectedAgent);
					this.generateInitialChatTitleIfNeeded(model, requestProps, defaultAgent, token);
					const pendingRequest = this._pendingRequests.get(sessionResource);
					if (pendingRequest) {
						store.add(autorun(reader => {
							const yieldRequested = pendingRequest.yieldRequested.read(reader);
							if (request) {
								this.chatAgentService.setYieldRequested(agent.id, request.id, yieldRequested);
							}
						}));
						pendingRequest.requestId ??= requestProps.requestId;
						if (pendingRequest.requestId) {
							this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'add', source: 'sendRequestId', requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
						}
					}

					// Check for disabled Claude Code hooks and notify the user once per workspace.
					// Only set the flag when actually showing the hint, so the setup agent flow
					// (which may resend requests) doesn't consume the flag before the real request runs.
					const disabledClaudeHooksDismissedKey = 'chat.disabledClaudeHooks.notification';
					if (hasDisabledClaudeHooks && !this.storageService.getBoolean(disabledClaudeHooksDismissedKey, StorageScope.WORKSPACE)) {
						this.storageService.store(disabledClaudeHooksDismissedKey, true, StorageScope.WORKSPACE, StorageTarget.USER);
						progressCallback([{ kind: 'disabledClaudeHooks' }]);
					}

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
				} else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command, getChatSessionType(model.sessionResource))) {
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
					}), history, location, model.sessionResource, token, options);
					agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
					rawResult = {};

				} else {
					throw new Error(`Cannot handle request`);
				}

				if ((token.isCancellationRequested && !rawResult)) {
					return;
				} else if (!request) {
					// Silent slash command completed successfully — allow queued
					// requests to proceed.
					shouldProcessPending = !token.isCancellationRequested;
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

					if (rawResult.errorDetails?.isRateLimited) {
						this.chatEntitlementService.markAnonymousRateLimited();
					}

					shouldProcessPending = !rawResult.errorDetails
						&& !token.isCancellationRequested
						&& !request.response?.response.value.some(v => v.kind === 'confirmation' && !v.isUsed);
					request.response?.complete();

					if (agentOrCommandFollowups) {
						const completedRequest = request;
						agentOrCommandFollowups.then(followups => {
							model.setFollowups(completedRequest, followups);
							const commandForTelemetry = agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command;
							this._chatServiceTelemetry.retrievedFollowups(agentPart?.agent.id ?? '', commandForTelemetry, followups?.length ?? 0);
						});
					}
				}
			} catch (err) {
				this.logService.error(`Error while handling chat request: ${toErrorMessage(err, true)}`);
				if (request) {
					requestTelemetry.complete({
						timeToFirstProgress: undefined,
						totalTime: undefined,
						result: 'error',
						requestType,
						detectedAgent,
						request,
					});
					const rawResult: IChatAgentResult = { errorDetails: { message: err.message } };
					model.setResponse(request, rawResult);
					completeResponseCreated();
					request.response?.complete();
				}
			} finally {
				store.dispose();
			}
		};
		let shouldProcessPending = false;
		const rawResponsePromise = sendRequestInternal();
		// Note- requestId is not known at this point, assigned later
		const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, source, undefined, rawResponsePromise, options);
		this._pendingRequests.set(model.sessionResource, cancellableRequest);
		this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'add', source: 'sendRequest', chatSessionId: chatSessionResourceToId(model.sessionResource) });
		rawResponsePromise.finally(() => {
			markChat(sessionResource, ChatPerfMark.RequestComplete);
			clearChatMarks(sessionResource);
			if (this._pendingRequests.get(model.sessionResource) === cancellableRequest) {
				this._pendingRequests.deleteAndDispose(model.sessionResource);
				this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'remove', source: 'sendRequestComplete', requestId: cancellableRequest.requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
			}
			// Process the next pending request from the queue if any
			if (shouldProcessPending) {
				this.processNextPendingRequest(model);
			}
		});
		if (options?.userSelectedModelId) {
			this.languageModelsService.addToRecentlyUsedList(options.userSelectedModelId);
		}
		this._onDidSubmitRequest.fire({ chatSessionResource: model.sessionResource, message: parsedRequest });
		return {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};
	}

	processPendingRequests(sessionResource: URI): void {
		const model = this._sessionModels.get(sessionResource);
		if (model && !this._pendingRequests.has(sessionResource)) {
			this.processNextPendingRequest(model);
		}
	}

	/**
	 * Returns true if the session is backed by an agent host server, which
	 * controls queued-message dequeuing on the server side.
	 */
	private _isServerManagedQueue(sessionResource: URI): boolean {
		return getChatSessionType(sessionResource).startsWith('agent-host-');
	}

	/**
	 * Process the next pending request from the model's queue, if any.
	 * Called after a request completes to continue processing queued requests.
	 * Multiple consecutive steering requests are combined into a single request.
	 */
	private processNextPendingRequest(model: ChatModel): void {
		// Agent host sessions delegate queue management to the server.
		// The server dispatches SessionTurnStarted with queuedMessageId when
		// it consumes a queued message, so the client should not dequeue eagerly.
		if (this._isServerManagedQueue(model.sessionResource)) {
			return;
		}

		// Dequeue all consecutive steering requests and combine them into one
		const steeringRequests = model.dequeueAllSteeringRequests();

		// Then dequeue a single non-steering request if no steering was found
		const nextQueued = steeringRequests.length === 0 ? model.dequeuePendingRequest() : undefined;

		const allRequests = steeringRequests.length > 0 ? steeringRequests : (nextQueued ? [nextQueued] : []);
		if (allRequests.length === 0) {
			return;
		}

		this.trace('processNextPendingRequest', `Processing ${allRequests.length} queued request(s) for session ${model.sessionResource}`);

		// Collect and remove all deferreds
		const deferreds: DeferredPromise<ChatSendResult>[] = [];
		for (const req of allRequests) {
			const deferred = this._queuedRequestDeferreds.get(req.request.id);
			this._queuedRequestDeferreds.delete(req.request.id);
			if (deferred) {
				deferreds.push(deferred);
			}
		}

		// Build send options from the first request, combining attachments from all
		const firstRequest = allRequests[0];

		// Preserve terminal correlation only when all merged requests agree on the
		// same terminal. With subagents, multiple terminals can queue steering
		// requests simultaneously — picking one arbitrarily would misattribute the
		// notification, so we drop the ID when they conflict.
		const terminalIds = new Set(allRequests.map(req => req.sendOptions.terminalExecutionId).filter((id): id is string => !!id));
		if (terminalIds.size > 1) {
			this.info('processNextPendingRequest', `Dropping terminalExecutionId: ${terminalIds.size} conflicting terminal IDs (${[...terminalIds].join(', ')})`);
		}
		const mergedTerminalExecutionId = terminalIds.size === 1 ? [...terminalIds][0] : undefined;

		const sendOptions: IChatSendRequestOptions = {
			...firstRequest.sendOptions,
			terminalExecutionId: mergedTerminalExecutionId,
			attachedContext: allRequests.flatMap(req => req.request.variableData.variables.slice()),
		};

		const location = sendOptions.location ?? sendOptions.locationData?.type ?? model.initialLocation;
		const defaultAgent = this.chatAgentService.getDefaultAgent(location, sendOptions.modeInfo?.kind);
		if (!defaultAgent) {
			this.logService.warn('processNextPendingRequest', `No default agent for location ${location}`);
			for (const deferred of deferreds) {
				deferred.complete({ kind: 'rejected', reason: 'No default agent available' });
			}
			return;
		}

		// For multiple steering requests, combine texts and re-parse; otherwise use as-is
		let parsedRequest: IParsedChatRequest;
		try {
			if (allRequests.length > 1) {
				const combinedText = allRequests.map(req => req.request.message.text).join('\n\n');
				// message.text already includes agent/slash-command prefixes from the
				// original parse, so clear them to avoid double-prefixing.
				parsedRequest = this.parseChatRequest(model.sessionResource, combinedText, location, {
					...sendOptions,
					agentId: undefined,
					slashCommand: undefined,
				});
			} else {
				parsedRequest = firstRequest.request.message;
			}
		} catch (err) {
			this.logService.error('processNextPendingRequest: failed to parse combined chat request', err);
			const reason = toErrorMessage(err);
			for (const deferred of deferreds) {
				deferred.complete({ kind: 'rejected', reason });
			}
			return;
		}

		const silentAgent = sendOptions.agentIdSilent ? this.chatAgentService.getAgent(sendOptions.agentIdSilent) : undefined;
		const agent = silentAgent ?? parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
		const agentSlashCommandPart = parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);

		const responseState = this._sendRequestAsync(model, model.sessionResource, parsedRequest, firstRequest.request.attempt, !sendOptions.noCommandDetection, silentAgent ?? defaultAgent, location, sendOptions);

		const result: ChatSendResultSent = {
			kind: 'sent',
			data: {
				...responseState,
				agent,
				slashCommand: agentSlashCommandPart?.command,
			},
		};
		for (const deferred of deferreds) {
			deferred.complete(result);
		}
	}

	private generateInitialChatTitleIfNeeded(model: ChatModel, request: IChatAgentRequest, defaultAgent: IChatAgentData, token: CancellationToken): void {
		// Generate a title only for the first request, and only via the default agent.
		// Use a single-entry history based on the current request (no full chat history).
		if (model.getRequests().length !== 1 || model.customTitle) {
			return;
		}

		const singleEntryHistory: IChatAgentHistoryEntry[] = [{
			request,
			response: [],
			result: {}
		}];
		const generate = async () => {
			const title = await this.chatAgentService.getChatTitle(defaultAgent.id, singleEntryHistory, token);
			if (title && !model.customTitle) {
				model.setCustomTitle(title);
			}
		};
		void generate();
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
				modeInstructions: request.modeInfo?.modeInstructions,
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
			this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'remove', source: 'removeRequest', requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
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
				this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'remove', source: 'adoptRequest', requestId: request.id, chatSessionId: chatSessionResourceToId(oldOwner.sessionResource) });
				this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'add', source: 'adoptRequest', requestId: request.id, chatSessionId: chatSessionResourceToId(target.sessionResource) });
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

	async cancelCurrentRequestForSession(sessionResource: URI, source?: string): Promise<void> {
		this.trace('cancelCurrentRequestForSession', `session: ${sessionResource}`);
		const pendingRequest = this._pendingRequests.get(sessionResource);
		if (!pendingRequest) {
			if (source !== 'archive') {
				const model = this._sessionModels.get(sessionResource);
				const requestInProgress = model?.requestInProgress.get();
				const pendingRequestsCount = model?.getPendingRequests().length ?? 0;
				const lastRequest = model?.lastRequest;
				this.telemetryService.publicLog2<ChatStopCancellationNoopEvent, ChatStopCancellationNoopClassification>(ChatStopCancellationNoopEventName, {
					source: source ?? 'chatService',
					reason: 'noPendingRequest',
					requestInProgress: requestInProgress === undefined ? 'unknown' : requestInProgress ? 'true' : 'false',
					pendingRequests: pendingRequestsCount,
					sessionScheme: sessionResource.scheme,
					lastRequestId: lastRequest?.id,
					chatSessionId: chatSessionResourceToId(sessionResource),
				});
				this.info('cancelCurrentRequestForSession', `No pending request was found for session ${sessionResource}. requestInProgress=${requestInProgress ?? 'unknown'}, pendingRequests=${pendingRequestsCount}`);
			}
			return;
		}

		const responseCompletePromise = pendingRequest.responseCompletePromise;
		pendingRequest.cancel();
		this._pendingRequests.deleteAndDispose(sessionResource);
		this.telemetryService.publicLog2<ChatPendingRequestChangeEvent, ChatPendingRequestChangeClassification>(ChatPendingRequestChangeEventName, { action: 'remove', source: source ?? 'cancelRequest', requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });

		if (responseCompletePromise) {
			await raceTimeout(responseCompletePromise, 1000);
		}
	}

	setYieldRequested(sessionResource: URI): void {
		const pendingRequest = this._pendingRequests.get(sessionResource);
		if (pendingRequest) {
			pendingRequest.setYieldRequested();
		}
	}

	migrateRequests(originalResource: URI, targetResource: URI): void {
		const model = this._sessionModels.get(originalResource);
		if (!model) {
			return;
		}

		const pendingRequests = [...model.getPendingRequests()];

		if (pendingRequests.length === 0) {
			return;
		}

		// Remove each remaining pending request from the original session
		for (const pending of pendingRequests) {
			this.removePendingRequest(originalResource, pending.request.id);
		}

		// Re-send remaining queued requests
		for (const pending of pendingRequests) {
			void this.sendRequest(targetResource, pending.request.message.text, {
				...pending.sendOptions,
				queue: pending.kind,
			});
		}
	}

	removePendingRequest(sessionResource: URI, requestId: string): void {
		const model = this._sessionModels.get(sessionResource) as ChatModel | undefined;
		if (model) {
			model.removePendingRequest(requestId);

			// If there are no more steering requests pending, reset yieldRequested on the active request
			const hasSteeringRequests = model.getPendingRequests().some(r => r.kind === ChatRequestQueueKind.Steering);
			if (!hasSteeringRequests) {
				const pendingRequest = this._pendingRequests.get(sessionResource);
				pendingRequest?.resetYieldRequested();
			}
		}

		// Reject the deferred promise for the removed request
		const deferred = this._queuedRequestDeferreds.get(requestId);
		if (deferred) {
			deferred.complete({ kind: 'rejected', reason: 'Request was removed from queue' });
			this._queuedRequestDeferreds.delete(requestId);
		}
	}

	setPendingRequests(sessionResource: URI, requests: readonly { requestId: string; kind: ChatRequestQueueKind }[]): void {
		const model = this._sessionModels.get(sessionResource) as ChatModel | undefined;
		if (model) {
			model.setPendingRequests(requests);
		}
	}

	public hasSessions(): boolean {
		return this._chatSessionStore.hasSessions();
	}

	async transferChatSession(transferredSessionResource: URI, toWorkspace: URI): Promise<void> {
		if (!LocalChatSessionUri.isLocalSession(transferredSessionResource)) {
			throw new Error(`Can only transfer local chat sessions. Invalid session: ${transferredSessionResource}`);
		}

		const model = this._sessionModels.get(transferredSessionResource) as ChatModel | undefined;
		if (!model) {
			throw new Error(`Failed to transfer session. Unknown session: ${transferredSessionResource}`);
		}

		if (model.initialLocation !== ChatAgentLocation.Chat) {
			throw new Error(`Can only transfer chat sessions located in the Chat view. Session ${transferredSessionResource} has location=${model.initialLocation}`);
		}

		await this._chatSessionStore.storeTransferSession({
			sessionResource: model.sessionResource,
			timestampInMilliseconds: Date.now(),
			toWorkspace: toWorkspace,
		}, model);
		this.chatTransferService.addWorkspaceToTransferred(toWorkspace);
		this.trace('transferChatSession', `Transferred session ${model.sessionResource} to workspace ${toWorkspace.toString()}`);
	}

	getChatStorageFolder(): URI {
		return this._chatSessionStore.getChatStorageFolder();
	}

	logChatIndex(): void {
		this._chatSessionStore.logIndex();
	}

	setSessionTitle(sessionResource: URI, title: string): void {
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

export async function chatModelToChatDetail(model: IChatModel): Promise<IChatDetail> {
	const title = model.title || localize('newChat', "New Chat");
	return {
		sessionResource: model.sessionResource,
		title,
		lastMessageDate: model.lastMessageDate,
		timing: model.timing,
		isActive: true,
		stats: await awaitStatsForSession(model),
		lastResponseState: model.lastRequest?.response?.state ?? ResponseModelState.Pending,
	};
}
