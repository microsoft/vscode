/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import type { IAuthorizationProtectedResourceMetadata } from '../../../../base/common/oauth.js';
import { URI } from '../../../../base/common/uri.js';
import { type ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, type AgentProvider, type AgentSignal, type IActiveClient, type IAgent, type IAgentActionSignal, type IAgentChats, type IAgentCreateChatForkSource, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentCreateSessionConfig, type IAgentCreateSessionResult, type IAgentDescriptor, type IAgentModelInfo, type IAgentResolveSessionConfigParams, type IAgentSessionConfigCompletionsParams, type IAgentSessionMetadata, type IAgentToolPendingConfirmationSignal } from '../../common/agentService.js';
import { buildSubagentTurnsFromHistory, buildTurnsFromHistory, type IHistoryRecord } from './historyRecordFixtures.js';
import { ProtectedResourceMetadata, ToolCallContributorKind, type AgentSelection, type MessageAttachment, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, CustomizationLoadStatus, buildDefaultChatUri, isAhpChatChannel, parseChatUri, parseSubagentSessionUri, type ClientPluginCustomization, type Customization, type PendingMessage, type StringOrMarkdown, type ToolCallResult, type Turn, type UsageInfo } from '../../common/state/sessionState.js';
import { hasKey } from '../../../../base/common/types.js';

/** Well-known auto-generated title used by the 'with-title' prompt. */
export const MOCK_AUTO_TITLE = 'Automatically generated title';

function uriKey(session: URI): string {
	// Build a stable key from raw URI fields without invoking `toString()`,
	// which would mutate the URI's `_formatted` cache and break
	// `assert.deepStrictEqual` comparisons in tests that capture the URI
	// before it is observed elsewhere.
	return `${session.scheme}://${session.authority}${session.path}${session.query ? '?' + session.query : ''}${session.fragment ? '#' + session.fragment : ''}`;
}

function mockProject(provider: AgentProvider) {
	return { uri: URI.from({ scheme: 'mock-project', path: `/${provider}` }), displayName: `Agent ${provider}` };
}

interface IMockSendMessageCall {
	readonly session: URI;
	readonly prompt: string;
	readonly attachments?: readonly MessageAttachment[];
	readonly chat?: URI;
	readonly senderClientId?: string;
}

/**
 * General-purpose mock agent for unit tests. Tracks all method calls
 * for assertion and exposes {@link fireProgress} to inject progress events.
 */
export class MockAgent implements IAgent {
	private readonly _onDidSessionProgress = new Emitter<AgentSignal>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _onDidSendMessage = new Emitter<IMockSendMessageCall>();
	readonly onDidSendMessage = this._onDidSendMessage.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models = this._models;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;
	/** Active turn IDs per session, captured from sendMessage(). */
	private readonly _activeTurnIds = new Map<string, string>();


	readonly sendMessageCalls: IMockSendMessageCall[] = [];
	readonly setPendingMessagesCalls: { session: URI; steeringMessage: PendingMessage | undefined; queuedMessages: readonly PendingMessage[]; chat?: URI }[] = [];
	readonly disposeSessionCalls: URI[] = [];
	readonly releaseSessionCalls: URI[] = [];
	readonly abortSessionCalls: URI[] = [];
	readonly respondToPermissionCalls: { requestId: string; approved: boolean }[] = [];
	readonly changeModelCalls: { session: URI; model: ModelSelection; chat?: URI }[] = [];
	readonly changeAgentCalls: { session: URI; agent: AgentSelection | undefined; chat?: URI }[] = [];
	readonly authenticateCalls: { resource: string; token: string }[] = [];
	readonly setClientCustomizationsCalls: { clientId: string; customizations: ClientPluginCustomization[] }[] = [];
	readonly setClientToolsCalls: { clientId: string; tools: readonly ToolDefinition[] }[] = [];
	readonly removeActiveClientCalls: { clientId: string }[] = [];
	readonly clientToolCallCompleteCalls: { session: URI; chat: URI; toolCallId: string; result: ToolCallResult }[] = [];
	readonly truncateSessionCalls: { session: URI; turnId: string | undefined; chat: URI | undefined }[] = [];
	readonly setCustomizationEnabledCalls: { id: string; enabled: boolean }[] = [];
	/** Configurable return value for getCustomizations. */
	customizations: Customization[] = [];
	private readonly _onDidCustomizationsChange = new Emitter<void>();
	readonly onDidCustomizationsChange = this._onDidCustomizationsChange.event;
	getSessionCustomizations?: (session: URI) => Promise<readonly Customization[]>;

	/**
	 * Configurable session history. Tests construct {@link IHistoryRecord}
	 * entries (the agent-internal intermediate shape) and the mock converts
	 * them to {@link Turn}s on demand. Subagent URIs are routed to filtered
	 * subagent turns via {@link buildSubagentTurnsFromHistory}.
	 */
	sessionMessages: IHistoryRecord[] = [];

	/** Optional overrides applied to session metadata from listSessions. */
	sessionMetadataOverrides: Partial<Omit<IAgentSessionMetadata, 'session'>> = {};

	constructor(readonly id: AgentProvider = 'mock') { }

