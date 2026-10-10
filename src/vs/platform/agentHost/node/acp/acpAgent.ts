/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as os from 'os';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { observableValue, type IObservable, type ISettableObservable } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../log/common/log.js';
import { type AgentChatMigrationResult, type AgentSignal, type IActiveClient, type IAgent, type IAgentChatConfigCompletionsParams, type IAgentChatContext, type IAgentChatMetadata, type IAgentChats, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentDescriptor, type IAgentDiscoveredChat, type IAgentModelInfo, type IAgentPermissionResponseContext, type IAgentResolveChatConfigParams, type IAgentToolPendingConfirmationSignal } from '../../common/agent.js';
import type { IAgentHostAcpAgentConfig } from '../../common/agentHostSchema.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import type { AgentSelection, MessageAttachment, ModelSelection } from '../../common/state/protocol/state.js';
import { MessageAttachmentKind, ToolCallStatus, type Customization, type Turn } from '../../common/state/sessionState.js';
import { transportFromChildProcess } from '../codex/codexAppServerClient.js';
import { AcpClient, type IAcpClient, type IAcpTransport } from './acpClient.js';
import { ACP_AUTH_REQUIRED_ERROR_CODE, ACP_PROTOCOL_VERSION, type AcpContentBlock, type IAcpAuthMethod, type IAcpInitializeResult, type IAcpPermissionOption, type IAcpRequestPermissionParams, type IAcpRequestPermissionResult, type IAcpSessionConfigOption, type IAcpSessionNotification, type IAcpSessionSetup } from './acpProtocol.js';
import { AcpTurnMapper } from './acpTurnMapper.js';

/** Prefix of every ACP provider id; the configured agent id follows. */
export const ACP_AGENT_PROVIDER_PREFIX = 'acp-';

export function acpProviderId(config: Pick<IAgentHostAcpAgentConfig, 'id'>): string {
	return `${ACP_AGENT_PROVIDER_PREFIX}${config.id}`;
}

/** Starts the agent process. Injectable so tests can run an in-memory agent. */
export type AcpAgentLauncher = (config: IAgentHostAcpAgentConfig, onStderr: (text: string) => void) => IAcpTransport;

