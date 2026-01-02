/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { InMemoryTestFileService, mock, TestContextService, TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { TestMcpService } from '../../../../mcp/test/common/testMcpService.js';
import { ChatAgentService, IChatAgent, IChatAgentData, IChatAgentImplementation, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatEditingService, IChatEditingSession } from '../../../common/editing/chatEditingService.js';
import { ChatModel, IChatModel, ISerializableChatData } from '../../../common/model/chatModel.js';
import { IChatFollowup, IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { ChatService } from '../../../common/chatService/chatServiceImpl.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { IChatVariablesService } from '../../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { MockChatService } from './mockChatService.js';
import { MockChatVariablesService } from '../mockChatVariables.js';

const chatAgentWithUsedContextId = 'ChatProviderWithUsedContext';
const chatAgentWithUsedContext: IChatAgent = {
	id: chatAgentWithUsedContextId,
	name: chatAgentWithUsedContextId,
	extensionId: nullExtensionDescription.identifier,
	extensionVersion: undefined,
	publisherDisplayName: '',
	extensionPublisherId: '',
	extensionDisplayName: '',
	locations: [ChatAgentLocation.Chat],
	modes: [ChatModeKind.Ask],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
	async invoke(request, progress, history, token) {
		progress([{
			documents: [
				{
					uri: URI.file('/test/path/to/file'),
					version: 3,
					ranges: [
						new Range(1, 1, 2, 2)
					]
				}
			],
			kind: 'usedContext'
		}]);

		return { metadata: { metadataKey: 'value' } };
	},
	async provideFollowups(sessionId, token) {
		return [{ kind: 'reply', message: 'Something else', agentId: '', tooltip: 'a tooltip' } satisfies IChatFollowup];
	},
};

const chatAgentWithMarkdownId = 'ChatProviderWithMarkdown';
const chatAgentWithMarkdown: IChatAgent = {
	id: chatAgentWithMarkdownId,
	name: chatAgentWithMarkdownId,
	extensionId: nullExtensionDescription.identifier,
	extensionVersion: undefined,
	publisherDisplayName: '',
	extensionPublisherId: '',
	extensionDisplayName: '',
	locations: [ChatAgentLocation.Chat],
	modes: [ChatModeKind.Ask],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
	async invoke(request, progress, history, token) {
		progress([{ kind: 'markdownContent', content: new MarkdownString('test') }]);
		return { metadata: { metadataKey: 'value' } };
	},
	async provideFollowups(sessionId, token) {
		return [];
	},
};

function getAgentData(id: string): IChatAgentData {
	return {
		name: id,
		id: id,
		extensionId: nullExtensionDescription.identifier,
		extensionVersion: undefined,
		extensionPublisherId: '',
		publisherDisplayName: '',
		extensionDisplayName: '',
		locations: [ChatAgentLocation.Chat],
		modes: [ChatModeKind.Ask],
		metadata: {},
		slashCommands: [],
		disambiguation: [],
	};
}

suite('ChatService', () => {
	const testDisposables = new DisposableStore();

	let instantiationService: TestInstantiationService;
	let testFileService: InMemoryTestFileService;

	let chatAgentService: IChatAgentService;
	const testServices: ChatService[] = [];

	/**
	 * Ensure we wait for model disposals from all created ChatServices
	 */
	function createChatService(): ChatService {
		const service = testDisposables.add(instantiationService.createInstance(ChatService));
		testServices.push(service);
		return service;
	}

	function startSessionModel(service: IChatService, location: ChatAgentLocation = ChatAgentLocation.Chat): IChatModelReference {
		const ref = testDisposables.add(service.startSession(location));
		return ref;
	}

	async function getOrRestoreModel(service: IChatService, resource: URI): Promise<IChatModel | undefined> {
		const ref = await service.getOrRestoreSession(resource);
		if (!ref) {
			return undefined;
		}
		return testDisposables.add(ref).object;
	}

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
			[IChatVariablesService, new MockChatVariablesService()],
			[IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()],
			[IMcpService, new TestMcpService()],
		)));
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile('default', 'Default', URI.file('/test/userdata'), URI.file('/test/cache')) });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IViewsService, new TestExtensionService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IChatSlashCommandService, testDisposables.add(instantiationService.createInstance(ChatSlashCommandService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file('/test/path/to/workspaceStorage') });
		instantiationService.stub(ILifecycleService, { onWillShutdown: Event.None });
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override startOrContinueGlobalEditingSession(): IChatEditingSession {
				return {
					state: constObservable('idle'),
					requestDisablement: observableValue('requestDisablement', []),
					entries: constObservable([]),
					dispose: () => { }
				} as unknown as IChatEditingSession;
			}
		});

		// Configure test file service with tracking and in-memory storage
		testFileService = testDisposables.add(new InMemoryTestFileService());
		instantiationService.stub(IFileService, testFileService);

		chatAgentService = testDisposables.add(instantiationService.createInstance(ChatAgentService));
		instantiationService.stub(IChatAgentService, chatAgentService);

		const agent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				return {};
			},
		};
		testDisposables.add(chatAgentService.registerAgent('testAgent', { ...getAgentData('testAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgent(chatAgentWithUsedContextId, getAgentData(chatAgentWithUsedContextId)));
		testDisposables.add(chatAgentService.registerAgent(chatAgentWithMarkdownId, getAgentData(chatAgentWithMarkdownId)));
		testDisposables.add(chatAgentService.registerAgentImplementation('testAgent', agent));
		chatAgentService.updateAgent('testAgent', {});
	});

	teardown(async () => {
		testDisposables.clear();
		await Promise.all(testServices.map(s => s.waitForModelDisposals()));
		testServices.length = 0;
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retrieveSession', async () => {
		const testService = createChatService();
		// Don't add refs to testDisposables so we can control disposal
		const session1Ref = testService.startSession(ChatAgentLocation.Chat);
		const session1 = session1Ref.object as ChatModel;
		session1.addRequest({ parts: [], text: 'request 1' }, { variables: [] }, 0);

		const session2Ref = testService.startSession(ChatAgentLocation.Chat);
		const session2 = session2Ref.object as ChatModel;
		session2.addRequest({ parts: [], text: 'request 2' }, { variables: [] }, 0);

		// Dispose refs to trigger persistence to file service
		session1Ref.dispose();
		session2Ref.dispose();

		// Wait for async persistence to complete
		await testService.waitForModelDisposals();

		// Verify that sessions were written to the file service
		assert.strictEqual(testFileService.writeOperations.length, 2, 'Should have written 2 sessions to file service');

		const session1WriteOp = testFileService.writeOperations.find((op: { resource: URI; content: string }) =>
			op.content.includes('request 1'));
		const session2WriteOp = testFileService.writeOperations.find((op: { resource: URI; content: string }) =>
			op.content.includes('request 2'));

		assert.ok(session1WriteOp, 'Session 1 should have been written to file service');
		assert.ok(session2WriteOp, 'Session 2 should have been written to file service');

		// Create a new service instance to simulate app restart
		const testService2 = createChatService();

		// Retrieve sessions and verify they're loaded from file service
		const retrieved1 = await getOrRestoreModel(testService2, session1.sessionResource);
		const retrieved2 = await getOrRestoreModel(testService2, session2.sessionResource);

		assert.ok(retrieved1, 'Should retrieve session 1');
		assert.ok(retrieved2, 'Should retrieve session 2');
		assert.deepStrictEqual(retrieved1.getRequests()[0]?.message.text, 'request 1');
		assert.deepStrictEqual(retrieved2.getRequests()[0]?.message.text, 'request 2');
	});

	test('addCompleteRequest', async () => {
		const testService = createChatService();

		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;
		assert.strictEqual(model.getRequests().length, 0);

		await testService.addCompleteRequest(model.sessionResource, 'test request', undefined, 0, { message: 'test response' });
		assert.strictEqual(model.getRequests().length, 1);
		assert.ok(model.getRequests()[0].response);
		assert.strictEqual(model.getRequests()[0].response?.response.toString(), 'test response');
	});

	test('sendRequest fails', async () => {
		const testService = createChatService();

		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;
		const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithUsedContextId} test request`);
		assert(response);
		await response.responseCompletePromise;

		await assertSnapshot(toSnapshotExportData(model));
	});

	test('history', async () => {
		const historyLengthAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				return {
					metadata: { historyLength: history.length }
				};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('defaultAgent', { ...getAgentData('defaultAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgent('agent2', getAgentData('agent2')));
		testDisposables.add(chatAgentService.registerAgentImplementation('defaultAgent', historyLengthAgent));
		testDisposables.add(chatAgentService.registerAgentImplementation('agent2', historyLengthAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		// Send a request to default agent
		const response = await testService.sendRequest(model.sessionResource, `test request`, { agentId: 'defaultAgent' });
		assert(response);
		await response.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);
		assert.strictEqual(model.getRequests()[0].response?.result?.metadata?.historyLength, 0);

		// Send a request to agent2- it can't see the default agent's message
		const response2 = await testService.sendRequest(model.sessionResource, `test request`, { agentId: 'agent2' });
		assert(response2);
		await response2.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 2);
		assert.strictEqual(model.getRequests()[1].response?.result?.metadata?.historyLength, 0);

		// Send a request to defaultAgent - the default agent can see agent2's message
		const response3 = await testService.sendRequest(model.sessionResource, `test request`, { agentId: 'defaultAgent' });
		assert(response3);
		await response3.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 3);
		assert.strictEqual(model.getRequests()[2].response?.result?.metadata?.historyLength, 2);
	});

	test('can serialize', async () => {
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));
		chatAgentService.updateAgent(chatAgentWithUsedContextId, {});
		const testService = createChatService();

		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;
		assert.strictEqual(model.getRequests().length, 0);

		await assertSnapshot(toSnapshotExportData(model));

		const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithUsedContextId} test request`);
		assert(response);
		await response.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);

		const response2 = await testService.sendRequest(model.sessionResource, `test request 2`);
		assert(response2);
		await response2.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 2);

		await assertSnapshot(toSnapshotExportData(model));
	});

	test('can deserialize', async () => {
		let serializedChatData: ISerializableChatData;
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));

		// create the first service, send request, get response, and serialize the state
		{  // serapate block to not leak variables in outer scope
			const testService = createChatService();

			const chatModel1Ref = testDisposables.add(startSessionModel(testService));
			const chatModel1 = chatModel1Ref.object;
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionResource, `@${chatAgentWithUsedContextId} test request`);
			assert(response);

			await response.responseCompletePromise;

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
		}

		// try deserializing the state into a new service

		const testService2 = createChatService();

		const chatModel2Ref = testService2.loadSessionFromContent(serializedChatData);
		assert(chatModel2Ref);
		testDisposables.add(chatModel2Ref);
		const chatModel2 = chatModel2Ref.object;

		await assertSnapshot(toSnapshotExportData(chatModel2));
	});

	test('can deserialize with response', async () => {
		let serializedChatData: ISerializableChatData;
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithMarkdownId, chatAgentWithMarkdown));

		{
			const testService = createChatService();

			const chatModel1Ref = testDisposables.add(startSessionModel(testService));
			const chatModel1 = chatModel1Ref.object;
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionResource, `@${chatAgentWithUsedContextId} test request`);
			assert(response);

			await response.responseCompletePromise;

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
		}

		// try deserializing the state into a new service

		const testService2 = createChatService();

		const chatModel2Ref = testService2.loadSessionFromContent(serializedChatData);
		assert(chatModel2Ref);
		testDisposables.add(chatModel2Ref);
		const chatModel2 = chatModel2Ref.object;

		await assertSnapshot(toSnapshotExportData(chatModel2));
	});

	test('onDidDisposeSession', async () => {
		const testService = createChatService();
		const modelRef = testService.startSession(ChatAgentLocation.Chat);
		const model = modelRef.object;

		let disposed = false;
		testDisposables.add(testService.onDidDisposeSession(e => {
			for (const resource of e.sessionResource) {
				if (resource.toString() === model.sessionResource.toString()) {
					disposed = true;
				}
			}
		}));

		modelRef.dispose();
		await testService.waitForModelDisposals();
		assert.strictEqual(disposed, true);
	});
});


function toSnapshotExportData(model: IChatModel) {
	const exp = model.toExport();
	return {
		...exp,
		requests: exp.requests.map(r => {
			return {
				...r,
				modelState: {
					...r.modelState,
					completedAt: undefined
				},
				timestamp: undefined,
				requestId: undefined, // id contains a random part
				responseId: undefined, // id contains a random part
			};
		})
	};
}
