/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { truncate } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentChatMigrationResult, AgentChatOperationContext, AgentProvider, AgentSession, AgentSignal, IActiveClient, IAgent, IAgentChatContext, IAgentChatMetadata, IAgentChats, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, resolveAgentChatContext } from '../../common/agent.js';
import { IAgentHostAcpAgentConfiguration } from '../../common/agentService.js';
import { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AgentSelection, Customization, MessageAttachment, ModelSelection, ProtectedResourceMetadata, ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, ChatAction, SessionAction } from '../../common/state/sessionActions.js';
import { ChatInputAnswer, ChatInputResponseKind, ClientPluginCustomization, createErrorResponsePart, MessageKind, parseChatUri, ResponsePart, ResponsePartKind, ToolCallConfirmationReason, ToolCallResult, ToolCallStatus, ToolResultContent, ToolResultContentType, Turn, TurnState } from '../../common/state/sessionState.js';
import { AcpConnection } from './acpConnection.js';

type AcpActiveSession = import('@agentclientprotocol/sdk').ActiveSession;
type AcpContentChunk = import('@agentclientprotocol/sdk').ContentChunk;
type AcpPermissionOption = import('@agentclientprotocol/sdk').PermissionOption;
type AcpPermissionOptionKind = import('@agentclientprotocol/sdk').PermissionOptionKind;
type AcpPlan = import('@agentclientprotocol/sdk').Plan;
type AcpPromptResponse = import('@agentclientprotocol/sdk').PromptResponse;
type AcpRequestPermissionRequest = import('@agentclientprotocol/sdk').RequestPermissionRequest;
type AcpRequestPermissionResponse = import('@agentclientprotocol/sdk').RequestPermissionResponse;
type AcpSessionId = import('@agentclientprotocol/sdk').SessionId;
type AcpSessionConfigOption = import('@agentclientprotocol/sdk').SessionConfigOption;
type AcpSessionConfigSelect = import('@agentclientprotocol/sdk').SessionConfigSelect;
type AcpSessionConfigSelectGroup = import('@agentclientprotocol/sdk').SessionConfigSelectGroup;
type AcpSessionConfigSelectOption = import('@agentclientprotocol/sdk').SessionConfigSelectOption;
type AcpSessionInfoUpdate = import('@agentclientprotocol/sdk').SessionInfoUpdate;
type AcpSessionUpdate = import('@agentclientprotocol/sdk').SessionUpdate;
type AcpStopReason = import('@agentclientprotocol/sdk').StopReason;
type AcpToolCall = import('@agentclientprotocol/sdk').ToolCall;
type AcpToolCallContent = import('@agentclientprotocol/sdk').ToolCallContent;
type AcpToolCallLocation = import('@agentclientprotocol/sdk').ToolCallLocation;
type AcpToolCallStatus = import('@agentclientprotocol/sdk').ToolCallStatus;
type AcpToolCallUpdate = import('@agentclientprotocol/sdk').ToolCallUpdate;
type AcpToolKind = import('@agentclientprotocol/sdk').ToolKind;

interface AcpTextPart {
	readonly id: string;
	readonly kind: ResponsePartKind.Markdown | ResponsePartKind.Reasoning;
	content: string;
}

interface AcpToolState {
	readonly acpId: string;
	readonly hostId: string;
	title: string;
	name: string;
	kind: AcpToolKind | undefined;
	status: AcpToolCallStatus | undefined;
	rawInput: unknown;
	rawOutput: unknown;
	content: readonly AcpToolCallContent[];
	locations: readonly AcpToolCallLocation[];
	started: boolean;
	ready: boolean;
	confirmationPending: boolean;
	completed: boolean;
}

interface AcpActiveTurn {
	readonly id: string;
	readonly prompt: string;
	readonly startedAt: string;
	readonly startedAtMs: number;
	readonly textParts: AcpTextPart[];
	readonly textPartsByKey: Map<string, AcpTextPart>;
	readonly tools: Map<string, AcpToolState>;
	abortRequested: boolean;
}

interface AcpSessionState {
	readonly session: URI;
	readonly workingDirectory: URI;
	readonly activeSession: AcpActiveSession;
	readonly createdAt: number;
	modifiedAt: number;
	summary: string | undefined;
	configOptions: readonly AcpSessionConfigOption[];
	chat: URI | undefined;
	activeTurn: AcpActiveTurn | undefined;
	readonly turns: Turn[];
}

