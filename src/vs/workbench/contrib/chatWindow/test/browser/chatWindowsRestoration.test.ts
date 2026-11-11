/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatWindow, IChatWindowOpenOptions, IChatWindowProvider } from '../../browser/chatWindow.js';
import { ChatWindowsRestoration, IChatWindowBounds, OPEN_CHAT_WINDOWS_STORAGE_KEY } from '../../browser/chatWindowsRestoration.js';
import { AuxiliaryWindowMode } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';

class TestStorageService extends InMemoryStorageService {
	willSave(): void {
		this.emitWillSaveState(WillSaveStateReason.NONE);
	}
}

suite('ChatWindowsRestoration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow(chat: string, others: readonly string[] = [], active = chat): IChatWindow {
		return new class extends mock<IChatWindow>() {
			override readonly chat = constObservable(URI.parse(active));
			override readonly chats = constObservable([chat, ...others].map(candidate => URI.parse(candidate)));
			override readonly openedChats = this.chats;
			override readonly mainPart = { groups: [] } as unknown as IContentPart;
		}();
	}

	function createRestoration(options: { stored?: object[]; restoreEnabled?: boolean; registered?: boolean; gone?: string[]; order?: (window: IChatWindow) => readonly URI[] | undefined; layoutChat?: (window: IChatWindow) => URI | undefined; canRestore?: (chat: URI) => Promise<boolean>; createdParts?: (window: IChatWindow) => readonly IContentPart[]; windowState?: (window: IChatWindow) => IChatWindowBounds | undefined; failOpen?: string[]; canonicalChatOf?: (resource: URI) => URI | undefined; openAs?: (chat: URI, options: IChatWindowOpenOptions, windows: ISettableObservable<readonly IChatWindow[]>) => Promise<IChatWindow | undefined> }) {
		const storageService = disposables.add(new TestStorageService());
		if (options.stored) {
			storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(options.stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		const restoreEnabled = observableValue('restoreEnabled', options.restoreEnabled ?? true);
		const onDidRemoveChats = disposables.add(new Emitter<readonly URI[]>());
		const finished: string[][] = [];
		const provider = new class extends mock<IChatWindowProvider>() {
			override readonly restoreEnabled = restoreEnabled;
			override readonly onDidRemoveChats = onDidRemoveChats.event;
			override canRestore(chat: URI) { return options.canRestore?.(chat) ?? Promise.resolve(!options.gone?.includes(chat.toString())); }
			override didFinishRestore(claimed: readonly URI[]) { finished.push(claimed.map(chat => chat.toString())); }
			override canonicalChatOf(resource: URI) { return options.canonicalChatOf?.(resource); }
		}();
		const providerObs = observableValue<IChatWindowProvider | undefined>('provider', options.registered === false ? undefined : provider);
		const windows = observableValue<readonly IChatWindow[]>('windows', []);
		const opened: { chat: string; options: IChatWindowOpenOptions }[] = [];
		const activated: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		const restoration = disposables.add(instantiationService.createInstance(ChatWindowsRestoration, {
			provider: providerObs as IObservable<IChatWindowProvider | undefined>,
			windows,
			open: async (chat: URI, openOptions: IChatWindowOpenOptions) => {
				if (options.failOpen?.includes(chat.toString())) {
					throw new Error('The window failed to open');
				}
				opened.push({ chat: chat.toString(), options: openOptions });
				if (options.openAs) {
					return options.openAs(chat, openOptions, windows);
				}
				// As the service does: the window it opens is one of the windows, with all its chats
				const window = createWindow(chat.toString(), openOptions.chats?.map(other => other.toString()));
				windows.set([...windows.get(), window], undefined);
				return window;
			},
			activateChat: (_window: IChatWindow, chat: URI) => activated.push(chat.toString()),
			chatsInOrder: window => options.order?.(window),
			layoutChatOf: window => options.layoutChat?.(window),
			terminalsShown: () => true,
			chatPart: window => window.chat.get().path === '/split' ? { state: { serializedGrid: {} }, chatGroup: 1 } : undefined,
			createdParts: window => options.createdParts?.(window) ?? [],
			windowState: window => options.windowState?.(window),
		}));
		const read = () => storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE);
		return { storageService, restoration, onDidRemoveChats, restoreEnabled, provider, providerObs, windows, opened, activated, read, finished };
	}

	const flush = () => new Promise(resolve => setTimeout(resolve, 0));

	test('stores the chats of a window with several, and its active chat, and restores those that can be, with old entries of one chat or session', async () => {
		const { storageService, windows, read, opened } = createRestoration({
			stored: [{ chat: 'test:/a', chats: ['test:/gone', 'test:/b'], activeChat: 'test:/b' }, { session: 'test:/session' }, { chat: 'test:/gone', chats: ['test:/c'] }],
			gone: ['test:/gone'],
		});
		await flush();
		windows.set([createWindow('test:/x', ['test:/y'], 'test:/y'), createWindow('test:/z')], undefined);
		storageService.willSave();

		assert.deepStrictEqual({ opened: opened.map(window => ({ chat: window.chat, chats: window.options.chats?.map(chat => chat.toString()) })), stored: JSON.parse(read()!).map((entry: { chat: string; chats?: string[]; activeChat?: string }) => ({ chat: entry.chat, chats: entry.chats, activeChat: entry.activeChat })) }, {
			opened: [{ chat: 'test:/a', chats: ['test:/b'] }, { chat: 'test:/session', chats: undefined }, { chat: 'test:/c', chats: undefined }],
			stored: [{ chat: 'test:/x', chats: ['test:/y'], activeChat: 'test:/y' }, { chat: 'test:/z', chats: undefined, activeChat: undefined }],
		});
	});

	test('stores the chats of a window in the order of its tabs rather than the order they joined in', async () => {
		const { storageService, windows, read } = createRestoration({ order: () => ['test:/a', 'test:/c', 'test:/b'].map(chat => URI.parse(chat)) });
		await flush();
		windows.set([createWindow('test:/a', ['test:/b', 'test:/c'])], undefined);
		storageService.willSave();

		assert.deepStrictEqual(JSON.parse(read()!).map((entry: { chat: string; chats?: string[] }) => [entry.chat, ...(entry.chats ?? [])]), [['test:/a', 'test:/c', 'test:/b']]);
	});

	test('stores the chat whose layout the window remembers when a tab was moved before it, and nothing when it is still first', async () => {
		const stored = async (order: string[], layoutChat: string) => {
			const { storageService, windows, read } = createRestoration({ order: () => order.map(chat => URI.parse(chat)), layoutChat: () => URI.parse(layoutChat) });
			await flush();
			windows.set([createWindow('test:/a', ['test:/b'])], undefined);
			storageService.willSave();
			return JSON.parse(read()!).map((entry: { chat: string; layoutChat?: string }) => [entry.chat, entry.layoutChat]);
		};

		assert.deepStrictEqual({ moved: await stored(['test:/b', 'test:/a'], 'test:/a'), first: await stored(['test:/a', 'test:/b'], 'test:/a') }, { moved: [['test:/b', 'test:/a']], first: [['test:/a', undefined]] });
	});

	test('restores a window that shows the tab of another chat first with the layout of the chat it remembers it for, unless that chat is gone', async () => {
		const { opened } = createRestoration({ stored: [{ chat: 'test:/b', layoutChat: 'test:/a', chats: ['test:/a'] }, { chat: 'test:/d', layoutChat: 'test:/c', chats: ['test:/c', 'test:/e'] }], gone: ['test:/c'] });
		await flush();

		assert.deepStrictEqual(opened.map(({ chat, options }) => [chat, options.layoutChat?.toString(), options.chats?.map(other => other.toString())]), [['test:/b', 'test:/a', ['test:/a']], ['test:/d', undefined, ['test:/e']]]);
	});

	test('restores the active chat of a window of several chats, also when it is the first', async () => {
		const { opened, activated } = createRestoration({ stored: [{ chat: 'test:/a', chats: ['test:/b'], activeChat: 'test:/a' }, { chat: 'test:/c', chats: ['test:/d'], activeChat: 'test:/d' }] });
		await flush();

		assert.deepStrictEqual({ opened: opened.map(window => window.chat), activated }, { opened: ['test:/a', 'test:/c'], activated: ['test:/a', 'test:/d'] });
	});

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

	test('tells the provider once which chats it restored or tried to, also in a window that failed to open, which stays stored until its chat is removed; not while restoring is pending, and with none when nothing was stored', async () => {
		const { storageService, restoreEnabled, windows, onDidRemoveChats, read, finished } = createRestoration({
			stored: [{ chat: 'test:/a', chats: ['test:/gone'] }, { chat: 'test:/b', chats: ['test:/c'] }],
			gone: ['test:/gone'],
			failOpen: ['test:/b'],
			restoreEnabled: false,
		});
		await flush();
		const whilePending = [...finished];
		restoreEnabled.set(true, undefined);
		await flush();
		windows.set([createWindow('test:/a')], undefined);
		storageService.willSave();
		const stored = JSON.parse(read()!).map((entry: { chat: string; chats?: string[] }) => [entry.chat, ...(entry.chats ?? [])]);
		onDidRemoveChats.fire([URI.parse('test:/b')]);
		storageService.willSave();
		const afterRemoval = JSON.parse(read()!).map((entry: { chat: string; chats?: string[] }) => [entry.chat, ...(entry.chats ?? [])]);
		const nothingStored = createRestoration({});
		await flush();

		assert.deepStrictEqual({ whilePending, finished, stored, afterRemoval, nothingStored: nothingStored.finished }, {
			whilePending: [],
			finished: [['test:/a', 'test:/b', 'test:/c']],
			stored: [['test:/a'], ['test:/b', 'test:/c']],
			afterRemoval: [['test:/a'], ['test:/c']],
			nothingStored: [[]],
		});
	});

	test('a window that failed to open is retired for good once its chat opens in a window, so that closing that window does not bring it back; other windows that failed stay stored', async () => {
		const { storageService, windows, read } = createRestoration({ stored: [{ chat: 'test:/a' }, { chat: 'test:/b' }], failOpen: ['test:/a', 'test:/b'] });
		await flush();
		const chatsOf = () => JSON.parse(read()!).map((entry: { chat: string }) => entry.chat);
		windows.set([createWindow('test:/a')], undefined);
		storageService.willSave();
		const whileOpen = chatsOf();
		windows.set([], undefined);
		storageService.willSave();

		assert.deepStrictEqual({ whileOpen, afterClose: chatsOf() }, { whileOpen: ['test:/a', 'test:/b'], afterClose: ['test:/b'] });
	});

	test('each chat of a window that failed to open is retired once it opens in a window, and its other chats stay stored, also when one of those opens first; after a reload, the window restores with the chats that remain', async () => {
		const stored = (restoration: ReturnType<typeof createRestoration>) => JSON.parse(restoration.read()!).map((entry: { chat: string; chats?: string[] }) => [entry.chat, ...(entry.chats ?? [])]);
		const primaryOpens = createRestoration({ stored: [{ chat: 'test:/a', chats: ['test:/b', 'test:/c'] }], failOpen: ['test:/a'] });
		await flush();
		primaryOpens.windows.set([createWindow('test:/a')], undefined);
		primaryOpens.storageService.willSave();
		const whileOpen = stored(primaryOpens);
		primaryOpens.windows.set([], undefined);
		primaryOpens.storageService.willSave();
		const afterClose = stored(primaryOpens);
		const reloaded = createRestoration({ stored: JSON.parse(primaryOpens.read()!) });
		await flush();

		const secondaryOpens = createRestoration({ stored: [{ chat: 'test:/a', chats: ['test:/b'] }], failOpen: ['test:/a'] });
		await flush();
		secondaryOpens.windows.set([createWindow('test:/b')], undefined);
		secondaryOpens.storageService.willSave();
		secondaryOpens.windows.set([], undefined);
		secondaryOpens.storageService.willSave();

		assert.deepStrictEqual({ whileOpen, afterClose, reopened: reloaded.opened.map(({ chat, options }) => [chat, ...(options.chats ?? []).map(other => other.toString())]), secondaryOnly: stored(secondaryOpens) }, {
			whileOpen: [['test:/a'], ['test:/b', 'test:/c']],
			afterClose: [['test:/b', 'test:/c']],
			reopened: [['test:/b', 'test:/c']],
			secondaryOnly: [['test:/a']],
		});
	});

	test('a window stored with its session that failed to open is retired once the session\'s main chat opens in a window, so that closing that window does not bring it back after a reload', async () => {
		const canonicalChatOf = (resource: URI) => resource.toString() === 'test:/session' ? URI.parse('test:/session-main') : undefined;
		const failed = createRestoration({ stored: [{ session: 'test:/session' }], failOpen: ['test:/session'], canonicalChatOf });
		await flush();
		failed.windows.set([createWindow('test:/session-main')], undefined);
		failed.storageService.willSave();
		failed.windows.set([], undefined);
		failed.storageService.willSave();
		const stored = failed.read();
		const reloaded = createRestoration({ stored: stored ? JSON.parse(stored) : undefined, canonicalChatOf });
		await flush();

		assert.deepStrictEqual({ stored, reopened: reloaded.opened.map(window => window.chat) }, { stored: undefined, reopened: [] });
	});

	test('of a stored window, the chats that came up in any window, as themselves or as the chat they open as, are restored; those that did not stay stored, in their order, whether its opening returned or threw', async () => {
		const stored = (restoration: ReturnType<typeof createRestoration>) => {
			restoration.storageService.willSave();
			return JSON.parse(restoration.read()!).map((entry: { chat: string; chats?: string[] }) => [entry.chat, ...(entry.chats ?? [])]);
		};
		// Its chat and the one beside it show as chats that other windows show already: both came up, in those windows.
		const elsewhere = createRestoration({
			stored: [{ chat: 'test:/c', chats: ['test:/b'] }],
			canonicalChatOf: resource => ({ 'test:/c': URI.parse('test:/c-main'), 'test:/b': URI.parse('test:/b-main') } as Record<string, URI>)[resource.toString()],
			openAs: async (_chat, _options, windows) => {
				const [first, second] = [createWindow('test:/c-main'), createWindow('test:/b-main')];
				windows.set([first, second], undefined);
				return first;
			},
		});
		await flush();
		// Its window opens with its chat and one beside it, without the last; or opens them and then fails.
		const partly = (fail: boolean) => createRestoration({
			stored: [{ chat: 'test:/a', chats: ['test:/b', 'test:/c'], terminal: true }],
			openAs: async (_chat, _options, windows) => {
				windows.set([createWindow('test:/a', ['test:/b'])], undefined);
				if (fail) {
					throw new Error('The last chat failed to open');
				}
				return windows.get()[0];
			},
		});
		const returned = partly(false);
		const threw = partly(true);
		await flush();

		assert.deepStrictEqual({ elsewhere: stored(elsewhere), returned: stored(returned), threw: stored(threw) }, {
			elsewhere: [['test:/c-main'], ['test:/b-main']],
			returned: [['test:/a', 'test:/b'], ['test:/c']],
			threw: [['test:/a', 'test:/b'], ['test:/c']],
		});
	});

	test('restores its windows asking to open their other chats in the window that shows their chat already, if one does', async () => {
		const { opened } = createRestoration({ stored: [{ chat: 'test:/a', chats: ['test:/b'] }] });
		await flush();

		assert.deepStrictEqual(opened.map(({ options }) => options.restoreChatsOnReveal), [true]);
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

	test('the parts a window created, such as for editors dropped on its edges, are stored with their editors and open again with them', async () => {
		const typeId = 'chatWindowsRestoration.test';
		const createEditor = (path: string) => new class extends mock<EditorInput>() {
			override readonly typeId = typeId;
			override readonly resource = URI.file(path);
		}();
		const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
		disposables.add(new TestInstantiationService()).invokeFunction(accessor => registry.start(accessor));
		disposables.add(registry.registerEditorSerializer(typeId, class implements IEditorSerializer {
			canSerialize() { return true; }
			serialize(editor: EditorInput) { return editor.resource!.path; }
			deserialize(_instantiationService: IInstantiationService, value: string) { return createEditor(value); }
		}));
		const created = createEditor('/created.txt');
		const createdPart = {
			groups: [new class extends mock<IEditorGroup>() {
				override readonly activeEditor = created;
				override getEditors() { return [created]; }
			}()]
		} as unknown as IContentPart;
		const saving = createRestoration({ createdParts: window => window.chat.get().path === '/a' ? [createdPart, { groups: [] } as unknown as IContentPart] : [] });
		await flush();
		saving.windows.set([createWindow('test:/a'), createWindow('test:/b')], undefined);
		saving.storageService.willSave();
		const stored = JSON.parse(saving.read()!);
		saving.windows.set([], undefined);

		const { opened } = createRestoration({ stored });
		await flush();

		assert.deepStrictEqual({ stored, restored: opened.map(window => ({ chat: window.chat, createdParts: window.options.createdParts?.map(part => ({ editors: part.editors?.map(editor => editor.resource?.path), active: part.activeEditor?.resource?.path })) })) }, {
			stored: [{ chat: 'test:/a', editors: [], terminal: true, created: [[{ typeId, value: '/created.txt', active: true }]] }, { chat: 'test:/b', editors: [], terminal: true }],
			restored: [{ chat: 'test:/a', createdParts: [{ editors: ['/created.txt'], active: '/created.txt' }] }, { chat: 'test:/b', createdParts: undefined }]
		});
	});

	test('each window opens again where it showed on the screen, maximized or in full screen as it was; a stored state that is not one is left out', async () => {
		const states: Record<string, IChatWindowBounds> = {
			'/a': { bounds: { x: 100, y: 50, width: 900, height: 700 }, mode: AuxiliaryWindowMode.Normal },
			'/b': { bounds: { x: -1200, y: 0, width: 1200, height: 800 }, mode: AuxiliaryWindowMode.Maximized },
		};
		const saving = createRestoration({ windowState: window => states[window.chat.get().path] });
		await flush();
		saving.windows.set([createWindow('test:/a'), createWindow('test:/b'), createWindow('test:/c')], undefined);
		saving.storageService.willSave();
		const stored = JSON.parse(saving.read()!);
		saving.windows.set([], undefined);

		const { opened } = createRestoration({ stored: [...stored, { chat: 'test:/invalid', window: { bounds: { x: 0, y: 0, width: 'wide' }, mode: AuxiliaryWindowMode.Fullscreen } }] });
		await flush();

		assert.deepStrictEqual(opened.map(window => ({ chat: window.chat, bounds: window.options.bounds, mode: window.options.mode })), [
			{ chat: 'test:/a', bounds: { x: 100, y: 50, width: 900, height: 700 }, mode: AuxiliaryWindowMode.Normal },
			{ chat: 'test:/b', bounds: { x: -1200, y: 0, width: 1200, height: 800 }, mode: AuxiliaryWindowMode.Maximized },
			{ chat: 'test:/c', bounds: undefined, mode: undefined },
			{ chat: 'test:/invalid', bounds: undefined, mode: undefined },
		]);
	});
});
