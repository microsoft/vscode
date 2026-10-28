/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatThinkingTitleService, IChatThinkingTitleRequest } from '../../common/chatThinkingTitleService.js';
import { IChatUtilityModelRequest, IChatUtilityModelService } from '../../common/chatUtilityModelService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { chatSessionResourceToId } from '../../common/model/chatUri.js';

suite('ChatThinkingTitleService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const cacheStorageKey = 'chat.thinkingTitleCache';
	const sessionResource = URI.parse('ahp-chat://host/opaque-session/opaque-chat');
	let configuration: TestConfigurationService;
	let storage: InMemoryStorageService;
	let selected: number;
	let requests: IChatUtilityModelRequest[];
	let models: ILanguageModelsService;
	let utility: IChatUtilityModelService;

	setup(() => {
		selected = 0;
		requests = [];
		configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		storage = store.add(new InMemoryStorageService());
		models = new class extends mock<ILanguageModelsService>() {
			override async selectLanguageModels() { selected++; return ['utility']; }
		}();
		utility = new class extends mock<IChatUtilityModelService>() {
			override async sendRequest(request: IChatUtilityModelRequest) {
				requests.push(request);
				return 'Reviewed the implementation';
			}
		}();
	});

	teardown(() => sinon.restore());

	function createService(storageService = storage): ChatThinkingTitleService {
		return store.add(new ChatThinkingTitleService(configuration, models, utility, storageService, new NullLogService()));
	}

	function createPeerStorage(): InMemoryStorageService {
		const peer = store.add(new InMemoryStorageService());
		const subscriptions = store.add(new DisposableStore());
		for (const [source, target] of [[storage, peer], [peer, storage]]) {
			subscriptions.add(source.onDidChangeValue(StorageScope.PROFILE, cacheStorageKey, subscriptions)(event => {
				if (!event.external) {
					target.storeAll([{ key: cacheStorageKey, value: source.get(cacheStorageKey, StorageScope.PROFILE), scope: StorageScope.PROFILE, target: StorageTarget.MACHINE }], true);
				}
			}));
		}
		return peer;
	}

	function request(content = 'Compare the implementation with the tests', legacyId = 'thinking'): IChatThinkingTitleRequest {
		return { sessionResource, content, legacyId };
	}

	test('does no cache or model work for hidden titles', async () => {
		const reads = sinon.spy(storage, 'getObject');
		const service = createService();
		await Promise.all(Array.from({ length: 900 }, (_, index) => service.generateTitle(request(`Thinking ${index}`), () => false, CancellationToken.None)));
		assert.deepStrictEqual({ reads: reads.callCount, selected, sent: requests.length }, { reads: 0, selected: 0, sent: 0 });
	});

	test('rechecks visibility and cancellation after model selection', async () => {
		const selectedModels = new DeferredPromise<string[]>();
		models = new class extends mock<ILanguageModelsService>() {
			override selectLanguageModels() { return selectedModels.p; }
		}();
		const service = createService();
		const cancellation = store.add(new CancellationTokenSource());
		let visible = true;
		const hidden = service.generateTitle(request(), () => visible, CancellationToken.None);
		const cancelled = service.generateTitle(request('Other reasoning'), () => true, cancellation.token);
		visible = false;
		cancellation.cancel();
		selectedModels.complete(['utility']);
		assert.deepStrictEqual({ results: await Promise.all([hidden, cancelled]), sent: requests.length }, { results: [undefined, undefined], sent: 0 });
	});

	test('loads once, debounces writes, and reuses titles when host part IDs change', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const reads = sinon.spy(storage, 'getObject');
			const writes = sinon.spy(storage, 'store');
			const service = createService();
			await service.generateTitle(request(), () => true, CancellationToken.None);
			const reused = await service.generateTitle(request(undefined, 'regenerated-history-id'), () => true, CancellationToken.None);
			await service.generateTitle(request('Check another implementation'), () => true, CancellationToken.None);
			const beforeFlush = { reads: reads.callCount, writes: writes.callCount, sent: requests.length };
			await clock.tickAsync(1000);
			const afterFlush = writes.callCount;
			const restored = await createService().generateTitle(request(undefined, 'another-history-id'), () => true, CancellationToken.None);
			assert.deepStrictEqual({ beforeFlush, afterFlush, reused, restored, sent: requests.length }, {
				beforeFlush: { reads: 1, writes: 0, sent: 2 },
				afterFlush: 1,
				reused: 'Reviewed the implementation',
				restored: 'Reviewed the implementation',
				sent: 2,
			});
		} finally {
			clock.restore();
		}
	});

	test('retains the original stored cache entries and respects disabled generation', async () => {
		const key = `${chatSessionResourceToId(sessionResource)}:old-part`;
		storage.store('chat.thinkingTitleCache', JSON.stringify({
			[key]: { title: 'Cached summary', storedAt: Date.now() },
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		await configuration.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
		const service = createService();
		assert.deepStrictEqual({
			cached: await service.generateTitle(request(undefined, 'old-part'), () => true, CancellationToken.None),
			uncached: await service.generateTitle(request('Uncached'), () => true, CancellationToken.None),
			selected, sent: requests.length,
		}, { cached: 'Cached summary', uncached: undefined, selected: 0, sent: 0 });
	});

	for (const lookupBeforeFlush of [false, true]) {
		test(`merges two windows' pending titles and reuses external entries (lookupBeforeFlush=${lookupBeforeFlush})`, async () => {
			const clock = sinon.useFakeTimers();
			try {
				const peerStorage = createPeerStorage();
				const first = createService();
				const second = createService(peerStorage);
				first.getCachedTitle(request('First'));
				second.getCachedTitle(request('Second'));
				await first.generateTitle(request('First'), () => true, CancellationToken.None);
				await clock.tickAsync(400);
				await second.generateTitle(request('Second'), () => true, CancellationToken.None);
				await clock.tickAsync(600);
				const beforeFlush = lookupBeforeFlush ? [second.getCachedTitle(request('First')), second.getCachedTitle(request('Second'))] : [];
				await clock.tickAsync(400);
				const titles = [first, second, createService()].map(service => ['First', 'Second'].map(content => service.getCachedTitle(request(content))));
				const reused = await second.generateTitle(request('First'), () => true, CancellationToken.None);
				assert.deepStrictEqual({ beforeFlush, titles, reused, sent: requests.length }, {
					beforeFlush: lookupBeforeFlush ? ['Reviewed the implementation', 'Reviewed the implementation'] : [],
					titles: Array.from({ length: 3 }, () => ['Reviewed the implementation', 'Reviewed the implementation']),
					reused: 'Reviewed the implementation',
					sent: 2,
				});
			} finally {
				clock.restore();
			}
		});
	}

	test('lazily reloads external changes without reviving removed entries or dropping pending titles', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const legacyKey = `${chatSessionResourceToId(sessionResource)}:thinking`;
			storage.store(cacheStorageKey, JSON.stringify({ [legacyKey]: { title: 'Old title', storedAt: Date.now() } }), StorageScope.PROFILE, StorageTarget.MACHINE);
			const reads = sinon.spy(storage, 'getObject');
			const service = createService();
			service.getCachedTitle(request());
			await service.generateTitle(request('Pending local', 'pending'), () => true, CancellationToken.None);
			const externalKey = `${chatSessionResourceToId(sessionResource)}:external`;
			storage.storeAll([{ key: cacheStorageKey, value: JSON.stringify({ [externalKey]: { title: 'External title', storedAt: Date.now() } }), scope: StorageScope.PROFILE, target: StorageTarget.MACHINE }], true);
			const readsBeforeLookup = reads.callCount;
			const titles = [service.getCachedTitle(request('External', 'external')), service.getCachedTitle(request('Pending local', 'pending')), service.getCachedTitle(request())];
			const readsAfterLookup = reads.callCount;
			await clock.tickAsync(1000);
			const restored = createService();
			assert.deepStrictEqual({
				readsBeforeLookup, readsAfterLookup, titles,
				restored: [restored.getCachedTitle(request('External', 'external')), restored.getCachedTitle(request('Pending local', 'pending')), restored.getCachedTitle(request())],
				sent: requests.length,
			}, {
				readsBeforeLookup: 1, readsAfterLookup: 2,
				titles: ['External title', 'Reviewed the implementation', undefined],
				restored: ['External title', 'Reviewed the implementation', undefined],
				sent: 1,
			});
		} finally {
			clock.restore();
		}
	});

	test('does not overwrite a newer external title with an older pending title', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const peerStorage = createPeerStorage();
			const first = createService();
			const second = createService(peerStorage);
			sinon.stub(utility, 'sendRequest').onFirstCall().resolves('Older title').onSecondCall().resolves('Newer title');
			await first.generateTitle(request(), () => true, CancellationToken.None);
			await clock.tickAsync(100);
			await second.generateTitle(request(), () => true, CancellationToken.None);
			second.dispose();
			const beforeFlush = first.getCachedTitle(request());
			await clock.tickAsync(1000);
			assert.deepStrictEqual({ beforeFlush, restored: createService().getCachedTitle(request()) }, {
				beforeFlush: 'Newer title', restored: 'Newer title',
			});
		} finally {
			clock.restore();
		}
	});

	test('preserves the seven-day and thousand-entry bounds after merging external titles', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const service = createService();
			await service.generateTitle(request('Pending local'), () => true, CancellationToken.None);
			const incoming: Record<string, { title: string; storedAt: number }> = {
				expired: { title: 'Expired title', storedAt: Date.now() - 7 * 24 * 60 * 60 * 1000 - 1 },
			};
			for (let index = 1; index <= 1000; index++) {
				incoming[`external-${index}`] = { title: `Title ${index}`, storedAt: Date.now() - index };
			}
			storage.storeAll([{ key: cacheStorageKey, value: JSON.stringify(incoming), scope: StorageScope.PROFILE, target: StorageTarget.MACHINE }], true);
			await clock.tickAsync(1000);
			const persistedKeys = Object.keys(storage.getObject(cacheStorageKey, StorageScope.PROFILE, {}));
			assert.deepStrictEqual({
				count: persistedKeys.length, expired: persistedKeys.includes('expired'), oldest: persistedKeys.includes('external-1000'),
				local: createService().getCachedTitle(request('Pending local')),
			}, { count: 1000, expired: false, oldest: false, local: 'Reviewed the implementation' });
		} finally {
			clock.restore();
		}
	});

	test('keeps content and chat identities distinct and sends bounded background requests', async () => {
		const service = createService();
		await service.generateTitle(request('a'.repeat(3000)), () => true, CancellationToken.None);
		await service.generateTitle({ ...request('a'.repeat(3000)), sessionResource: URI.parse('ahp-chat://other/chat') }, () => true, CancellationToken.None);
		await service.generateTitle(request('Different content'), () => true, CancellationToken.None);
		assert.deepStrictEqual({
			distinctKeys: new Set(requests.map(request => request.key)).size,
			background: requests.map(request => request.background),
			relevant: requests.map(request => request.isRelevant?.()),
			purposes: requests.map(request => request.purpose),
			boundedPrompt: requests.every(request => request.messages[0].content[0].type === 'text' && request.messages[0].content[0].value.length < 2500),
		}, { distinctKeys: 3, background: [true, true, true], relevant: [true, true, true], purposes: ['thinkingTitle', 'thinkingTitle', 'thinkingTitle'], boundedPrompt: true });
	});
});
