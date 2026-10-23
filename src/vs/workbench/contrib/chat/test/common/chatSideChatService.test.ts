/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSideChatService, IChatSideChatOrigin, IChatSideChatProvider, IChatSideChatRequestOptions, IChatSideChatSelection } from '../../common/chatSideChatService.js';

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

	test('routes requests and attachments without inventing an origin', async () => {
		const { store, service } = createService();
		const calls: { resource: URI; query: string; selection?: IChatSideChatSelection; options?: IChatSideChatRequestOptions }[] = [];
		const registration = store.add(service.registerProvider({
			canAskInSideChat: sessionResource => sessionResource.toString() === resource.toString(),
			askInSideChat: async (resource, query, selection, options) => { calls.push({ resource, query, selection, options }); },
			observeSideChatOrigin: () => constObservable(undefined),
			revealSideChatSource: async () => assert.fail('A chat without an origin cannot reveal a source'),
		}));
		const options: IChatSideChatRequestOptions = {
			attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: 'attached' }],
			token: CancellationToken.None,
		};
		await service.askInSideChat(resource, 'question', { text: 'selection' }, options);
		await service.revealSideChatSource(resource);
		assert.deepStrictEqual({ calls, origin: service.observeSideChatOrigin(resource).get() }, {
			calls: [{ resource, query: 'question', selection: { text: 'selection' }, options }],
			origin: undefined,
		});
		registration.dispose();
		await assert.rejects(service.askInSideChat(resource, 'question'), /No side chat provider/);
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