	getDescriptor(): IAgentDescriptor {
		return { provider: this.id, displayName: `Agent ${this.id}`, description: `Test ${this.id} agent` };
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		if (this.id === 'copilot') {
			return [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
		}
		return [];
	}

	setModels(models: readonly IAgentModelInfo[]): void {
		this._models.set(models, undefined);
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()].map(s => ({ session: s, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides }));
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		if (!this._sessions.has(AgentSession.id(session))) {
			return undefined;
		}
		return { session, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides };
	}

	/** Optional override for the working directory returned by createSession. */
	resolvedWorkingDirectory: URI | undefined;

	/**
	 * When set, {@link sendMessage} rejects with this error after recording the
	 * call — used to simulate a failed first-turn materialization (e.g. worktree
	 * or branch setup throwing).
	 */
	sendMessageError: Error | undefined;
	async createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		const session = config?.session ?? AgentSession.uri(this.id, `${this.id}-session-${this._nextId++}`);
		const rawId = AgentSession.id(session);
		this._sessions.set(rawId, session);
		return { session, project: mockProject(this.id), workingDirectory: this.resolvedWorkingDirectory };
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return { schema: { type: 'object', properties: {} }, values: params.config ?? {} };
	}

	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return { items: [] };
	}

	async sendMessage(session: URI, chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string): Promise<void> {
		const call = { session, prompt, attachments, chat, ...(senderClientId ? { senderClientId } : {}) };
		this.sendMessageCalls.push(call);
		this._onDidSendMessage.fire(call);
		if (turnId) {
			this._activeTurnIds.set(uriKey(session), turnId);
		}
		if (this.sendMessageError) {
			throw this.sendMessageError;
		}
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, queuedMessages: readonly PendingMessage[], chat?: URI): void {
		this.setPendingMessagesCalls.push({ session, steeringMessage, queuedMessages, chat });
	}

	readonly onSessionConfigChangedCalls: { session: URI; values: Record<string, unknown> }[] = [];
	onSessionConfigChanged(session: URI, values: Record<string, unknown>): void {
		this.onSessionConfigChangedCalls.push({ session, values });
	}

	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		const subagentInfo = parseSubagentSessionUri(session);
		if (subagentInfo) {
			return buildSubagentTurnsFromHistory(this.sessionMessages, subagentInfo.toolCallId, session.toString());
		}
		return buildTurnsFromHistory(this.sessionMessages);
	}

	async disposeSession(session: URI): Promise<void> {
		this.disposeSessionCalls.push(session);
		this._sessions.delete(AgentSession.id(session));
	}

	async releaseSession(session: URI): Promise<void> {
		// Non-destructive: record the call but keep the session in the catalog
		// so a later restore/resume still finds its durable data.
		this.releaseSessionCalls.push(session);
	}

	async abortSession(session: URI): Promise<void> {
		this.abortSessionCalls.push(session);
	}

	async truncateSession(session: URI, turnId?: string, chat?: URI): Promise<void> {
		this.truncateSessionCalls.push({ session, turnId, chat });
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		this.respondToPermissionCalls.push({ requestId, approved });
	}

	respondToUserInputRequest(): void {
		// no-op for tests
	}

	async changeModel(session: URI, model: ModelSelection, chat?: URI): Promise<void> {
		this.changeModelCalls.push({ session, model, chat });
	}

	async changeAgent(session: URI, agent: AgentSelection | undefined, chat?: URI): Promise<void> {
		this.changeAgentCalls.push({ session, agent, chat });
	}

	/**
	 * Create an additional (peer) chat. The base mock is single-chat and
	 * rejects; multi-chat test subclasses override this.
	 */
	async createChat(_session: URI, _chat: URI, _options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> {
		throw new Error(`Agent ${this.id} does not support multiple chats`);
	}

	/** Dispose an additional (peer) chat. Overridden by multi-chat subclasses. */
	async disposeChat(_session: URI, _chat: URI): Promise<void> { }

	/**
	 * Map an already-resolved chat URI to the `(session, chat)` pair the
	 * mock records calls against (mirroring the real agents).
	 */
	private _resolveChatTarget(chat: URI): { session: URI; chat: URI } {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`Mock agent chat operation requires an AHP chat URI: ${chat.toString()}`);
		}
		return { session: URI.parse(parsed.session), chat: URI.parse(chat.toString()) };
	}

	readonly chats: IAgentChats = {
		createChat: (chatUri: URI, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.createChat(session, chat, options);
		},
		fork: (chatUri: URI, source: IAgentCreateChatForkSource, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.createChat(session, chat, { ...options, fork: source });
		},
		disposeChat: (chatUri: URI): Promise<void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.disposeChat(session, chat);
		},
		sendMessage: (chatUri: URI, prompt: string, _workingDirectory: URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string): Promise<void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.sendMessage(session, chat, prompt, attachments, turnId, senderClientId);
		},
		abort: (chat: URI): Promise<void> => {
			const { session } = this._resolveChatTarget(chat);
			return this.abortSession(session);
		},
		changeModel: (chatUri: URI, model: ModelSelection): Promise<void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.changeModel(session, model, chat);
		},
		changeAgent: (chatUri: URI, agent: AgentSelection | undefined): Promise<void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.changeAgent(session, agent, chat);
		},
		getMessages: (chat: URI): Promise<readonly Turn[]> => {
			return this.getSessionMessages(chat);
		},
	};

	async authenticate(resource: string, token: string): Promise<boolean> {
		this.authenticateCalls.push({ resource, token });
		return true;
	}

	getCustomizations(): Customization[] {
		return this.customizations;
	}

	syncClientCustomizations(session: URI, clientId: string, customizations: ClientPluginCustomization[]): ISyncedCustomization[] {
		this.setClientCustomizationsCalls.push({ clientId, customizations });
		const results: ISyncedCustomization[] = customizations.map(c => ({
			customization: {
				...c,
				load: { kind: CustomizationLoadStatus.Loaded },
			},
		}));
		this._onDidSessionProgress.fire({
			kind: 'action',
			resource: session,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: results.map(result => result.customization),
			},
		});
		return results;
	}

	setCustomizationEnabled(id: string, enabled: boolean): void {
		this.setCustomizationEnabledCalls.push({ id, enabled });
	}

	getOrCreateActiveClient(session: URI, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		const self = this;
		let tools: readonly ToolDefinition[] = [];
		let customizations: readonly ClientPluginCustomization[] = [];
		return {
			clientId: client.clientId,
			displayName: client.displayName,
			get tools() { return tools; },
			set tools(value: readonly ToolDefinition[]) {
				tools = value;
				self.setClientToolsCalls.push({ clientId: client.clientId, tools: value });
			},
			get customizations() { return customizations; },
			set customizations(value: readonly ClientPluginCustomization[]) {
				customizations = value;
				self.syncClientCustomizations(session, client.clientId, [...value]);
			},
		};
	}

	removeActiveClient(_session: URI, clientId: string): void {
		this.removeActiveClientCalls.push({ clientId });
	}

	onClientToolCallComplete(session: URI, chat: URI, toolCallId: string, result: ToolCallResult): void {
		this.clientToolCallCompleteCalls.push({ session, chat, toolCallId, result });
	}

	async shutdown(): Promise<void> { }

	/**
	 * Fires an {@link AgentSignal} on this agent.
	 */
	fireProgress(signal: AgentSignal): void {
		this._onDidSessionProgress.fire(signal);
	}

	/**
	 * Looks up the active turn id captured from the most recent
	 * {@link sendMessage} call for a given session. Returns `undefined` if
	 * the session has no active turn yet (e.g. tests that fire progress
	 * without first calling sendMessage).
	 */
	getActiveTurnId(session: URI): string | undefined {
		return this._activeTurnIds.get(uriKey(session));
	}

	fireCustomizationsChange(): void {
		this._onDidCustomizationsChange.fire();
	}

	dispose(): void {
		this._onDidSessionProgress.dispose();
		this._onDidSendMessage.dispose();
		this._onDidCustomizationsChange.dispose();
	}
}

