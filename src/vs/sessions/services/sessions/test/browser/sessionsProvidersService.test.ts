/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILifecycleService, ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { SessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';

suite('SessionsProvidersService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function provider(id: string, order = 0): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({ id, order });
	}

	function createService() {
		const instantiationService = store.add(new TestInstantiationService());
		const lifecycleService = store.add(new TestLifecycleService());
		instantiationService.stub(ILifecycleService, lifecycleService);
		const service = store.add(instantiationService.createInstance(SessionsProvidersService));
		return { service, lifecycleService };
	}

	test('separates logical providers from routable environment backends', () => {
		const { service } = createService();
		const cloud = provider('cloud');
		const local = provider('local', -1);
		const first = provider('environment-1');
		const second = provider('environment-2');
		store.add(service.registerProvider(cloud));
		store.add(service.registerSessionBackend(cloud.id, first));
		store.add(service.registerSessionBackend(cloud.id, second));
		store.add(service.registerProvider(local));

		assert.deepStrictEqual({
			providers: service.getProviders(),
			withBackends: service.getProviders({ includeSessionBackends: true }),
			routing: [cloud, local, first, second].map(provider => service.getProvider(provider.id)),
		}, {
			providers: [local, cloud],
			withBackends: [local, cloud, first, second],
			routing: [cloud, local, first, second],
		});
	});

	test('keeps early backends unavailable until their owner registers and gates them on its lifetime', () => {
		const { service } = createService();
		const cloud = provider('cloud');
		const backend = provider('environment');
		const events: { added: string[]; removed: string[] }[] = [];
		store.add(service.onDidChangeProviders(event => events.push({
			added: event.added.map(provider => provider.id),
			removed: event.removed.map(provider => provider.id),
		})));
		const snapshot = () => ({
			providers: service.getProviders().map(provider => provider.id),
			backends: service.getProviders({ includeSessionBackends: true }).map(provider => provider.id),
			routable: service.getProvider(backend.id) === backend,
		});

		const backendRegistration = store.add(service.registerSessionBackend(cloud.id, backend));
		const beforeOwner = snapshot();
		const ownerRegistration = store.add(service.registerProvider(cloud));
		const withOwner = snapshot();
		ownerRegistration.dispose();
		const withoutOwner = snapshot();
		store.add(service.registerProvider(cloud));
		const restored = snapshot();
		backendRegistration.dispose();
		const removed = snapshot();

		assert.deepStrictEqual({ beforeOwner, withOwner, withoutOwner, restored, removed, events }, {
			beforeOwner: { providers: [], backends: [], routable: false },
			withOwner: { providers: ['cloud'], backends: ['cloud', 'environment'], routable: true },
			withoutOwner: { providers: [], backends: [], routable: false },
			restored: { providers: ['cloud'], backends: ['cloud', 'environment'], routable: true },
			removed: { providers: ['cloud'], backends: ['cloud'], routable: false },
			events: [
				{ added: ['cloud', 'environment'], removed: [] },
				{ added: [], removed: ['cloud', 'environment'] },
				{ added: ['cloud', 'environment'], removed: [] },
				{ added: [], removed: ['environment'] },
			],
		});
	});

	test('does not resurrect a backend disposed before its owner registers', () => {
		const { service } = createService();
		const registration = store.add(service.registerSessionBackend('cloud', provider('environment')));
		registration.dispose();
		store.add(service.registerProvider(provider('cloud')));
		assert.deepStrictEqual({
			providers: service.getProviders({ includeSessionBackends: true }).map(provider => provider.id),
			backend: service.getProvider('environment'),
		}, { providers: ['cloud'], backend: undefined });
	});

	test('rejects duplicate routing IDs and nested backend ownership', () => {
		const { service } = createService();
		store.add(service.registerSessionBackend('cloud', provider('environment')));
		assert.throws(() => service.registerProvider(provider('environment')), /already registered/);
		assert.throws(() => service.registerSessionBackend('cloud', provider('environment')), /already registered/);
		assert.throws(() => service.registerSessionBackend('environment', provider('nested')), /logical sessions provider/);
		assert.throws(() => service.registerSessionBackend('other', provider('cloud')), /already registered/);
		store.add(service.registerProvider(provider('cloud')));
		assert.throws(() => service.registerSessionBackend('other', provider('cloud')), /already registered/);
		assert.throws(() => service.registerSessionBackend('same', provider('same')), /logical sessions provider/);
	});

	test('continues notifying when shutdown is vetoed', () => {
		const { service, lifecycleService } = createService();
		const events: { added: string[]; removed: string[] }[] = [];
		store.add(service.onDidChangeProviders(event => events.push({
			added: event.added.map(provider => provider.id),
			removed: event.removed.map(provider => provider.id),
		})));
		const owner = store.add(service.registerProvider(provider('cloud')));
		store.add(lifecycleService.onBeforeShutdown(event => event.veto(true, 'test')));
		let vetoed = false;
		lifecycleService.fireBeforeShutdown({
			reason: ShutdownReason.RELOAD,
			veto: value => { vetoed = value === true; },
			finalVeto: () => { },
		});
		const backend = store.add(service.registerSessionBackend('cloud', provider('environment')));
		backend.dispose();
		owner.dispose();

		assert.deepStrictEqual({ vetoed, events }, {
			vetoed: true,
			events: [
				{ added: ['cloud'], removed: [] },
				{ added: ['environment'], removed: [] },
				{ added: [], removed: ['environment'] },
				{ added: [], removed: ['cloud'] },
			],
		});
	});

	for (const reason of [ShutdownReason.CLOSE, ShutdownReason.QUIT, ShutdownReason.RELOAD, ShutdownReason.LOAD]) {
		test(`removes all providers and backends without notifying during shutdown (reason: ${reason})`, () => {
			const { service, lifecycleService } = createService();
			const registrations = store.add(new DisposableStore());
			registrations.add(service.registerProvider(provider('cloud')));
			const ids = Array.from({ length: 125 }, (_, index) => `host-${index}`);
			for (const id of ids) {
				registrations.add(service.registerProvider(provider(id)));
				registrations.add(service.registerSessionBackend('cloud', provider(`${id}-backend`)));
			}
			let notifications = 0;
			store.add(service.onDidChangeProviders(() => notifications++));

			lifecycleService.willShutdown = true;
			lifecycleService.fireShutdown(reason);
			registrations.clear();

			assert.deepStrictEqual({
				notifications,
				providers: service.getProviders({ includeSessionBackends: true }),
				routable: ids.some(id => service.getProvider(id) || service.getProvider(`${id}-backend`)),
			}, { notifications: 0, providers: [], routable: false });
		});
	}

	test('keeps late registrations routable without notifying after shutdown is committed', () => {
		const { service, lifecycleService } = createService();
		store.add(service.registerSessionBackend('cloud', provider('early-backend')));
		let notifications = 0;
		store.add(service.onDidChangeProviders(() => notifications++));
		lifecycleService.willShutdown = true;

		const owner = store.add(service.registerProvider(provider('cloud')));
		const backend = store.add(service.registerSessionBackend('cloud', provider('late-backend')));
		const registered = service.getProviders({ includeSessionBackends: true }).map(provider => provider.id);
		const routable = service.getProvider('late-backend')?.id;
		backend.dispose();
		owner.dispose();

		assert.deepStrictEqual({
			notifications, registered, routable,
			remaining: service.getProviders({ includeSessionBackends: true }),
			unavailableBackend: service.getProvider('early-backend'),
		}, {
			notifications: 0, registered: ['cloud', 'early-backend', 'late-backend'], routable: 'late-backend',
			remaining: [], unavailableBackend: undefined,
		});
	});
});
