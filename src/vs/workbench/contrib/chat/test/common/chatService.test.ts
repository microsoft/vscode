/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ProviderResult } from 'vs/editor/common/languages';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IViewsService } from 'vs/workbench/common/views';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChatProgress, IChatProvider, IChatRequest, IChatResponse, IChat, ISlashCommand, IPersistedChatState } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestContextService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

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
	const testDisposables = new DisposableStore();

	let storageService: IStorageService;
	let instantiationService: TestInstantiationService;

	suiteSetup(async () => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IStorageService, storageService = new TestStorageService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IViewsService, new TestExtensionService());
		instantiationService.stub(IChatContributionService, new TestExtensionService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
	});

	teardown(() => {
		testDisposables.clear();
	});

	test('retrieveSession', async () => {
		const testService = instantiationService.createInstance(ChatService);
		const provider1 = new SimpleTestProvider('provider1');
		const provider2 = new SimpleTestProvider('provider2');
		testService.registerProvider(provider1);
		testService.registerProvider(provider2);

		const session1 = testService.startSession('provider1', CancellationToken.None);
		await session1.waitForInitialization();
		session1!.addRequest('request 1');

		const session2 = testService.startSession('provider2', CancellationToken.None);
		await session2.waitForInitialization();
		session2!.addRequest('request 2');

		assert.strictEqual(provider1.lastInitialState, undefined);
		assert.strictEqual(provider2.lastInitialState, undefined);
		provider1.changeState({ state: 'provider1_state' });
		provider2.changeState({ state: 'provider2_state' });
		storageService.flush();

		const testService2 = instantiationService.createInstance(ChatService);
		testService2.registerProvider(provider1);
		testService2.registerProvider(provider2);
		const retrieved1 = testService2.getOrRestoreSession(session1.sessionId);
		await retrieved1!.waitForInitialization();
		const retrieved2 = testService2.getOrRestoreSession(session2.sessionId);
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

		const testService = instantiationService.createInstance(ChatService);
		const provider1 = getFailProvider('provider1');
		testService.registerProvider(provider1);

		const session1 = testService.startSession('provider1', CancellationToken.None);
		await assert.rejects(() => session1.waitForInitialization());
	});

	test('Can\'t register same provider id twice', async () => {
		const testService = instantiationService.createInstance(ChatService);
		const id = 'testProvider';
		testService.registerProvider({
			id,
			displayName: 'Test',
			prepareSession: function (initialState: IPersistedChatState | undefined, token: CancellationToken): ProviderResult<IChat | undefined> {
				throw new Error('Function not implemented.');
			},
			provideReply: function (request: IChatRequest, progress: (progress: IChatProgress) => void, token: CancellationToken): ProviderResult<IChatResponse> {
				throw new Error('Function not implemented.');
			}
		});

		assert.throws(() => {
			testService.registerProvider({
				id,
				displayName: 'Test',
				prepareSession: function (initialState: IPersistedChatState | undefined, token: CancellationToken): ProviderResult<IChat | undefined> {
					throw new Error('Function not implemented.');
				},
				provideReply: function (request: IChatRequest, progress: (progress: IChatProgress) => void, token: CancellationToken): ProviderResult<IChatResponse> {
					throw new Error('Function not implemented.');
				}
			});
		}, 'Expected to throw for dupe provider');
	});

	test('getSlashCommands', async () => {
		const testService = instantiationService.createInstance(ChatService);
		const provider = new class extends SimpleTestProvider {
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
		};

		testService.registerProvider(provider);

		const model = testService.startSession('testProvider', CancellationToken.None);
		const commands = await testService.getSlashCommands(model.sessionId, CancellationToken.None);

		assert.strictEqual(commands?.length, 1);
		assert.strictEqual(commands?.[0].command, 'command');
		assert.strictEqual(commands?.[0].detail, 'detail');
		assert.strictEqual(commands?.[0].sortText, 'sortText');
	});

	test('sendRequestToProvider', async () => {
		const testService = instantiationService.createInstance(ChatService);
		testService.registerProvider(new SimpleTestProvider('testProvider'));

		const model = testService.startSession('testProvider', CancellationToken.None);
		assert.strictEqual(model.getRequests().length, 0);

		await testService.sendRequestToProvider(model.sessionId, { message: 'test request' });
		assert.strictEqual(model.getRequests().length, 1);
	});

	test('addCompleteRequest', async () => {
		const testService = instantiationService.createInstance(ChatService);
		testService.registerProvider(new SimpleTestProvider('testProvider'));

		const model = testService.startSession('testProvider', CancellationToken.None);
		assert.strictEqual(model.getRequests().length, 0);

		await testService.addCompleteRequest(model.sessionId, 'test request', { message: 'test response' });
		assert.strictEqual(model.getRequests().length, 1);
		assert.ok(model.getRequests()[0].response);
		assert.strictEqual(model.getRequests()[0].response?.response.value, 'test response');
	});
});