/**
 * Well-known URI of a pre-existing session seeded in {@link ScriptedMockAgent}.
 * This session appears in `listSessions()` and has message history via
 * `getSessionMessages()`, but was never created through the server's
 * `handleCreateSession`. It simulates a session from a previous server
 * lifetime for testing the restore-on-subscribe path.
 */
export const PRE_EXISTING_SESSION_URI = AgentSession.uri('mock', 'pre-existing-session');

export class ScriptedMockAgent implements IAgent {
	readonly id: AgentProvider = 'mock';

	private readonly _onDidSessionProgress = new Emitter<AgentSignal>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, [{ provider: 'mock', id: 'mock-model', name: 'Mock Model', maxContextWindow: 128000, supportsVision: false }]);
	readonly models = this._models;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;

	/**
	 * Message history for the pre-existing session: a single user→assistant
	 * turn with a tool call.
	 */
	private readonly _preExistingMessages: IHistoryRecord[] = [
		{ type: 'message', role: 'user', session: PRE_EXISTING_SESSION_URI, messageId: 'h-msg-1', content: 'What files are here?' },
		{ type: 'tool_start', session: PRE_EXISTING_SESSION_URI, toolCallId: 'h-tc-1', toolName: 'list_files', displayName: 'List Files', invocationMessage: 'Listing files...' },
		{ type: 'tool_complete', session: PRE_EXISTING_SESSION_URI, toolCallId: 'h-tc-1', result: { pastTenseMessage: 'Listed files', content: [{ type: ToolResultContentType.Text, text: 'file1.ts\nfile2.ts' }], success: true } satisfies ToolCallResult },
		{ type: 'message', role: 'assistant', session: PRE_EXISTING_SESSION_URI, messageId: 'h-msg-2', content: 'Here are the files: file1.ts and file2.ts' },
	];

	// Track pending permission requests
	private readonly _pendingPermissions = new Map<string, (approved: boolean) => void>();
	// Track the active turn ID per session, captured from sendMessage().
	private readonly _activeTurnIds = new Map<string, string>();
	// Track pending abort callbacks for slow responses
	private readonly _pendingAborts = new Map<string, () => void>();

	constructor() {
		// Seed the pre-existing session so it appears in listSessions()
		this._sessions.set(AgentSession.id(PRE_EXISTING_SESSION_URI), PRE_EXISTING_SESSION_URI);

		// Allow integration tests to seed additional pre-existing sessions across
		// server restarts via env var. The value is a comma-separated list of
		// session URIs (e.g. `mock://pre-1,mock://pre-2`).
		const seeded = process.env['VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS'];
		if (seeded) {
			for (const raw of seeded.split(',')) {
				const trimmed = raw.trim();
				if (!trimmed) {
					continue;
				}
				const uri = URI.parse(trimmed);
				this._sessions.set(AgentSession.id(uri), uri);
			}
		}
	}

	getDescriptor(): IAgentDescriptor {
		return { provider: 'mock', displayName: 'Mock Agent', description: 'Scripted test agent' };
	}

	getProtectedResources(): IAuthorizationProtectedResourceMetadata[] {
		return [];
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()].map(s => ({
			session: s,
			startTime: Date.now(),
			modifiedTime: Date.now(),
			project: mockProject(this.id),
			summary: s.toString() === PRE_EXISTING_SESSION_URI.toString() ? 'Pre-existing session' : undefined,
		}));
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		if (!this._sessions.has(AgentSession.id(session))) {
			return undefined;
		}
		return {
			session,
			startTime: Date.now(),
			modifiedTime: Date.now(),
			project: mockProject(this.id),
			summary: session.toString() === PRE_EXISTING_SESSION_URI.toString() ? 'Pre-existing session' : undefined,
		};
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		const session = config?.session ?? AgentSession.uri('mock', `mock-session-${this._nextId++}`);
		const rawId = AgentSession.id(session);
		this._sessions.set(rawId, session);
		return { session, project: mockProject(this.id) };
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const isolation = params.config?.isolation === 'folder' || params.config?.isolation === 'worktree' ? params.config.isolation : 'worktree';
		const branch = isolation === 'worktree' && typeof params.config?.branch === 'string' ? params.config.branch : 'main';
		return {
			schema: {
				type: 'object',
				properties: {
					isolation: {
						type: 'string',
						title: 'Isolation',
						description: 'Where the mock agent should make changes',
						enum: ['folder', 'worktree'],
						enumLabels: ['Folder', 'Worktree'],
						default: 'worktree',
					},
					branch: {
						type: 'string',
						title: 'Branch',
						description: 'Base branch to work from',
						enum: ['main'],
						enumLabels: ['main'],
						default: 'main',
						enumDynamic: isolation === 'worktree',
						readOnly: isolation === 'folder',
					},
				},
			},
			values: { isolation, branch },
		};
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.property !== 'branch') {
			return { items: [] };
		}
		const query = params.query?.toLowerCase() ?? '';
		const branches = ['main', 'feature/config', 'release'].filter(branch => branch.toLowerCase().includes(query));
		return { items: branches.map(branch => ({ value: branch, label: branch })) };
	}

	async sendMessage(session: URI, chat: URI, prompt: string, _attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		if (turnId) {
			this._activeTurnIds.set(uriKey(session), turnId);
			this._activeTurnIds.set(uriKey(chat), turnId);
		}
		const { sessionStr, turnId: tid } = this._ctx(chat);
		switch (prompt) {
			case 'hello':
				this._fireSequence([
					_markdown(chat, sessionStr, tid, 'Hello, world!'),
					_idle(chat, sessionStr, tid),
				]);
				break;

			case 'use-tool':
				this._fireSequence([
					..._toolStart(chat, sessionStr, tid, 'tc-1', 'echo_tool', 'Echo Tool', 'Running echo tool...'),
					_toolComplete(chat, sessionStr, tid, 'tc-1', { pastTenseMessage: 'Ran echo tool', content: [{ type: ToolResultContentType.Text, text: 'echoed' }], success: true }),
					_markdown(chat, sessionStr, tid, 'Tool done.'),
					_idle(chat, sessionStr, tid),
				]);
				break;

			case 'error':
				this._fireSequence([
					_error(chat, sessionStr, tid, 'test_error', 'Something went wrong'),
				]);
				break;

			case 'permission': {
				// Fire tool_start to create the tool, then pending_confirmation to request confirmation
				(async () => {
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, tid, 'tc-perm-1', 'shell', 'Shell', 'Run a test command')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-perm-1', 'Run a test command', { toolInput: 'echo test', confirmationTitle: 'Run a test command' }));
				})();
				this._pendingPermissions.set('tc-perm-1', (approved) => {
					if (approved) {
						this._fireSequence([
							_markdown(chat, sessionStr, tid, 'Allowed.'),
							_idle(chat, sessionStr, tid),
						]);
					}
				});
				break;
			}

			case 'write-file': {
				// Fire tool_start + pending_confirmation with write permission for a regular file (should be auto-approved)
				(async () => {
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, tid, 'tc-write-1', 'create', 'Create File', 'Create file')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-write-1', 'Write src/app.ts', { permissionKind: 'write', permissionPath: '/workspace/src/app.ts' }));
					// Auto-approved writes resolve immediately — complete the tool and turn
					await timeout(10);
					this._fireSequence([
						_toolComplete(chat, sessionStr, tid, 'tc-write-1', { pastTenseMessage: 'Wrote file', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true }),
						_idle(chat, sessionStr, tid),
					]);
				})();
				break;
			}

			case 'write-env': {
				// Fire tool_start + pending_confirmation with write permission for .env (should be blocked)
				(async () => {
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, tid, 'tc-write-env-1', 'create', 'Create File', 'Create file')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-write-env-1', 'Write .env', { permissionKind: 'write', permissionPath: '/workspace/.env', confirmationTitle: 'Write .env' }));
				})();
				this._pendingPermissions.set('tc-write-env-1', (approved) => {
					if (approved) {
						this._fireSequence([
							_toolComplete(chat, sessionStr, tid, 'tc-write-env-1', { pastTenseMessage: 'Wrote .env', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true }),
							_idle(chat, sessionStr, tid),
						]);
					}
				});
				break;
			}

			case 'run-safe-command': {
				// Fire tool_start + pending_confirmation with shell permission for an allowed command (should be auto-approved)
				(async () => {
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, tid, 'tc-shell-1', 'bash', 'Run Command', 'Run command')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-shell-1', 'ls -la', { permissionKind: 'shell', toolInput: 'ls -la' }));
					// Auto-approved shell commands resolve immediately
					await timeout(10);
					this._fireSequence([
						_toolComplete(chat, sessionStr, tid, 'tc-shell-1', { pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'file1.ts\nfile2.ts' }], success: true }),
						_idle(chat, sessionStr, tid),
					]);
				})();
				break;
			}

			case 'run-dangerous-command': {
				// Fire tool_start + pending_confirmation with shell permission for a denied command (should require confirmation)
				(async () => {
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, tid, 'tc-shell-deny-1', 'bash', 'Run Command', 'Run command')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-shell-deny-1', 'rm -rf /', { permissionKind: 'shell', toolInput: 'rm -rf /', confirmationTitle: 'Run in terminal' }));
				})();
				this._pendingPermissions.set('tc-shell-deny-1', (approved) => {
					if (approved) {
						this._fireSequence([
							_toolComplete(chat, sessionStr, tid, 'tc-shell-deny-1', { pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: '' }], success: true }),
							_idle(chat, sessionStr, tid),
						]);
					}
				});
				break;
			}

			case 'orphan-confirmation': {
				// Regression scenario for a `pending_confirmation` that
				// arrives without an active protocol turn (the session would
				// otherwise hang forever). Reproduces a hook-triggered
				// continuation that runs *after* the protocol turn has
				// already completed:
				//   1. A tool runs and the turn completes — the state manager
				//      no longer has an active turn.
				//   2. The continuation dispatches a new tool with an empty
				//      turnId and emits `pending_confirmation` while there is
				//      no active turn.
				// The read targets a path inside the working directory, so the
				// host auto-approves it and calls `respondToPermissionRequest`,
				// which resolves the callback below and lets the session
				// continue. Without the fix the signal is dropped, the callback
				// never fires, and the session hangs.
				(async () => {
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, tid, 'tc-orphan-initial', 'bash', 'Run Command', 'Run command')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_toolComplete(chat, sessionStr, tid, 'tc-orphan-initial', { pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true }));
					await timeout(5);
					// Complete the turn — the state manager clears the active turn.
					this._onDidSessionProgress.fire(_idle(chat, sessionStr, tid));

					// Hook-triggered continuation: a new tool starts with an
					// empty turnId and `pending_confirmation` arrives while
					// there is no active turn.
					await timeout(10);
					for (const s of _toolStart(chat, sessionStr, '', 'tc-orphan', 'view', 'Read', 'Read file')) {
						this._onDidSessionProgress.fire(s);
					}
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-orphan', 'Read file', { permissionKind: 'read', permissionPath: '/workspace/file.ts' }));
				})();
				this._pendingPermissions.set('tc-orphan', (approved) => {
					if (approved) {
						this._fireSequence([
							_toolComplete(chat, sessionStr, tid, 'tc-orphan', { pastTenseMessage: 'Read file', content: [{ type: ToolResultContentType.Text, text: 'contents' }], success: true }),
							_markdown(chat, sessionStr, tid, 'continued-after-hook'),
							_idle(chat, sessionStr, tid),
						]);
					}
				});
				break;
			}

			case 'with-usage':
				this._fireSequence([
					_markdown(chat, sessionStr, tid, 'Usage response.'),
					_usage(chat, sessionStr, tid, { inputTokens: 100, outputTokens: 50, model: 'mock-model', _meta: { cost: 0.5 } }),
					_idle(chat, sessionStr, tid),
				]);
				break;

			case 'with-reasoning': {
				const initialReasoning = _reasoning(chat, sessionStr, tid, 'Let me think');
				const partId = initialReasoning.action.type === ActionType.ChatResponsePart
					&& hasKey(initialReasoning.action.part, { id: true })
					? initialReasoning.action.part.id
					: '';
				this._fireSequence([
					initialReasoning,
					_action(chat, {
						type: ActionType.ChatReasoning,
						turnId: tid,
						partId,
						content: ' about this...',
					}),
					_markdown(chat, sessionStr, tid, 'Reasoned response.'),
					_idle(chat, sessionStr, tid),
				]);
				break;
			}

			case 'with-title':
				this._fireSequence([
					_markdown(chat, sessionStr, tid, 'Title response.'),
					_titleChanged(session, sessionStr, MOCK_AUTO_TITLE),
					_idle(chat, sessionStr, tid),
				]);
				break;

			case 'slow': {
				// Slow response for cancel testing — fires delta after a long delay
				const timer = setTimeout(() => {
					const ctx = this._ctx(chat);
					this._fireSequence([
						_markdown(chat, ctx.sessionStr, ctx.turnId, 'Slow response.'),
						_idle(chat, ctx.sessionStr, ctx.turnId),
					]);
				}, 5000);
				this._pendingAborts.set(session.toString(), () => clearTimeout(timer));
				break;
			}

			case 'client-tool': {
				// Fires tool_start with toolClientId followed by pending_confirmation
				// (without confirmationTitle) to simulate a client-provided tool
				// that is ready for execution. The real SDK handler fires
				// tool_ready once its deferred is in place.
				(async () => {
					await timeout(10);
					// Client tools don't get auto-ready — toolStart with toolClientId only emits tool_start
					this._onDidSessionProgress.fire(_action(chat, {
						type: ActionType.ChatToolCallStart,
						turnId: tid,
						toolCallId: 'tc-client-1',
						toolName: 'runTests',
						displayName: 'Run Tests',
						contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client-tool' },
					}));
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-client-1', 'Running tests...', { toolInput: '{}' }));
				})();
				// The tool stays pending — the client is responsible for dispatching toolCallComplete.
				// Once complete, fire a response delta and idle.
				this._pendingPermissions.set('tc-client-1', () => {
					this._fireSequence([
						_markdown(chat, sessionStr, tid, 'Client tool done.'),
						_idle(chat, sessionStr, tid),
					]);
				});
				break;
			}

			case 'client-tool-with-permission': {
				// Fires tool_start with toolClientId followed by a permission request.
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire(_action(chat, {
						type: ActionType.ChatToolCallStart,
						turnId: tid,
						toolCallId: 'tc-client-perm-1',
						toolName: 'runTests',
						displayName: 'Run Tests',
						contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client-tool' },
					}));
					await timeout(5);
					this._onDidSessionProgress.fire(_pendingConfirmation(chat, 'tc-client-perm-1', 'Run tests on project', { confirmationTitle: 'Allow Run Tests?' }));
				})();
				this._pendingPermissions.set('tc-client-perm-1', (approved) => {
					if (approved) {
						this._fireSequence([
							_toolComplete(chat, sessionStr, tid, 'tc-client-perm-1', { pastTenseMessage: 'Ran tests', content: [{ type: ToolResultContentType.Text, text: 'all passed' }], success: true }),
							_markdown(chat, sessionStr, tid, 'Permission granted, tool done.'),
							_idle(chat, sessionStr, tid),
						]);
					}
				});
				break;
			}

			case 'subagent': {
				// Spawns a subagent: parent `task` tool starts (emits start +
				// auto-ready as a pair), then `subagent_started` creates the
				// child session, then an inner tool runs in the child session
				// (routed via `parentToolCallId`).
				this._fireSequence([
					..._toolStart(chat, sessionStr, tid, 'tc-task-1', 'task', 'Task', 'Spawning subagent', { toolKind: 'subagent', subagentAgentName: 'explore', subagentDescription: 'Explore' }),
					{ kind: 'subagent_started', chat, toolCallId: 'tc-task-1', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Exploration helper' },
					..._toolStart(chat, sessionStr, tid, 'tc-inner-1', 'echo_tool', 'Echo Tool', 'Inner tool running...', { parentToolCallId: 'tc-task-1' }),
					_toolComplete(chat, sessionStr, tid, 'tc-inner-1', { pastTenseMessage: 'Ran inner tool', content: [{ type: ToolResultContentType.Text, text: 'inner-ok' }], success: true }, 'tc-task-1'),
					{ kind: 'subagent_completed', chat, toolCallId: 'tc-task-1' },
					_toolComplete(chat, sessionStr, tid, 'tc-task-1', { pastTenseMessage: 'Subagent done', content: [{ type: ToolResultContentType.Text, text: 'task-ok' }], success: true }),
					_markdown(chat, sessionStr, tid, 'Subagent finished.'),
					_idle(chat, sessionStr, tid),
				]);
				break;
			}

			default:
				if (prompt.startsWith('terminal-edit:')) {
					// Test prompt: simulate a terminal command that edits a file on disk
					// without emitting any ToolResultFileEditContent. The test relies on the
					// git-driven diff path to pick this up. Format: `terminal-edit:<absPath>`.
					const filePath = prompt.slice('terminal-edit:'.length);
					void (async () => {
						for (const s of _toolStart(chat, sessionStr, tid, 'tc-term-edit-1', 'bash', 'Run Command', 'Edit file via shell')) {
							this._onDidSessionProgress.fire(s);
						}
						const fs = await import('fs/promises');
						await fs.writeFile(filePath, 'edited-from-terminal\n');
						this._fireSequence([
							_toolComplete(chat, sessionStr, tid, 'tc-term-edit-1', { pastTenseMessage: 'Edited file', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true }),
							_idle(chat, sessionStr, tid),
						]);
					})().catch(err => {
						// Surface failures deterministically — an unhandled rejection
						// would make the test suite flaky.
						this._fireSequence([
							_markdown(chat, sessionStr, tid, 'terminal-edit failed: ' + (err instanceof Error ? err.message : String(err))),
							_idle(chat, sessionStr, tid),
						]);
					});
					break;
				}
				this._fireSequence([
					_markdown(chat, sessionStr, tid, 'Unknown prompt: ' + prompt),
					_idle(chat, sessionStr, tid),
				]);
				break;
		}
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// When steering is set, consume it on the next tick
		if (steeringMessage) {
			timeout(20).then(() => {
				this._onDidSessionProgress.fire({ kind: 'steering_consumed', chat: isAhpChatChannel(session.toString()) ? session : URI.parse(buildDefaultChatUri(session)), id: steeringMessage.id });
			});
		}
	}

	getOrCreateActiveClient(_session: URI, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		let tools: readonly ToolDefinition[] = [];
		let customizations: readonly ClientPluginCustomization[] = [];
		return {
			clientId: client.clientId,
			displayName: client.displayName,
			get tools() { return tools; },
			set tools(value: readonly ToolDefinition[]) { tools = value; },
			get customizations() { return customizations; },
			set customizations(value: readonly ClientPluginCustomization[]) { customizations = value; },
		};
	}

	removeActiveClient(): void { }

	setCustomizationEnabled() {

	}

	private didCompleteToolCalls = new Set<string>();

	onClientToolCallComplete(session: URI, chat: URI, toolCallId: string, result: ToolCallResult): void {
		// The mock's event model is chat-channel oriented (sendMessage fires
		// every turn signal on the chat URI). Emit the completion on the chat
		// channel the tool was started on so the parked turn callback — which
		// captured that same chat URI — resolves on the right channel.
		const key = `${chat.toString()}:${toolCallId}`;
		if (this.didCompleteToolCalls.has(key)) {
			return;
		}
		this.didCompleteToolCalls.add(key);
		// Fire tool_complete action signal and resolve any pending callback.
		const { sessionStr, turnId } = this._ctx(chat);
		this._onDidSessionProgress.fire(_toolComplete(chat, sessionStr, turnId, toolCallId, result));
		const callback = this._pendingPermissions.get(toolCallId);
		if (callback) {
			this._pendingPermissions.delete(toolCallId);
			callback(true);
		}
	}

	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		const subagentInfo = parseSubagentSessionUri(session);
		if (subagentInfo) {
			return buildSubagentTurnsFromHistory(this._preExistingMessages, subagentInfo.toolCallId, session.toString());
		}
		// Restore addresses the default chat by its channel URI; normalize it
		// back to the session URI (mirroring the real agents' getSessionMessages).
		const parsed = parseChatUri(session);
		const normalized = parsed && buildDefaultChatUri(parsed.session) === session.toString() ? URI.parse(parsed.session) : session;
		if (normalized.toString() === PRE_EXISTING_SESSION_URI.toString()) {
			return buildTurnsFromHistory(this._preExistingMessages);
		}
		return [];
	}

	async disposeSession(session: URI): Promise<void> {
		this._sessions.delete(AgentSession.id(session));
	}

	async abortSession(session: URI): Promise<void> {
		const callback = this._pendingAborts.get(session.toString());
		if (callback) {
			this._pendingAborts.delete(session.toString());
			callback();
		}
	}

	async changeModel(_session: URI, _model: ModelSelection): Promise<void> {
		// Mock agent doesn't track model state
	}

	/**
	 * Map an already-resolved chat URI to the `(session, chat)` pair the
	 * scripted mock's per-chat context is keyed by.
	 */
	private _resolveChatTarget(chat: URI): { session: URI; chat: URI } {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`Scripted mock chat operation requires an AHP chat URI: ${chat.toString()}`);
		}
		return { session: URI.parse(parsed.session), chat: URI.parse(chat.toString()) };
	}

	readonly chats: IAgentChats = {
		createChat: (_chat: URI, _options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			throw new Error('Scripted mock agent does not support multiple chats');
		},
		fork: (_chat: URI, _source: IAgentCreateChatForkSource, _options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			throw new Error('Scripted mock agent does not support chat forking');
		},
		disposeChat: (_chat: URI): Promise<void> => {
			return Promise.resolve();
		},
		sendMessage: (chatUri: URI, prompt: string, _workingDirectory: URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string): Promise<void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this.sendMessage(session, chat, prompt, attachments, turnId);
		},
		abort: (chat: URI): Promise<void> => {
			const { session } = this._resolveChatTarget(chat);
			return this.abortSession(session);
		},
		changeModel: (chat: URI, model: ModelSelection): Promise<void> => {
			const { session } = this._resolveChatTarget(chat);
			return this.changeModel(session, model);
		},
		changeAgent: (_chat: URI, _agent: AgentSelection | undefined): Promise<void> => {
			// Scripted mock does not track agent selection.
			return Promise.resolve();
		},
		getMessages: (chat: URI): Promise<readonly Turn[]> => {
			return this.getSessionMessages(chat);
		},
	};

	async truncateSession(_session: URI, _turnId?: string): Promise<void> {
		// Mock agent accepts truncation without side effects
	}

	respondToPermissionRequest(toolCallId: string, approved: boolean): void {
		const callback = this._pendingPermissions.get(toolCallId);
		if (callback) {
			this._pendingPermissions.delete(toolCallId);
			callback(approved);
		}
	}

	respondToUserInputRequest(): void {
		// no-op for tests
	}

	async authenticate(_resource: string, _token: string): Promise<boolean> {
		return true;
	}

	async shutdown(): Promise<void> { }

	dispose(): void {
		this._onDidSessionProgress.dispose();
	}

	/**
	 * Fires a sequence of {@link AgentSignal}s with staggered 10 ms delays
	 * so the state manager processes them in order.
	 */
	private _fireSequence(signals: AgentSignal[]): void {
		let delay = 0;
		for (const signal of signals) {
			delay += 10;
			setTimeout(() => this._onDidSessionProgress.fire(signal), delay);
		}
	}

	/** Builds the session-string + turnId context for signal construction. */
	private _ctx(session: URI): { sessionStr: string; turnId: string } {
		return {
			sessionStr: session.toString(),
			turnId: this._activeTurnIds.get(uriKey(session)) ?? 'mock-turn',
		};
	}
}

