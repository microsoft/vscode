/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { ChatRequestQueueKind, ChatSendResult, IChatModelReference, IChatProgress, IChatSendRequestOptions, IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../../contrib/chat/common/constants.js';
import { IChatModel, IChatRequestModeInfo } from '../../../contrib/chat/common/model/chatModel.js';
import { IChatAgentImplementation, IChatAgentData, IChatAgentRequest, IChatAgentService } from '../../../contrib/chat/common/participants/chatAgents.js';
import { IAgentPluginService } from '../../../contrib/chat/common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService } from '../../../contrib/chat/common/customizationHarnessService.js';
import { ILanguageModelToolsService } from '../../../contrib/chat/common/tools/languageModelToolsService.js';
import { MockChatService } from '../../../contrib/chat/test/common/chatService/mockChatService.js';
import { MockChatSessionsService } from '../../../contrib/chat/test/common/mockChatSessionsService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatAgents2 } from '../../browser/mainThreadChatAgents2.js';
import { IChatUsageDto, IExtensionChatAgentMetadata } from '../../common/extHost.protocol.js';

suite('MainThreadChatAgents2', function () {

	const AGENT_ID = 'test-agent';

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let mainThread: MainThreadChatAgents2;
	let mockChatService: MockChatService;
	let agentImpl: IChatAgentImplementation;
	let warnings: string[];
	let errors: sinon.SinonSpy;
	let toolsService: ILanguageModelToolsService;
	let resolveInvoke: (result: unknown) => void;

	setup(async function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();
		warnings = [];
		errors = sinon.spy();

		// `$invokeAgent` is kept pending so the `_pendingProgress` entry registered at
		// the start of `invoke` stays alive while we route a usage chunk through it.
		const invokePromise = new Promise<unknown>(resolve => { resolveInvoke = resolve; });
		const proxy = {
			$acceptActiveChatSession: () => { },
			$invokeAgent: () => invokePromise,
			$onDidChangePlugins: () => { },
		};
		const extHostContext = new class implements IExtHostContext {
			remoteAuthority = '';
			extensionHostKind = ExtensionHostKind.LocalProcess;
			dispose() { }
			assertRegistered() { }
			set(v: any): any { return null; }
			getProxy(): any { return proxy; }
			drain(): any { return null; }
		};

		let capturedImpl: IChatAgentImplementation | undefined;
		const chatAgentService = new class extends mock<IChatAgentService>() {
			override getAgent() { return { id: AGENT_ID } as IChatAgentData; }
			override getAgentsByName() { return []; }
			override registerAgentImplementation(_id: string, impl: IChatAgentImplementation): IDisposable {
				capturedImpl = impl;
				return { dispose() { } };
			}
		};

		mockChatService = new MockChatService();

		instantiationService.stub(IChatAgentService, chatAgentService);
		instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
		instantiationService.stub(IChatService, mockChatService);
		instantiationService.stub(ILanguageFeaturesService, new class extends mock<ILanguageFeaturesService>() { });
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override onDidChangeFocusedSession = Event.None;
			override get lastFocusedWidget() { return undefined; }
		});
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string) { warnings.push(message); }
			override error = errors;
		});
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() { });
		instantiationService.stub(IPromptsService, new class extends mock<IPromptsService>() {
			override onDidChangeCustomAgents = Event.None;
			override onDidChangeInstructions = Event.None;
			override onDidChangeAgentInstructions = Event.None;
			override onDidChangeSkills = Event.None;
			override onDidChangeSlashCommands = Event.None;
			override onDidChangeHooks = Event.None;
		});
		toolsService = new class extends mock<ILanguageModelToolsService>() {
			override beginToolCall() { return undefined; }
			override async updateToolStream() { }
		};
		instantiationService.stub(ILanguageModelToolsService, toolsService);
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() { });
		instantiationService.stub(ITelemetryService, new class extends mock<ITelemetryService>() { });
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = observableValue('plugins', []);
		});
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() { });

		mainThread = disposables.add(instantiationService.createInstance(MainThreadChatAgents2, extHostContext));

		await mainThread.$registerAgent(1, new ExtensionIdentifier('test.ext'), AGENT_ID, { hasFollowups: false } as IExtensionChatAgentMetadata, undefined);
		agentImpl = capturedImpl!;
	});

	teardown(function () {
		resolveInvoke?.({});
		disposables.dispose();
		instantiationService.dispose();
		sinon.restore();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function addSession(resource: URI, requests: { id: string; response?: { setUsage: sinon.SinonSpy } }[]): void {
		mockChatService.addSession({
			sessionResource: resource,
			getRequests: () => requests,
		} as unknown as IChatModel);
	}

	function makeRequest(requestId: string, sessionResource: URI, subAgentInvocationId?: string): IChatAgentRequest {
		return {
			requestId,
			sessionResource,
			agentId: AGENT_ID,
			message: 'hello',
			location: ChatAgentLocation.Chat,
			variables: { variables: [] },
			subAgentInvocationId,
		};
	}

	/**
	 * Starts an agent invocation (which registers the pending-progress entry) and routes a
	 * single usage chunk through `$handleProgressChunk`, returning the parts forwarded to the
	 * agent's progress callback.
	 */
	async function routeUsageChunk(request: IChatAgentRequest): Promise<IChatProgress[]> {
		const forwarded: IChatProgress[] = [];
		const invoke = agentImpl.invoke(request, parts => forwarded.push(...parts), [], CancellationToken.None);
		const usage: IChatUsageDto = { kind: 'usage', promptTokens: 1, completionTokens: 2, copilotCredits: 5 };
		await mainThread.$handleProgressChunk(request.requestId, [usage]);
		resolveInvoke({});
		await invoke;
		return forwarded;
	}

	test('forwards usage to the progress callback for a subagent request', async function () {
		const sessionResource = URI.parse('vscode-chat:/subagent-session');
		addSession(sessionResource, []);

		const forwarded = await routeUsageChunk(makeRequest('req-sub', sessionResource, 'subagent-1'));

		const usageParts = forwarded.filter(p => p.kind === 'usage');
		assert.strictEqual(usageParts.length, 1);
		assert.strictEqual((usageParts[0] as { copilotCredits?: number }).copilotCredits, 5);
	});

	test('sets usage on the response model for a non-subagent request', async function () {
		const sessionResource = URI.parse('vscode-chat:/parent-session');
		const setUsage = sinon.spy();
		addSession(sessionResource, [{ id: 'req-parent', response: { setUsage } }]);

		const forwarded = await routeUsageChunk(makeRequest('req-parent', sessionResource));

		assert.strictEqual(forwarded.filter(p => p.kind === 'usage').length, 0);
		assert.strictEqual(setUsage.callCount, 1);
		assert.strictEqual(setUsage.firstCall.args[0].copilotCredits, 5);
	});

	test('drops usage (with a warning) for a non-subagent request that has no response model', async function () {
		const sessionResource = URI.parse('vscode-chat:/orphan-session');
		addSession(sessionResource, []);

		const forwarded = await routeUsageChunk(makeRequest('req-orphan', sessionResource));

		assert.strictEqual(forwarded.filter(p => p.kind === 'usage').length, 0);
		assert.ok(warnings.some(w => w.includes('req-orphan')), `expected a warning mentioning the requestId, got: ${JSON.stringify(warnings)}`);
	});

	test('logs denied tool chunks without dropping markdown or waiting for streaming callbacks', async function () {
		const sessionResource = URI.parse('vscode-chat:/streaming-session');
		addSession(sessionResource, []);
		const beginError = new Error('Tool disabled by policy');
		const updateError = new Error('Streaming tool disabled by policy');
		sinon.stub(toolsService, 'beginToolCall').throws(beginError);
		const pendingUpdate = new DeferredPromise<void>();
		const update = sinon.stub(toolsService, 'updateToolStream');
		update.onFirstCall().rejects(updateError);
		update.onSecondCall().returns(pendingUpdate.p);
		const forwarded: IChatProgress[] = [];
		const invoke = agentImpl.invoke(makeRequest('req-stream', sessionResource), parts => forwarded.push(...parts), [], CancellationToken.None);
		const before: IChatProgress = { kind: 'markdownContent', content: { value: 'Before' } };
		const after: IChatProgress = { kind: 'markdownContent', content: { value: 'After' } };

		await mainThread.$handleProgressChunk('req-stream', [
			before,
			{ kind: 'beginToolInvocation', toolCallId: 'denied-begin', toolName: 'extensionTool' },
			{ kind: 'updateToolInvocation', toolCallId: 'denied-update', streamData: { partialInput: {} } },
			{ kind: 'updateToolInvocation', toolCallId: 'pending-update', streamData: { partialInput: {} } },
			after,
		]);
		await pendingUpdate.complete();
		resolveInvoke({});
		await invoke;

		assert.deepStrictEqual({ forwarded, errors: errors.args }, {
			forwarded: [before, after],
			errors: [
				['MainThreadChatAgents2#$handleProgressChunk: Failed to begin tool invocation denied-begin', beginError],
				['MainThreadChatAgents2#$handleProgressChunk: Failed to update tool invocation denied-update', updateError],
			],
		});
	});

	suite('$sendRequestToSession', function () {
		const sessionResource = URI.parse('vscode-chat-session://local/background');
		const modeInfo: IChatRequestModeInfo = { kind: ChatModeKind.Agent, isBuiltin: true, modeInstructions: undefined, telemetryModeId: 'agent', applyCodeBlockSuggestionId: undefined, permissionLevel: ChatPermissionLevel.AutoApprove };
		let sent: { resource: string; message: string; options: Omit<IChatSendRequestOptions, 'userSelectedTools'> }[];
		let releases: number;

		function stubSession(result: (deferred: DeferredPromise<ChatSendResult>) => ChatSendResult, session: URI | undefined = sessionResource): DeferredPromise<ChatSendResult> {
			sent = [];
			releases = 0;
			const deferred = new DeferredPromise<ChatSendResult>();
			const model = {
				sessionResource,
				lastRequest: { modelId: 'test-model', modeInfo, response: { agent: { id: 'previous-agent' } } },
			} as unknown as IChatModel;
			sinon.stub(mockChatService, 'acquireOrLoadSession').callsFake(async resource => session && resource.toString() === session.toString()
				? { object: model, dispose: () => releases++ } as IChatModelReference
				: undefined);
			const sendRequest: IChatService['sendRequest'] = async (resource, message, options) => {
				const { userSelectedTools: _, ...rest } = options ?? {};
				sent.push({ resource: resource.toString(), message, options: rest });
				return result(deferred);
			};
			sinon.stub(mockChatService, 'sendRequest').callsFake(sendRequest);
			return deferred;
		}

		test('queues the request in the session with the context of its last request and keeps the session alive until it completes', async function () {
			const deferred = stubSession(deferred => ({ kind: 'queued', deferred: deferred.p }));

			await mainThread.$sendRequestToSession(new ExtensionIdentifier('test.ext'), sessionResource, { prompt: 'Build output', label: 'Build finished' });
			const releasesBeforeCompletion = releases;
			deferred.complete({ kind: 'rejected', reason: 'Cleared' });
			await timeout(0);

			assert.deepStrictEqual({ sent, releasesBeforeCompletion, releases }, {
				sent: [{
					resource: sessionResource.toString(),
					message: '[Notification from extension test.ext]\nBuild output',
					options: {
						userSelectedModelId: 'test-model',
						modeInfo,
						agentIdSilent: 'previous-agent',
						instructionContext: { modeKind: ChatModeKind.Agent, enabledTools: undefined },
						queue: ChatRequestQueueKind.Queued,
						isSystemInitiated: true,
						systemInitiatedLabel: 'Build finished (test.ext)',
						requestSource: 'extension',
					},
				}],
				releasesBeforeCompletion: 0,
				releases: 1,
			});
		});

		test('lets the extension\'s own participant handle a steering request', async function () {
			stubSession(deferred => ({ kind: 'queued', deferred: deferred.p }));
			const agentService = instantiationService.get(IChatAgentService);
			sinon.stub(agentService, 'getAgent').callsFake(id => ({ id, extensionId: new ExtensionIdentifier(id === 'own.participant' ? 'test.ext' : 'other.ext') }) as IChatAgentData);

			await mainThread.$sendRequestToSession(new ExtensionIdentifier('test.ext'), sessionResource, { prompt: 'Test output', label: 'Tests finished', participant: 'own.participant', delivery: 'steer' });
			const error = await mainThread.$sendRequestToSession(new ExtensionIdentifier('test.ext'), sessionResource, { prompt: 'Test output', label: 'Tests finished', participant: 'other.participant' }).then(() => undefined, (e: Error) => e.message);

			assert.deepStrictEqual({ sent: sent.map(({ resource, message, options }) => ({ resource, message, options: { agentIdSilent: options.agentIdSilent, queue: options.queue } })), error }, {
				sent: [{ resource: sessionResource.toString(), message: 'Test output', options: { agentIdSilent: 'own.participant', queue: ChatRequestQueueKind.Steering } }],
				error: `Chat participant 'other.participant' is not registered by extension 'test.ext'`,
			});
		});

		test('rejects when the session is gone or does not accept the request', async function () {
			stubSession(() => ({ kind: 'rejected', reason: 'Session is read-only' }));
			const rejected = await mainThread.$sendRequestToSession(new ExtensionIdentifier('test.ext'), sessionResource, { prompt: 'Build output', label: 'Build finished' }).then(() => undefined, (e: Error) => e.message);
			const missing = await mainThread.$sendRequestToSession(new ExtensionIdentifier('test.ext'), URI.parse('vscode-chat-session://local/deleted'), { prompt: 'Build output', label: 'Build finished' }).then(() => undefined, (e: Error) => e.message);

			assert.deepStrictEqual({ rejected, missing, releases }, {
				rejected: 'Session is read-only',
				missing: 'Chat session not found: vscode-chat-session://local/deleted',
				releases: 1,
			});
		});
	});
});
