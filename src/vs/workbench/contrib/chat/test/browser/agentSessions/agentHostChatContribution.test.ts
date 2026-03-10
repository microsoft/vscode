/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { timeout } from '../../../../../../base/common/async.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentAttachment, IAgentHostService, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent, AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatMarkdownContent, IChatProgress, IChatTerminalToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostContribution, AgentHostSessionListController, AgentHostSessionHandler } from '../../../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';

// ---- Mock agent host service ------------------------------------------------

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	override readonly onDidSessionProgress = this._onDidSessionProgress.event;
	override readonly onAgentHostExit = Event.None;
	override readonly onAgentHostStart = Event.None;

	private _nextId = 1;
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	private readonly _sessionMessages = new Map<string, (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]>();
	public sendMessageCalls: { session: URI; prompt: string; attachments?: IAgentAttachment[] }[] = [];
	public models: IAgentModelInfo[] = [];
	public agents = [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', requiresAuth: true }];

	override async setAuthToken(_token: string): Promise<void> { }

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async listAgents() {
		return this.agents;
	}

	override async listModels(): Promise<IAgentModelInfo[]> {
		return this.models;
	}

	override async createSession(): Promise<URI> {
		const id = `sdk-session-${this._nextId++}`;
		const session = AgentSession.uri('copilot', id);
		this._sessions.set(id, { session, startTime: Date.now(), modifiedTime: Date.now() });
		return session;
	}

	override async sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		this.sendMessageCalls.push({ session, prompt, attachments });
	}

	override async getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		return this._sessionMessages.get(AgentSession.id(session)) ?? [];
	}

	override async disposeSession(_session: URI): Promise<void> { }
	public abortSessionCalls: URI[] = [];
	override async abortSession(session: URI): Promise<void> { this.abortSessionCalls.push(session); }
	public permissionResponses: { requestId: string; approved: boolean }[] = [];
	override respondToPermissionRequest(requestId: string, approved: boolean): void { this.permissionResponses.push({ requestId, approved }); }
	override async shutdown(): Promise<void> { }
	override async restartAgentHost(): Promise<void> { }

	// Test helpers
	fireProgress(event: IAgentProgressEvent): void {
		this._onDidSessionProgress.fire(event);
	}

	setSessionMessages(sessionId: string, messages: (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]): void {
		this._sessionMessages.set(sessionId, messages);
	}

	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	dispose(): void {
		this._onDidSessionProgress.dispose();
	}
}

// ---- Minimal service mocks --------------------------------------------------

class MockChatAgentService extends mock<IChatAgentService>() {
	declare readonly _serviceBrand: undefined;

	registeredAgents = new Map<string, { data: IChatAgentData; impl: IChatAgentImplementation }>();

	override registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation) {
		this.registeredAgents.set(data.id, { data, impl: agentImpl });
		return toDisposable(() => this.registeredAgents.delete(data.id));
	}
}

// ---- Helpers ----------------------------------------------------------------

function createTestServices(disposables: DisposableStore) {
	const instantiationService = disposables.add(new TestInstantiationService());

	const agentHostService = new MockAgentHostService();
	disposables.add(toDisposable(() => agentHostService.dispose()));

	const chatAgentService = new MockChatAgentService();

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IProductService, { quality: 'insider' });
	instantiationService.stub(IChatAgentService, chatAgentService);
	instantiationService.stub(IChatSessionsService, {
		registerChatSessionItemController: () => toDisposable(() => { }),
		registerChatSessionContentProvider: () => toDisposable(() => { }),
		registerChatSessionContribution: () => toDisposable(() => { }),
	});
	instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
	instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
	instantiationService.stub(ILanguageModelsService, {
		deltaLanguageModelChatProviderDescriptors: () => { },
		registerLanguageModelProvider: () => toDisposable(() => { }),
	});
	instantiationService.stub(IConfigurationService, { getValue: () => true });
	instantiationService.stub(IOutputService, { getChannel: () => undefined });
	instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: '', folders: [] }), getWorkspaceFolder: () => null });

	return { instantiationService, agentHostService, chatAgentService };
}

