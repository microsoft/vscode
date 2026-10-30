/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationHandle, INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { getCanvasInputResource, ICanvas, ICanvasReference } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { AbstractCustomView } from '../../../../services/customView/browser/customView.js';
import { CustomViewService, ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, IChatDeletedEvent, ISessionCanvasClosedEvent, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CanvasesPinnedToSidebarContext, IPinnedCanvas, MAX_PINNED_CANVASES, PINNED_CANVAS_PAGE_ID, PinnedCanvasState } from '../../browser/pinnedCanvases.js';
import { PinnedCanvasService } from '../../browser/pinnedCanvasService.js';

const STORAGE_KEY = 'sessions.pinnedCanvases';

class TestCanvasPage extends AbstractCustomView {
	readonly title = constObservable('Canvas');
	render(): void { }
	layout(): void { }
}

suite('PinnedCanvasService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCanvas(id: string, overrides?: Partial<ICanvas>): ICanvas {
		return {
			resource: URI.parse(`ahp-canvas:/chat/${id}`),
			instanceId: id,
			title: `Canvas ${id}`,
			source: URI.parse(`http://127.0.0.1:4000/${id}?token=secret`),
			extensionId: 'user:canvases',
			canvasId: id,
			...overrides,
		};
	}

	function createChat(resource: string, canvases: readonly ICanvas[] | undefined) {
		const membership = observableValue<readonly ICanvas[] | undefined>('canvases', canvases);
		const chat = upcastPartial<IChat>({ resource: URI.parse(resource), title: observableValue('title', `Chat ${resource}`), canvases: membership, isArchived: observableValue('isArchived', false) });
		return { chat, membership };
	}

	function createSession(resource: string, chats: readonly IChat[]) {
		return upcastPartial<ISession>({
			providerId: 'local-agent-host',
			resource: URI.parse(resource),
			chats: observableValue('chats', chats),
			isArchived: observableValue('isArchived', false),
		});
	}

	function reference(session: ISession, chat: IChat, canvas: ICanvas): ICanvasReference {
		return { providerId: session.providerId, session: session.resource, chat: chat.resource, canvas: canvas.resource };
	}

	function createHarness(options: { readonly sessions: readonly ISession[]; readonly storage?: InMemoryStorageService; readonly activeSession?: IActiveSession; readonly observesChatCanvases?: boolean; readonly closeCompleted?: Promise<void> }) {
		const disposables = store.add(new DisposableStore());
		const sessionsChanged = disposables.add(new Emitter<ISessionsChangeEvent>());
		const chatDeleted = disposables.add(new Emitter<IChatDeletedEvent>());
		const sessionArchived = disposables.add(new Emitter<ISession>());
		const canvasClosed = disposables.add(new Emitter<ISessionCanvasClosedEvent>());
		const observed: string[] = [];
		const released: string[] = [];
		const live = new Map<string, ISettableObservable<ICanvas | undefined>>();
		const openedChats: string[] = [];
		const notifications: string[] = [];
		/** Membership the provider publishes for chats observed directly, by chat resource. */
		const chatCanvases = new Map<string, ISettableObservable<readonly ICanvas[] | undefined>>();
		const chatObservations: string[] = [];

		const storage = options.storage ?? disposables.add(new InMemoryStorageService());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSession: resource => options.sessions.find(session => session.resource.toString() === resource.toString()),
			onDidChangeSessions: sessionsChanged.event,
			onDidArchiveSession: sessionArchived.event,
			onDidDeleteSession: Event.None,
			onDidDeleteChat: chatDeleted.event,
			onDidCloseCanvas: canvasClosed.event,
			observeCanvas: (_session, _chat, canvasResource) => {
				const key = canvasResource.toString();
				observed.push(key);
				const value = live.get(key) ?? observableValue<ICanvas | undefined>('live', undefined);
				live.set(key, value);
				return { object: value, dispose: () => released.push(key) };
			},
			observeChatCanvases: (_session, chatResource) => {
				if (options.observesChatCanvases === false) {
					return undefined;
				}
				const key = chatResource.toString();
				chatObservations.push(`observe ${key}`);
				const value = chatCanvases.get(key) ?? observableValue<readonly ICanvas[] | undefined>('chatCanvases', undefined);
				chatCanvases.set(key, value);
				return { object: value, dispose: () => chatObservations.push(`release ${key}`) };
			},
			closeCanvas: async (session, chat, canvas) => {
				await options.closeCompleted;
				canvasClosed.fire({ session, chatResource: chat.resource, canvasResource: canvas.resource });
			},
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			activeSession: constObservable(options.activeSession),
			openChat: async (_session, chatResource) => { openedChats.push(chatResource.toString()); },
		}));
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override info(message: NotificationMessage): INotificationHandle {
				notifications.push(String(message));
				return super.info(message);
			}
		}());
		const configurationService = new TestConfigurationService({ [CanvasesEnabledSettingId]: true });
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: false }, onDidChangeSentiment: Event.None }));
		const contextKeyService = new MockContextKeyService();
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ILogService, new NullLogService());
		const customViewService = disposables.add(new CustomViewService(new NullLogService(), storage));
		disposables.add(customViewService.registerCustomView({ id: PINNED_CANVAS_PAGE_ID, ctor: new SyncDescriptor(TestCanvasPage) }));
		instantiationService.stub(ICustomViewService, customViewService);

		const service = disposables.add(instantiationService.createInstance(PinnedCanvasService));
		const setLive = (canvas: ICanvas | undefined, resource: URI) => live.get(resource.toString())?.set(canvas, undefined);
		const setChatCanvases = (chat: URI, canvases: readonly ICanvas[] | undefined) => chatCanvases.get(chat.toString())?.set(canvases, undefined);
		const setCanvasesEnabled = async (enabled: boolean) => {
			await configurationService.setUserConfiguration(CanvasesEnabledSettingId, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === CanvasesEnabledSettingId }));
		};
		const snapshot = (entries: readonly IPinnedCanvas[] = service.entries.get()) => entries.map(entry => ({
			title: entry.title.get(),
			chatTitle: entry.chatTitle.get(),
			state: entry.state.get(),
			canvas: entry.reference.get()?.canvas.toString(),
		}));
		return {
			service, storage, customViewService, observed, released, openedChats, notifications, contextKeyService, chatObservations,
			sessionsChanged, chatDeleted, sessionArchived, canvasClosed, setLive, setChatCanvases, setCanvasesEnabled, snapshot,
			dispose: () => disposables.dispose(),
		};
	}

	test('pins a live canvas, keeps it live, and persists only its identity', () => {
		const canvas = createCanvas('plan');
		const { chat } = createChat('chat:/a', [canvas]);
		const session = createSession('session:/a', [chat]);
		const harness = createHarness({ sessions: [session] });

		const pinned = harness.service.pin(reference(session, chat, canvas));
		harness.setLive(canvas, canvas.resource);
		const raw = harness.storage.get(STORAGE_KEY, StorageScope.WORKSPACE)!;
		const afterPin = {
			pinned,
			entries: harness.snapshot(),
			isPinned: harness.service.isPinned(reference(session, chat, canvas)),
			tracked: harness.service.getTrackedCanvas(reference(session, chat, canvas))?.title,
			contextKey: harness.contextKeyService.getContextKeyValue(CanvasesPinnedToSidebarContext.key),
			observed: [...harness.observed],
			stored: JSON.parse(raw),
			persistsSource: raw.includes('token=secret'),
			persistsResource: raw.includes(canvas.resource.toString()),
		};
		harness.service.unpin(reference(session, chat, canvas));

		assert.deepStrictEqual({
			...afterPin,
			afterUnpin: harness.snapshot(),
			released: harness.released,
			storedAfterUnpin: harness.storage.get(STORAGE_KEY, StorageScope.WORKSPACE),
		}, {
			pinned: true,
			entries: [{ title: 'Canvas plan', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Live, canvas: 'ahp-canvas:/chat/plan' }],
			isPinned: true,
			tracked: 'Canvas plan',
			contextKey: [getCanvasInputResource(reference(session, chat, canvas)).toString()],
			observed: ['ahp-canvas:/chat/plan'],
			stored: {
				version: 1,
				pins: [{ providerId: 'local-agent-host', session: 'session:/a', chat: 'chat:/a', extensionId: 'user:canvases', canvasId: 'plan', instanceId: 'plan', title: 'Canvas plan' }],
			},
			persistsSource: false,
			persistsResource: false,
			afterUnpin: [],
			released: ['ahp-canvas:/chat/plan'],
			storedAfterUnpin: undefined,
		});
	});

	test('caps pins and tells the user when the sidebar is full', () => {
		const canvases = Array.from({ length: MAX_PINNED_CANVASES + 1 }, (_, index) => createCanvas(`c${index}`));
		const { chat } = createChat('chat:/a', canvases);
		const session = createSession('session:/a', [chat]);
		const harness = createHarness({ sessions: [session] });

		const results = canvases.map(canvas => harness.service.pin(reference(session, chat, canvas)));

		assert.deepStrictEqual({ results, count: harness.service.entries.get().length, notifications: harness.notifications }, {
			results: [true, true, true, true, true, false],
			count: MAX_PINNED_CANVASES,
			notifications: ['You can add up to 5 canvases to the sidebar. Remove one from the sidebar to add another.'],
		});
	});

	test('removes pins when their canvas is closed, their chat is deleted, or their session is archived', async () => {
		const [closed, deleted, archived, kept] = ['closed', 'deleted', 'archived', 'kept'].map(id => createCanvas(id));
		const first = createChat('chat:/first', [closed, kept]);
		const second = createChat('chat:/second', [deleted]);
		const firstSession = createSession('session:/first', [first.chat, second.chat]);
		const third = createChat('chat:/third', [archived]);
		const otherSession = createSession('session:/other', [third.chat]);
		const harness = createHarness({ sessions: [firstSession, otherSession] });
		harness.service.pin(reference(firstSession, first.chat, closed));
		harness.service.pin(reference(firstSession, first.chat, kept));
		harness.service.pin(reference(firstSession, second.chat, deleted));
		harness.service.pin(reference(otherSession, third.chat, archived));
		harness.setLive(closed, closed.resource);
		const titles = () => harness.service.entries.get().map(entry => entry.title.get());

		await harness.service.closeCanvas(reference(firstSession, first.chat, closed));
		const afterClose = titles();
		harness.chatDeleted.fire({ session: firstSession, sessionResource: firstSession.resource, chatResource: second.chat.resource });
		const afterDelete = titles();
		(otherSession.isArchived as ISettableObservable<boolean>).set(true, undefined);
		harness.sessionsChanged.fire({ added: [], removed: [], changed: [otherSession] });

		assert.deepStrictEqual({ afterClose, afterDelete, afterArchive: titles() }, {
			afterClose: ['Canvas kept', 'Canvas deleted', 'Canvas archived'],
			afterDelete: ['Canvas kept', 'Canvas archived'],
			afterArchive: ['Canvas kept'],
		});
	});

	test('removes pins of a session reported removed, but not of a session replaced under the same resource', () => {
		const [removedCanvas, replacedCanvas] = [createCanvas('removed'), createCanvas('replaced')];
		const removedChat = createChat('chat:/removed', [removedCanvas]);
		const replacedChat = createChat('chat:/replaced', [replacedCanvas]);
		const removedSession = createSession('session:/removed', [removedChat.chat]);
		const replacedSession = createSession('session:/replaced', [replacedChat.chat]);
		const sessions = [removedSession, replacedSession];
		const harness = createHarness({ sessions });
		harness.service.pin(reference(removedSession, removedChat.chat, removedCanvas));
		harness.service.pin(reference(replacedSession, replacedChat.chat, replacedCanvas));

		// Another client deletes one session, and the provider replaces the object of the other.
		const replacement = createSession('session:/replaced', [replacedChat.chat]);
		sessions.splice(0, sessions.length, replacement);
		harness.sessionsChanged.fire({ added: [], removed: [removedSession, replacedSession], changed: [replacement] });

		assert.deepStrictEqual(harness.service.entries.get().map(entry => entry.title.get()), ['Canvas replaced']);
	});

	test('removes restored pins whose session or chat is archived, including a session listed later', () => {
		const [archivedCanvas, keptCanvas, laterCanvas] = ['archived', 'kept', 'later'].map(id => createCanvas(id));
		const archivedChat = createChat('chat:/archived', [archivedCanvas]);
		const keptChat = createChat('chat:/kept', [keptCanvas]);
		const laterChat = createChat('chat:/later', [laterCanvas]);
		const session = createSession('session:/a', [archivedChat.chat, keptChat.chat]);
		const laterSession = createSession('session:/later', [laterChat.chat]);
		const storage = store.add(new InMemoryStorageService());
		const before = createHarness({ sessions: [session, laterSession], storage });
		before.service.pin(reference(session, archivedChat.chat, archivedCanvas));
		before.service.pin(reference(session, keptChat.chat, keptCanvas));
		before.service.pin(reference(laterSession, laterChat.chat, laterCanvas));
		before.dispose();

		// While the window was closed, a chat and another session were archived; that session is listed later.
		(archivedChat.chat.isArchived as ISettableObservable<boolean>).set(true, undefined);
		(laterSession.isArchived as ISettableObservable<boolean>).set(true, undefined);
		const sessions = [session];
		const after = createHarness({ sessions, storage });
		const restored = after.service.entries.get().map(entry => entry.title.get());
		sessions.push(laterSession);
		after.sessionsChanged.fire({ added: [laterSession], removed: [], changed: [] });

		assert.deepStrictEqual({ restored, listed: after.service.entries.get().map(entry => entry.title.get()) }, {
			restored: ['Canvas kept', 'Canvas later'],
			listed: ['Canvas kept'],
		});
	});

	test('removes a pin whose canvas is closed from its chat after the chat already dropped the canvas', () => {
		const canvas = createCanvas('plan');
		const { chat, membership } = createChat('chat:/a', [canvas]);
		const session = createSession('session:/a', [chat]);
		const harness = createHarness({ sessions: [session] });
		harness.service.pin(reference(session, chat, canvas));
		harness.setLive(canvas, canvas.resource);

		// The host drops the canvas from its chat before it reports the close complete.
		membership.set([], undefined);
		const whileClosing = harness.snapshot();
		harness.canvasClosed.fire({ session, chatResource: chat.resource, canvasResource: canvas.resource });

		assert.deepStrictEqual({ whileClosing, afterClose: harness.snapshot() }, {
			whileClosing: [{ title: 'Canvas plan', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Unavailable, canvas: undefined }],
			afterClose: [],
		});
	});

	test('keeps a pin whose close completes after it moved on to its reopened canvas', async () => {
		const canvas = createCanvas('plan');
		const { chat, membership } = createChat('chat:/a', [canvas]);
		const session = createSession('session:/a', [chat]);
		const closeCompleted = new DeferredPromise<void>();
		const harness = createHarness({ sessions: [session], closeCompleted: closeCompleted.p });
		harness.service.pin(reference(session, chat, canvas));
		harness.setLive(canvas, canvas.resource);

		const closing = harness.service.closeCanvas(reference(session, chat, canvas));
		// Before the close completes, the chat opens the same instance again as a new canvas.
		const reopened = createCanvas('plan', { resource: URI.parse('ahp-canvas:/chat/plan-reopened') });
		membership.set([reopened], undefined);
		harness.setLive(reopened, reopened.resource);
		await closeCompleted.complete();
		await closing;

		assert.deepStrictEqual(harness.snapshot(), [{ title: 'Canvas plan', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Live, canvas: 'ahp-canvas:/chat/plan-reopened' }]);
	});

	test('keeps a pin while its session leaves the catalog and observes it again through the returning session', () => {
		const canvas = createCanvas('plan');
		const { chat } = createChat('chat:/a', [canvas]);
		const session = createSession('session:/a', [chat]);
		const sessions = [session];
		const harness = createHarness({ sessions });
		harness.service.pin(reference(session, chat, canvas));
		harness.setLive(canvas, canvas.resource);

		// A reconnecting provider hides its sessions without reporting them removed.
		sessions.length = 0;
		harness.sessionsChanged.fire({ added: [], removed: [], changed: [] });
		const whileMissing = { entries: harness.snapshot(), released: [...harness.released] };
		const replaced = createSession('session:/a', [createChat('chat:/a', undefined).chat]);
		sessions.push(replaced);
		harness.sessionsChanged.fire({ added: [replaced], removed: [], changed: [] });

		assert.deepStrictEqual({ whileMissing, returned: harness.snapshot(), observed: harness.observed }, {
			whileMissing: {
				entries: [{ title: 'Canvas plan', chatTitle: undefined, state: PinnedCanvasState.Pending, canvas: undefined }],
				released: ['ahp-canvas:/chat/plan'],
			},
			returned: [{ title: 'Canvas plan', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Live, canvas: 'ahp-canvas:/chat/plan' }],
			observed: ['ahp-canvas:/chat/plan', 'ahp-canvas:/chat/plan'],
		});
	});

	test('rebinds a restored pin to the canvas with the same instance ID, or marks it unavailable', () => {
		const original = createCanvas('plan');
		const first = createChat('chat:/a', [original]);
		const firstSession = createSession('session:/a', [first.chat]);
		const storage = store.add(new InMemoryStorageService());
		const before = createHarness({ sessions: [firstSession], storage });
		before.service.pin(reference(firstSession, first.chat, original));
		before.dispose();

		// After a reload, the chat's membership is unknown until the chat is shown again.
		const restored = createChat('chat:/a', undefined);
		const restoredSession = createSession('session:/a', [restored.chat]);
		const after = createHarness({ sessions: [restoredSession], storage });
		const whileUnknown = after.snapshot();
		const republished = createCanvas('plan', { resource: URI.parse('ahp-canvas:/chat/plan-after-restart'), title: 'Plan after restart' });
		restored.membership.set([republished], undefined);
		after.setLive(republished, republished.resource);
		const rebound = after.snapshot();
		restored.membership.set([], undefined);

		assert.deepStrictEqual({ whileUnknown, rebound, closed: after.snapshot(), observed: after.observed }, {
			whileUnknown: [{ title: 'Canvas plan', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Pending, canvas: undefined }],
			rebound: [{ title: 'Plan after restart', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Live, canvas: 'ahp-canvas:/chat/plan-after-restart' }],
			closed: [{ title: 'Plan after restart', chatTitle: 'Chat chat:/a', state: PinnedCanvasState.Unavailable, canvas: undefined }],
			observed: ['ahp-canvas:/chat/plan-after-restart'],
		});
	});

	test('always shows a pin on the canvas page, even from its own chat, without showing the chat', async () => {
		const canvas = createCanvas('plan');
		const { chat } = createChat('chat:/a', [canvas]);
		const session = createSession('session:/a', [chat]);
		const activeSession = upcastPartial<IActiveSession>({ ...session, activeChat: constObservable(chat) });
		const harness = createHarness({ sessions: [session], activeSession });
		const pinned = reference(session, chat, canvas);
		harness.service.pin(pinned);
		harness.setLive(canvas, canvas.resource);

		await harness.service.show(pinned);
		const shown = {
			page: harness.customViewService.activeCustomView.get()?.id,
			shown: harness.service.isShown(pinned),
			selected: harness.service.selected.get()?.title.get(),
			reconnecting: harness.service.selected.get()?.reconnecting.get(),
		};
		harness.service.unpin(pinned);

		assert.deepStrictEqual({ shown, openedChats: harness.openedChats, chatObservations: harness.chatObservations, pageAfterUnpin: harness.customViewService.activeCustomView.get()?.id }, {
			shown: { page: PINNED_CANVAS_PAGE_ID, shown: true, selected: 'Canvas plan', reconnecting: false },
			openedChats: [],
			chatObservations: [],
			pageAfterUnpin: undefined,
		});
	});

	/** Pins `canvas`, then restores the pin in a new window whose chat has not published its canvases. */
	function createRestoredHarness(canvas: ICanvas, options?: { readonly observesChatCanvases?: boolean }) {
		const original = createChat('chat:/a', [canvas]);
		const session = createSession('session:/a', [original.chat]);
		const storage = store.add(new InMemoryStorageService());
		const before = createHarness({ sessions: [session], storage });
		before.service.pin(reference(session, original.chat, canvas));
		before.dispose();
		const restored = createChat('chat:/a', undefined);
		const restoredSession = createSession('session:/a', [restored.chat]);
		const harness = createHarness({ sessions: [restoredSession], storage, observesChatCanvases: options?.observesChatCanvases });
		const [entry] = harness.service.entries.get();
		return { harness, entry, chat: restored.chat, membership: restored.membership };
	}

	test('reconnects a restored pin on its page through its chat canvases, without showing its chat', async () => {
		const canvas = createCanvas('plan');
		const { harness, entry, chat } = createRestoredHarness(canvas);

		await harness.service.show(entry);
		const whileReconnecting = {
			page: harness.customViewService.activeCustomView.get()?.id,
			state: entry.state.get(),
			reconnecting: entry.reconnecting.get(),
			chatObservations: [...harness.chatObservations],
		};
		harness.setChatCanvases(chat.resource, [canvas]);
		harness.setLive(canvas, canvas.resource);

		assert.deepStrictEqual({
			whileReconnecting,
			reconnected: { state: entry.state.get(), reconnecting: entry.reconnecting.get(), canvas: entry.reference.get()?.canvas.toString(), shown: harness.service.isShown(entry.reference.get()!) },
			chatObservations: harness.chatObservations,
			openedChats: harness.openedChats,
		}, {
			whileReconnecting: { page: PINNED_CANVAS_PAGE_ID, state: PinnedCanvasState.Pending, reconnecting: true, chatObservations: ['observe chat:/a'] },
			reconnected: { state: PinnedCanvasState.Live, reconnecting: false, canvas: 'ahp-canvas:/chat/plan', shown: true },
			chatObservations: ['observe chat:/a', 'release chat:/a'],
			openedChats: [],
		});
	});

	test('marks a restored pin unavailable on its page when its chat no longer lists its canvas', async () => {
		const { harness, entry, chat } = createRestoredHarness(createCanvas('plan'));

		await harness.service.show(entry);
		harness.setChatCanvases(chat.resource, [createCanvas('other')]);

		assert.deepStrictEqual({
			state: entry.state.get(),
			reconnecting: entry.reconnecting.get(),
			page: harness.customViewService.activeCustomView.get()?.id,
			chatObservations: harness.chatObservations,
			openedChats: harness.openedChats,
		}, {
			state: PinnedCanvasState.Unavailable,
			reconnecting: false,
			page: PINNED_CANVAS_PAGE_ID,
			chatObservations: ['observe chat:/a', 'release chat:/a'],
			openedChats: [],
		});
	});

	test('hands a reconnecting pin over to its chat canvases once its chat publishes them', async () => {
		const canvas = createCanvas('plan');
		const { harness, entry, chat, membership } = createRestoredHarness(canvas);

		await harness.service.show(entry);
		membership.set([createCanvas('pending', { instanceId: undefined })], undefined);
		const whilePending = { state: entry.state.get(), reconnecting: entry.reconnecting.get(), chatObservations: [...harness.chatObservations] };
		membership.set([canvas], undefined);
		harness.setLive(canvas, canvas.resource);

		assert.deepStrictEqual({ whilePending, state: entry.state.get(), reconnecting: entry.reconnecting.get(), chatObservations: harness.chatObservations }, {
			whilePending: { state: PinnedCanvasState.Pending, reconnecting: true, chatObservations: [`observe ${chat.resource}`, `release ${chat.resource}`] },
			state: PinnedCanvasState.Live,
			reconnecting: false,
			chatObservations: [`observe ${chat.resource}`, `release ${chat.resource}`],
		});
	});

	test('holds no chat observation while canvases are disabled and reconnects once they are enabled again', async () => {
		const canvas = createCanvas('plan');
		const { harness, entry, chat } = createRestoredHarness(canvas);

		await harness.service.show(entry);
		await harness.setCanvasesEnabled(false);
		const whileDisabled = [...harness.chatObservations];
		await harness.setCanvasesEnabled(true);
		harness.setChatCanvases(chat.resource, [canvas]);
		harness.setLive(canvas, canvas.resource);

		assert.deepStrictEqual({ whileDisabled, chatObservations: harness.chatObservations, state: entry.state.get() }, {
			whileDisabled: [`observe ${chat.resource}`, `release ${chat.resource}`],
			chatObservations: [`observe ${chat.resource}`, `release ${chat.resource}`, `observe ${chat.resource}`, `release ${chat.resource}`],
			state: PinnedCanvasState.Live,
		});
	});

	test('returns the canvas page to the pin each history entry showed', async () => {
		const [plan, preview] = [createCanvas('plan'), createCanvas('preview')];
		const { chat } = createChat('chat:/a', [plan, preview]);
		const session = createSession('session:/a', [chat]);
		const harness = createHarness({ sessions: [session] });
		harness.service.pin(reference(session, chat, plan));
		harness.service.pin(reference(session, chat, preview));
		const [planEntry, previewEntry] = harness.service.entries.get();

		await harness.service.show(planEntry);
		await harness.service.show(previewEntry);
		const openings = [harness.customViewService.activeCustomViewOpen.get()?.state];
		harness.customViewService.showCustomView(PINNED_CANVAS_PAGE_ID, { source: 'history', state: planEntry.id });
		openings.push(harness.customViewService.activeCustomViewOpen.get()?.state);

		assert.deepStrictEqual({ openings, selected: harness.service.selected.get()?.title.get() }, {
			openings: [previewEntry.id, planEntry.id],
			selected: 'Canvas plan',
		});
	});

	test('shows a restored pin without showing its chat when its provider cannot observe chat canvases', async () => {
		const { harness, entry } = createRestoredHarness(createCanvas('plan'), { observesChatCanvases: false });

		await harness.service.show(entry);

		assert.deepStrictEqual({
			page: harness.customViewService.activeCustomView.get()?.id,
			state: entry.state.get(),
			reconnecting: entry.reconnecting.get(),
			openedChats: harness.openedChats,
		}, {
			page: PINNED_CANVAS_PAGE_ID,
			state: PinnedCanvasState.Pending,
			reconnecting: false,
			openedChats: [],
		});
	});
});
