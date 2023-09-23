/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ProviderResult } from 'vs/editor/common/languages';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IViewsService } from 'vs/workbench/common/views';
import { ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChat, IChatProgress, IChatProvider, IChatRequest, IChatResponse, IPersistedChatState, ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { ChatSlashCommandService, IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { ChatVariablesService, IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestContextService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

class SimpleTestProvider extends Disposable implements IChatProvider {
	private static sessionId = 0;

	lastInitialState = undefined;

	readonly displayName = 'Test';

	private _onDidChangeState = this._register(new Emitter());

	constructor(readonly id: string) {
		super();
	}

	prepareSession(initialState: any) {
		this.lastInitialState = initialState;
		return Promise.resolve(<IChat>{
			id: SimpleTestProvider.sessionId++,
			username: 'test',
			responderUsername: 'test',
			requesterUsername: 'test',
			onDidChangeState: this._onDidChangeState.event
		});
	}

	changeState(state: any) {
		this._onDidChangeState.fire(state);
	}

	async provideReply(request: IChatRequest) {
		return { session: request.session, followups: [] };
	}
}

suite('Chat', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: IStorageService;
	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
			// [IChatSlashCommandService, new SyncDescriptor<any>(ChatSlashCommandService)],
			[IChatVariablesService, new SyncDescriptor<any>(ChatVariablesService)]
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
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
	});

	test('retrieveSession', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const provider1 = testDisposables.add(new SimpleTestProvider('provider1'));
		const provider2 = testDisposables.add(new SimpleTestProvider('provider2'));
		testDisposables.add(testService.registerProvider(provider1));
		testDisposables.add(testService.registerProvider(provider2));

		const session1 = testDisposables.add(testService.startSession('provider1', CancellationToken.None));
		await session1.waitForInitialization();
		session1!.addRequest({ parts: [], text: 'request 1' });

		const session2 = testDisposables.add(testService.startSession('provider2', CancellationToken.None));
		await session2.waitForInitialization();
		session2!.addRequest({ parts: [], text: 'request 2' });

		assert.strictEqual(provider1.lastInitialState, undefined);
		assert.strictEqual(provider2.lastInitialState, undefined);
		provider1.changeState({ state: 'provider1_state' });
		provider2.changeState({ state: 'provider2_state' });
		storageService.flush();

		const testService2 = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService2.registerProvider(provider1));
		testDisposables.add(testService2.registerProvider(provider2));
		const retrieved1 = testDisposables.add(testService2.getOrRestoreSession(session1.sessionId)!);
		await retrieved1!.waitForInitialization();
		const retrieved2 = testDisposables.add(testService2.getOrRestoreSession(session2.sessionId)!);
		await retrieved2!.waitForInitialization();
		assert.deepStrictEqual(provider1.lastInitialState, { state: 'provider1_state' });
		assert.deepStrictEqual(provider2.lastInitialState, { state: 'provider2_state' });
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
			displayName: 'Test',
			prepareSession: function (initialState: IPersistedChatState | undefined, token: CancellationToken): ProviderResult<IChat | undefined> {
				throw new Error('Function not implemented.');
			},
			provideReply: function (request: IChatRequest, progress: (progress: IChatProgress) => void, token: CancellationToken): ProviderResult<IChatResponse> {
				throw new Error('Function not implemented.');
			}
		}));

		assert.throws(() => {
			testDisposables.add(testService.registerProvider({
				id,
				displayName: 'Test',
				prepareSession: function (initialState: IPersistedChatState | undefined, token: CancellationToken): ProviderResult<IChat | undefined> {
					throw new Error('Function not implemented.');
				},
				provideReply: function (request: IChatRequest, progress: (progress: IChatProgress) => void, token: CancellationToken): ProviderResult<IChatResponse> {
					throw new Error('Function not implemented.');
				}
			}));
		}, 'Expected to throw for dupe provider');
	});

	test('getSlashCommands', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		const provider = testDisposables.add(new class extends SimpleTestProvider {
			constructor() {
				super('testProvider');
			}

			provideSlashCommands(): ProviderResult<ISlashCommand[]> {
				return [
					{
						command: 'command',
						detail: 'detail',
						sortText: 'sortText',
					}
				];
			}
		});

		testDisposables.add(testService.registerProvider(provider));

		const model = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
		const commands = await testService.getSlashCommands(model.sessionId, CancellationToken.None);

		assert.strictEqual(commands?.length, 1);
		assert.strictEqual(commands?.[0].command, 'command');
		assert.strictEqual(commands?.[0].detail, 'detail');
		assert.strictEqual(commands?.[0].sortText, 'sortText');
	});

	test('sendRequestToProvider', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

		const model = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		await testService.sendRequestToProvider(model.sessionId, { message: 'test request' });
		assert.strictEqual(model.getRequests().length, 1);
	});

	test('addCompleteRequest', async () => {
		const testService = testDisposables.add(instantiationService.createInstance(ChatService));
		testDisposables.add(testService.registerProvider(testDisposables.add(new SimpleTestProvider('testProvider'))));

		const model = testDisposables.add(testService.startSession('testProvider', CancellationToken.None));
		assert.strictEqual(model.getRequests().length, 0);

		await testService.addCompleteRequest(model.sessionId, 'test request', { message: 'test response' });
		assert.strictEqual(model.getRequests().length, 1);
		assert.ok(model.getRequests()[0].response);
		assert.strictEqual(model.getRequests()[0].response?.response.asString(), 'test response');
	});
});
