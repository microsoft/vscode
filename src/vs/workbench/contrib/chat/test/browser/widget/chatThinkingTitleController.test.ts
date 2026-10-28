/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatThinkingTitleController } from '../../../browser/widget/chatThinkingTitleController.js';
import { IChatThinkingTitleRequest, IChatThinkingTitleService } from '../../../common/chatThinkingTitleService.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('ChatThinkingTitleController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;
	let observers: TestIntersectionObserver[];
	let sent: { content: string; token: CancellationToken }[];
	let held: DeferredPromise<string> | undefined;
	let configuration: TestConfigurationService;
	let service: IChatThinkingTitleService;

	class TestIntersectionObserver extends mock<IntersectionObserver>() {
		readonly targets = new Set<Element>();
		constructor(private readonly callback: IntersectionObserverCallback) {
			super();
			observers.push(this);
		}
		override observe(target: Element) { this.targets.add(target); }
		override unobserve(target: Element) { this.targets.delete(target); }
		override disconnect() { this.targets.clear(); }
		emit(target: Element, intersecting: boolean): void {
			const rect = target.getBoundingClientRect();
			this.callback([{
				target, time: 0, isIntersecting: intersecting, intersectionRatio: intersecting ? 1 : 0,
				boundingClientRect: rect, rootBounds: null, intersectionRect: intersecting ? rect : new DOMRect(),
			}], this);
		}
	}

	setup(() => {
		clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		observers = [];
		sent = [];
		held = undefined;
		configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		service = new class extends mock<IChatThinkingTitleService>() {
			override getCachedTitle() { return undefined; }
			override async generateTitle(request: IChatThinkingTitleRequest, _isRelevant: () => boolean, token: CancellationToken) {
				sent.push({ content: request.content, token });
				return held ? held.p : `Reviewed ${request.content}`;
			}
		}();
	});

	teardown(() => {
		clock.restore();
		sinon.restore();
	});

	async function setGenerationEnabled(enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === ChatConfiguration.ThinkingGenerateTitles; }
		}());
	}

	function createChat(nativeObserver = false) {
		const container = mainWindow.document.createElement('div');
		container.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:100px;overflow:hidden';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const controller = store.add(new ChatThinkingTitleController(container, () => 0, nativeObserver ? undefined : TestIntersectionObserver, service, configuration, new NullLogService()));
		return { container, controller };
	}

	function register(chat: ReturnType<typeof createChat>, content = 'reasoning', newlyCompleted = true) {
		const header = mainWindow.document.createElement('button');
		header.style.cssText = 'display:block;width:200px;height:20px';
		header.textContent = 'Finished thinking';
		chat.container.appendChild(header);
		let prepared = 0;
		const registration = store.add(chat.controller.register(header, () => {
			prepared++;
			return { sessionResource: URI.parse('ahp-chat:/chat'), content };
		}, title => header.textContent = title, newlyCompleted));
		return { header, registration, get prepared() { return prepared; } };
	}

	test('a large restored response never generates titles, even for visible headers', async () => {
		const chat = createChat();
		const items = Array.from({ length: 900 }, (_, index) => register(chat, `reasoning-${index}`, false));
		await clock.tickAsync(0);
		await clock.tickAsync(300);
		const before = { observers: observers.length, prepared: items.reduce((sum, item) => sum + item.prepared, 0), sent: sent.length };
		observers[0].emit(items[0].header, true);
		await clock.tickAsync(249);
		const duringDwell = sent.length;
		await clock.tickAsync(1);
		assert.deepStrictEqual({ before, duringDwell, sent: sent.map(request => request.content), title: items[0].header.textContent }, {
			before: { observers: 1, prepared: 0, sent: 0 }, duringDwell: 0, sent: [], title: 'Finished thinking',
		});
	});

	test('scrolling away cancels a completion request and returning never restarts it', async () => {
		const chat = createChat();
		const item = register(chat);
		await clock.tickAsync(0);
		observers[0].emit(item.header, true);
		await clock.tickAsync(100);
		observers[0].emit(item.header, false);
		await clock.tickAsync(300);
		const whileOffscreen = sent.length;
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		observers[0].emit(item.header, false);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		assert.deepStrictEqual({ whileOffscreen, sent: sent.length, title: item.header.textContent }, { whileOffscreen: 0, sent: 0, title: 'Finished thinking' });
	});

	test('returning to a background chat does not generate old titles, but new completions can', async () => {
		const chat = createChat();
		chat.controller.setVisible(false);
		const item = register(chat);
		await clock.tickAsync(0);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		const hidden = { prepared: item.prepared, sent: sent.length };
		chat.controller.setVisible(true);
		await clock.tickAsync(300);
		const beforeFreshIntersection = sent.length;
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		const afterReturning = sent.length;
		const fresh = register(chat, 'newly completed');
		await clock.tickAsync(0);
		observers[0].emit(fresh.header, true);
		await clock.tickAsync(300);
		assert.deepStrictEqual({ hidden, beforeFreshIntersection, afterReturning, sent: sent.map(request => request.content) }, {
			hidden: { prepared: 0, sent: 0 }, beforeFreshIntersection: 0, afterReturning: 0, sent: ['newly completed'],
		});
	});

	for (const enabled of [true, false]) {
		test(`restored visible headers reuse cached titles without generating (enabled=${enabled})`, async () => {
			await setGenerationEnabled(enabled);
			service = new class extends mock<IChatThinkingTitleService>() {
				override getCachedTitle() { return 'Previously reviewed the implementation'; }
				override async generateTitle(): Promise<string | undefined> { return assert.fail('Restoration must never generate titles'); }
			}();
			const chat = createChat();
			const item = register(chat, 'restored', false);
			await clock.tickAsync(0);
			observers[0].emit(item.header, true);
			await clock.tickAsync(300);
			assert.deepStrictEqual({ prepared: item.prepared, title: item.header.textContent }, { prepared: 1, title: 'Previously reviewed the implementation' });
		});
	}

	test('disabling generation cancels active work but still applies a cached title', async () => {
		const chat = createChat();
		const item = register(chat);
		const result = held = new DeferredPromise<string>();
		await clock.tickAsync(0);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		sinon.stub(service, 'getCachedTitle').returns('Previously reviewed the implementation');
		await setGenerationEnabled(false);
		const cancelled = sent[0].token.isCancellationRequested;
		await clock.tickAsync(300);
		const whileDisabled = item.header.textContent;
		result.complete('Late generated title');
		await clock.tickAsync(0);
		await setGenerationEnabled(true);
		await clock.tickAsync(300);
		assert.deepStrictEqual({ cancelled, whileDisabled, title: item.header.textContent, sent: sent.length }, {
			cancelled: true, whileDisabled: 'Previously reviewed the implementation', title: 'Previously reviewed the implementation', sent: 1,
		});
	});

	test('enabling generation does not qualify completions that happened while disabled', async () => {
		await setGenerationEnabled(false);
		const chat = createChat();
		const item = register(chat);
		await clock.tickAsync(0);
		await setGenerationEnabled(true);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		const fresh = register(chat, 'new completion');
		await clock.tickAsync(0);
		observers[0].emit(fresh.header, true);
		await clock.tickAsync(300);
		assert.deepStrictEqual({ sent: sent.map(request => request.content), title: item.header.textContent }, {
			sent: ['new completion'], title: 'Finished thinking',
		});
	});

	test('a section that finishes offscreen does not generate a title when scrolled into view', async () => {
		const chat = createChat();
		chat.container.style.top = '-1000px';
		const item = register(chat, 'completed offscreen');
		await clock.tickAsync(0);
		chat.container.style.top = '0';
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		assert.deepStrictEqual({ sent: sent.length, title: item.header.textContent }, { sent: 0, title: 'Finished thinking' });
	});

	test('switching away or removing a header cancels active work without applying late results', async () => {
		const chat = createChat();
		const item = register(chat);
		held = new DeferredPromise();
		await clock.tickAsync(0);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		chat.controller.setVisible(false);
		const cancelled = sent[0].token.isCancellationRequested;
		item.registration.dispose();
		held.complete('Late summary');
		await clock.tickAsync(0);
		assert.deepStrictEqual({ cancelled, title: item.header.textContent, observed: observers[0].targets.size }, { cancelled: true, title: 'Finished thinking', observed: 0 });
	});

	test('supports two simultaneously viewed chats without requiring focus', async () => {
		const first = createChat();
		const second = createChat();
		const a = register(first, 'first');
		const b = register(second, 'second');
		await clock.tickAsync(0);
		observers[0].emit(a.header, true);
		observers[1].emit(b.header, true);
		await clock.tickAsync(300);
		assert.deepStrictEqual(sent.map(request => request.content).sort(), ['first', 'second']);
	});

	test('rejects stale intersections after a header leaves the viewport, is hidden, or is detached', async () => {
		const results: number[] = [];
		for (const change of ['offscreen', 'hidden', 'detached']) {
			const chat = createChat();
			const item = register(chat, change);
			await clock.tickAsync(0);
			observers.at(-1)!.emit(item.header, true);
			if (change === 'offscreen') {
				item.header.style.marginTop = '200px';
			} else if (change === 'hidden') {
				chat.container.style.display = 'none';
			} else {
				item.header.remove();
			}
			await clock.tickAsync(300);
			results.push(item.prepared);
		}
		assert.deepStrictEqual({ results, sent: sent.length }, { results: [0, 0, 0], sent: 0 });
	});

	test('does not request titles when generation is disabled or the controller is disposed', async () => {
		const chat = createChat();
		const item = register(chat);
		await configuration.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
		await clock.tickAsync(0);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		chat.controller.dispose();
		await configuration.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, true);
		observers[0].emit(item.header, true);
		await clock.tickAsync(300);
		assert.deepStrictEqual({ prepared: item.prepared, sent: sent.length, observed: observers[0].targets.size }, { prepared: 1, sent: 0, observed: 0 });
	});

	test('native viewport observation excludes offscreen headers and a background chat', async () => {
		clock.restore();
		const received = new DeferredPromise<void>();
		service = new class extends mock<IChatThinkingTitleService>() {
			override getCachedTitle() { return undefined; }
			override async generateTitle(request: IChatThinkingTitleRequest, _isRelevant: () => boolean, token: CancellationToken) {
				sent.push({ content: request.content, token });
				received.complete();
				return 'Reviewed visible reasoning';
			}
		}();
		const foreground = createChat(true);
		const visible = register(foreground, 'visible');
		const offscreen = register(foreground, 'offscreen');
		offscreen.header.style.marginTop = '200px';
		const background = createChat(true);
		background.container.style.left = '500px';
		background.controller.setVisible(false);
		register(background, 'background');
		await raceTimeout(received.p, 5000, () => assert.fail('The visible title was never requested'));
		await timeout(300);
		assert.deepStrictEqual({ sent: sent.map(request => request.content), title: visible.header.textContent }, {
			sent: ['visible'], title: 'Reviewed visible reasoning',
		});
	});
});
