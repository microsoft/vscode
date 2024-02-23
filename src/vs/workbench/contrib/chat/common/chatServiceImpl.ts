/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableMap, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { Progress } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IChatAgentRequest, IChatAgentResult, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatModel, ChatModelInitState, ChatRequestModel, ChatWelcomeMessageModel, IChatModel, IChatRequestVariableData, ISerializableChatData, ISerializableChatsData, getHistoryEntriesFromModel, updateRanges } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, IParsedChatRequest, getPromptText } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ChatMessageRole, IChatMessage } from 'vs/workbench/contrib/chat/common/languageModels';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { ChatCopyKind, IChat, IChatCompleteResponse, IChatDetail, IChatDynamicRequest, IChatFollowup, IChatProgress, IChatProvider, IChatProviderInfo, IChatSendRequestData, IChatService, IChatTransferredSessionData, IChatUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const serializedChatKey = 'interactive.sessions';

const globalChatKey = 'chat.workspaceTransfer';
interface IChatTransfer {
	toWorkspace: UriComponents;
	timestampInMilliseconds: number;
	chat: ISerializableChatData;
	inputValue: string;
}
const SESSION_TRANSFER_EXPIRATION_IN_MILLISECONDS = 1000 * 60;

type ChatProviderInvokedEvent = {
	providerId: string;
	timeToFirstProgress: number | undefined;
	totalTime: number | undefined;
	result: 'success' | 'error' | 'errorWithOutput' | 'cancelled' | 'filtered';
	requestType: 'string' | 'followup' | 'slashCommand';
	chatSessionId: string;
	agent: string;
	slashCommand: string | undefined;
};

type ChatProviderInvokedClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that was invoked.' };
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The time in milliseconds from invoking the provider to getting the first data.' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The total time it took to run the provider\'s `provideResponseWithProgress`.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the ChatProvider resulted in an error.' };
	requestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of request that the user made.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random ID for the session.' };
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of agent used.' };
	slashCommand?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of slashCommand used.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of Chat providers.';
};

type ChatVoteEvent = {
	providerId: string;
	direction: 'up' | 'down';
};

type ChatVoteClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this response came from.' };
	direction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user voted up or down.' };
	owner: 'roblourens';
	comment: 'Provides insight into the performance of Chat providers.';
};

type ChatCopyEvent = {
	providerId: string;
	copyKind: 'action' | 'toolbar';
};

type ChatCopyClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	copyKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the copy was initiated.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatInsertEvent = {
	providerId: string;
	newFile: boolean;
};

type ChatInsertClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	newFile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the code was inserted into a new untitled file.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatCommandEvent = {
	providerId: string;
	commandId: string;
};

type ChatCommandClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	commandId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the command that was executed.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

type ChatTerminalEvent = {
	providerId: string;
	languageId: string;
};

type ChatTerminalClassification = {
	providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the provider that this codeblock response came from.' };
	languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language of the code that was run in the terminal.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of Chat features.';
};

const maxPersistedSessions = 25;

