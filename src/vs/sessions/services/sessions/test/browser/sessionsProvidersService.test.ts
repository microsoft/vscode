/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';

suite('SessionsProvidersService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function provider(id: string, order = 0): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({ id, order });
	}

	test('separates logical providers from routable environment backends', () => {
		const service = store.add(new SessionsProvidersService());
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
		const service = store.add(new SessionsProvidersService());
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
		const service = store.add(new SessionsProvidersService());
		const registration = store.add(service.registerSessionBackend('cloud', provider('environment')));
		registration.dispose();
		store.add(service.registerProvider(provider('cloud')));
		assert.deepStrictEqual({
			providers: service.getProviders({ includeSessionBackends: true }).map(provider => provider.id),
			backend: service.getProvider('environment'),
		}, { providers: ['cloud'], backend: undefined });
	});

	test('rejects duplicate routing IDs and nested backend ownership', () => {
		const service = store.add(new SessionsProvidersService());
		store.add(service.registerSessionBackend('cloud', provider('environment')));
		assert.throws(() => service.registerProvider(provider('environment')), /already registered/);
		assert.throws(() => service.registerSessionBackend('cloud', provider('environment')), /already registered/);
		assert.throws(() => service.registerSessionBackend('environment', provider('nested')), /logical sessions provider/);
		assert.throws(() => service.registerSessionBackend('other', provider('cloud')), /already registered/);
		store.add(service.registerProvider(provider('cloud')));
		assert.throws(() => service.registerSessionBackend('other', provider('cloud')), /already registered/);
		assert.throws(() => service.registerSessionBackend('same', provider('same')), /logical sessions provider/);
	});
});