// =============================================================================
// Test-event helpers
// =============================================================================

// =============================================================================
// Signal factory helpers
// =============================================================================

let _mockPartIdCounter = 0;

/** Wraps a session action into an {@link IAgentActionSignal}. */
function _action(session: URI, action: import('../../common/state/sessionActions.js').SessionAction | import('../../common/state/sessionActions.js').ChatAction, parentToolCallId?: string): IAgentActionSignal {
	return { kind: 'action', resource: session, action, parentToolCallId };
}

/** Creates a markdown {@link ResponsePartKind.Markdown} response part signal. */
function _markdown(session: URI, sessionStr: string, turnId: string, content: string, parentToolCallId?: string): IAgentActionSignal {
	return _action(session, {
		type: ActionType.ChatResponsePart,
		turnId,
		part: { kind: ResponsePartKind.Markdown, id: `mock-md-${++_mockPartIdCounter}`, content },
	}, parentToolCallId);
}

/** Creates a reasoning {@link ResponsePartKind.Reasoning} response part signal. */
function _reasoning(session: URI, sessionStr: string, turnId: string, content: string): IAgentActionSignal {
	return _action(session, {
		type: ActionType.ChatResponsePart,
		turnId,
		part: { kind: ResponsePartKind.Reasoning, id: `mock-rs-${++_mockPartIdCounter}`, content },
	});
}