export class ChatService extends Disposable implements IChatService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IChatProvider>();

	private readonly _sessionModels = this._register(new DisposableMap<string, ChatModel>());
	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellationTokenSource>());
	private _persistedSessions: ISerializableChatsData;
	private readonly _hasProvider: IContextKey<boolean>;

	private _transferredSessionData: IChatTransferredSessionData | undefined;
	public get transferredSessionData(): IChatTransferredSessionData | undefined {
		return this._transferredSessionData;
	}

	private readonly _onDidPerformUserAction = this._register(new Emitter<IChatUserActionEvent>());
	public readonly onDidPerformUserAction: Event<IChatUserActionEvent> = this._onDidPerformUserAction.event;

	private readonly _onDidDisposeSession = this._register(new Emitter<{ sessionId: string; providerId: string; reason: 'initializationFailed' | 'cleared' }>());
	public readonly onDidDisposeSession = this._onDidDisposeSession.event;

	private readonly _onDidRegisterProvider = this._register(new Emitter<{ providerId: string }>());
	public readonly onDidRegisterProvider = this._onDidRegisterProvider.event;

	private readonly _onDidUnregisterProvider = this._register(new Emitter<{ providerId: string }>());
	public readonly onDidUnregisterProvider = this._onDidUnregisterProvider.event;

	private readonly _sessionFollowupCancelTokens = this._register(new DisposableMap<string, CancellationTokenSource>());

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();

		this._hasProvider = CONTEXT_PROVIDER_EXISTS.bindTo(this.contextKeyService);

		const sessionData = storageService.get(serializedChatKey, StorageScope.WORKSPACE, '');
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
			this._transferredSessionData = { sessionId: transferredChat.sessionId, inputValue: transferredData.inputValue };
		}

		this._register(storageService.onWillSaveState(() => this.saveState()));
	}

	private saveState(): void {
		let allSessions: (ChatModel | ISerializableChatData)[] = Array.from(this._sessionModels.values())
			.filter(session => session.getRequests().length > 0);
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

	notifyUserAction(action: IChatUserActionEvent): void {
		if (action.action.kind === 'vote') {
			this.telemetryService.publicLog2<ChatVoteEvent, ChatVoteClassification>('interactiveSessionVote', {
				providerId: action.providerId,
				direction: action.action.direction === InteractiveSessionVoteDirection.Up ? 'up' : 'down'
			});
		} else if (action.action.kind === 'copy') {
			this.telemetryService.publicLog2<ChatCopyEvent, ChatCopyClassification>('interactiveSessionCopy', {
				providerId: action.providerId,
				copyKind: action.action.copyKind === ChatCopyKind.Action ? 'action' : 'toolbar'
			});
		} else if (action.action.kind === 'insert') {
			this.telemetryService.publicLog2<ChatInsertEvent, ChatInsertClassification>('interactiveSessionInsert', {
				providerId: action.providerId,
				newFile: !!action.action.newFile
			});
		} else if (action.action.kind === 'command') {
			const command = CommandsRegistry.getCommand(action.action.commandButton.command.id);
			const commandId = command ? action.action.commandButton.command.id : 'INVALID';
			this.telemetryService.publicLog2<ChatCommandEvent, ChatCommandClassification>('interactiveSessionCommand', {
				providerId: action.providerId,
				commandId
			});
		} else if (action.action.kind === 'runInTerminal') {
			this.telemetryService.publicLog2<ChatTerminalEvent, ChatTerminalClassification>('interactiveSessionRunInTerminal', {
				providerId: action.providerId,
				languageId: action.action.languageId ?? ''
			});
		}

		this._onDidPerformUserAction.fire(action);
	}

	private trace(method: string, message: string): void {
		this.logService.trace(`ChatService#${method}: ${message}`);
	}

	private error(method: string, message: string): void {
		this.logService.error(`ChatService#${method} ${message}`);
	}

	private deserializeChats(sessionData: string): ISerializableChatsData {
		try {
			const arrayOfSessions: ISerializableChatData[] = revive(JSON.parse(sessionData)); // Revive serialized URIs in session data
			if (!Array.isArray(arrayOfSessions)) {
				throw new Error('Expected array');
			}

			const sessions = arrayOfSessions.reduce((acc, session) => {
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

				acc[session.sessionId] = session;
				return acc;
			}, {} as ISerializableChatsData);
			return sessions;
		} catch (err) {
			this.error('deserializeChats', `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? '...' : ''}]`);
			return {};
		}
	}

	private getTransferredSessionData(): IChatTransfer | undefined {
		const data: IChatTransfer[] = this.storageService.getObject(globalChatKey, StorageScope.PROFILE, []);
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
	 * The array is sorted by creation date in descending order.
	 * Chat sessions that have already been loaded into the chat view are excluded from the result.
	 * Imported chat sessions are also excluded from the result.
	 */
	getHistory(): IChatDetail[] {
		const sessions = Object.values(this._persistedSessions)
			.filter(session => session.requests.length > 0);
		sessions.sort((a, b) => (b.creationDate ?? 0) - (a.creationDate ?? 0));

		return sessions
			.filter(session => !this._sessionModels.has(session.sessionId))
			.filter(session => !session.isImported)
			.map(item => {
				const title = ChatModel.getDefaultTitle(item.requests);
				return {
					sessionId: item.sessionId,
					title
				};
			});
	}

	removeHistoryEntry(sessionId: string): void {
		delete this._persistedSessions[sessionId];
		this.saveState();
	}

	clearAllHistoryEntries(): void {
		this._persistedSessions = {};
		this.saveState();
	}

	startSession(providerId: string, token: CancellationToken): ChatModel {
		this.trace('startSession', `providerId=${providerId}`);
		return this._startSession(providerId, undefined, token);
	}

	private _startSession(providerId: string, someSessionHistory: ISerializableChatData | undefined, token: CancellationToken): ChatModel {
		this.trace('_startSession', `providerId=${providerId}`);
		const model = this.instantiationService.createInstance(ChatModel, providerId, someSessionHistory);
		this._sessionModels.set(model.sessionId, model);
		this.initializeSession(model, token);
		return model;
	}

	private reinitializeModel(model: ChatModel): void {
		this.trace('reinitializeModel', `Start reinit`);
		this.initializeSession(model, CancellationToken.None);
	}

	private async initializeSession(model: ChatModel, token: CancellationToken): Promise<void> {
		try {
			this.trace('initializeSession', `Initialize session ${model.sessionId}`);
			model.startInitialize();
			await this.extensionService.activateByEvent(`onInteractiveSession:${model.providerId}`);

			const provider = this._providers.get(model.providerId);
			if (!provider) {
				throw new Error(`Unknown provider: ${model.providerId}`);
			}

			let session: IChat | undefined;
			try {
				session = await provider.prepareSession(token) ?? undefined;
			} catch (err) {
				this.trace('initializeSession', `Provider initializeSession threw: ${err}`);
			}

			if (!session) {
				throw new Error('Provider returned no session');
			}

			this.trace('startSession', `Provider returned session`);

			const defaultAgent = this.chatAgentService.getDefaultAgent();
			if (!defaultAgent) {
				throw new Error('No default agent');
			}

			const welcomeMessage = model.welcomeMessage ? undefined : await defaultAgent.provideWelcomeMessage?.(token) ?? undefined;
			const welcomeModel = welcomeMessage && new ChatWelcomeMessageModel(
				model,
				welcomeMessage.map(item => typeof item === 'string' ? new MarkdownString(item) : item),
				await defaultAgent.provideSampleQuestions?.(token) ?? []
			);

			model.initialize(session, welcomeModel);
		} catch (err) {
			this.trace('startSession', `initializeSession failed: ${err}`);
			model.setInitializationError(err);
			this._sessionModels.deleteAndDispose(model.sessionId);
			this._onDidDisposeSession.fire({ sessionId: model.sessionId, providerId: model.providerId, reason: 'initializationFailed' });
		}
	}

	getSession(sessionId: string): IChatModel | undefined {
		return this._sessionModels.get(sessionId);
	}

	getSessionId(sessionProviderId: number): string | undefined {
		return Iterable.find(this._sessionModels.values(), model => model.session?.id === sessionProviderId)?.sessionId;
	}

	getOrRestoreSession(sessionId: string): ChatModel | undefined {
		this.trace('getOrRestoreSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (model) {
			return model;
		}

		const sessionData = this._persistedSessions[sessionId];
		if (!sessionData) {
			return undefined;
		}

		if (sessionId === this.transferredSessionData?.sessionId) {
			this._transferredSessionData = undefined;
		}

		return this._startSession(sessionData.providerId, sessionData, CancellationToken.None);
	}

	loadSessionFromContent(data: ISerializableChatData): IChatModel | undefined {
		return this._startSession(data.providerId, data, CancellationToken.None);
	}

	async sendRequest(sessionId: string, request: string): Promise<IChatSendRequestData | undefined> {
		this.trace('sendRequest', `sessionId: ${sessionId}, message: ${request.substring(0, 20)}${request.length > 20 ? '[...]' : ''}}`);
		if (!request.trim()) {
			this.trace('sendRequest', 'Rejected empty message');
			return;
		}

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		await model.waitForInitialization();
		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		if (this._pendingRequests.has(sessionId)) {
			this.trace('sendRequest', `Session ${sessionId} already has a pending request`);
			return;
		}

		const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionId, request);
		const agent = parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart)?.agent ?? this.chatAgentService.getDefaultAgent()!;
		const agentSlashCommandPart = parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);

		// This method is only returning whether the request was accepted - don't block on the actual request
		return {
			responseCompletePromise: this._sendRequestAsync(model, sessionId, provider, parsedRequest),
			agent,
			slashCommand: agentSlashCommandPart?.command,
		};
	}

	private refreshFollowupsCancellationToken(sessionId: string): CancellationToken {
		this._sessionFollowupCancelTokens.get(sessionId)?.cancel();
		const newTokenSource = new CancellationTokenSource();
		this._sessionFollowupCancelTokens.set(sessionId, newTokenSource);

		return newTokenSource.token;
	}

	private async _sendRequestAsync(model: ChatModel, sessionId: string, provider: IChatProvider, parsedRequest: IParsedChatRequest): Promise<void> {
		const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionId);
		let request: ChatRequestModel;
		const agentPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
		const agentSlashCommandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);
		const commandPart = 'kind' in parsedRequest ? undefined : parsedRequest.parts.find((r): r is ChatRequestSlashCommandPart => r instanceof ChatRequestSlashCommandPart);

		let gotProgress = false;
		const requestType = commandPart ? 'slashCommand' : 'string';

		const source = new CancellationTokenSource();
		const token = source.token;
		const sendRequestInternal = async () => {
			const progressCallback = (progress: IChatProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				gotProgress = true;

				if (progress.kind === 'content' || progress.kind === 'markdownContent') {
					this.trace('sendRequest', `Provider returned progress for session ${model.sessionId}, ${typeof progress.content === 'string' ? progress.content.length : progress.content.value.length} chars`);
				} else {
					this.trace('sendRequest', `Provider returned progress: ${JSON.stringify(progress)}`);
				}

				model.acceptResponseProgress(request, progress);
			};

			const stopWatch = new StopWatch(false);
			const listener = token.onCancellationRequested(() => {
				this.trace('sendRequest', `Request for session ${model.sessionId} was cancelled`);
				this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					providerId: provider.id,
					timeToFirstProgress: undefined,
					// Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
					totalTime: stopWatch.elapsed(),
					result: 'cancelled',
					requestType,
					agent: agentPart?.agent.id ?? '',
					slashCommand: agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command,
					chatSessionId: model.sessionId
				});

				model.cancelRequest(request);
			});

			try {
				let rawResult: IChatAgentResult | null | undefined;
				let agentOrCommandFollowups: Promise<IChatFollowup[] | undefined> | undefined = undefined;

				const defaultAgent = this.chatAgentService.getDefaultAgent();
				if (agentPart || (defaultAgent && !commandPart)) {
					const agent = (agentPart?.agent ?? defaultAgent)!;
					const history = getHistoryEntriesFromModel(model);

					const initVariableData: IChatRequestVariableData = { variables: [] };
					request = model.addRequest(parsedRequest, initVariableData, agent, agentSlashCommandPart?.command);
					const variableData = await this.chatVariablesService.resolveVariables(parsedRequest, model, progressCallback, token);
					request.variableData = variableData;

					const promptTextResult = getPromptText(request.message);
					const requestProps: IChatAgentRequest = {
						sessionId,
						requestId: request.id,
						agentId: agent.id,
						message: promptTextResult.message,
						command: agentSlashCommandPart?.command.name,
						variables: updateRanges(variableData, promptTextResult.diff) // TODO bit of a hack
					};

					const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
					rawResult = agentResult;
					agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, followupsCancelToken);
				} else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command)) {
					request = model.addRequest(parsedRequest, { variables: [] });
					// contributed slash commands
					// TODO: spell this out in the UI
					const history: IChatMessage[] = [];
					for (const request of model.getRequests()) {
						if (!request.response) {
							continue;
						}
						history.push({ role: ChatMessageRole.User, content: request.message.text });
						history.push({ role: ChatMessageRole.Assistant, content: request.response.response.asString() });
					}
					const message = parsedRequest.text;
					const commandResult = await this.chatSlashCommandService.executeCommand(commandPart.slashCommand.command, message.substring(commandPart.slashCommand.command.length + 1).trimStart(), new Progress<IChatProgress>(p => {
						progressCallback(p);
					}), history, token);
					agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
					rawResult = {};

				} else {
					throw new Error(`Cannot handle request`);
				}

				if (token.isCancellationRequested) {
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
					this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
						providerId: provider.id,
						timeToFirstProgress: rawResult.timings?.firstProgress,
						totalTime: rawResult.timings?.totalElapsed,
						result,
						requestType,
						agent: agentPart?.agent.id ?? '',
						slashCommand: agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command,
						chatSessionId: model.sessionId
					});
					model.setResponse(request, rawResult);
					this.trace('sendRequest', `Provider returned response for session ${model.sessionId}`);

					model.completeResponse(request);
					if (agentOrCommandFollowups) {
						agentOrCommandFollowups.then(followups => {
							model.setFollowups(request, followups);
						});
					}
				}
			} finally {
				listener.dispose();
			}
		};
		const rawResponsePromise = sendRequestInternal();
		this._pendingRequests.set(model.sessionId, source);
		rawResponsePromise.finally(() => {
			this._pendingRequests.deleteAndDispose(model.sessionId);
		});
		return rawResponsePromise;
	}

	async removeRequest(sessionId: string, requestId: string): Promise<void> {
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		await model.waitForInitialization();
		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		model.removeRequest(requestId);
	}

	async sendRequestToProvider(sessionId: string, message: IChatDynamicRequest): Promise<{ responseCompletePromise: Promise<void> } | undefined> {
		this.trace('sendRequestToProvider', `sessionId: ${sessionId}`);
		return await this.sendRequest(sessionId, message.message);
	}

	getProviders(): string[] {
		return Array.from(this._providers.keys());
	}

	async addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, response: IChatCompleteResponse): Promise<void> {
		this.trace('addCompleteRequest', `message: ${message}`);

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		await model.waitForInitialization();
		const parsedRequest = typeof message === 'string' ?
			this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionId, message) :
			message;
		const request = model.addRequest(parsedRequest, variableData || { variables: [] });
		if (typeof response.message === 'string') {
			model.acceptResponseProgress(request, { content: response.message, kind: 'content' });
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

	clearSession(sessionId: string): void {
		this.trace('clearSession', `sessionId: ${sessionId}`);
		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`Unknown session: ${sessionId}`);
		}

		this._persistedSessions[sessionId] = model.toJSON();

		this._sessionModels.deleteAndDispose(sessionId);
		this._pendingRequests.get(sessionId)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionId);
		this._onDidDisposeSession.fire({ sessionId, providerId: model.providerId, reason: 'cleared' });
	}

	registerProvider(provider: IChatProvider): IDisposable {
		this.trace('registerProvider', `Adding new chat provider`);

		if (this._providers.has(provider.id)) {
			throw new Error(`Provider ${provider.id} already registered`);
		}

		this._providers.set(provider.id, provider);
		this._hasProvider.set(true);
		this._onDidRegisterProvider.fire({ providerId: provider.id });

		Array.from(this._sessionModels.values())
			.filter(model => model.providerId === provider.id)
			// The provider may have been registered in the process of initializing this model. Only grab models that were deinitialized when the provider was unregistered
			.filter(model => model.initState === ChatModelInitState.Created)
			.forEach(model => this.reinitializeModel(model));

		return toDisposable(() => {
			this.trace('registerProvider', `Disposing chat provider`);
			this._providers.delete(provider.id);
			this._hasProvider.set(this._providers.size > 0);
			Array.from(this._sessionModels.values())
				.filter(model => model.providerId === provider.id)
				.forEach(model => model.deinitialize());
			this._onDidUnregisterProvider.fire({ providerId: provider.id });
		});
	}

	public hasSessions(providerId: string): boolean {
		return !!Object.values(this._persistedSessions).find((session) => session.providerId === providerId);
	}

	getProviderInfos(): IChatProviderInfo[] {
		return Array.from(this._providers.values()).map(provider => {
			return {
				id: provider.id,
			};
		});
	}

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void {
		const model = Iterable.find(this._sessionModels.values(), model => model.sessionId === transferredSessionData.sessionId);
		if (!model) {
			throw new Error(`Failed to transfer session. Unknown session ID: ${transferredSessionData.sessionId}`);
		}

		const existingRaw: IChatTransfer[] = this.storageService.getObject(globalChatKey, StorageScope.PROFILE, []);
		existingRaw.push({
			chat: model.toJSON(),
			timestampInMilliseconds: Date.now(),
			toWorkspace: toWorkspace,
			inputValue: transferredSessionData.inputValue,
		});

		this.storageService.store(globalChatKey, JSON.stringify(existingRaw), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.trace('transferChatSession', `Transferred session ${model.sessionId} to workspace ${toWorkspace.toString()}`);
	}
}
