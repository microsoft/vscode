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
import { FileService } from '../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { createTestChatSessionResources } from '../../../contrib/chat/test/common/model/chatSessionResourceLocks.js';
import { ChatAgentResult, ChatPromptReference } from '../../common/extHostTypeConverters.js';
import { ChatReferenceBinaryData, LanguageModelTextPart, LanguageModelToolResult } from '../../common/extHostTypes.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { resolveChatBinaryData } from '../../../contrib/chat/common/model/chatSessionResources.js';

suite('MainThreadChatAgents2', function () {

	const AGENT_ID = 'test-agent';

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let mainThread: MainThreadChatAgents2;
	let mockChatService: MockChatService;
	let agentImpl: IChatAgentImplementation;
	let warnings: string[];
	let resolveInvoke: (result: unknown) => void;
	let invokedRequest: IChatAgentRequest | undefined;

	setup(async function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();
		warnings = [];
		invokedRequest = undefined;

		// `$invokeAgent` is kept pending so the `_pendingProgress` entry registered at
		// the start of `invoke` stays alive while we route a usage chunk through it.
		const invokePromise = new Promise<unknown>(resolve => { resolveInvoke = resolve; });
		const proxy = {
			$acceptActiveChatSession: () => { },
			$invokeAgent: (_handle: number, request: IChatAgentRequest) => {
				invokedRequest = request;
				return invokePromise;
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

	test('persisted images reach participants as non-empty binary data with original authorization references', async () => {
		const files = disposables.add(new FileService(new NullLogService()));
		disposables.add(files.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resources = disposables.add(createTestChatSessionResources(files));
		const directory = URI.file('/session.resources');
		const source = new Uint8Array([0, 1, 128, 255]);
		const prepared = await resources.prepare({ value: source }, directory);
		const restored = resources.restore(prepared.value, directory);
		const originalResource = URI.file('/original/screenshot.png');
		const request: IChatAgentRequest = {
			...makeRequest('binary-request', URI.parse('vscode-local-chat-session:/binary')),
			variables: {
				variables: [{
					kind: 'image', id: 'image', name: 'screenshot.png', mimeType: 'image/png', isPasted: true,
					value: restored.value, references: [{ kind: 'reference', reference: originalResource }],
				}]
			},
		};
		resolveInvoke({});
		await agentImpl.invoke(request, () => { }, [], CancellationToken.None);
		assert.ok(invokedRequest);
		const reference = ChatPromptReference.to(invokedRequest.variables.variables[0], [], new NullLogService());
		assert.ok(reference?.value instanceof ChatReferenceBinaryData);
		assert.deepStrictEqual({
			bytes: await reference.value.data(),
			reference: reference.value.reference,
			isPasted: reference.value.isPasted,
		}, { bytes: source, reference: originalResource, isPasted: true });
	});

	test('unavailable tool data revives as an explicit extension text part', async () => {
		const files = disposables.add(new FileService(new NullLogService()));
		disposables.add(files.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resources = disposables.add(createTestChatSessionResources(files));
		const directory = URI.file('/session.resources');
		const prepared = await resources.prepare({
			metadata: { tool: { $mid: MarshalledId.LanguageModelToolResult, content: [{ $mid: MarshalledId.LanguageModelDataPart, data: 'AQID', mimeType: 'image/png' }] } },
		}, directory);
		const restored = resources.restore(prepared.value, directory);
		await files.del(directory, { recursive: true });
		const result = ChatAgentResult.to(await resolveChatBinaryData(restored, 'history'));
		assert.ok(result?.metadata?.tool instanceof LanguageModelToolResult);
		const part = result.metadata.tool.content[0];
		assert.ok(part instanceof LanguageModelTextPart);
		assert.match(part.value, /unavailable/);
	});

	test('missing persisted image fails before calling a participant', async () => {
		const files = disposables.add(new FileService(new NullLogService()));
		disposables.add(files.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resources = disposables.add(createTestChatSessionResources(files));
		const directory = URI.file('/missing.resources');
		const prepared = await resources.prepare({ value: new Uint8Array([1, 2, 3]) }, directory);
		const restored = resources.restore(prepared.value, directory);
		await files.del(directory, { recursive: true });
		const request: IChatAgentRequest = {
			...makeRequest('missing-request', URI.parse('vscode-local-chat-session:/missing')),
			variables: { variables: [{ kind: 'image', id: 'image', name: 'missing.png', value: restored.value }] },
		};
		await assert.rejects(agentImpl.invoke(request, () => { }, [], CancellationToken.None));
		assert.strictEqual(invokedRequest, undefined);
	});

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