/** Creates a {@link ActionType.ChatTurnComplete} signal. */
function _idle(session: URI, sessionStr: string, turnId: string): IAgentActionSignal {
	return _action(session, { type: ActionType.ChatTurnComplete, turnId, duration: 1 });
}

/** Creates a {@link ActionType.ChatError} signal. */
function _error(session: URI, sessionStr: string, turnId: string, errorType: string, message: string, stack?: string): IAgentActionSignal {
	return _action(session, { type: ActionType.ChatError, turnId, duration: 1, error: { errorType, message, stack } });
}

/** Creates a {@link ActionType.SessionTitleChanged} signal. */
function _titleChanged(session: URI, sessionStr: string, title: string): IAgentActionSignal {
	return _action(session, { type: ActionType.SessionTitleChanged, title });
}

/** Creates a {@link ActionType.ChatUsage} signal. */
function _usage(session: URI, sessionStr: string, turnId: string, usage: UsageInfo): IAgentActionSignal {
	return _action(session, { type: ActionType.ChatUsage, turnId, usage });
}

/**
 * Creates tool-start signals: a {@link ActionType.ChatToolCallStart} and,
 * for non-client tools, an auto-ready {@link ActionType.ChatToolCallReady}.
 */
function _toolStart(session: URI, sessionStr: string, turnId: string, toolCallId: string, toolName: string, displayName: string, invocationMessage: StringOrMarkdown, opts?: {
	toolInput?: string;
	toolKind?: string;
	toolClientId?: string;
	subagentAgentName?: string;
	subagentDescription?: string;
	parentToolCallId?: string;
}): IAgentActionSignal[] {
	const meta: Record<string, unknown> = {};
	if (opts?.toolKind) {
		meta.toolKind = opts.toolKind;
	}
	if (opts?.subagentAgentName) {
		meta.subagentAgentName = opts.subagentAgentName;
	}
	if (opts?.subagentDescription) {
		meta.subagentDescription = opts.subagentDescription;
	}
	const signals: IAgentActionSignal[] = [_action(session, {
		type: ActionType.ChatToolCallStart,
		turnId,
		toolCallId,
		toolName,
		displayName,
		contributor: opts?.toolClientId ? { kind: ToolCallContributorKind.Client, clientId: opts.toolClientId } : undefined,
		_meta: Object.keys(meta).length ? meta : undefined,
	}, opts?.parentToolCallId)];
	if (!opts?.toolClientId) {
		signals.push(_action(session, {
			type: ActionType.ChatToolCallReady,
			turnId,
			toolCallId,
			invocationMessage,
			toolInput: opts?.toolInput,
			confirmed: ToolCallConfirmationReason.NotNeeded,
		}, opts?.parentToolCallId));
	}
	return signals;
}

