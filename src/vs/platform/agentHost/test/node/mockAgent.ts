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
import { AgentSession, type AgentProvider, type IAgent, type IAgentAttachment, type IAgentCreateSessionConfig, type IAgentCreateSessionResult, type IAgentDescriptor, type IAgentModelInfo, type IAgentProgressEvent, type IAgentResolveSessionConfigParams, type IAgentSessionConfigCompletionsParams, type IAgentSessionMetadata, type SessionHistoryEvent } from '../../common/agentService.js';
import { ProtectedResourceMetadata, type ModelSelection } from '../../common/state/protocol/state.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { CustomizationStatus, ToolResultContentType, type CustomizationRef, type PendingMessage, type ToolCallResult } from '../../common/state/sessionState.js';

/** Well-known auto-generated title used by the 'with-title' prompt. */
export const MOCK_AUTO_TITLE = 'Automatically generated title';

function mockProject(provider: AgentProvider) {
	return { uri: URI.from({ scheme: 'mock-project', path: `/${provider}` }), displayName: `Agent ${provider}` };
}

/**
 * General-purpose mock agent for unit tests. Tracks all method calls
 * for assertion and exposes {@link fireProgress} to inject progress events.
 */
export class MockAgent implements IAgent {
	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models = this._models;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;


	readonly sendMessageCalls: { session: URI; prompt: string; attachments?: readonly IAgentAttachment[] }[] = [];
	readonly setPendingMessagesCalls: { session: URI; steeringMessage: PendingMessage | undefined; queuedMessages: readonly PendingMessage[] }[] = [];
	readonly disposeSessionCalls: URI[] = [];
	readonly abortSessionCalls: URI[] = [];
	readonly respondToPermissionCalls: { requestId: string; approved: boolean }[] = [];
	readonly changeModelCalls: { session: URI; model: ModelSelection }[] = [];
	readonly authenticateCalls: { resource: string; token: string }[] = [];
	readonly setClientCustomizationsCalls: { clientId: string; customizations: CustomizationRef[] }[] = [];
	readonly setCustomizationEnabledCalls: { uri: string; enabled: boolean }[] = [];
	/** Configurable return value for getCustomizations. */
	customizations: CustomizationRef[] = [];

	/** Configurable return value for getSessionMessages. */
	sessionMessages: SessionHistoryEvent[] = [];

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

	/** Optional override for the working directory returned by createSession. */
	resolvedWorkingDirectory: URI | undefined;

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

