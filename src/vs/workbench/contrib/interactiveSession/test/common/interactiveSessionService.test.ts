/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ProviderResult } from 'vs/editor/common/languages';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInteractiveProgress, IInteractiveProvider, IInteractiveRequest, IInteractiveResponse, IInteractiveSession, IPersistedInteractiveState } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionServiceImpl';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('InteractiveSession', () => {
	const testDisposables = new DisposableStore();

	let storageService: IStorageService;
	let instantiationService: TestInstantiationService;

	suiteSetup(async () => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IStorageService, storageService = new TestStorageService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
	});

	teardown(() => {
		testDisposables.clear();
	});

	test('Restores state for the correct provider', async () => {
		let sessionId = 0;
		function getTestProvider(providerId: string) {
			return new class implements IInteractiveProvider {
				readonly id = providerId;

				lastInitialState = undefined;

				prepareSession(initialState: any) {
					this.lastInitialState = initialState;
					return Promise.resolve(<IInteractiveSession>{
						id: sessionId++,
						username: 'test',
						responderUsername: 'test',
						requesterUsername: 'test'
					});
				}

				async provideReply(request: IInteractiveRequest) {
					return { session: request.session, followups: [] };
				}
			};
		}

		const testService = instantiationService.createInstance(InteractiveSessionService);
		const provider1 = getTestProvider('provider1');
		const provider2 = getTestProvider('provider2');
		testService.registerProvider(provider1);
		testService.registerProvider(provider2);

		let session1 = await testService.startSession('provider1', true, CancellationToken.None);
		session1!.addRequest('request 1');
		let session2 = await testService.startSession('provider2', true, CancellationToken.None);
		session2!.addRequest('request 2');
		assert.strictEqual(provider1.lastInitialState, undefined);
		assert.strictEqual(provider2.lastInitialState, undefined);
		testService.acceptNewSessionState(session1!.sessionId, { state: 'provider1_state' });
		testService.acceptNewSessionState(session2!.sessionId, { state: 'provider2_state' });
		storageService.flush();

		const testService2 = instantiationService.createInstance(InteractiveSessionService);
		testService2.registerProvider(provider1);
		testService2.registerProvider(provider2);
		session1 = await testService2.startSession('provider1', true, CancellationToken.None);
		session2 = await testService2.startSession('provider2', true, CancellationToken.None);
		assert.deepStrictEqual(provider1.lastInitialState, { state: 'provider1_state' });
		assert.deepStrictEqual(provider2.lastInitialState, { state: 'provider2_state' });
	});

	test('Can\'t register same provider id twice', async () => {
		const testService = instantiationService.createInstance(InteractiveSessionService);
		const id = 'testProvider';
		testService.registerProvider({
			id,
			prepareSession: function (initialState: IPersistedInteractiveState | undefined, token: CancellationToken): ProviderResult<IInteractiveSession | undefined> {
				throw new Error('Function not implemented.');
			},
			provideReply: function (request: IInteractiveRequest, progress: (progress: IInteractiveProgress) => void, token: CancellationToken): ProviderResult<IInteractiveResponse> {
				throw new Error('Function not implemented.');
			}
		});

		assert.throws(() => {
			testService.registerProvider({
				id,
				prepareSession: function (initialState: IPersistedInteractiveState | undefined, token: CancellationToken): ProviderResult<IInteractiveSession | undefined> {
					throw new Error('Function not implemented.');
				},
				provideReply: function (request: IInteractiveRequest, progress: (progress: IInteractiveProgress) => void, token: CancellationToken): ProviderResult<IInteractiveResponse> {
					throw new Error('Function not implemented.');
				}
			});
		}, 'Expected to throw for dupe provider');
	});
});