/** Creates a {@link ActionType.ChatToolCallComplete} signal. */
function _toolComplete(session: URI, sessionStr: string, turnId: string, toolCallId: string, result: ToolCallResult, parentToolCallId?: string): IAgentActionSignal {
	return _action(session, { type: ActionType.ChatToolCallComplete, turnId, toolCallId, result }, parentToolCallId);
}

/** Creates a {@link IAgentToolPendingConfirmationSignal}. */
function _pendingConfirmation(session: URI, toolCallId: string, invocationMessage: StringOrMarkdown, opts?: {
	toolInput?: string;
	confirmationTitle?: StringOrMarkdown;
	permissionKind?: IAgentToolPendingConfirmationSignal['permissionKind'];
	permissionPath?: IAgentToolPendingConfirmationSignal['permissionPath'];
}): IAgentToolPendingConfirmationSignal {
	return {
		kind: 'pending_confirmation',
		chat: session,
		state: {
			status: ToolCallStatus.PendingConfirmation,
			toolCallId,
			toolName: '',
			displayName: '',
			invocationMessage,
			toolInput: opts?.toolInput,
			confirmationTitle: opts?.confirmationTitle,
		},
		permissionKind: opts?.permissionKind,
		permissionPath: opts?.permissionPath,
	};
}