function createContribution(disposables: DisposableStore) {
	const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

	const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot'));
	const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
		provider: 'copilot' as const,
		agentId: 'agent-host-copilot',
		sessionType: 'agent-host-copilot',
		fullName: 'Agent Host - Copilot',
		description: 'Copilot SDK agent running in a dedicated process',
	}));
	const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));

	return { contribution, listController, sessionHandler, agentHostService, chatAgentService };
}

function makeRequest(overrides: Partial<{ message: string; sessionResource: URI; variables: IChatAgentRequest['variables'] }> = {}): IChatAgentRequest {
	return upcastPartial<IChatAgentRequest>({
		sessionResource: overrides.sessionResource ?? URI.from({ scheme: 'untitled', path: '/chat-1' }),
		requestId: 'req-1',
		agentId: 'agent-host-copilot',
		message: overrides.message ?? 'Hello',
		variables: overrides.variables ?? { variables: [] },
		location: ChatAgentLocation.Chat,
	});
}

/** Extract the text value from a string or IMarkdownString. */
function textOf(value: string | IMarkdownString | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : value.value;
}

suite('AgentHostChatContribution', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Registration ---------------------------------------------------

	suite('registration', () => {

		test('registers agent', () => {
			const { chatAgentService } = createContribution(disposables);

			assert.ok(chatAgentService.registeredAgents.has('agent-host-copilot'));
		});
	});

	// ---- Session list (IChatSessionItemController) ----------------------

	suite('session list', () => {

		test('refresh populates items from agent host', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'bbb'), startTime: 3000, modifiedTime: 4000 });

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 2);
			assert.strictEqual(listController.items[0].label, 'My session');
			assert.strictEqual(listController.items[1].label, 'Session bbb');
			assert.strictEqual(listController.items[0].resource.scheme, 'agent-host-copilot');
			assert.strictEqual(listController.items[0].resource.path, '/aaa');
		});

		test('refresh fires onDidChangeChatSessionItems', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			let fired = false;
			disposables.add(listController.onDidChangeChatSessionItems(() => { fired = true; }));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'x'), startTime: 1000, modifiedTime: 2000 });
			await listController.refresh(CancellationToken.None);

			assert.ok(fired);
		});

		test('refresh handles error gracefully', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.listSessions = async () => { throw new Error('fail'); };

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 0);
		});
	});

	// ---- Session ID resolution in _invokeAgent --------------------------

	suite('session ID resolution', () => {

		test('creates new SDK session for untitled resource', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			const origSend = agentHostService.sendMessage.bind(agentHostService);
			agentHostService.sendMessage = async (session: URI, prompt: string) => {
				await origSend(session, prompt);
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({ message: 'Hello' }),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			assert.strictEqual(agentHostService.sendMessageCalls[0].prompt, 'Hello');
			assert.ok(AgentSession.id(agentHostService.sendMessageCalls[0].session).startsWith('sdk-session-'));
		});

		test('reuses SDK session for same resource on second message', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const resource = URI.from({ scheme: 'untitled', path: '/chat-reuse' });

			agentHostService.sendMessage = async (session: URI, prompt: string) => {
				agentHostService.sendMessageCalls.push({ session, prompt });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({ message: 'First', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);

			await agent.impl.invoke(
				makeRequest({ message: 'Second', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 2);
			assert.strictEqual(agentHostService.sendMessageCalls[0].session.toString(), agentHostService.sendMessageCalls[1].session.toString());
		});

		test('uses sessionId from agent-host scheme resource', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-42' });

			agentHostService.sendMessage = async (session: URI, prompt: string) => {
				agentHostService.sendMessageCalls.push({ session, prompt });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({ message: 'Hi', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(AgentSession.id(agentHostService.sendMessageCalls[0].session), 'existing-session-42');
		});

		test('agent-host scheme with untitled path creates new session via mapping', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-abc123' });

			agentHostService.sendMessage = async (session: URI, prompt: string) => {
				agentHostService.sendMessageCalls.push({ session, prompt });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({ message: 'Hi', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);

			// Should create a new SDK session, not use "untitled-abc123" literally
			assert.ok(AgentSession.id(agentHostService.sendMessageCalls[0].session).startsWith('sdk-session-'));
		});
	});

	// ---- Progress event → chat progress conversion ----------------------

	suite('progress routing', () => {

		test('delta events become markdownContent progress', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'delta', messageId: 'msg-1', content: 'hello ' });
				agentHostService.fireProgress({ session, type: 'delta', messageId: 'msg-1', content: 'world' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 2);
			assert.strictEqual(collected[0][0].kind, 'markdownContent');
			assert.strictEqual((collected[0][0] as IChatMarkdownContent).content.value, 'hello ');
			assert.strictEqual(collected[1][0].kind, 'markdownContent');
			assert.strictEqual((collected[1][0] as IChatMarkdownContent).content.value, 'world');
		});

		test('tool_start events become toolInvocation progress', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'tool_start', toolCallId: 'tc-1', toolName: 'read_file', displayName: 'Read File', invocationMessage: 'Reading file' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		});

		test('tool_complete event transitions toolInvocation to completed', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'tool_start', toolCallId: 'tc-2', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running Bash command' });
				agentHostService.fireProgress({ session, type: 'tool_complete', toolCallId: 'tc-2', success: true, pastTenseMessage: 'Ran Bash command' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(invocation.toolCallId, 'tc-2');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		});

		test('tool_complete with failure sets error state', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'tool_start', toolCallId: 'tc-3', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running Bash command' });
				agentHostService.fireProgress({ session, type: 'tool_complete', toolCallId: 'tc-3', success: false, pastTenseMessage: '"Bash" failed', toolOutput: 'command not found', error: { message: 'command not found' } });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		});

		test('malformed toolArguments does not throw', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'tool_start', toolCallId: 'tc-bad', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running Bash command', toolArguments: '{not valid json' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		});

		test('outstanding tool invocations are completed on idle', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				// tool_start without tool_complete
				agentHostService.fireProgress({ session, type: 'tool_start', toolCallId: 'tc-orphan', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running Bash command' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		});

		test('events from other sessions are ignored', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session: AgentSession.uri('copilot', 'other-session'), type: 'delta', messageId: 'msg-x', content: 'wrong' });
				agentHostService.fireProgress({ session, type: 'delta', messageId: 'msg-y', content: 'right' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			assert.strictEqual(collected.length, 1);
			assert.strictEqual((collected[0][0] as IChatMarkdownContent).content.value, 'right');
		});
	});

	// ---- Cancellation -----------------------------------------------------

	suite('cancellation', () => {

		test('cancellation resolves the agent invoke', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const cts = new CancellationTokenSource();
			disposables.add(cts);

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				cts.cancel();
			};

			const result = await agent.impl.invoke(
				makeRequest(),
				() => { }, [], cts.token,
			);

			assert.ok(result);
		});

		test('cancellation force-completes outstanding tool invocations', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const cts = new CancellationTokenSource();
			disposables.add(cts);
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'tool_start', toolCallId: 'tc-cancel', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running Bash command' });
				cts.cancel();
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], cts.token,
			);

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		});

		test('cancellation calls abortSession on the agent host service', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const cts = new CancellationTokenSource();
			disposables.add(cts);

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				cts.cancel();
			};

			await agent.impl.invoke(
				makeRequest(),
				() => { }, [], cts.token,
			);

			assert.strictEqual(agentHostService.abortSessionCalls.length, 1);
		});
	});

	// ---- Error events -------------------------------------------------------

	suite('error events', () => {

		test('error event renders error message and finishes the request', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({ session, type: 'error', errorType: 'test_error', message: 'Something went wrong' });
			};

			await agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			// Should have received the error message and the request should have finished
			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'markdownContent');
			assert.ok((collected[0][0] as IChatMarkdownContent).content.value.includes('Something went wrong'));
		});
	});

	// ---- Permission requests -----------------------------------------------

	suite('permission requests', () => {

		test('permission_request event shows confirmation and responds when confirmed', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				// Simulate a permission request
				agentHostService.fireProgress({
					session,
					type: 'permission_request',
					requestId: 'perm-1',
					permissionKind: 'shell',
					fullCommandText: 'echo hello',
					rawRequest: '{}',
				});
			};

			// Start the invoke but don't await yet -- we need to confirm the permission
			const invokePromise = agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			// Wait for the permission confirmation to appear
			await timeout(10);

			// The permission request should have produced a ChatToolInvocation in WaitingForConfirmation state
			assert.ok(collected.length >= 1, 'Should have received permission confirmation progress');
			const permInvocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(permInvocation.kind, 'toolInvocation');

			// Confirm the permission
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });

			// Now fire idle to complete the request
			await timeout(10);
			const session = agentHostService.sendMessageCalls[0].session;
			agentHostService.fireProgress({ session, type: 'idle' });

			await invokePromise;

			// The handler should have approved the permission request
			assert.strictEqual(agentHostService.permissionResponses.length, 1);
			assert.strictEqual(agentHostService.permissionResponses[0].requestId, 'perm-1');
			assert.strictEqual(agentHostService.permissionResponses[0].approved, true);
		});

		test('permission_request denied when user skips', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session,
					type: 'permission_request',
					requestId: 'perm-2',
					permissionKind: 'write',
					path: '/tmp/test.txt',
					rawRequest: '{}',
				});
			};

			const invokePromise = agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			await timeout(10);

			const permInvocation = collected[0][0] as IChatToolInvocation;
			// Deny the permission
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.Denied });

			await timeout(10);
			const session = agentHostService.sendMessageCalls[0].session;
			agentHostService.fireProgress({ session, type: 'idle' });

			await invokePromise;

			assert.strictEqual(agentHostService.permissionResponses.length, 1);
			assert.strictEqual(agentHostService.permissionResponses[0].requestId, 'perm-2');
			assert.strictEqual(agentHostService.permissionResponses[0].approved, false);
		});

		test('shell permission shows terminal-style confirmation data', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session,
					type: 'permission_request',
					requestId: 'perm-shell',
					permissionKind: 'shell',
					fullCommandText: 'echo hello',
					intention: 'Print greeting',
					rawRequest: '{}',
				});
			};

			const invokePromise = agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			await timeout(10);
			const permInvocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(permInvocation.toolSpecificData?.kind, 'terminal');
			const termData = permInvocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.strictEqual(termData.commandLine.original, 'echo hello');

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			agentHostService.fireProgress({ session: agentHostService.sendMessageCalls[0].session, type: 'idle' });
			await invokePromise;
		});

		test('read permission shows input-style confirmation data', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session,
					type: 'permission_request',
					requestId: 'perm-read',
					permissionKind: 'read',
					path: '/workspace/file.ts',
					intention: 'Read file contents',
					rawRequest: '{"kind":"read","path":"/workspace/file.ts"}',
				});
			};

			const invokePromise = agent.impl.invoke(
				makeRequest(),
				(parts) => collected.push(parts),
				[], CancellationToken.None,
			);

			await timeout(10);
			const permInvocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(permInvocation.toolSpecificData?.kind, 'input');

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			agentHostService.fireProgress({ session: agentHostService.sendMessageCalls[0].session, type: 'idle' });
			await invokePromise;
		});
	});

	// ---- History loading ---------------------------------------------------

	suite('history loading', () => {

		test('loads user and assistant messages into history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			agentHostService.setSessionMessages('sess-1', [
				{ session: AgentSession.uri('copilot', 'sess-1'), type: 'message', messageId: 'msg-u1', content: 'What is 2+2?', role: 'user' },
				{ session: AgentSession.uri('copilot', 'sess-1'), type: 'message', messageId: 'msg-a1', content: '4', role: 'assistant' },
			]);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/sess-1' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 2);

			const request = session.history[0];
			assert.strictEqual(request.type, 'request');
			if (request.type === 'request') {
				assert.strictEqual(request.prompt, 'What is 2+2?');
			}

			const response = session.history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type === 'response') {
				assert.strictEqual((response.parts[0] as IChatMarkdownContent).content.value, '4');
			}
		});

		test('untitled sessions have empty history', async () => {
			const { sessionHandler } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-xyz' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 0);
		});
	});

	// ---- Tool invocation rendering -----------------------------------------

	suite('tool invocation rendering', () => {

		test('bash tool renders as terminal command block with output', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session, type: 'tool_start', toolCallId: 'tc-shell', toolName: 'bash',
					displayName: 'Bash', invocationMessage: 'Running `echo hello`',
					toolInput: 'echo hello', toolKind: 'terminal',
					toolArguments: JSON.stringify({ command: 'echo hello' }),
				});
				agentHostService.fireProgress({ session, type: 'tool_complete', toolCallId: 'tc-shell', success: true, pastTenseMessage: 'Ran `echo hello`', toolOutput: 'hello\n', result: { content: 'hello\n' } });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(makeRequest(), (parts) => collected.push(parts), [], CancellationToken.None);

			const invocation = collected[0][0] as IChatToolInvocation;
			const termData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.deepStrictEqual({
				kind: invocation.kind,
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				dataKind: termData.kind,
				commandLine: termData.commandLine.original,
				language: termData.language,
				outputText: termData.terminalCommandOutput?.text,
				exitCode: termData.terminalCommandState?.exitCode,
			}, {
				kind: 'toolInvocation',
				invocationMessage: 'Running `echo hello`',
				pastTenseMessage: undefined,
				dataKind: 'terminal',
				commandLine: 'echo hello',
				language: 'shellscript',
				outputText: 'hello\n',
				exitCode: 0,
			});
		});

		test('bash tool failure sets exit code 1 and error output', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session, type: 'tool_start', toolCallId: 'tc-fail', toolName: 'bash',
					displayName: 'Bash', invocationMessage: 'Running `bad_cmd`',
					toolInput: 'bad_cmd', toolKind: 'terminal',
					toolArguments: JSON.stringify({ command: 'bad_cmd' }),
				});
				agentHostService.fireProgress({
					session, type: 'tool_complete', toolCallId: 'tc-fail', success: false,
					pastTenseMessage: '"Bash" failed', toolOutput: 'command not found: bad_cmd',
					error: { message: 'command not found: bad_cmd' },
				});
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(makeRequest(), (parts) => collected.push(parts), [], CancellationToken.None);

			const invocation = collected[0][0] as IChatToolInvocation;
			const termData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.deepStrictEqual({
				pastTenseMessage: invocation.pastTenseMessage,
				outputText: termData.terminalCommandOutput?.text,
				exitCode: termData.terminalCommandState?.exitCode,
			}, {
				pastTenseMessage: undefined,
				outputText: 'command not found: bad_cmd',
				exitCode: 1,
			});
		});

		test('generic tool has invocation message and no toolSpecificData', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session, type: 'tool_start', toolCallId: 'tc-gen', toolName: 'custom_tool',
					displayName: 'custom_tool', invocationMessage: 'Using "custom_tool"',
					toolArguments: JSON.stringify({ input: 'data' }),
				});
				agentHostService.fireProgress({ session, type: 'tool_complete', toolCallId: 'tc-gen', success: true, pastTenseMessage: 'Used "custom_tool"' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(makeRequest(), (parts) => collected.push(parts), [], CancellationToken.None);

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				toolSpecificData: invocation.toolSpecificData,
			}, {
				invocationMessage: 'Using "custom_tool"',
				pastTenseMessage: 'Used "custom_tool"',
				toolSpecificData: undefined,
			});
		});

		test('bash tool without arguments has no terminal data', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session, type: 'tool_start', toolCallId: 'tc-noargs', toolName: 'bash',
					displayName: 'Bash', invocationMessage: 'Running Bash command',
					toolKind: 'terminal',
				});
				agentHostService.fireProgress({ session, type: 'tool_complete', toolCallId: 'tc-noargs', success: true, pastTenseMessage: 'Ran Bash command' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(makeRequest(), (parts) => collected.push(parts), [], CancellationToken.None);

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				toolSpecificData: invocation.toolSpecificData,
			}, {
				invocationMessage: 'Running Bash command',
				pastTenseMessage: 'Ran Bash command',
				toolSpecificData: undefined,
			});
		});

		test('view tool shows file path in messages', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];

			agentHostService.sendMessage = async (session: URI) => {
				agentHostService.sendMessageCalls.push({ session, prompt: '' });
				agentHostService.fireProgress({
					session, type: 'tool_start', toolCallId: 'tc-view', toolName: 'view',
					displayName: 'View File', invocationMessage: 'Reading /tmp/test.txt',
					toolArguments: JSON.stringify({ file_path: '/tmp/test.txt' }),
				});
				agentHostService.fireProgress({ session, type: 'tool_complete', toolCallId: 'tc-view', success: true, pastTenseMessage: 'Read /tmp/test.txt' });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(makeRequest(), (parts) => collected.push(parts), [], CancellationToken.None);

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
			}, {
				invocationMessage: 'Reading /tmp/test.txt',
				pastTenseMessage: 'Read /tmp/test.txt',
			});
		});
	});

	// ---- History with tool events ----------------------------------------

	suite('history with tool events', () => {

		test('tool_start and tool_complete appear as toolInvocationSerialized in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const session = AgentSession.uri('copilot', 'tool-hist');

			agentHostService.setSessionMessages('tool-hist', [
				{ session, type: 'message', messageId: 'u1', content: 'run ls', role: 'user' },
				{ session, type: 'tool_start', toolCallId: 'tc-1', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running `ls`', toolInput: 'ls', toolKind: 'terminal' },
				{ session, type: 'tool_complete', toolCallId: 'tc-1', success: true, pastTenseMessage: 'Ran `ls`', toolOutput: 'file1\nfile2' },
				{ session, type: 'message', messageId: 'a1', content: 'Here are the files.', role: 'assistant' },
			]);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/tool-hist' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// request, response
			assert.strictEqual(chatSession.history.length, 2);

			const response = chatSession.history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type === 'response') {
				// tool invocation + markdown content
				assert.strictEqual(response.parts.length, 2);
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
				assert.strictEqual(toolPart.toolCallId, 'tc-1');
				assert.strictEqual(toolPart.isComplete, true);
				// Terminal tool has output and exit code
				assert.strictEqual(toolPart.toolSpecificData?.kind, 'terminal');
				const termData = toolPart.toolSpecificData as IChatTerminalToolInvocationData;
				assert.strictEqual(termData.terminalCommandOutput?.text, 'file1\nfile2');
				assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
			}
		});

		test('orphaned tool_start is marked complete in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const session = AgentSession.uri('copilot', 'orphan-tool');

			agentHostService.setSessionMessages('orphan-tool', [
				{ session, type: 'message', messageId: 'u1', content: 'do something', role: 'user' },
				{ session, type: 'tool_start', toolCallId: 'tc-orphan', toolName: 'read_file', displayName: 'Read File', invocationMessage: 'Reading file' },
				// No tool_complete for tc-orphan
				{ session, type: 'message', messageId: 'a1', content: 'Done', role: 'assistant' },
			]);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/orphan-tool' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 2);
			const response = chatSession.history[1];
			if (response.type === 'response') {
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
				assert.strictEqual(toolPart.isComplete, true);
			}
		});

		test('non-terminal tool_complete sets pastTenseMessage in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const session = AgentSession.uri('copilot', 'generic-tool');

			agentHostService.setSessionMessages('generic-tool', [
				{ session, type: 'message', messageId: 'u1', content: 'search', role: 'user' },
				{ session, type: 'tool_start', toolCallId: 'tc-g', toolName: 'grep', displayName: 'Grep', invocationMessage: 'Searching...' },
				{ session, type: 'tool_complete', toolCallId: 'tc-g', success: true, pastTenseMessage: 'Searched for pattern' },
				{ session, type: 'message', messageId: 'a1', content: 'Found it.', role: 'assistant' },
			]);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/generic-tool' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const response = chatSession.history[1];
			if (response.type === 'response') {
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(textOf(toolPart.pastTenseMessage), 'Searched for pattern');
				assert.strictEqual(toolPart.toolSpecificData, undefined);
			}
		});

		test('empty events produce empty history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			agentHostService.setSessionMessages('empty-sess', []);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/empty-sess' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 0);
		});
	});

	// ---- sendMessage error handling --------------------------------------

	suite('sendMessage error handling', () => {

		test('sendMessage failure resolves the agent invoke without throwing', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async () => {
				throw new Error('connection lost');
			};

			const result = await agent.impl.invoke(
				makeRequest({ message: 'Hello' }),
				() => { }, [], CancellationToken.None,
			);

			assert.ok(result);
		});
	});

	// ---- Session list provider filtering --------------------------------

	suite('session list provider filtering', () => {

		test('filters sessions to only the matching provider', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			// Add sessions from both providers (use a non-copilot scheme to test filtering)
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-1'), startTime: 1000, modifiedTime: 2000 });
			agentHostService.addSession({ session: URI.from({ scheme: 'other-provider', path: '/cl-1' }), startTime: 1000, modifiedTime: 2000 });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-2'), startTime: 3000, modifiedTime: 4000 });

			await listController.refresh(CancellationToken.None);

			// The list controller is configured for 'copilot', so only copilot sessions
			assert.strictEqual(listController.items.length, 2);
			assert.ok(listController.items.every(item => item.resource.scheme === 'agent-host-copilot'));
		});
	});

	// ---- Language model provider ----------------------------------------

	suite('language model provider', () => {

		test('maps models with correct metadata', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.models = [
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: true, supportsReasoningEffort: false },
			];

			const provider = disposables.add(instantiationService.createInstance(AgentHostLanguageModelProvider, 'agent-host-copilot', 'agent-host-copilot', 'copilot'));
			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].identifier, 'agent-host-copilot:gpt-4o');
			assert.strictEqual(models[0].metadata.name, 'GPT-4o');
			assert.strictEqual(models[0].metadata.maxInputTokens, 128000);
			assert.strictEqual(models[0].metadata.capabilities?.vision, true);
			assert.strictEqual(models[0].metadata.targetChatSessionType, 'agent-host-copilot');
		});

		test('filters out models from other providers', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.models = [
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: false, supportsReasoningEffort: false },
				{ provider: 'copilot', id: 'other-model', name: 'Other Model', maxContextWindow: 200000, supportsVision: false, supportsReasoningEffort: false },
			];

			// Create a provider that filters to a different vendor, simulating cross-provider filtering
			const provider = disposables.add(instantiationService.createInstance(AgentHostLanguageModelProvider, 'agent-host-copilot', 'agent-host-copilot', 'not-copilot'));
			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 0);
		});

		test('filters out disabled models', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.models = [
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: false, supportsReasoningEffort: false, policyState: 'enabled' },
				{ provider: 'copilot', id: 'gpt-3.5', name: 'GPT-3.5', maxContextWindow: 16000, supportsVision: false, supportsReasoningEffort: false, policyState: 'disabled' },
			];

			const provider = disposables.add(instantiationService.createInstance(AgentHostLanguageModelProvider, 'agent-host-copilot', 'agent-host-copilot', 'copilot'));
			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].metadata.name, 'GPT-4o');
		});

		test('returns empty array on error', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.listModels = async () => { throw new Error('not connected'); };

			const provider = disposables.add(instantiationService.createInstance(AgentHostLanguageModelProvider, 'agent-host-copilot', 'agent-host-copilot', 'copilot'));
			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 0);
		});

		test('sendChatRequest throws', async () => {
			const { instantiationService } = createTestServices(disposables);

			const provider = disposables.add(instantiationService.createInstance(AgentHostLanguageModelProvider, 'agent-host-copilot', 'agent-host-copilot', 'copilot'));

			await assert.rejects(() => provider.sendChatRequest(), /do not support direct chat requests/);
		});
	});

	// ---- Attachment context conversion --------------------------------------

	suite('attachment context', () => {

		test('file variable with file:// URI becomes file attachment', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({
					message: 'check this file',
					variables: {
						variables: [
							upcastPartial({ kind: 'file', id: 'v-file', name: 'test.ts', value: URI.file('/workspace/test.ts') }),
						],
					},
				}),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			const call = agentHostService.sendMessageCalls[0];
			assert.deepStrictEqual(call.attachments, [
				{ type: 'file', path: URI.file('/workspace/test.ts').fsPath, displayName: 'test.ts' },
			]);
		});

		test('directory variable with file:// URI becomes directory attachment', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({
					message: 'check this dir',
					variables: {
						variables: [
							upcastPartial({ kind: 'directory', id: 'v-dir', name: 'src', value: URI.file('/workspace/src') }),
						],
					},
				}),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			assert.deepStrictEqual(agentHostService.sendMessageCalls[0].attachments, [
				{ type: 'directory', path: URI.file('/workspace/src').fsPath, displayName: 'src' },
			]);
		});

		test('implicit selection variable becomes selection attachment', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({
					message: 'explain this',
					variables: {
						variables: [
							upcastPartial({ kind: 'implicit', id: 'v-implicit', name: 'selection', isFile: true as const, isSelection: true, uri: URI.file('/workspace/foo.ts'), enabled: true, value: undefined }),
						],
					},
				}),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			assert.deepStrictEqual(agentHostService.sendMessageCalls[0].attachments, [
				{ type: 'selection', path: URI.file('/workspace/foo.ts').fsPath, displayName: 'selection' },
			]);
		});

		test('non-file URIs are skipped', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({
					message: 'check this',
					variables: {
						variables: [
							upcastPartial({ kind: 'file', id: 'v-file', name: 'untitled', value: URI.from({ scheme: 'untitled', path: '/foo' }) }),
						],
					},
				}),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			// No attachments because it's not a file:// URI
			assert.strictEqual(agentHostService.sendMessageCalls[0].attachments, undefined);
		});

		test('tool variables are skipped', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({
					message: 'use tools',
					variables: {
						variables: [
							upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
						],
					},
				}),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			assert.strictEqual(agentHostService.sendMessageCalls[0].attachments, undefined);
		});

		test('mixed variables extracts only supported types', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({
					message: 'mixed',
					variables: {
						variables: [
							upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/workspace/a.ts') }),
							upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
							upcastPartial({ kind: 'directory', id: 'v-dir', name: 'lib', value: URI.file('/workspace/lib') }),
							upcastPartial({ kind: 'file', id: 'v-file', name: 'remote.ts', value: URI.from({ scheme: 'vscode-remote', path: '/remote/file.ts' }) }),
						],
					},
				}),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			assert.deepStrictEqual(agentHostService.sendMessageCalls[0].attachments, [
				{ type: 'file', path: URI.file('/workspace/a.ts').fsPath, displayName: 'a.ts' },
				{ type: 'directory', path: URI.file('/workspace/lib').fsPath, displayName: 'lib' },
			]);
		});

		test('no variables results in no attachments argument', async () => {
			const { chatAgentService, agentHostService } = createContribution(disposables);

			const agent = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			agentHostService.sendMessage = async (session: URI, prompt: string, attachments?: IAgentAttachment[]) => {
				agentHostService.sendMessageCalls.push({ session, prompt, attachments });
				agentHostService.fireProgress({ session, type: 'idle' });
			};

			await agent.impl.invoke(
				makeRequest({ message: 'Hello' }),
				() => { }, [], CancellationToken.None,
			);

			assert.strictEqual(agentHostService.sendMessageCalls.length, 1);
			assert.strictEqual(agentHostService.sendMessageCalls[0].attachments, undefined);
		});
	});

	// ---- AgentHostContribution discovery ---------------------------------

	suite('dynamic discovery', () => {

		test('setting gate prevents registration', async () => {
			const { instantiationService } = createTestServices(disposables);
			instantiationService.stub(IConfigurationService, { getValue: () => false });

			const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));
			// Contribution should exist but not have registered any agents
			assert.ok(contribution);
			// Let async work settle
			await timeout(10);
		});
	});
});