const spawnAcpAgent: AcpAgentLauncher = (config, onStderr) => {
	const child = spawn(config.command, [...(config.args ?? [])], {
		env: { ...process.env, ...config.env },
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	child.stderr.setEncoding('utf8');
	child.stderr.on('data', chunk => onStderr(String(chunk)));
	// A missing or non-executable command fails asynchronously with `error` and
	// no `exit`; unhandled, it would take down the agent host. Surface it as an exit.
	child.once('error', error => {
		onStderr(`failed to start: ${error.message}`);
		child.emit('exit', null, null);
	});
	return transportFromChildProcess(child);
};

interface IAcpConnection {
	readonly client: IAcpClient;
	readonly initialize: IAcpInitializeResult;
	readonly disposables: DisposableStore;
}

interface IAcpChatState {
	readonly chat: URI;
	readonly sessionId: string;
	readonly cwd: string;
	readonly createdAt: number;
	modifiedAt: number;
	/** Connection the native session is bound to; a new connection must resume it. */
	connection: IAcpConnection | undefined;
	configOptions: readonly IAcpSessionConfigOption[];
	turn: AcpTurnMapper | undefined;
}

interface IAcpChatProviderData {
	readonly sessionId: string;
	readonly cwd: string;
}

interface IPendingPermission {
	readonly sessionId: string;
	readonly options: readonly IAcpPermissionOption[];
	readonly resolve: (result: IAcpRequestPermissionResult) => void;
}

/**
 * Agent host provider for a user-configured Agent Client Protocol agent
 * (for example `qwen --acp` or `opencode acp`).
 *
 * One agent process serves every chat of this provider; ACP multiplexes
 * sessions over a single connection. The process starts lazily on the first
 * chat operation and is restarted on demand after it exits.
 */
export class AcpAgent extends Disposable implements IAgent {

	readonly id: string;
	readonly agentHostCapabilities = { workspaceConversion: false } as const;

	/**
	 * ACP reports models per session (the `model` config option of `session/new`),
	 * so until the first session exists only the agent's own default is offered.
	 * Creating a throwaway session to learn them would leave empty sessions in
	 * agents that persist them.
	 */
	private readonly _models: ISettableObservable<readonly IAgentModelInfo[]>;
	readonly models: IObservable<readonly IAgentModelInfo[]>;

	private readonly _onDidChatProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidChatProgress = this._onDidChatProgress.event;

	private readonly _onDidDiscoverChats = this._register(new Emitter<readonly IAgentDiscoveredChat[]>());
	readonly onDidDiscoverChats = this._onDidDiscoverChats.event;

	readonly onDidMaterializeChat = Event.None;
	readonly onDidChangeChatData = Event.None;
	readonly onDidSpawnChat = Event.None;

	private _connection: Promise<IAcpConnection> | undefined;
	private readonly _chats = new Map<string, IAcpChatState>();
	private readonly _chatBySessionId = new Map<string, IAcpChatState>();
	private readonly _pendingPermissions = new Map<string, IPendingPermission>();

	constructor(
		private readonly _config: IAgentHostAcpAgentConfig,
		private readonly _launch: AcpAgentLauncher = spawnAcpAgent,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.id = acpProviderId(_config);
		this._models = observableValue<readonly IAgentModelInfo[]>(this, [defaultModel(this.id)]);
		this.models = this._models;
	}

	getDescriptor(): IAgentDescriptor {
		const name = this._displayName;
		return { provider: this.id, displayName: name, description: `${name} (Agent Client Protocol)` };
	}

	private get _displayName(): string {
		return this._config.displayName || this._config.id;
	}

	// #region Connection

	private _getConnection(): Promise<IAcpConnection> {
		if (!this._connection) {
			const connection = this._connect();
			this._connection = connection;
			// A failed start must not poison later attempts.
			connection.catch(() => {
				if (this._connection === connection) {
					this._connection = undefined;
				}
			});
		}
		return this._connection;
	}

	private async _connect(): Promise<IAcpConnection> {
		this._logService.info(`[ACP:${this._config.id}] starting agent process`);
		const transport = this._launch(this._config, text => this._logService.trace(`[ACP:${this._config.id} stderr] ${text.trimEnd()}`));
		const disposables = new DisposableStore();
		const client = disposables.add(new AcpClient(transport, (level, message) => {
			const line = `[ACP:${this._config.id}] ${message}`;
			if (level === 'error') {
				this._logService.error(line);
			} else if (level === 'warn') {
				this._logService.warn(line);
			} else {
				this._logService.trace(line);
			}
		}));
		disposables.add(client.onNotification('session/update', params => this._handleSessionUpdate(params)));
		disposables.add(client.onRequest('session/request_permission', params => this._handlePermissionRequest(params).then(result => ({ result }))));
		let connection: IAcpConnection | undefined;
		disposables.add(client.onExit(e => {
			this._logService.info(`[ACP:${this._config.id}] agent process exited (code=${e.code}, signal=${e.signal})`);
			this._handleConnectionLost(connection);
		}));
		try {
			const initialize = await client.request('initialize', {
				protocolVersion: ACP_PROTOCOL_VERSION,
				// fs/* and terminal/* are not advertised: agents keep using their own file access and
				// terminals, as they do from a shell (some route their own state files through fs/*).
				clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
				clientInfo: { name: 'vscode', title: 'Visual Studio Code', version: '1' },
			});
			if (initialize.protocolVersion !== ACP_PROTOCOL_VERSION) {
				throw new Error(`${this._displayName} speaks ACP version ${initialize.protocolVersion}; only version ${ACP_PROTOCOL_VERSION} is supported.`);
			}
			connection = { client, initialize, disposables };
			return connection;
		} catch (error) {
			disposables.dispose();
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to start ${this._displayName} (\`${this._config.command}\`): ${message}`);
		}
	}

	private _handleConnectionLost(connection: IAcpConnection | undefined): void {
		if (connection && this._connection) {
			void this._connection.then(current => {
				if (current === connection) {
					this._connection = undefined;
				}
			}, () => { });
		}
		for (const state of this._chats.values()) {
			if (state.connection === connection) {
				state.connection = undefined;
				if (state.turn && !state.turn.ended) {
					this._fire(state.turn.fail('acpAgentExited', `${this._displayName} stopped unexpectedly.`));
				}
				state.turn = undefined;
			}
		}
		for (const [toolCallId, pending] of this._pendingPermissions) {
			if (this._chatBySessionId.get(pending.sessionId)?.connection === undefined) {
				pending.resolve({ outcome: { outcome: 'cancelled' } });
				this._pendingPermissions.delete(toolCallId);
			}
		}
		connection?.disposables.dispose();
	}

	/** Makes sure the chat's native session lives on the current connection. */
	private async _ensureBound(state: IAcpChatState): Promise<IAcpConnection> {
		const connection = await this._getConnection();
		if (state.connection === connection) {
			return connection;
		}
		const setup = await this._reopenSession(connection, state.sessionId, state.cwd);
		state.connection = connection;
		this._applySetup(state, setup);
		return connection;
	}

	private async _reopenSession(connection: IAcpConnection, sessionId: string, cwd: string): Promise<IAcpSessionSetup | null> {
		const capabilities = connection.initialize.agentCapabilities;
		if (capabilities?.sessionCapabilities?.resume) {
			return connection.client.request('session/resume', { sessionId, cwd, mcpServers: [] });
		}
		if (capabilities?.loadSession) {
			// Replayed history arrives as session/update notifications, which are
			// dropped while no turn is running: the host already has the turns.
			return connection.client.request('session/load', { sessionId, cwd, mcpServers: [] });
		}
		throw new Error(`${this._displayName} cannot reopen an existing session (no ACP resume or load support).`);
	}

	// #endregion

	// #region Chats

	readonly chats: IAgentChats = {
		createChat: (chat, context, options) => this._createChat(chat, context, options),
		disposeChat: chat => this._closeChat(chat),
		releaseChat: chat => this._closeChat(chat),
		sendMessage: (chat, prompt, _workingDirectories, attachments, turnId) => this._sendMessage(chat, prompt, attachments, turnId),
		abort: chat => this._abort(chat),
		changeModel: (chat, model) => this._changeModel(chat, model),
		changeAgent: async (_chat: URI, _agent: AgentSelection | undefined) => { /* ACP modes are not mapped to agents yet. */ },
		getMessages: async (): Promise<readonly Turn[]> => [],
	};

	private async _createChat(chat: URI, _context: URI | IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const cwd = options?.workingDirectories?.[0]?.fsPath ?? os.homedir();
		const connection = await this._getConnection();
		let result;
		try {
			result = await connection.client.request('session/new', { cwd, mcpServers: [] });
		} catch (error) {
			throw this._describeError(error, connection);
		}
		const state = this._track(chat, result.sessionId, cwd, connection);
		this._applySetup(state, result);
		if (options?.model) {
			await this._changeModel(chat, options.model);
		}
		const providerData: IAcpChatProviderData = { sessionId: result.sessionId, cwd };
		return { providerData: JSON.stringify(providerData), resolvedWorkingDirectory: URI.file(cwd) };
	}

	async materializeChat(chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<void> {
		if (this._chats.has(chat.toString())) {
			return;
		}
		const data = parseProviderData(providerData);
		if (!data) {
			throw new Error(`${this._displayName} has no session to restore for ${chat.toString()}.`);
		}
		const state = this._track(chat, data.sessionId, data.cwd, undefined);
		await this._ensureBound(state);
	}

	private _track(chat: URI, sessionId: string, cwd: string, connection: IAcpConnection | undefined): IAcpChatState {
		const now = Date.now();
		const state: IAcpChatState = { chat, sessionId, cwd, createdAt: now, modifiedAt: now, connection, configOptions: [], turn: undefined };
		this._chats.set(chat.toString(), state);
		this._chatBySessionId.set(sessionId, state);
		return state;
	}

	private async _closeChat(chat: URI): Promise<void> {
		const state = this._chats.get(chat.toString());
		if (!state) {
			return;
		}
		this._chats.delete(chat.toString());
		this._chatBySessionId.delete(state.sessionId);
		const connection = state.connection;
		if (connection?.initialize.agentCapabilities?.sessionCapabilities?.close) {
			await connection.client.request('session/close', { sessionId: state.sessionId }).catch(error => {
				this._logService.warn(`[ACP:${this._config.id}] session/close failed: ${error instanceof Error ? error.message : String(error)}`);
			});
		}
	}

	private async _sendMessage(chat: URI, prompt: string, attachments: readonly MessageAttachment[] | undefined, turnId: string | undefined): Promise<void> {
		const state = this._requireChat(chat);
		if (state.turn && !state.turn.ended) {
			throw new Error(`${this._displayName} is still working on the previous turn.`);
		}
		const connection = await this._ensureBound(state);
		const mapper = new AcpTurnMapper(chat, turnId ?? generateUuid());
		state.turn = mapper;
		state.modifiedAt = Date.now();
		const content: AcpContentBlock[] = [{ type: 'text', text: prompt }, ...attachmentsToContent(attachments)];
		// session/prompt resolves only when the turn ends; progress streams as notifications.
		connection.client.request('session/prompt', { sessionId: state.sessionId, prompt: content }).then(
			result => this._fire(mapper.finish(result.stopReason)),
			error => this._fire(mapper.fail('acpError', this._describeError(error, connection).message)),
		).finally(() => this._cancelPermissions(state.sessionId));
	}

	private async _abort(chat: URI): Promise<void> {
		const state = this._chats.get(chat.toString());
		if (!state?.connection || !state.turn || state.turn.ended) {
			return;
		}
		this._cancelPermissions(state.sessionId);
		state.connection.client.notify('session/cancel', { sessionId: state.sessionId });
	}

	private async _changeModel(chat: URI, model: ModelSelection): Promise<void> {
		const state = this._requireChat(chat);
		const option = state.configOptions.find(o => o.category === 'model');
		if (!option || option.currentValue === model.id || !modelsFromConfigOptions(this.id, [option]).some(m => m.id === model.id)) {
			// The agent default, or a model this session does not offer: keep the agent's choice.
			return;
		}
		const connection = await this._ensureBound(state);
		const result = await connection.client.request('session/set_config_option', { sessionId: state.sessionId, configId: option.id, value: model.id });
		this._applySetup(state, { configOptions: result.configOptions });
	}

	private _requireChat(chat: URI): IAcpChatState {
		const state = this._chats.get(chat.toString());
		if (!state) {
			throw new Error(`${this._displayName} chat is not open: ${chat.toString()}`);
		}
		return state;
	}

	private _applySetup(state: IAcpChatState, setup: IAcpSessionSetup | null | undefined): void {
		if (setup?.configOptions) {
			state.configOptions = setup.configOptions;
			const models = modelsFromConfigOptions(this.id, setup.configOptions);
			if (models.length) {
				this._models.set([defaultModel(this.id), ...models], undefined);
			}
		}
	}

	// #endregion

	// #region Agent → client traffic

	private _handleSessionUpdate(params: IAcpSessionNotification): void {
		const state = this._chatBySessionId.get(params.sessionId);
		if (!state?.turn) {
			// Replayed history (session/load) or updates after a turn ended.
			return;
		}
		if (params.update.sessionUpdate === 'session_info_update' || params.update.sessionUpdate === 'config_option_update') {
			if (params.update.sessionUpdate === 'config_option_update') {
				this._applySetup(state, { configOptions: (params.update as { configOptions: readonly IAcpSessionConfigOption[] }).configOptions });
			}
			return;
		}
		this._fire(state.turn.map(params.update));
	}

	private _handlePermissionRequest(params: IAcpRequestPermissionParams): Promise<IAcpRequestPermissionResult> {
		const state = this._chatBySessionId.get(params.sessionId);
		if (!state?.turn || state.turn.ended) {
			return Promise.resolve({ outcome: { outcome: 'cancelled' } });
		}
		const toolCallId = params.toolCall.toolCallId;
		const title = params.toolCall.title || params.toolCall.kind || 'Tool';
		return new Promise(resolve => {
			this._pendingPermissions.set(toolCallId, { sessionId: params.sessionId, options: params.options, resolve });
			this._fire(state.turn!.beginPermission(params.toolCall));
			const signal: IAgentToolPendingConfirmationSignal = {
				kind: 'pending_confirmation',
				chat: state.chat,
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId,
					toolName: params.toolCall.kind || 'other',
					displayName: title,
					invocationMessage: title,
					confirmationTitle: title,
				},
				permissionKind: permissionKindForTool(params.toolCall.kind ?? undefined),
			};
			this._onDidChatProgress.fire(signal);
		});
	}

	respondToPermissionRequest(requestId: string, approved: boolean, context?: IAgentPermissionResponseContext): void {
		const pending = this._pendingPermissions.get(requestId);
		if (!pending) {
			return;
		}
		this._pendingPermissions.delete(requestId);
		const optionId = choosePermissionOption(pending.options, approved, context?.selectedOptionId);
		pending.resolve(optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } });
	}

	private _cancelPermissions(sessionId: string): void {
		for (const [toolCallId, pending] of this._pendingPermissions) {
			if (pending.sessionId === sessionId) {
				this._pendingPermissions.delete(toolCallId);
				pending.resolve({ outcome: { outcome: 'cancelled' } });
			}
		}
	}

	// #endregion

	// #region Required IAgent surface without ACP-specific behavior

	async getChatMetadata(chat: URI): Promise<IAgentChatMetadata | undefined> {
		const state = this._chats.get(chat.toString());
		return state && { chat, startTime: state.createdAt, modifiedTime: state.modifiedAt, workingDirectories: [URI.file(state.cwd)] };
	}

	async listChatsToMigrate(): Promise<AgentChatMigrationResult> {
		return [];
	}

	getOrCreateActiveClient(_chat: URI, _context: URI | IAgentChatContext, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		return { clientId: client.clientId, displayName: client.displayName, tools: [], customizations: [] };
	}

	removeActiveClient(): void { }

	onClientToolCallComplete(): void { }

	respondToUserInputRequest(): void { }

	async resolveChatConfig(params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult> {
		return { schema: { type: 'object', properties: {} }, values: params.config ?? {} };
	}

	getInheritedChatConfig(): undefined {
		return undefined;
	}

	async chatConfigCompletions(_params: IAgentChatConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return { items: [] };
	}

	async getChatCustomizations(): Promise<readonly Customization[]> {
		return [];
	}

	async setWorkingDirectory(): Promise<void> {
		throw new Error(`${this._displayName} sessions cannot change their working directory.`);
	}

	getProtectedResources() {
		return [];
	}

	async authenticate(): Promise<boolean> {
		return true;
	}

	async shutdown(): Promise<void> {
		const connection = this._connection;
		this._connection = undefined;
		for (const pending of this._pendingPermissions.values()) {
			pending.resolve({ outcome: { outcome: 'cancelled' } });
		}
		this._pendingPermissions.clear();
		if (connection) {
			(await connection.catch(() => undefined))?.disposables.dispose();
		}
	}

	override dispose(): void {
		void this.shutdown();
		super.dispose();
	}

	// #endregion

	private _fire(signals: readonly AgentSignal[]): void {
		for (const signal of signals) {
			this._onDidChatProgress.fire(signal);
		}
	}

	private _describeError(error: unknown, connection: IAcpConnection): Error {
		const code = (error as { code?: unknown } | undefined)?.code;
		if (code === ACP_AUTH_REQUIRED_ERROR_CODE) {
			return new Error(describeAuthRequired(this._displayName, connection.initialize.authMethods));
		}
		return error instanceof Error ? error : new Error(String(error));
	}
}

function parseProviderData(providerData: string | undefined): IAcpChatProviderData | undefined {
	if (!providerData) {
		return undefined;
	}
	try {
		const data = JSON.parse(providerData) as Partial<IAcpChatProviderData>;
		return typeof data.sessionId === 'string' && typeof data.cwd === 'string' ? { sessionId: data.sessionId, cwd: data.cwd } : undefined;
	} catch {
		return undefined;
	}
}

function attachmentsToContent(attachments: readonly MessageAttachment[] | undefined): AcpContentBlock[] {
	const blocks: AcpContentBlock[] = [];
	for (const attachment of attachments ?? []) {
		if (attachment.type === MessageAttachmentKind.Resource) {
			const uri = URI.parse(attachment.uri);
			blocks.push({ type: 'resource_link', uri: attachment.uri, name: attachment.label || basename(uri.path) });
		}
	}
	return blocks;
}

/** Model id meaning "whatever the agent is configured to use". */
export const ACP_DEFAULT_MODEL_ID = 'default';

function defaultModel(provider: string): IAgentModelInfo {
	return { provider, id: ACP_DEFAULT_MODEL_ID, name: 'Agent Default', supportsVision: false };
}

export function modelsFromConfigOptions(provider: string, options: readonly IAcpSessionConfigOption[]): IAgentModelInfo[] {
	const option = options.find(o => o.category === 'model' && o.type === 'select');
	const models: IAgentModelInfo[] = [];
	for (const entry of option?.options ?? []) {
		const choices = 'options' in entry ? entry.options : [entry];
		for (const choice of choices) {
			models.push({ provider, id: choice.value, name: choice.name, supportsVision: false });
		}
	}
	return models;
}

export function choosePermissionOption(options: readonly IAcpPermissionOption[], approved: boolean, selectedOptionId: string | undefined): string | undefined {
	if (selectedOptionId && options.some(o => o.optionId === selectedOptionId)) {
		return selectedOptionId;
	}
	const preferred = approved ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
	for (const kind of preferred) {
		const option = options.find(o => o.kind === kind);
		if (option) {
			return option.optionId;
		}
	}
	return undefined;
}

function permissionKindForTool(kind: string | undefined): IAgentToolPendingConfirmationSignal['permissionKind'] {
	switch (kind) {
		case 'edit':
		case 'delete':
		case 'move':
			return 'write';
		case 'execute':
			return 'shell';
		case 'read':
		case 'search':
			return 'read';
		case 'fetch':
			return 'url';
		default:
			return undefined;
	}
}

export function describeAuthRequired(displayName: string, methods: readonly IAcpAuthMethod[] | undefined): string {
	const hints = (methods ?? []).map(m => m.description || m.name).filter(Boolean);
	return hints.length
		? `${displayName} needs you to sign in: ${hints.join('; ')}`
		: `${displayName} needs you to sign in. Run the agent in a terminal to complete authentication.`;
}
