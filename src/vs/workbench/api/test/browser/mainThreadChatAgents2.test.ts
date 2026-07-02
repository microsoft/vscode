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
	let resolveInvoke: (result: unknown) => void;

	setup(async function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();
		warnings = [];

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
		});
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() { });
		instantiationService.stub(IPromptsService, new class extends mock<IPromptsService>() {
			override onDidChangeCustomAgents = Event.None;
			override onDidChangeInstructions = Event.None;
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
});