interface PendingPermission {
	readonly acpSessionId: AcpSessionId;
	readonly options: readonly AcpPermissionOption[];
	readonly tool: AcpToolState;
	readonly resolve: (response: AcpRequestPermissionResponse) => void;
}

function serializeValue(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value, undefined, 2);
	} catch {
		return String(value);
	}
}

function mapPermissionKind(kind: AcpToolKind | undefined): 'shell' | 'write' | 'read' | 'url' | 'custom-tool' {
	switch (kind) {
		case 'execute':
			return 'shell';
		case 'edit':
		case 'delete':
		case 'move':
			return 'write';
		case 'read':
		case 'search':
			return 'read';
		case 'fetch':
			return 'url';
		default:
			return 'custom-tool';
	}
}

export class AcpAgent extends Disposable implements IAgent {
	readonly id: AgentProvider;
	readonly agentHostCapabilities = { workspaceConversion: false };

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidChatProgress = this._onDidSessionProgress.event;
	readonly onDidMaterializeChat = Event.None;
	readonly onDidChangeChatData = Event.None;
	readonly onDidSpawnChat = Event.None;
	readonly onDidDiscoverChats = Event.None;

	private readonly _models;
	readonly models;

	private readonly _connection: AcpConnection;
	private readonly _sessions = new Map<string, AcpSessionState>();
	private readonly _sessionsByAcpId = new Map<AcpSessionId, AcpSessionState>();
	private readonly _pendingPermissions = new Map<string, PendingPermission>();
	private readonly _activeClients = new Map<string, Map<string, IActiveClient>>();
	private _lastKnownModels = new Map<string, IAgentModelInfo>();

	constructor(
		private readonly _configuration: IAgentHostAcpAgentConfiguration,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.id = `acp-${_configuration.id}`;
		this._models = observableValue<readonly IAgentModelInfo[]>(this, [{
			provider: this.id,
			id: 'default',
			name: localize('acp.model.default', "Default"),
			supportsVision: false,
		}]);
		this.models = this._models;
		this._connection = this._register(new AcpConnection(_configuration, request => this._requestPermission(request), _logService));
		this._register(this._connection.onDidClose(error => this._handleConnectionClosed(error)));
	}

