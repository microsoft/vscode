/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
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
import { IChatProgress, IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IChatModel } from '../../../contrib/chat/common/model/chatModel.js';
import { IChatAgentImplementation, IChatAgentData, IChatAgentHistoryEntry, IChatAgentRequest, IChatAgentService } from '../../../contrib/chat/common/participants/chatAgents.js';
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
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { stringifyJsonWithBufferRefs } from '../../../services/extensions/common/rpcProtocol.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatAgents2 } from '../../browser/mainThreadChatAgents2.js';
import { ExtHostChatAgentsShape2, IChatAgentHistoryEntryDto, IChatUsageDto, IExtensionChatAgentMetadata } from '../../common/extHost.protocol.js';

suite('MainThreadChatAgents2', function () {

	const AGENT_ID = 'test-agent';

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let mainThread: MainThreadChatAgents2;
	let mockChatService: MockChatService;
	let agentImpl: IChatAgentImplementation;
	let warnings: string[];
	let resolveInvoke: (result: unknown) => void;
	let historyContexts: Record<string, SerializableObjectWithBuffers<{ history: IChatAgentHistoryEntryDto[] } | IChatAgentHistoryEntryDto[]>>;
	let followupResult: Parameters<ExtHostChatAgentsShape2['$provideFollowups']>[2] | undefined;
	let participantDetector: Parameters<IChatAgentService['registerChatParticipantDetectionProvider']>[1] | undefined;

	setup(async function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();
		warnings = [];
		historyContexts = {};
		followupResult = undefined;
		participantDetector = undefined;

		// `$invokeAgent` is kept pending so the `_pendingProgress` entry registered at
		// the start of `invoke` stays alive while we route a usage chunk through it.
		const invokePromise = new Promise<unknown>(resolve => { resolveInvoke = resolve; });
		const proxy = {
			$acceptActiveChatSession: () => { },
			$invokeAgent: (...args: Parameters<ExtHostChatAgentsShape2['$invokeAgent']>) => {
				historyContexts.invoke = args[2];
				return invokePromise;
			},
			$provideFollowups: (...args: Parameters<ExtHostChatAgentsShape2['$provideFollowups']>) => {
				followupResult = args[2];
				historyContexts.followups = args[3];
				return Promise.resolve([]);
			},
			$provideChatTitle: (...args: Parameters<ExtHostChatAgentsShape2['$provideChatTitle']>) => {
				historyContexts.title = args[1];
				return Promise.resolve(undefined);
			},
			$provideChatSummary: (...args: Parameters<ExtHostChatAgentsShape2['$provideChatSummary']>) => {
				historyContexts.summary = args[1];
				return Promise.resolve(undefined);
			},
			$detectChatParticipant: (...args: Parameters<ExtHostChatAgentsShape2['$detectChatParticipant']>) => {
				historyContexts.detection = args[2];
				return Promise.resolve(undefined);
			},
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
			override registerChatParticipantDetectionProvider(_handle: number, provider: Parameters<IChatAgentService['registerChatParticipantDetectionProvider']>[1]): IDisposable {
				participantDetector = provider;
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
		instantiationService.stub(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() { });
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() { });
		instantiationService.stub(ITelemetryService, new class extends mock<ITelemetryService>() { });
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = observableValue('plugins', []);
		});
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() { });

		mainThread = disposables.add(instantiationService.createInstance(MainThreadChatAgents2, extHostContext));

		await mainThread.$registerAgent(1, new ExtensionIdentifier('test.ext'), AGENT_ID, { hasFollowups: true } as IExtensionChatAgentMetadata, undefined);
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

	test('uses buffer-backed JSON for every chat-history RPC', async () => {
		const sessionResource = URI.parse('vscode-chat:/large-history');
		const request = makeRequest('current', sessionResource);
		const text = 'x'.repeat(128 * 1024);
		const history: IChatAgentHistoryEntry[] = Array.from({ length: 32 }, (_, index) => ({
			request: makeRequest(`previous-${index}`, sessionResource),
			response: [],
			result: { metadata: { text } }
		}));
		const result = history[history.length - 1].result;
		const invocation = agentImpl.invoke(request, () => { }, history, CancellationToken.None);

		try {
			await agentImpl.provideFollowups!(request, result, history, CancellationToken.None);
			await agentImpl.provideChatTitle!(history, CancellationToken.None);
			await agentImpl.provideChatSummary!(history, CancellationToken.None);
			mainThread.$registerChatParticipantDetectionProvider(2);
			assert.ok(participantDetector);
			await participantDetector.provideParticipantDetection(request, history, { location: ChatAgentLocation.Chat, participants: [] }, CancellationToken.None);

			assert.deepStrictEqual(Object.keys(historyContexts).sort(), ['detection', 'followups', 'invoke', 'summary', 'title']);
			for (const context of Object.values(historyContexts)) {
				assert.ok(context instanceof SerializableObjectWithBuffers);
				const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(context.value, null, false, context.options?.preserveUndefined);
				assert.deepStrictEqual({
					smallJson: jsonString.length < 16 * 1024,
					bufferCount: referencedBuffers.length,
					preserveUndefined: context.options?.preserveUndefined,
					history: Array.isArray(context.value) ? context.value : context.value.history
				}, { smallJson: true, bufferCount: 32, preserveUndefined: false, history });
			}
			assert.ok(followupResult instanceof SerializableObjectWithBuffers);
			assert.deepStrictEqual(followupResult.value, result);
		} finally {
			resolveInvoke({});
			await invocation;
		}
	});
});
