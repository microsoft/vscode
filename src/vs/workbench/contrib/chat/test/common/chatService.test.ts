/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatAgentLocation, ChatAgentService, IChatAgent, IChatAgentImplementation, IChatAgentService } from '../../common/chatAgents.js';
import { IChatModel, ISerializableChatData } from '../../common/chatModel.js';
import { IChatFollowup, IChatService } from '../../common/chatService.js';
import { ChatService } from '../../common/chatServiceImpl.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { MockChatService } from './mockChatService.js';
import { MockChatVariablesService } from './mockChatVariables.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestContextService, TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';

const chatAgentWithUsedContextId = 'ChatProviderWithUsedContext';
const chatAgentWithUsedContext: IChatAgent = {
	id: chatAgentWithUsedContextId,
	name: chatAgentWithUsedContextId,
	extensionId: nullExtensionDescription.identifier,
	publisherDisplayName: '',
	extensionPublisherId: '',
	extensionDisplayName: '',
	locations: [ChatAgentLocation.Panel],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
	async invoke(request, progress, history, token) {
		progress({
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
		});

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
	publisherDisplayName: '',
	extensionPublisherId: '',
	extensionDisplayName: '',
	locations: [ChatAgentLocation.Panel],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
	async invoke(request, progress, history, token) {
		progress({ kind: 'markdownContent', content: new MarkdownString('test') });
		return { metadata: { metadataKey: 'value' } };
	},
	async provideFollowups(sessionId, token) {
		return [];
	},
};

function getAgentData(id: string) {
	return {
		name: id,
		id: id,
		extensionId: nullExtensionDescription.identifier,
		extensionPublisherId: '',
		publisherDisplayName: '',
		extensionDisplayName: '',
		locations: [ChatAgentLocation.Panel],
		metadata: {},
		slashCommands: [],
		disambiguation: [],
	};
}

suite('ChatService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: IStorageService;
	let instantiationService: TestInstantiationService;

	let chatAgentService: IChatAgentService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
			[IChatVariablesService, new MockChatVariablesService()],
			[IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()]
		)));
		instantiationService.stub(IStorageService, storageService = testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IViewsService, new TestExtensionService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IChatSlashCommandService, testDisposables.add(instantiationService.createInstance(ChatSlashCommandService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatService, new MockChatService());

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
		chatAgentService.updateAgent('testAgent', { requester: { name: 'test' } });
	});

	test('retrieveSession', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const session1 = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		await session1.waitForInitialization();
		session1.addRequest({ parts: [], text: 'request 1' }, { variables: [] }, 0);

		const session2 = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		await session2.waitForInitialization();
		session2.addRequest({ parts: [], text: 'request 2' }, { variables: [] }, 0);

		storageService.flush();
		const testService2 = testDisposables.add(instantiationService.createInstance(ChatService));
		const retrieved1 = testDisposables.add(testService2.getOrRestoreSession(session1.sessionId)!);
		await retrieved1.waitForInitialization();
		const retrieved2 = testDisposables.add(testService2.getOrRestoreSession(session2.sessionId)!);
		await retrieved2.waitForInitialization();
		assert.deepStrictEqual(retrieved1.getRequests()[0]?.message.text, 'request 1');
		assert.deepStrictEqual(retrieved2.getRequests()[0]?.message.text, 'request 2');
	});

	test('addCompleteRequest', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));

		const model = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		await testService.addCompleteRequest(model.sessionId, 'test request', undefined, 0, { message: 'test response' });
		assert.strictEqual(model.getRequests().length, 1);
		assert.ok(model.getRequests()[0].response);
		assert.strictEqual(model.getRequests()[0].response?.response.toString(), 'test response');
	});

	test('sendRequest fails', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));

		const model = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		const response = await testService.sendRequest(model.sessionId, `@${chatAgentWithUsedContextId} test request`);
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

		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const model = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));

		// Send a request to default agent
		const response = await testService.sendRequest(model.sessionId, `test request`, { agentId: 'defaultAgent' });
		assert(response);
		await response.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);
		assert.strictEqual(model.getRequests()[0].response?.result?.metadata?.historyLength, 0);

		// Send a request to agent2- it can't see the default agent's message
		const response2 = await testService.sendRequest(model.sessionId, `test request`, { agentId: 'agent2' });
		assert(response2);
		await response2.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 2);
		assert.strictEqual(model.getRequests()[1].response?.result?.metadata?.historyLength, 0);

		// Send a request to defaultAgent - the default agent can see agent2's message
		const response3 = await testService.sendRequest(model.sessionId, `test request`, { agentId: 'defaultAgent' });
		assert(response3);
		await response3.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 3);
		assert.strictEqual(model.getRequests()[2].response?.result?.metadata?.historyLength, 2);
	});

	test('can serialize', async () => {
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));
		chatAgentService.updateAgent(chatAgentWithUsedContextId, { requester: { name: 'test' } });
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));

		const model = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		await assertSnapshot(toSnapshotExportData(model));

		const response = await testService.sendRequest(model.sessionId, `@${chatAgentWithUsedContextId} test request`);
		assert(response);
		await response.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);

		const response2 = await testService.sendRequest(model.sessionId, `test request 2`);
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
			const testService = testDisposables.add(instantiationService.createInstance(ChatService));

			const chatModel1 = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionId, `@${chatAgentWithUsedContextId} test request`);
			assert(response);

			await response.responseCompletePromise;

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
		}

		// try deserializing the state into a new service

		const testService2 = testDisposables.add(instantiationService.createInstance(ChatService));

		const chatModel2 = testService2.loadSessionFromContent(serializedChatData);
		assert(chatModel2);

		await assertSnapshot(toSnapshotExportData(chatModel2));
	});

	test('can deserialize with response', async () => {
		let serializedChatData: ISerializableChatData;
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithMarkdownId, chatAgentWithMarkdown));

		{
			const testService = testDisposables.add(instantiationService.createInstance(ChatService));

			const chatModel1 = testDisposables.add(testService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionId, `@${chatAgentWithUsedContextId} test request`);
			assert(response);

			await response.responseCompletePromise;

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
		}

		// try deserializing the state into a new service

		const testService2 = testDisposables.add(instantiationService.createInstance(ChatService));

		const chatModel2 = testService2.loadSessionFromContent(serializedChatData);
		assert(chatModel2);

		await assertSnapshot(toSnapshotExportData(chatModel2));
	});
});


function toSnapshotExportData(model: IChatModel) {
	const exp = model.toExport();
	return {
		...exp,
		requests: exp.requests.map(r => {
			return {
				...r,
				timestamp: undefined,
				requestId: undefined, // id contains a random part
				responseId: undefined, // id contains a random part
			};
		})
	};
}