	getDescriptor(): IAgentDescriptor {
		const displayName = this._configuration.name ?? this._configuration.id;
		return {
			provider: this.id,
			displayName,
			description: localize('acp.agent.description', "ACP agent: {0}", displayName),
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [];
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		const workingDirectories = config?.workingDirectories;
		if (!workingDirectories || workingDirectories.length !== 1) {
			throw new Error(localize('acp.session.singleWorkingDirectory', "ACP sessions require exactly one working directory."));
		}
		const workingDirectory = workingDirectories[0];
		if (workingDirectory.scheme !== Schemas.file) {
			throw new Error(localize('acp.session.localWorkingDirectory', "ACP sessions require a local file working directory."));
		}

		const session = config.session ?? AgentSession.uri(this.id, generateUuid());
		const sessionKey = session.toString();
		if (this._sessions.has(sessionKey)) {
			throw new Error(localize('acp.session.exists', "ACP session already exists."));
		}

		const activeSession = await this._connection.createSession(workingDirectory.fsPath);
		const now = Date.now();
		const state: AcpSessionState = {
			session,
			workingDirectory,
			activeSession,
			createdAt: now,
			modifiedAt: now,
			summary: undefined,
			configOptions: activeSession.newSessionResponse.configOptions ?? [],
			chat: undefined,
			activeTurn: undefined,
			turns: [],
		};
		this._sessions.set(sessionKey, state);
		this._sessionsByAcpId.set(activeSession.sessionId, state);
		this._refreshModelCatalog();
		try {
			if (config?.model && config.model.id !== 'default') {
				await this._changeModel(state, config.model);
			}
		} catch (error) {
			try {
				await this.disposeSession(session);
			} catch (disposeError) {
				this._logService.error(`[Agent Rosetta:${this._configuration.id}] Failed to dispose ACP session after model selection failed.`, disposeError);
			}
			throw error;
		}
		this._logService.info(`[Agent Rosetta:${this._configuration.id}] Created ACP session ${activeSession.sessionId}.`);
		return {
			session,
			project: { uri: workingDirectory, displayName: basename(workingDirectory) },
			resolvedWorkingDirectory: workingDirectory,
		};
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return { schema: { type: 'object', properties: {} }, values: params.config ?? {} };
	}

	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return { items: [] };
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()].map(state => this._metadata(state));
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const state = this._getSession(session);
		return state ? this._metadata(state) : undefined;
	}

	async getSessionMessages(resource: URI): Promise<readonly Turn[]> {
		return this._getSession(resource)?.turns ?? [];
	}

	readonly chats: IAgentChats = {
		createChat: async (chat: URI, context: AgentChatOperationContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			if (options?.fork) {
				throw new Error(localize('acp.chat.forkUnsupported', "ACP chats do not support forking."));
			}
			const session = resolveAgentChatContext(context, chat).configurationResource;
			if (this._sessions.has(session.toString())) {
				throw new Error(localize('acp.chat.multipleUnsupported', "ACP sessions do not support additional chats."));
			}
			const result = await this.createSession({
				session,
				model: options?.model,
				agent: options?.agent,
				workingDirectories: options?.workingDirectories,
				config: options?.config,
				activeClient: options?.activeClient,
				importConversation: options?.importConversation,
			});
			const state = this._requireSession(session);
			state.chat = chat;
			return {
				project: result.project,
				resolvedWorkingDirectory: result.resolvedWorkingDirectory,
			};
		},
		disposeChat: (chat: URI, context: AgentChatOperationContext): Promise<void> => {
			return this.disposeSession(resolveAgentChatContext(context, chat).configurationResource);
		},
		releaseChat: (_chat: URI, _context: AgentChatOperationContext): Promise<void> => Promise.resolve(),
		sendMessage: (chat: URI, prompt: string, workingDirectoriesOrDirectory: readonly URI[] | URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> => {
			const workingDirectories = URI.isUri(workingDirectoriesOrDirectory) ? [workingDirectoriesOrDirectory] : workingDirectoriesOrDirectory;
			return this._sendMessage(chat, prompt, workingDirectories, attachments, turnId);
		},
		abort: (chat: URI, _context: AgentChatOperationContext): Promise<void> => this._abort(chat),
		changeModel: (_chat: URI, model: ModelSelection, _context: AgentChatOperationContext): Promise<void> => {
			if (model.id === 'default') {
				return Promise.resolve();
			}
			return this._changeModel(this._requireSession(_chat), model);
		},
		changeAgent: (_chat: URI, agent: AgentSelection | undefined, _context: AgentChatOperationContext): Promise<void> => {
			if (agent) {
				throw new Error(localize('acp.agent.changeUnsupported', "ACP sessions do not support custom agent selection."));
			}
			return Promise.resolve();
		},
		getMessages: (chat: URI, _context: AgentChatOperationContext): Promise<readonly Turn[]> => this.getSessionMessages(chat),
	};

	async materializeChat(_chat: URI, _context: AgentChatOperationContext, _providerData: string | undefined): Promise<IAgentCreateChatResult | void> { }

	async setWorkingDirectory(_chat: URI, _context: AgentChatOperationContext, _workingDirectory: URI): Promise<void> {
		throw new Error(localize('acp.session.workingDirectoryChangeUnsupported', "ACP sessions do not support changing the working directory."));
	}

	resolveChatConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return this.resolveSessionConfig(params);
	}

	getInheritedChatConfig(): undefined {
		return undefined;
	}

	chatConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return this.sessionConfigCompletions(params);
	}

	async getChatCustomizations(_chat: URI, _context: AgentChatOperationContext, _hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]> {
		return [];
	}

	async listChatsToMigrate(): Promise<AgentChatMigrationResult> {
		return [];
	}

	async getChatMetadata(chat: URI, context: AgentChatOperationContext): Promise<IAgentChatMetadata | undefined> {
		const state = this._getSession(resolveAgentChatContext(context, chat).configurationResource);
		if (!state) {
			return undefined;
		}
		return {
			chat,
			startTime: state.createdAt,
			modifiedTime: state.modifiedAt,
			project: { uri: state.workingDirectory, displayName: basename(state.workingDirectory) },
			summary: state.summary,
			workingDirectories: [state.workingDirectory],
		};
	}

	private async _sendMessage(chat: URI, prompt: string, workingDirectories: readonly URI[] | undefined, attachments: readonly MessageAttachment[] | undefined, turnId: string | undefined): Promise<void> {
		if (attachments && attachments.length > 0) {
			throw new Error(localize('acp.attachments.unsupported', "This ACP agent does not support prompt attachments."));
		}
		const state = this._requireSession(chat);
		if (!workingDirectories || workingDirectories.length !== 1 || !isEqual(workingDirectories[0], state.workingDirectory)) {
			throw new Error(localize('acp.session.workingDirectoryChanged', "The ACP session working directory cannot be changed after creation."));
		}
		if (state.activeTurn) {
			throw new Error(localize('acp.turn.active', "The ACP session already has an active turn."));
		}

		const activeTurn: AcpActiveTurn = {
			id: turnId ?? generateUuid(),
			prompt,
			startedAt: new Date().toISOString(),
			startedAtMs: Date.now(),
			textParts: [],
			textPartsByKey: new Map(),
			tools: new Map(),
			abortRequested: false,
		};
		state.chat = chat;
		state.activeTurn = activeTurn;
		state.modifiedAt = Date.now();
		state.summary ??= truncate(prompt.replace(/\s+/g, ' ').trim(), 80);

		const promptPromise = state.activeSession.prompt(prompt);
		void this._consumePrompt(state, promptPromise).catch(error => this._failTurn(state, error));
	}

	private async _consumePrompt(state: AcpSessionState, promptPromise: Promise<AcpPromptResponse>): Promise<void> {
		const promptFailure = promptPromise.then(
			() => new Promise<never>(() => { }),
			error => Promise.reject(error),
		);
		while (state.activeTurn) {
			const message = await Promise.race([state.activeSession.nextUpdate(), promptFailure]);
			if (message.kind === 'stop') {
				this._completeTurn(state, message.stopReason);
				return;
			}
			this._handleUpdate(state, message.update);
		}
	}

	private _handleUpdate(state: AcpSessionState, update: AcpSessionUpdate): void {
		switch (update.sessionUpdate) {
			case 'agent_message_chunk':
				this._handleContentChunk(state, update, ResponsePartKind.Markdown);
				break;
			case 'agent_thought_chunk':
				this._handleContentChunk(state, update, ResponsePartKind.Reasoning);
				break;
			case 'tool_call':
			case 'tool_call_update':
				this._handleToolUpdate(state, update);
				break;
			case 'plan':
				this._handlePlan(state, update);
				break;
			case 'session_info_update':
				this._handleSessionInfo(state, update);
				break;
			case 'config_option_update':
				this._applyConfigOptions(state, update.configOptions);
				break;
			case 'user_message_chunk':
			case 'plan_update':
			case 'plan_removed':
			case 'available_commands_update':
			case 'current_mode_update':
			case 'usage_update':
				break;
		}
	}

	private async _changeModel(state: AcpSessionState, model: ModelSelection): Promise<void> {
		const option = this._findModelOption(state.configOptions);
		if (!option) {
			throw new Error(localize('acp.model.changeUnsupported', "This ACP agent does not expose a model configuration option."));
		}
		if (!this._flattenSelectOptions(option.options).some(candidate => candidate.value === model.id)) {
			throw new Error(localize('acp.model.unavailable', "ACP model '{0}' is not available in this session.", model.id));
		}
		if (option.currentValue === model.id) {
			return;
		}
		const configOptions = await this._connection.setSessionConfigOption(state.activeSession.sessionId, option.id, model.id);
		this._applyConfigOptions(state, configOptions);
	}

	private _applyConfigOptions(state: AcpSessionState, configOptions: readonly AcpSessionConfigOption[]): void {
		state.configOptions = configOptions;
		this._refreshModelCatalog();
	}

	private _refreshModelCatalog(): void {
		const sessionModels: Map<string, IAgentModelInfo>[] = [];
		for (const state of this._sessions.values()) {
			const option = this._findModelOption(state.configOptions);
			if (!option) {
				sessionModels.push(new Map());
				continue;
			}
			const models = new Map<string, IAgentModelInfo>();
			for (const value of this._flattenSelectOptions(option.options)) {
				models.set(value.value, {
					provider: this.id,
					id: value.value,
					name: value.name,
					supportsVision: false,
					_meta: value.description ? { description: value.description } : undefined,
				});
			}
			sessionModels.push(models);
		}

		let models: Map<string, IAgentModelInfo>;
		if (sessionModels.length > 0) {
			models = new Map(sessionModels[0]);
			for (const id of [...models.keys()]) {
				if (!sessionModels.every(catalog => catalog.has(id))) {
					models.delete(id);
				}
			}
			if (models.size > 0) {
				this._lastKnownModels = new Map(models);
			}
		} else {
			models = new Map(this._lastKnownModels);
		}

		const next = models.size > 0 ? [...models.values()] : [{
			provider: this.id,
			id: 'default',
			name: localize('acp.model.default', "Default"),
			supportsVision: false,
		}];
		const current = this._models.get();
		if (current.length === next.length && current.every((model, index) => model.id === next[index].id && model.name === next[index].name)) {
			return;
		}
		this._models.set(next, undefined);
	}

	private _findModelOption(configOptions: readonly AcpSessionConfigOption[]): (AcpSessionConfigOption & AcpSessionConfigSelect & { type: 'select' }) | undefined {
		const selectOptions = configOptions.filter((option): option is AcpSessionConfigOption & AcpSessionConfigSelect & { type: 'select' } => option.type === 'select');
		return selectOptions.find(option => option.category === 'model')
			?? selectOptions.find(option => option.id.toLowerCase() === 'model');
	}

	private _flattenSelectOptions(options: AcpSessionConfigSelect['options']): readonly AcpSessionConfigSelectOption[] {
		const result: AcpSessionConfigSelectOption[] = [];
		for (const option of options) {
			if (this._isSelectGroup(option)) {
				result.push(...option.options);
			} else {
				result.push(option);
			}
		}
		return result;
	}

	private _isSelectGroup(option: AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup): option is AcpSessionConfigSelectGroup {
		return 'group' in option;
	}

	private _handleContentChunk(state: AcpSessionState, update: AcpContentChunk, kind: ResponsePartKind.Markdown | ResponsePartKind.Reasoning): void {
		if (update.content.type !== 'text') {
			this._logService.debug(`[Agent Rosetta:${this._configuration.id}] Ignoring unsupported ACP content type ${update.content.type}.`);
			return;
		}
		const turn = state.activeTurn;
		const chat = state.chat;
		if (!turn || !chat) {
			return;
		}

		const key = `${kind}:${update.messageId ?? 'default'}`;
		const existing = turn.textPartsByKey.get(key);
		if (!existing) {
			const part: AcpTextPart = { id: generateUuid(), kind, content: update.content.text };
			turn.textPartsByKey.set(key, part);
			turn.textParts.push(part);
			this._emitAction(chat, {
				type: ActionType.ChatResponsePart,
				turnId: turn.id,
				part: { kind, id: part.id, content: part.content },
			});
			return;
		}

		existing.content += update.content.text;
		this._emitAction(chat, kind === ResponsePartKind.Markdown ? {
			type: ActionType.ChatDelta,
			turnId: turn.id,
			partId: existing.id,
			content: update.content.text,
		} : {
			type: ActionType.ChatReasoning,
			turnId: turn.id,
			partId: existing.id,
			content: update.content.text,
		});
	}

	private _handlePlan(state: AcpSessionState, plan: AcpPlan): void {
		const turn = state.activeTurn;
		const chat = state.chat;
		if (!turn || !chat || plan.entries.length === 0) {
			return;
		}
		const content = plan.entries.map(entry => `- [${entry.status === 'completed' ? 'x' : ' '}] ${entry.content}`).join('\n');
		const part: AcpTextPart = { id: generateUuid(), kind: ResponsePartKind.Markdown, content };
		turn.textParts.push(part);
		this._emitAction(chat, {
			type: ActionType.ChatResponsePart,
			turnId: turn.id,
			part: { kind: part.kind, id: part.id, content },
		});
	}

	private _handleSessionInfo(state: AcpSessionState, update: AcpSessionInfoUpdate): void {
		if (update.title !== undefined) {
			state.summary = update.title ?? undefined;
			if (state.summary) {
				this._emitAction(state.session, { type: ActionType.SessionTitleChanged, title: state.summary });
			}
		}
		if (update.updatedAt) {
			const modifiedAt = Date.parse(update.updatedAt);
			if (!Number.isNaN(modifiedAt)) {
				state.modifiedAt = modifiedAt;
			}
		}
	}

	private _handleToolUpdate(state: AcpSessionState, update: AcpToolCall | AcpToolCallUpdate): void {
		const turn = state.activeTurn;
		const chat = state.chat;
		if (!turn || !chat) {
			return;
		}
		const tool = this._getOrCreateTool(state, update.toolCallId);
		if (update.title !== undefined && update.title !== null) {
			tool.title = update.title;
		}
		if (update.name !== undefined && update.name !== null) {
			tool.name = update.name;
		}
		if (update.kind !== undefined && update.kind !== null) {
			tool.kind = update.kind;
		}
		if (update.status !== undefined && update.status !== null) {
			tool.status = update.status;
		}
		if (update.rawInput !== undefined) {
			tool.rawInput = update.rawInput;
		}
		if (update.rawOutput !== undefined) {
			tool.rawOutput = update.rawOutput;
		}
		if (update.content !== undefined && update.content !== null) {
			tool.content = update.content;
		}
		if (update.locations !== undefined && update.locations !== null) {
			tool.locations = update.locations;
		}

		this._ensureToolStarted(chat, turn, tool);
		if (tool.status === 'in_progress' && !tool.ready && !tool.confirmationPending) {
			tool.ready = true;
			this._emitAction(chat, {
				type: ActionType.ChatToolCallReady,
				turnId: turn.id,
				toolCallId: tool.hostId,
				invocationMessage: tool.title,
				toolInput: serializeValue(tool.rawInput),
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
		}
		if ((tool.status === 'completed' || tool.status === 'failed') && !tool.completed) {
			if (!tool.ready && !tool.confirmationPending) {
				tool.ready = true;
				this._emitAction(chat, {
					type: ActionType.ChatToolCallReady,
					turnId: turn.id,
					toolCallId: tool.hostId,
					invocationMessage: tool.title,
					toolInput: serializeValue(tool.rawInput),
					confirmed: ToolCallConfirmationReason.NotNeeded,
				});
			}
			tool.completed = true;
			const success = tool.status === 'completed';
			this._emitAction(chat, {
				type: ActionType.ChatToolCallComplete,
				turnId: turn.id,
				toolCallId: tool.hostId,
				result: {
					success,
					pastTenseMessage: success
						? localize('acp.tool.completed', "{0} completed", tool.title)
						: localize('acp.tool.failed', "{0} failed", tool.title),
					content: this._toolResultContent(tool),
					error: success ? undefined : { message: serializeValue(tool.rawOutput) ?? localize('acp.tool.failed.detail', "The ACP tool call failed.") },
				},
			});
		}
	}

	private _getOrCreateTool(state: AcpSessionState, acpId: string): AcpToolState {
		const turn = state.activeTurn;
		if (!turn) {
			throw new Error(localize('acp.turn.missing', "ACP tool update arrived without an active turn."));
		}
		let tool = turn.tools.get(acpId);
		if (!tool) {
			tool = {
				acpId,
				hostId: `${state.activeSession.sessionId}:${acpId}`,
				title: localize('acp.tool.defaultTitle', "ACP tool"),
				name: 'acp-tool',
				kind: undefined,
				status: undefined,
				rawInput: undefined,
				rawOutput: undefined,
				content: [],
				locations: [],
				started: false,
				ready: false,
				confirmationPending: false,
				completed: false,
			};
			turn.tools.set(acpId, tool);
		}
		return tool;
	}

	private _ensureToolStarted(chat: URI, turn: AcpActiveTurn, tool: AcpToolState): void {
		if (tool.started) {
			return;
		}
		tool.started = true;
		this._emitAction(chat, {
			type: ActionType.ChatToolCallStart,
			turnId: turn.id,
			toolCallId: tool.hostId,
			toolName: tool.name,
			displayName: tool.title,
			intention: tool.title,
			_meta: tool.kind ? { acpToolKind: tool.kind } : undefined,
		});
	}

	private _toolResultContent(tool: AcpToolState): ToolResultContent[] | undefined {
		const content: ToolResultContent[] = [];
		for (const item of tool.content) {
			switch (item.type) {
				case 'content':
					if (item.content.type === 'text') {
						content.push({ type: ToolResultContentType.Text, text: item.content.text });
					}
					break;
				case 'diff':
					content.push({ type: ToolResultContentType.Text, text: localize('acp.tool.diff', "Updated {0}", item.path) });
					break;
				case 'terminal':
					content.push({ type: ToolResultContentType.Text, text: localize('acp.tool.terminal', "Terminal {0}", item.terminalId) });
					break;
			}
		}
		if (content.length === 0) {
			const rawOutput = serializeValue(tool.rawOutput);
			if (rawOutput) {
				content.push({ type: ToolResultContentType.Text, text: rawOutput });
			}
		}
		return content.length > 0 ? content : undefined;
	}

	private _requestPermission(request: AcpRequestPermissionRequest): Promise<AcpRequestPermissionResponse> {
		const state = this._sessionsByAcpId.get(request.sessionId);
		const turn = state?.activeTurn;
		const chat = state?.chat;
		if (!state || !turn || !chat) {
			return Promise.resolve({ outcome: { outcome: 'cancelled' } });
		}

		this._handleToolUpdate(state, request.toolCall);
		const tool = this._getOrCreateTool(state, request.toolCall.toolCallId);
		tool.confirmationPending = true;
		this._emitToolPendingConfirmation(chat, turn, tool);

		return new Promise<AcpRequestPermissionResponse>(resolve => {
			const existing = this._pendingPermissions.get(tool.hostId);
			existing?.resolve({ outcome: { outcome: 'cancelled' } });
			this._pendingPermissions.set(tool.hostId, {
				acpSessionId: request.sessionId,
				options: request.options,
				tool,
				resolve,
			});
		});
	}

	private _emitToolPendingConfirmation(chat: URI, turn: AcpActiveTurn, tool: AcpToolState): void {
		this._onDidSessionProgress.fire({
			kind: 'pending_confirmation',
			chat,
			state: {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: tool.hostId,
				toolName: tool.name,
				displayName: tool.title,
				invocationMessage: tool.title,
				confirmationTitle: tool.title,
				toolInput: serializeValue(tool.rawInput),
			},
			permissionKind: mapPermissionKind(tool.kind),
			permissionPath: tool.locations[0]?.path,
			managedApprovalRequired: true,
		});
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		const pending = this._pendingPermissions.get(requestId);
		if (!pending) {
			this._logService.warn(`[Agent Rosetta:${this._configuration.id}] Unknown permission request ${requestId}.`);
			return;
		}
		this._pendingPermissions.delete(requestId);
		const preferredKind: AcpPermissionOptionKind = approved ? 'allow_once' : 'reject_once';
		const fallbackKind: AcpPermissionOptionKind = approved ? 'allow_always' : 'reject_always';
		const option = pending.options.find(candidate => candidate.kind === preferredKind)
			?? pending.options.find(candidate => candidate.kind === fallbackKind);
		pending.resolve(option
			? { outcome: { outcome: 'selected', optionId: option.optionId } }
			: { outcome: { outcome: 'cancelled' } });

		pending.tool.confirmationPending = false;
		pending.tool.ready = approved;
	}

	respondToUserInputRequest(_requestId: string, _response: ChatInputResponseKind, _answers?: Record<string, ChatInputAnswer>): void {
		this._logService.warn(`[Agent Rosetta:${this._configuration.id}] Ignoring unsupported user input response.`);
	}

	private async _abort(chat: URI): Promise<void> {
		const state = this._requireSession(chat);
		if (!state.activeTurn) {
			return;
		}
		state.activeTurn.abortRequested = true;
		this._cancelPermissionsForSession(state.activeSession.sessionId);
		await this._connection.cancelSession(state.activeSession.sessionId);
	}

	private _completeTurn(state: AcpSessionState, stopReason: AcpStopReason): void {
		const turn = state.activeTurn;
		const chat = state.chat;
		if (!turn || !chat) {
			return;
		}
		const duration = Date.now() - turn.startedAtMs;
		const cancelled = turn.abortRequested || stopReason === 'cancelled';
		if (!cancelled) {
			this._emitAction(chat, { type: ActionType.ChatTurnComplete, turnId: turn.id, duration });
		} else if (!turn.abortRequested) {
			this._emitAction(chat, { type: ActionType.ChatTurnCancelled, turnId: turn.id, duration });
		}
		this._recordTurn(state, turn, cancelled ? TurnState.Cancelled : TurnState.Complete, duration);
		state.activeTurn = undefined;
		state.modifiedAt = Date.now();
	}

	private _failTurn(state: AcpSessionState, error: unknown): void {
		const turn = state.activeTurn;
		const chat = state.chat;
		if (!turn || !chat) {
			return;
		}
		const duration = Date.now() - turn.startedAtMs;
		const resolved = error instanceof Error ? error : new Error(String(error));
		this._emitAction(chat, {
			type: ActionType.ChatError,
			turnId: turn.id,
			duration,
			part: createErrorResponsePart({
				errorType: 'acp',
				message: resolved.message,
				stack: resolved.stack,
			}),
		});
		this._recordTurn(state, turn, TurnState.Error, duration, resolved);
		state.activeTurn = undefined;
		state.modifiedAt = Date.now();
	}

	private _recordTurn(state: AcpSessionState, turn: AcpActiveTurn, turnState: TurnState, duration: number, error?: Error): void {
		const responseParts: ResponsePart[] = turn.textParts.map(part => ({
			kind: part.kind,
			id: part.id,
			content: part.content,
		}));
		if (error) {
			responseParts.push(createErrorResponsePart({ errorType: 'acp', message: error.message, stack: error.stack }));
		}
		state.turns.push({
			id: turn.id,
			startedAt: turn.startedAt,
			duration,
			message: { text: turn.prompt, origin: { kind: MessageKind.User } },
			responseParts,
			usage: undefined,
			state: turnState,
		});
	}

	private _handleConnectionClosed(error: Error): void {
		this._logService.error(`[Agent Rosetta:${this._configuration.id}] ACP connection closed.`, error);
		for (const state of this._sessions.values()) {
			if (state.activeTurn) {
				this._failTurn(state, error);
			}
		}
	}

	private _cancelPermissionsForSession(acpSessionId: AcpSessionId): void {
		for (const [requestId, pending] of this._pendingPermissions) {
			if (pending.acpSessionId === acpSessionId) {
				this._pendingPermissions.delete(requestId);
				pending.resolve({ outcome: { outcome: 'cancelled' } });
			}
		}
	}

	async disposeSession(resource: URI): Promise<void> {
		const state = this._getSession(resource);
		if (!state) {
			return;
		}
		this._cancelPermissionsForSession(state.activeSession.sessionId);
		try {
			if (this._connection.initializeResult?.agentCapabilities?.sessionCapabilities?.close) {
				await this._connection.closeSession(state.activeSession.sessionId);
			}
		} finally {
			state.activeSession.dispose();
			this._sessions.delete(state.session.toString());
			this._sessionsByAcpId.delete(state.activeSession.sessionId);
			this._activeClients.delete(state.session.toString());
			this._refreshModelCatalog();
		}
	}

	async authenticate(_resource: string, _token: string): Promise<boolean> {
		return false;
	}

	getOrCreateActiveClient(chat: URI, context: AgentChatOperationContext, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		const sessionKey = this._requireSession(resolveAgentChatContext(context, chat).configurationResource).session.toString();
		let clients = this._activeClients.get(sessionKey);
		if (!clients) {
			clients = new Map();
			this._activeClients.set(sessionKey, clients);
		}
		const existing = clients.get(client.clientId);
		if (existing) {
			return existing;
		}

		let tools: readonly ToolDefinition[] = [];
		let customizations: readonly ClientPluginCustomization[] = [];
		const activeClient: IActiveClient = {
			clientId: client.clientId,
			displayName: client.displayName,
			get tools() { return tools; },
			set tools(value: readonly ToolDefinition[]) { tools = value; },
			get customizations() { return customizations; },
			set customizations(value: readonly ClientPluginCustomization[]) { customizations = value; },
		};
		clients.set(client.clientId, activeClient);
		return activeClient;
	}

	removeActiveClient(chat: URI, context: AgentChatOperationContext, clientId: string): void {
		const state = this._getSession(resolveAgentChatContext(context, chat).configurationResource);
		if (state) {
			this._activeClients.get(state.session.toString())?.delete(clientId);
		}
	}

	onClientToolCallComplete(_chat: URI, _toolCallId: string, _result: ToolCallResult, _context?: IAgentChatContext): void {
		this._logService.warn(`[Agent Rosetta:${this._configuration.id}] Ignoring unsupported client tool completion.`);
	}

	async shutdown(): Promise<void> {
		for (const state of [...this._sessions.values()]) {
			try {
				await this.disposeSession(state.session);
			} catch (error) {
				this._logService.error(`[Agent Rosetta:${this._configuration.id}] Failed to close ACP session ${state.activeSession.sessionId}.`, error);
			}
		}
	}

	private _metadata(state: AcpSessionState): IAgentSessionMetadata {
		return {
			session: state.session,
			startTime: state.createdAt,
			modifiedTime: state.modifiedAt,
			project: { uri: state.workingDirectory, displayName: basename(state.workingDirectory) },
			summary: state.summary,
			workingDirectories: [state.workingDirectory],
		};
	}

	private _getSession(resource: URI): AcpSessionState | undefined {
		const parsed = parseChatUri(resource);
		return this._sessions.get(parsed?.session ?? resource.toString());
	}

	private _requireSession(resource: URI): AcpSessionState {
		const state = this._getSession(resource);
		if (!state) {
			throw new Error(localize('acp.session.notFound', "ACP session was not found."));
		}
		return state;
	}

	private _emitAction(resource: URI, action: SessionAction | ChatAction): void {
		this._onDidSessionProgress.fire({ kind: 'action', resource, action });
	}

	override dispose(): void {
		for (const pending of this._pendingPermissions.values()) {
			pending.resolve({ outcome: { outcome: 'cancelled' } });
		}
		this._pendingPermissions.clear();
		for (const state of this._sessions.values()) {
			state.activeSession.dispose();
		}
		this._sessions.clear();
		this._sessionsByAcpId.clear();
		super.dispose();
	}
}