	async sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		this.sendMessageCalls.push({ session, prompt, attachments });
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, queuedMessages: readonly PendingMessage[]): void {
		this.setPendingMessagesCalls.push({ session, steeringMessage, queuedMessages });
	}

	async getSessionMessages(_session: URI): Promise<SessionHistoryEvent[]> {
		return this.sessionMessages;
	}

	async disposeSession(session: URI): Promise<void> {
		this.disposeSessionCalls.push(session);
		this._sessions.delete(AgentSession.id(session));
	}

	async abortSession(session: URI): Promise<void> {
		this.abortSessionCalls.push(session);
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		this.respondToPermissionCalls.push({ requestId, approved });
	}

	respondToUserInputRequest(): void {
		// no-op for tests
	}

	async changeModel(session: URI, model: ModelSelection): Promise<void> {
		this.changeModelCalls.push({ session, model });
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		this.authenticateCalls.push({ resource, token });
		return true;
	}

	getCustomizations(): CustomizationRef[] {
		return this.customizations;
	}

	async setClientCustomizations(clientId: string, customizations: CustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		this.setClientCustomizationsCalls.push({ clientId, customizations });
		const results: ISyncedCustomization[] = customizations.map(c => ({
			customization: {
				customization: c,
				enabled: true,
				status: CustomizationStatus.Loaded,
			},
		}));
		progress?.(results);
		return results;
	}

	setCustomizationEnabled(uri: string, enabled: boolean): void {
		this.setCustomizationEnabledCalls.push({ uri, enabled });
	}

	setClientTools(): void { }

	onClientToolCallComplete(): void { }

	async shutdown(): Promise<void> { }

	fireProgress(event: IAgentProgressEvent): void {
		this._onDidSessionProgress.fire(event);
	}

	dispose(): void {
		this._onDidSessionProgress.dispose();
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

	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, [{ provider: 'mock', id: 'mock-model', name: 'Mock Model', maxContextWindow: 128000, supportsVision: false }]);
	readonly models = this._models;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;

	/**
	 * Message history for the pre-existing session: a single user→assistant
	 * turn with a tool call.
	 */
	private readonly _preExistingMessages: SessionHistoryEvent[] = [
		{ type: 'message', role: 'user', session: PRE_EXISTING_SESSION_URI, messageId: 'h-msg-1', content: 'What files are here?' },
		{ type: 'tool_start', session: PRE_EXISTING_SESSION_URI, toolCallId: 'h-tc-1', toolName: 'list_files', displayName: 'List Files', invocationMessage: 'Listing files...' },
		{ type: 'tool_complete', session: PRE_EXISTING_SESSION_URI, toolCallId: 'h-tc-1', result: { pastTenseMessage: 'Listed files', content: [{ type: ToolResultContentType.Text, text: 'file1.ts\nfile2.ts' }], success: true } satisfies ToolCallResult },
		{ type: 'message', role: 'assistant', session: PRE_EXISTING_SESSION_URI, messageId: 'h-msg-2', content: 'Here are the files: file1.ts and file2.ts' },
	];

	// Track pending permission requests
	private readonly _pendingPermissions = new Map<string, (approved: boolean) => void>();
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

	async sendMessage(session: URI, prompt: string, _attachments?: IAgentAttachment[]): Promise<void> {
		switch (prompt) {
			case 'hello':
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Hello, world!' },
					{ type: 'idle', session },
				]);
				break;

			case 'use-tool':
				this._fireSequence(session, [
					{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'echo_tool', displayName: 'Echo Tool', invocationMessage: 'Running echo tool...' },
					{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { pastTenseMessage: 'Ran echo tool', content: [{ type: ToolResultContentType.Text, text: 'echoed' }], success: true } },
					{ type: 'delta', session, messageId: 'msg-1', content: 'Tool done.' },
					{ type: 'idle', session },
				]);
				break;

			case 'error':
				this._fireSequence(session, [
					{ type: 'error', session, errorType: 'test_error', message: 'Something went wrong' },
				]);
				break;

			case 'permission': {
				// Fire tool_start to create the tool, then tool_ready to request confirmation
				const toolStartEvent = {
					type: 'tool_start' as const,
					session,
					toolCallId: 'tc-perm-1',
					toolName: 'shell',
					displayName: 'Shell',
					invocationMessage: 'Run a test command',
				};
				const toolReadyEvent = {
					type: 'tool_ready' as const,
					session,
					toolCallId: 'tc-perm-1',
					invocationMessage: 'Run a test command',
					toolInput: 'echo test',
					confirmationTitle: 'Run a test command',
				};
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire(toolStartEvent);
					await timeout(5);
					this._onDidSessionProgress.fire(toolReadyEvent);
				})();
				this._pendingPermissions.set('tc-perm-1', (approved) => {
					if (approved) {
						this._fireSequence(session, [
							{ type: 'delta', session, messageId: 'msg-1', content: 'Allowed.' },
							{ type: 'idle', session },
						]);
					}
				});
				break;
			}

			case 'write-file': {
				// Fire tool_start + tool_ready with write permission for a regular file (should be auto-approved)
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-write-1', toolName: 'create', displayName: 'Create File', invocationMessage: 'Create file' });
					await timeout(5);
					this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-write-1', invocationMessage: 'Write src/app.ts', permissionKind: 'write', permissionPath: '/workspace/src/app.ts' });
					// Auto-approved writes resolve immediately — complete the tool and turn
					await timeout(10);
					this._fireSequence(session, [
						{ type: 'tool_complete', session, toolCallId: 'tc-write-1', result: { pastTenseMessage: 'Wrote file', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true } },
						{ type: 'idle', session },
					]);
				})();
				break;
			}

			case 'write-env': {
				// Fire tool_start + tool_ready with write permission for .env (should be blocked)
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-write-env-1', toolName: 'create', displayName: 'Create File', invocationMessage: 'Create file' });
					await timeout(5);
					this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-write-env-1', invocationMessage: 'Write .env', permissionKind: 'write', permissionPath: '/workspace/.env', confirmationTitle: 'Write .env' });
				})();
				this._pendingPermissions.set('tc-write-env-1', (approved) => {
					if (approved) {
						this._fireSequence(session, [
							{ type: 'tool_complete', session, toolCallId: 'tc-write-env-1', result: { pastTenseMessage: 'Wrote .env', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true } },
							{ type: 'idle', session },
						]);
					}
				});
				break;
			}

			case 'run-safe-command': {
				// Fire tool_start + tool_ready with shell permission for an allowed command (should be auto-approved)
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-shell-1', toolName: 'bash', displayName: 'Run Command', invocationMessage: 'Run command' });
					await timeout(5);
					this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-shell-1', invocationMessage: 'ls -la', permissionKind: 'shell', toolInput: 'ls -la' });
					// Auto-approved shell commands resolve immediately
					await timeout(10);
					this._fireSequence(session, [
						{ type: 'tool_complete', session, toolCallId: 'tc-shell-1', result: { pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'file1.ts\nfile2.ts' }], success: true } },
						{ type: 'idle', session },
					]);
				})();
				break;
			}

			case 'run-dangerous-command': {
				// Fire tool_start + tool_ready with shell permission for a denied command (should require confirmation)
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-shell-deny-1', toolName: 'bash', displayName: 'Run Command', invocationMessage: 'Run command' });
					await timeout(5);
					this._onDidSessionProgress.fire({ type: 'tool_ready', session, toolCallId: 'tc-shell-deny-1', invocationMessage: 'rm -rf /', permissionKind: 'shell', toolInput: 'rm -rf /', confirmationTitle: 'Run in terminal' });
				})();
				this._pendingPermissions.set('tc-shell-deny-1', (approved) => {
					if (approved) {
						this._fireSequence(session, [
							{ type: 'tool_complete', session, toolCallId: 'tc-shell-deny-1', result: { pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: '' }], success: true } },
							{ type: 'idle', session },
						]);
					}
				});
				break;
			}

			case 'with-usage':
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Usage response.' },
					{ type: 'usage', session, inputTokens: 100, outputTokens: 50, model: 'mock-model' },
					{ type: 'idle', session },
				]);
				break;

			case 'with-reasoning':
				this._fireSequence(session, [
					{ type: 'reasoning', session, content: 'Let me think' },
					{ type: 'reasoning', session, content: ' about this...' },
					{ type: 'delta', session, messageId: 'msg-1', content: 'Reasoned response.' },
					{ type: 'idle', session },
				]);
				break;

			case 'with-title':
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Title response.' },
					{ type: 'title_changed', session, title: MOCK_AUTO_TITLE },
					{ type: 'idle', session },
				]);
				break;

			case 'slow': {
				// Slow response for cancel testing — fires delta after a long delay
				const timer = setTimeout(() => {
					this._fireSequence(session, [
						{ type: 'delta', session, messageId: 'msg-1', content: 'Slow response.' },
						{ type: 'idle', session },
					]);
				}, 5000);
				this._pendingAborts.set(session.toString(), () => clearTimeout(timer));
				break;
			}

			case 'client-tool': {
				// Fires tool_start with toolClientId to simulate a client-provided tool.
				// The server waits for the client to dispatch toolCallComplete.
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire({
						type: 'tool_start',
						session,
						toolCallId: 'tc-client-1',
						toolName: 'runTests',
						displayName: 'Run Tests',
						invocationMessage: 'Running tests...',
						toolClientId: 'test-client-tool',
					});
				})();
				// The tool stays pending — the client is responsible for dispatching toolCallComplete.
				// Once complete, fire a response delta and idle.
				this._pendingPermissions.set('tc-client-1', () => {
					this._fireSequence(session, [
						{ type: 'delta', session, messageId: 'msg-ct', content: 'Client tool done.' },
						{ type: 'idle', session },
					]);
				});
				break;
			}

			case 'client-tool-with-permission': {
				// Fires tool_start with toolClientId followed by a permission request.
				(async () => {
					await timeout(10);
					this._onDidSessionProgress.fire({
						type: 'tool_start',
						session,
						toolCallId: 'tc-client-perm-1',
						toolName: 'runTests',
						displayName: 'Run Tests',
						invocationMessage: 'Running tests...',
						toolClientId: 'test-client-tool',
					});
					await timeout(5);
					this._onDidSessionProgress.fire({
						type: 'tool_ready',
						session,
						toolCallId: 'tc-client-perm-1',
						invocationMessage: 'Run tests on project',
						confirmationTitle: 'Allow Run Tests?',
					});
				})();
				this._pendingPermissions.set('tc-client-perm-1', (approved) => {
					if (approved) {
						this._fireSequence(session, [
							{ type: 'tool_complete', session, toolCallId: 'tc-client-perm-1', result: { pastTenseMessage: 'Ran tests', content: [{ type: ToolResultContentType.Text, text: 'all passed' }], success: true } },
							{ type: 'delta', session, messageId: 'msg-cp', content: 'Permission granted, tool done.' },
							{ type: 'idle', session },
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
				this._fireSequence(session, [
					{
						type: 'tool_start',
						session,
						toolCallId: 'tc-task-1',
						toolName: 'task',
						displayName: 'Task',
						invocationMessage: 'Spawning subagent',
						toolKind: 'subagent',
						subagentAgentName: 'explore',
						subagentDescription: 'Explore',
					},
					{
						type: 'subagent_started',
						session,
						toolCallId: 'tc-task-1',
						agentName: 'explore',
						agentDisplayName: 'Explore',
						agentDescription: 'Exploration helper',
					},
					{
						type: 'tool_start',
						session,
						toolCallId: 'tc-inner-1',
						toolName: 'echo_tool',
						displayName: 'Echo Tool',
						invocationMessage: 'Inner tool running...',
						parentToolCallId: 'tc-task-1',
					},
					{
						type: 'tool_complete',
						session,
						toolCallId: 'tc-inner-1',
						parentToolCallId: 'tc-task-1',
						result: { pastTenseMessage: 'Ran inner tool', content: [{ type: ToolResultContentType.Text, text: 'inner-ok' }], success: true },
					},
					{
						type: 'tool_complete',
						session,
						toolCallId: 'tc-task-1',
						result: { pastTenseMessage: 'Subagent done', content: [{ type: ToolResultContentType.Text, text: 'task-ok' }], success: true },
					},
					{ type: 'delta', session, messageId: 'msg-sa', content: 'Subagent finished.' },
					{ type: 'idle', session },
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
						this._onDidSessionProgress.fire({ type: 'tool_start', session, toolCallId: 'tc-term-edit-1', toolName: 'bash', displayName: 'Run Command', invocationMessage: 'Edit file via shell' });
						const fs = await import('fs/promises');
						await fs.writeFile(filePath, 'edited-from-terminal\n');
						this._fireSequence(session, [
							{ type: 'tool_complete', session, toolCallId: 'tc-term-edit-1', result: { pastTenseMessage: 'Edited file', content: [{ type: ToolResultContentType.Text, text: 'ok' }], success: true } },
							{ type: 'idle', session },
						]);
					})().catch(err => {
						// Surface failures deterministically — an unhandled rejection
						// would make the test suite flaky.
						this._fireSequence(session, [
							{ type: 'delta', session, messageId: 'msg-err', content: 'terminal-edit failed: ' + (err instanceof Error ? err.message : String(err)) },
							{ type: 'idle', session },
						]);
					});
					break;
				}
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Unknown prompt: ' + prompt },
					{ type: 'idle', session },
				]);
				break;
		}
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// When steering is set, consume it on the next tick
		if (steeringMessage) {
			timeout(20).then(() => {
				this._onDidSessionProgress.fire({ type: 'steering_consumed', session, id: steeringMessage.id });
			});
		}
	}

	async setClientCustomizations() {
		return [];
	}

	setCustomizationEnabled() {

	}

	setClientTools(): void { }

	onClientToolCallComplete(session: URI, toolCallId: string, result: ToolCallResult): void {
		// Fire tool_complete and resolve any pending callback.
		this._onDidSessionProgress.fire({
			type: 'tool_complete',
			session,
			toolCallId,
			result,
		});
		const callback = this._pendingPermissions.get(toolCallId);
		if (callback) {
			this._pendingPermissions.delete(toolCallId);
			callback(true);
		}
	}

	async getSessionMessages(session: URI): Promise<SessionHistoryEvent[]> {
		if (session.toString() === PRE_EXISTING_SESSION_URI.toString()) {
			return this._preExistingMessages;
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

	private _fireSequence(session: URI, events: IAgentProgressEvent[]): void {
		let delay = 0;
		for (const event of events) {
			delay += 10;
			setTimeout(() => this._onDidSessionProgress.fire(event), delay);
		}
	}
}
