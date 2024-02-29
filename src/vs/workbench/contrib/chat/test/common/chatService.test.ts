/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { assertSnapshot } from 'vs/base/test/common/snapshot';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { ProviderResult } from 'vs/editor/common/languages';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { ChatAgentService, IChatAgent, IChatAgentImplementation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { ISerializableChatData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChat, IChatFollowup, IChatProgress, IChatProvider, IChatRequest, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { ChatSlashCommandService, IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { MockChatVariablesService } from 'vs/workbench/contrib/chat/test/common/mockChatVariables';
import { IExtensionService, nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { TestContextService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { MockChatService } from 'vs/workbench/contrib/chat/test/common/mockChatService';
import { MockChatContributionService } from 'vs/workbench/contrib/chat/test/common/mockChatContributionService';

class SimpleTestProvider extends Disposable implements IChatProvider {
	private static sessionId = 0;

	readonly displayName = 'Test';

	constructor(readonly id: string) {
		super();
	}

	async prepareSession(): Promise<IChat> {
		return {
			id: SimpleTestProvider.sessionId++,
			responderUsername: 'test',
			requesterUsername: 'test',
		};
	}

	async provideReply(request: IChatRequest, progress: (progress: IChatProgress) => void): Promise<{ session: IChat; followups: never[] }> {
		return { session: request.session, followups: [] };
	}
}

const chatAgentWithUsedContextId = 'ChatProviderWithUsedContext';
const chatAgentWithUsedContext: IChatAgent = {
	id: chatAgentWithUsedContextId,
	extensionId: nullExtensionDescription.identifier,
	metadata: {},
	slashCommands: [],
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

suite('Chat', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: IStorageService;
	let instantiationService: TestInstantiationService;

	let chatAgentService: IChatAgentService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
			[IChatVariablesService, new MockChatVariablesService()],
		)));
		instantiationService.stub(IStorageService, storageService = testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IViewsService, new TestExtensionService());
		instantiationService.stub(IChatContributionService, new TestExtensionService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IChatSlashCommandService, testDisposables.add(instantiationService.createInstance(ChatSlashCommandService)));
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatContributionService, new MockChatContributionService(
			[
				{ extensionId: nullExtensionDescription.identifier, name: 'testAgent', isDefault: true },
				{ extensionId: nullExtensionDescription.identifier, name: chatAgentWithUsedContextId, isDefault: true },
			]));

		chatAgentService = testDisposables.add(instantiationService.createInstance(ChatAgentService));
		instantiationService.stub(IChatAgentService, chatAgentService);

		const agent = {
			async invoke(request, progress, history, token) {
				return {};
			},
		} satisfies IChatAgentImplementation;
		testDisposables.add(chatAgentService.registerAgent('testAgent', agent));
	});

	test('retrieveSession', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const provider1 = testDisposables.add(new SimpleTestProvider('provider1'));
		const provider2 = testDisposables.add(new SimpleTestProvider('provider2'));
		testDisposables.add(testService.registerProvider(provider1));
		testDisposables.add(testService.registerProvider(provider2));

		const session1 = testDisposables.add(testService.startSession('provider1', CancellationToken.None));
		await session1.waitForInitialization();
		session1.addRequest({ parts: [], text: 'request 1' }, { variables: [] });

		const session2 = testDisposables.add(testService.startSession('provider2', CancellationToken.None));
		await session2.waitForInitialization();
		session2.addRequest({ parts: [], text: 'request 2' }, { variables: [] });

		storageService.flush();
		const testService2 = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService2.registerProvider(provider1));
		testDisposables.add(testService2.registerProvider(provider2));
		const retrieved1 = testDisposables.add(testService2.getOrRestoreSession(session1.sessionId)!);
		await retrieved1.waitForInitialization();
		const retrieved2 = testDisposables.add(testService2.getOrRestoreSession(session2.sessionId)!);
		await retrieved2.waitForInitialization();
		assert.deepStrictEqual(retrieved1.getRequests()[0]?.message.text, 'request 1');
		assert.deepStrictEqual(retrieved2.getRequests()[0]?.message.text, 'request 2');
	});

	test('Handles failed session startup', async () => {
		function getFailProvider(providerId: string) {
			return new class implements IChatProvider {
				readonly id = providerId;
				readonly displayName = 'Test';

				lastInitialState = undefined;

				prepareSession(initialState: any): ProviderResult<any> {
					throw new Error('Failed to start session');
				}

				async provideReply(request: IChatRequest) {
					return { session: request.session, followups: [] };
				}
			};
		}

		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const provider1 = getFailProvider('provider1');
		testDisposables.add(testService.registerProvider(provider1));

		const session1 = testDisposables.add(testService.startSession('provider1', CancellationToken.None));
		await assert.rejects(() => session1.waitForInitialization());
	});

	test('Can\'t register same provider id twice', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const id = 'testProvider';
		testDisposables.add(testService.registerProvider({
			id,
			prepareSession: function (token: CancellationToken): ProviderResult<IChat | undefined> {
				throw new Error('Function not implemented.');
			}
		}));

		assert.throws(() => {
			testDisposables.add(testService.registerProvider({
				id,
				prepareSession: function (token: CancellationToken): ProviderResult<IChat | undefined> {
					throw new Error('Function not implemented.');
				}
			}));
		}, 'Expected to throw for dupe provider');
	});

	test('sendRequestToProvider', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

		const model = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		const response = await testService.sendRequestToProvider(model.sessionId, { message: 'test request' });
		await response?.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);
	});

	test('addCompleteRequest', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

		const model = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		await testService.addCompleteRequest(model.sessionId, 'test request', undefined, { message: 'test response' });
		assert.strictEqual(model.getRequests().length, 1);
		assert.ok(model.getRequests()[0].response);
		assert.strictEqual(model.getRequests()[0].response?.response.asString(), 'test response');
	});

	test('can serialize', async () => {
		testDisposables.add(chatAgentService.registerAgent(chatAgentWithUsedContext.id, chatAgentWithUsedContext));
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

		const model = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		await assertSnapshot(model.toExport());

		const response = await testService.sendRequest(model.sessionId, `@${chatAgentWithUsedContextId} test request`);
		assert(response);
		await response.responseCompletePromise;

		assert.strictEqual(model.getRequests().length, 1);

		await assertSnapshot(model.toExport());
	});

	test('can deserialize', async () => {
		let serializedChatData: ISerializableChatData;
		testDisposables.add(chatAgentService.registerAgent(chatAgentWithUsedContext.id, chatAgentWithUsedContext));

		// create the first service, send request, get response, and serialize the state
		{  // serapate block to not leak variables in outer scope
			const testService = testDisposables.add(instantiationService.createInstance(ChatService));
			testDisposables.add(testService.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

			const chatModel1 = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionId, `@${chatAgentWithUsedContextId} test request`);
			assert(response);

			await response.responseCompletePromise;

			serializedChatData = chatModel1.toJSON();
		}

		// try deserializing the state into a new service

		const testService2 = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService2.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

		const chatModel2 = testService2.loadSessionFromContent(serializedChatData);
		assert(chatModel2);

		await assertSnapshot(chatModel2.toExport());
	});
});
