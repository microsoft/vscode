/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSideChatService, IChatSideChatOrigin, IChatSideChatProvider } from '../../common/chatSideChatService.js';

suite('ChatSideChatService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test:///side-chat');
	const origin: IChatSideChatOrigin = {
		sourceSessionResource: URI.parse('test:///source-chat'),
		sourceTurnId: 'turn-1',
		sourceTitle: 'Source Chat',
	};

	function createProvider(sideChatOrigin: IObservable<IChatSideChatOrigin | undefined>, reveal?: () => void): IChatSideChatProvider {
		return {
			canAskInSideChat: () => false,
			askInSideChat: async () => { },
			observeSideChatOrigin: sessionResource => sessionResource.toString() === resource.toString() ? sideChatOrigin : constObservable(undefined),
			revealSideChatSource: async () => { reveal?.(); },
		};
	}

	function createService(): { store: DisposableStore; service: ChatSideChatService } {
		const store = disposables.add(new DisposableStore());
		return { store, service: store.add(new ChatSideChatService()) };
	}

	test('reacts when a provider is registered', () => {
		const { store, service } = createService();
		const observed = service.observeSideChatOrigin(resource);
		const before = observed.get();
		store.add(service.registerProvider(createProvider(constObservable(origin))));

		assert.deepStrictEqual([before, observed.get()], [undefined, origin]);
	});

	test('returns undefined after a provider is unregistered', () => {
		const { store, service } = createService();
		const observed = service.observeSideChatOrigin(resource);
		const registration = store.add(service.registerProvider(createProvider(constObservable(origin))));
		const before = observed.get();
		registration.dispose();

		assert.deepStrictEqual([before, observed.get()], [origin, undefined]);
	});

	test('caches origin observables by resource', () => {
		const { service } = createService();

		assert.strictEqual(service.observeSideChatOrigin(resource), service.observeSideChatOrigin(resource));
	});

	test('uses the first provider that reports an origin', () => {
		const { store, service } = createService();
		store.add(service.registerProvider(createProvider(constObservable(undefined))));
		store.add(service.registerProvider(createProvider(constObservable(origin))));

		assert.deepStrictEqual(service.observeSideChatOrigin(resource).get(), origin);
	});

	test('reveals through the provider that owns the side chat', async () => {
		const { store, service } = createService();
		const calls: string[] = [];
		store.add(service.registerProvider(createProvider(constObservable(undefined), () => calls.push('first'))));
		store.add(service.registerProvider(createProvider(constObservable(origin), () => calls.push('second'))));

		await service.revealSideChatSource(resource);
		await service.revealSideChatSource(URI.parse('test:///not-a-side-chat'));

		assert.deepStrictEqual(calls, ['second']);
	});
});
