/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IContentPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatWindow, IChatWindowOpenOptions, IChatWindowProvider } from '../../browser/chatWindow.js';
import { ChatWindowsRestoration, OPEN_CHAT_WINDOWS_STORAGE_KEY } from '../../browser/chatWindowsRestoration.js';

class TestStorageService extends InMemoryStorageService {
	willSave(): void {
		this.emitWillSaveState(WillSaveStateReason.NONE);
	}
}

suite('ChatWindowsRestoration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow(chat: string): IChatWindow {
		return new class extends mock<IChatWindow>() {
			override readonly chat = constObservable(URI.parse(chat));
			override readonly mainPart = { groups: [] } as unknown as IContentPart;
		}();
	}

	function createRestoration(options: { stored?: object[]; restoreEnabled?: boolean; registered?: boolean; gone?: string[]; canRestore?: (chat: URI) => Promise<boolean> }) {
		const storageService = disposables.add(new TestStorageService());
		if (options.stored) {
			storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(options.stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		const restoreEnabled = observableValue('restoreEnabled', options.restoreEnabled ?? true);
		const onDidRemoveChats = disposables.add(new Emitter<readonly URI[]>());
		const provider = new class extends mock<IChatWindowProvider>() {
			override readonly restoreEnabled = restoreEnabled;
			override readonly onDidRemoveChats = onDidRemoveChats.event;
			override canRestore(chat: URI) { return options.canRestore?.(chat) ?? Promise.resolve(!options.gone?.includes(chat.toString())); }
		}();
		const providerObs = observableValue<IChatWindowProvider | undefined>('provider', options.registered === false ? undefined : provider);
		const windows = observableValue<readonly IChatWindow[]>('windows', []);
		const opened: { chat: string; options: IChatWindowOpenOptions }[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		const restoration = disposables.add(instantiationService.createInstance(ChatWindowsRestoration, {
			provider: providerObs as IObservable<IChatWindowProvider | undefined>,
			windows,
			open: async (chat: URI, openOptions: IChatWindowOpenOptions) => {
				opened.push({ chat: chat.toString(), options: openOptions });
				return undefined;
			},
			terminalsShown: () => true,
			chatPart: window => window.chat.get().path === '/split' ? { state: { serializedGrid: {} }, chatGroup: 1 } : undefined,
		}));
		const read = () => storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE);
		return { storageService, restoration, onDidRemoveChats, restoreEnabled, provider, providerObs, windows, opened, read };
	}

	const flush = () => new Promise(resolve => setTimeout(resolve, 0));

	test('keeps the stored chat windows while their restoration is pending', async () => {
		const pending = new DeferredPromise<boolean>();
		const stored = [{ chat: 'test:/chat' }];
		const { storageService, read } = createRestoration({ stored, canRestore: () => pending.p });

		storageService.willSave();
		const whilePending = read();
		pending.complete(false);
		await flush();

		assert.strictEqual(whilePending, JSON.stringify(stored));
	});

	test('keeps the stored chat windows until the provider registers, and while it does not restore, such as while chat windows are disabled or AI features are hidden', async () => {
		const stored = [{ chat: 'test:/chat' }];
		const unregistered = createRestoration({ stored, registered: false });
		unregistered.storageService.willSave();
		const disabled = createRestoration({ stored, restoreEnabled: false });
		disabled.storageService.willSave();

		disabled.restoreEnabled.set(true, undefined);
		await flush();

		assert.deepStrictEqual({ unregistered: unregistered.read(), disabled: disabled.read(), openedOnceEnabled: disabled.opened.map(window => window.chat) }, {
			unregistered: JSON.stringify(stored), disabled: JSON.stringify(stored), openedOnceEnabled: ['test:/chat'],
		});
	});

	test('forgets the stored chat window of a removed chat before the next save', () => {
		const { onDidRemoveChats, read } = createRestoration({ stored: [{ chat: 'test:/chat' }, { session: 'test:/session' }], restoreEnabled: false });

		onDidRemoveChats.fire([URI.parse('test:/chat')]);
		const afterFirst = JSON.parse(read()!);
		onDidRemoveChats.fire([URI.parse('test:/session')]);

		assert.deepStrictEqual({ afterFirst, afterSecond: read() }, { afterFirst: [{ session: 'test:/session' }], afterSecond: undefined });
	});

	test('a window is restored, without focus, for each stored chat that is not gone, with the groups of its chat part, and a window stored with its session shows the session; a stored chat part that is not one is left out', async () => {
		const { opened } = createRestoration({
			stored: [{ chat: 'test:/peer', terminal: true, chatPart: { state: { serializedGrid: {} }, chatGroup: 1 } }, { session: 'test:/session' }, { chat: 'test:/archived' }, { chat: 'test:/invalid', chatPart: { state: 'not a state', chatGroup: 0 } }],
			gone: ['test:/archived'],
		});
		await flush();

		assert.deepStrictEqual(opened.map(window => ({ chat: window.chat, preserveFocus: window.options.preserveFocus, showTerminals: window.options.showTerminals, chatPart: window.options.chatPart })), [
			{ chat: 'test:/peer', preserveFocus: true, showTerminals: true, chatPart: { state: { serializedGrid: {} }, chatGroup: 1 } },
			{ chat: 'test:/session', preserveFocus: true, showTerminals: undefined, chatPart: undefined },
			{ chat: 'test:/invalid', preserveFocus: true, showTerminals: undefined, chatPart: undefined },
		]);
	});

	test('stores the open chat windows, with their chat, whether they show their terminals and the groups of their chat part besides the chat\'s', async () => {
		const { storageService, windows, read } = createRestoration({});
		await flush();
		windows.set([createWindow('test:/a'), createWindow('test:/split')], undefined);

		storageService.willSave();
		const stored = JSON.parse(read()!);
		windows.set([], undefined);
		storageService.willSave();

		assert.deepStrictEqual({ stored, none: read() }, {
			stored: [{ chat: 'test:/a', editors: [], terminal: true }, { chat: 'test:/split', editors: [], terminal: true, chatPart: { state: { serializedGrid: {} }, chatGroup: 1 } }],
			none: undefined,
		});
	});
});
