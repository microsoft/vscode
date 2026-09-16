/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { autorun, constObservable, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IPaneComposite } from '../../../../../workbench/common/panecomposite.js';
import { PaneCompositeDescriptor } from '../../../../../workbench/browser/panecomposite.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IChatWidgetViewState } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { IChatModelReference, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatModel, IChatModelInputState, IInputModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { KANBAN_CUSTOM_VIEW_ID } from '../../../../common/projectBoard.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ChatInteractivity, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { PROJECT_BOARD_CHAT_CONTAINER_ID, ProjectBoardChatContent, ProjectBoardChatSidePanel, ProjectBoardChatViewPane } from '../../browser/projectBoardChatSidePanel.js';
import { IProjectBoardCard } from '../../common/projectBoardModel.js';

function createCard(name = 'child'): IProjectBoardCard {
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:${name}`);
		override readonly title = constObservable(name);
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly capabilities = constObservable({ canRename: true, canDelete: true });
		override readonly interactivity = observableValue('interactivity', ChatInteractivity.Full);
		override readonly modelId = constObservable(`model-${name}`);
		override readonly mode = constObservable({ id: `mode-${name}`, kind: 'agent' });
	}();
	const session = createTestSession('owning-session').session;
	const mainChat: IChat = { ...chat, resource: URI.parse(`test-chat:main-${name}`) };
	return {
		id: name, chat,
		session: { ...session, mainChat: constObservable(mainChat), chats: constObservable([mainChat, chat]) },
		title: name, sessionTitle: 'owning-session', status: SessionStatus.Completed, isRead: false,
		description: undefined, archived: false, readOnly: false, workspace: undefined,
		sharedContext: [], connection: undefined,
	};
}

suite('ProjectBoardChatSidePanel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function setup() {
		const instantiation = workbenchInstantiationService(undefined, store);
		const descriptor = new class extends mock<ICustomViewDescriptor>() {
			override readonly id = KANBAN_CUSTOM_VIEW_ID;
			override readonly supportsAuxiliaryBar = true;
		}();
		const customView = observableValue<ICustomViewDescriptor | undefined>('customView', descriptor);
		const auxiliaryBarVisible = observableValue('auxiliary', false);
		const paneEvents: string[] = [];
		let previousCustomView: ICustomViewDescriptor | undefined = descriptor;
		store.add(autorun(reader => {
			const currentCustomView = customView.read(reader);
			if (currentCustomView !== previousCustomView) {
				previousCustomView = currentCustomView;
				auxiliaryBarVisible.set(false, undefined);
			}
		}));
		let underlyingAuxiliaryVisible = false;
		instantiation.stub(IWorkbenchLayoutService, {
			isVisible: () => customView.get() ? auxiliaryBarVisible.get() : underlyingAuxiliaryVisible,
		});
		instantiation.stub(ICustomViewService, {
			activeCustomView: customView,
			auxiliaryBarVisible,
			setAuxiliaryBarVisible: visible => {
				paneEvents.push(`visible:${visible}`);
				auxiliaryBarVisible.set(visible, undefined);
			},
		});
		const active = store.add(new VisibleSession(createCard('main').session, createCard('main').chat));
		const activeSession = constObservable(active);
		const trust = sinon.stub().resolves(true);
		instantiation.stub(ISessionsService, { canOpenSession: trust, activeSession });
		const markRead = sinon.stub().resolves();
		instantiation.stub(ISessionsManagementService, { markRead });
		const sentimentChanged = store.add(new Emitter<void>());
		const sentiment = { hidden: false };
		instantiation.stub(IChatEntitlementService, { sentiment, onDidChangeSentiment: sentimentChanged.event });
		const notifications: string[] = [];
		instantiation.stub(INotificationService, { error: message => notifications.push(String(message)) });
		instantiation.stub(ILogService, new NullLogService());

		let activeComposite: string | undefined = 'previous-pane';
		const pane = new class extends mock<ProjectBoardChatViewPane>() {
			override open = sinon.stub().resolves();
			override clear = sinon.spy();
			override focus = sinon.spy();
			override hasChatFocus = sinon.stub().returns(true);
			override isBodyVisible(): boolean { return true; }
		}();
		const openView = sinon.stub().callsFake(async () => {
			paneEvents.push('open');
			activeComposite = PROJECT_BOARD_CHAT_CONTAINER_ID;
			auxiliaryBarVisible.set(true, undefined);
			return pane;
		});
		instantiation.stub(IViewsService, { openView });
		const restorePane = sinon.stub().callsFake(async (id: string, location: ViewContainerLocation) => {
			paneEvents.push('restore');
			assert.strictEqual(location, ViewContainerLocation.AuxiliaryBar);
			activeComposite = id;
			return undefined;
		});
		instantiation.stub(IPaneCompositePartService, {
			getActivePaneComposite: () => {
				const id = activeComposite;
				return id ? new class extends mock<IPaneComposite>() {
					override getId(): string { return id; }
				}() : undefined;
			},
			getLastActivePaneCompositeId: () => activeComposite ?? '',
			getPaneComposite: () => new class extends mock<PaneCompositeDescriptor>() { }(),
			openPaneComposite: restorePane,
			hideActivePaneComposite: () => {
				paneEvents.push('hide');
				activeComposite = undefined;
			},
		});
		const panel = store.add(instantiation.createInstance(ProjectBoardChatSidePanel));
		return { panel, pane, instantiation, customView, auxiliaryBarVisible, paneEvents, active, activeSession, trust, markRead, openView, restorePane, sentiment, sentimentChanged, notifications, getActiveComposite: () => activeComposite, setActiveComposite: (id: string) => activeComposite = id, setUnderlyingAuxiliaryVisible: (visible: boolean) => underlyingAuxiliaryVisible = visible, waitForClose: () => waitForState(auxiliaryBarVisible, visible => !visible) };
	}

	test('opens the clicked child without activating its session, and marks read after render', async () => {
		const h = setup();
		const card = createCard();
		const rendered = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		h.pane.open.callsFake(() => { void started.complete(); return rendered.p; });
		const opened = h.panel.open(card, () => { });
		await started.p;
		assert.strictEqual(h.markRead.callCount, 0);
		await rendered.complete();
		await opened;
		assert.deepStrictEqual({
			target: h.pane.open.firstCall.args[0],
			active: h.activeSession.get(),
			read: h.markRead.firstCall.args[0],
			focused: h.pane.focus.callCount,
			visible: h.auxiliaryBarVisible.get(),
		}, { target: card, active: h.active, read: card.session, focused: 1, visible: true });
	});

	test('hiding and showing the auxiliary bar preserves the chat without cancellation or reopening', async () => {
		const h = setup();
		const focusCard = sinon.spy();
		await h.panel.open(createCard(), focusCard);
		const token: CancellationToken = h.pane.open.firstCall.args[1];
		h.pane.clear.resetHistory();
		const state = () => ({
			visible: h.auxiliaryBarVisible.get(),
			cancelled: token.isCancellationRequested,
			cleared: h.pane.clear.callCount,
			opens: h.pane.open.callCount,
			focusCard: focusCard.callCount,
		});
		h.auxiliaryBarVisible.set(false, undefined);
		const hidden = state();
		h.auxiliaryBarVisible.set(true, undefined);
		assert.deepStrictEqual({ hidden, shown: state() }, {
			hidden: { visible: false, cancelled: false, cleared: 0, opens: 1, focusCard: 0 },
			shown: { visible: true, cancelled: false, cleared: 0, opens: 1, focusCard: 0 },
		});
	});

	test('declining trust does not open, focus, or mark read', async () => {
		const h = setup();
		h.trust.resolves(false);
		await h.panel.open(createCard(), () => { });
		assert.deepStrictEqual([h.openView.callCount, h.markRead.callCount, h.pane.focus.callCount, h.auxiliaryBarVisible.get()], [0, 0, 0, false]);
	});

	test('close cancels a pending trust check without opening a pane', async () => {
		const h = setup();
		const trust = new DeferredPromise<boolean>();
		h.trust.returns(trust.p);
		const opened = h.panel.open(createCard(), () => { });
		h.panel.close();
		await opened;
		await trust.complete(true);
		assert.deepStrictEqual([h.openView.callCount, h.markRead.callCount], [0, 0]);
	});

	test('declining a replacement chat closes the cancelled loading surface', async () => {
		const h = setup();
		const rendering = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		h.pane.open.callsFake(() => { void started.complete(); return rendering.p; });
		const first = h.panel.open(createCard('first'), () => { });
		await started.p;
		h.trust.resolves(false);
		await h.panel.open(createCard('second'), () => { });
		await first;
		await rendering.complete();
		await h.waitForClose();
		assert.deepStrictEqual([h.markRead.callCount, h.auxiliaryBarVisible.get()], [0, false]);
	});

	test('rapid switching cancels the earlier render and reads only the latest child', async () => {
		const h = setup();
		const firstRendering = new DeferredPromise<void>();
		const firstStarted = new DeferredPromise<void>();
		h.pane.open.onFirstCall().callsFake(() => { void firstStarted.complete(); return firstRendering.p; });
		const first = h.panel.open(createCard('first'), () => { });
		await firstStarted.p;
		const secondCard = createCard('second');
		await h.panel.open(secondCard, () => { });
		await first;
		await firstRendering.complete();
		assert.deepStrictEqual({
			cancelled: (h.pane.open.firstCall.args[1] as CancellationToken).isCancellationRequested,
			reads: h.markRead.getCalls().map(call => call.args[0]),
			focusCount: h.pane.focus.callCount,
		}, { cancelled: true, reads: [secondCard.session], focusCount: 1 });
	});

	test('close restores the previous composite and calls the card focus restorer once', async () => {
		const h = setup();
		const focusCard = sinon.spy();
		await h.panel.open(createCard(), focusCard);
		h.panel.close();
		h.panel.close();
		await h.waitForClose();
		assert.deepStrictEqual({
			clearCount: h.pane.clear.callCount,
			restored: h.restorePane.firstCall.args,
			visible: h.auxiliaryBarVisible.get(),
			focusCount: focusCard.callCount,
		}, { clearCount: 1, restored: ['previous-pane', ViewContainerLocation.AuxiliaryBar, false], visible: false, focusCount: 1 });
	});

	test('opens before requesting visibility and restores before hiding the transient pane', async () => {
		const h = setup();
		await h.panel.open(createCard(), () => { });
		h.panel.close();
		await h.waitForClose();
		assert.deepStrictEqual(h.paneEvents, ['open', 'visible:true', 'restore', 'visible:false']);
	});

	test('restoration that shows the covered composite cannot leave the transient pane open', async () => {
		const h = setup();
		await h.panel.open(createCard(), () => { });
		const restoring = new DeferredPromise<void>();
		h.restorePane.callsFake(async () => {
			await restoring.p;
			h.auxiliaryBarVisible.set(true, undefined);
		});
		h.panel.close();
		await restoring.complete();
		await h.waitForClose();
		assert.strictEqual(h.auxiliaryBarVisible.get(), false);
	});

	test('closing while the pane opens restores after the late open completes', async () => {
		const h = setup();
		const opening = new DeferredPromise<ProjectBoardChatViewPane>();
		const started = new DeferredPromise<void>();
		h.openView.callsFake(async () => {
			void started.complete();
			const pane = await opening.p;
			h.setActiveComposite(PROJECT_BOARD_CHAT_CONTAINER_ID);
			return pane;
		});
		const opened = h.panel.open(createCard(), () => { });
		await started.p;
		h.panel.close();
		await opening.complete(h.pane);
		await opened;
		await h.waitForClose();
		assert.deepStrictEqual([h.pane.open.callCount, h.markRead.callCount, h.auxiliaryBarVisible.get(), h.restorePane.callCount], [0, 0, false, 1]);
	});

	test('restoration does not replace a different pane the user selected', async () => {
		const h = setup();
		await h.panel.open(createCard(), () => { });
		h.setActiveComposite('user-selected-pane');
		h.panel.close();
		await Promise.resolve();
		assert.deepStrictEqual([h.restorePane.callCount, h.auxiliaryBarVisible.get()], [0, true]);
	});

	test('dispose cancels loading, closes once, and prevents subsequent opens', async () => {
		const h = setup();
		const focusCard = sinon.spy();
		await h.panel.open(createCard(), focusCard);
		h.panel.dispose();
		h.panel.dispose();
		await assert.rejects(h.panel.open(createCard(), focusCard), /embedded Kanban/);
		await h.waitForClose();
		assert.deepStrictEqual([focusCard.callCount, h.pane.clear.callCount, h.auxiliaryBarVisible.get()], [0, 1, false]);
	});

	test('leaving Kanban does not restore focus into the outgoing board', async () => {
		const h = setup();
		const focusCard = sinon.spy();
		await h.panel.open(createCard(), focusCard);
		h.customView.set(undefined, undefined);
		assert.deepStrictEqual([focusCard.callCount, h.pane.clear.callCount], [0, 1]);
	});

	test('leaving Kanban skips queued composite restoration instead of reopening main-session parts', async () => {
		const h = setup();
		await h.panel.open(createCard(), () => { });
		h.panel.close();
		h.customView.set(undefined, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({ restored: h.restorePane.callCount, events: h.paneEvents, activeComposite: h.getActiveComposite() }, { restored: 0, events: ['open', 'visible:true', 'hide'], activeComposite: undefined });
	});

	test('leaving Kanban restores the exact previous composite when underlying auxiliary content is already visible', async () => {
		const h = setup();
		h.setUnderlyingAuxiliaryVisible(true);
		await h.panel.open(createCard(), () => { });
		h.customView.set(undefined, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({
			restored: h.restorePane.firstCall.args,
			events: h.paneEvents,
		}, {
			restored: ['previous-pane', ViewContainerLocation.AuxiliaryBar, false],
			events: ['open', 'visible:true', 'restore'],
		});
	});

	test('replacing Kanban does not restore over another custom view even when underlying auxiliary content is visible', async () => {
		const h = setup();
		h.setUnderlyingAuxiliaryVisible(true);
		await h.panel.open(createCard(), () => { });
		h.customView.set(new class extends mock<ICustomViewDescriptor>() {
			override readonly id = 'another-custom-view';
		}(), undefined);
		await Promise.resolve();
		assert.deepStrictEqual({ restored: h.restorePane.callCount, events: h.paneEvents, visible: h.auxiliaryBarVisible.get() }, {
			restored: 0, events: ['open', 'visible:true', 'hide'], visible: false,
		});
	});

	test('closing an unfocused chat preserves focus in the current destination', async () => {
		const h = setup();
		const focusCard = sinon.spy();
		await h.panel.open(createCard(), focusCard);
		h.pane.hasChatFocus.returns(false);
		h.panel.close();
		await h.waitForClose();
		assert.deepStrictEqual([focusCard.callCount, h.pane.clear.callCount, h.auxiliaryBarVisible.get()], [0, 1, false]);
	});

	test('load failure is explicit, restores the pane, and never marks read', async () => {
		const h = setup();
		h.pane.open.rejects(new Error('load failed'));
		await assert.rejects(h.panel.open(createCard(), () => { }), /load failed/);
		await h.waitForClose();
		assert.deepStrictEqual([h.markRead.callCount, h.pane.clear.callCount, h.auxiliaryBarVisible.get()], [0, 1, false]);
	});

	test('leaving Kanban and disabling AI close the host', async () => {
		const h = setup();
		await h.panel.open(createCard(), () => { });
		h.customView.set(undefined, undefined);
		await assert.rejects(h.panel.open(createCard(), () => { }), /embedded Kanban/);
		assert.deepStrictEqual([h.pane.clear.callCount, h.auxiliaryBarVisible.get()], [1, false]);

		const other = setup();
		await other.panel.open(createCard(), () => { });
		other.sentiment.hidden = true;
		other.sentimentChanged.fire();
		await assert.rejects(other.panel.open(createCard(), () => { }), /AI features/);
		await other.waitForClose();
		assert.deepStrictEqual([other.pane.clear.callCount, other.auxiliaryBarVisible.get()], [1, false]);
	});
});

suite('ProjectBoardChatContent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function setup() {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IHoverService, { setupDelayedHover: () => ({ dispose() { } }) });
		instantiation.stubInstance(WorkbenchToolBar, { setActions() { }, dispose() { } });
		const widget = new class extends mock<ChatWidget>() {
			override render(): void { }
			override setReadOnly = sinon.spy();
			override setLoading = sinon.spy();
			override setVisible = sinon.spy();
			override getInput(): string { return ''; }
			override getInputState = sinon.stub().returns(undefined);
			override setModel = sinon.spy();
			override restoreViewState = sinon.spy();
			override getViewState(): IChatWidgetViewState { return { scrollTop: 42, isAtBottom: false }; }
			override layout(): void { }
			override lockToCodingAgent = sinon.spy();
			override dispose = sinon.spy();
		}();
		instantiation.stubInstance(ChatWidget, widget);
		instantiation.stub(IChatSessionsService, { canResolveChatSession: async () => true, getChatSessionContribution: () => undefined });
		const load = sinon.stub();
		instantiation.stub(IChatService, { acquireOrLoadSession: load });
		const child = sinon.spy(instantiation, 'createChild');
		const card = createCard();
		const cache = new LRUCache<string, IChatWidgetViewState>(10);
		const pendingInputs = new LRUCache<string, IChatModelInputState>(10);
		const content = store.add(instantiation.createInstance(ProjectBoardChatContent, card, cache, pendingInputs, () => { }));
		const inputState = observableValue<IChatModelInputState | undefined>('inputState', undefined);
		const setInputState = sinon.spy((state: IChatModelInputState) => inputState.set(state, undefined));
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = card.chat.resource;
			override readonly inputModel = new class extends mock<IInputModel>() {
				override readonly state = inputState;
				override setState = setInputState;
			}();
		}();
		const released = sinon.spy();
		const ref: IChatModelReference = { object: model, dispose: released };
		load.resolves(ref);
		return { instantiation, content, card, widget, child, cache, pendingInputs, load, ref, released, setInputState, inputState };
	}

	test('input pickers receive an independent active-session facade for the exact child', () => {
		const h = setup();
		const scoped = h.child.firstCall.returnValue;
		const session = scoped.get(ISessionContext).session.get()!;
		assert.deepStrictEqual({
			resource: session.resource,
			chat: session.activeChat.get(),
			model: session.modelId.get(),
			mode: session.mode.get(),
			contextSession: scoped.get(IContextKeyService).getContextKeyValue('sessionId'),
		}, {
			resource: h.card.session.resource,
			chat: h.card.chat,
			model: h.card.chat.modelId.get(),
			mode: h.card.chat.mode.get(),
			contextSession: h.card.session.sessionId,
		});

	});

	test('binds the exact model, reflects read-only state, and releases only its reference', async () => {
		const h = setup();
		await h.content.load(CancellationToken.None);
		h.content.dispose();
		assert.deepStrictEqual({
			loaded: h.load.firstCall.args[0],
			bound: h.widget.setModel.firstCall.args[0],
			readOnly: h.widget.setReadOnly.firstCall.args[0],
			released: h.released.callCount,
			unboundBeforeRelease: h.widget.setModel.getCall(1).args[0] === undefined && h.widget.setModel.getCall(1).calledBefore(h.released.firstCall),
			cacheSize: h.cache.size,
		}, { loaded: h.card.chat.resource, bound: h.ref.object, readOnly: false, released: 1, unboundBeforeRelease: true, cacheSize: 1 });
	});

	test('late cancelled loads release their reference without binding a disposed widget', async () => {
		const h = setup();
		const deferred = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		h.load.callsFake(() => { void started.complete(); return deferred.p; });
		const cts = store.add(new CancellationTokenSource());
		const loading = h.content.load(cts.token);
		await started.p;
		cts.cancel();
		h.content.dispose();
		await deferred.complete(h.ref);
		await loading;
		assert.deepStrictEqual([h.released.callCount, h.widget.setModel.callCount], [1, 0]);
	});

	test('input typed before a model binds survives hiding and reopening the child', async () => {
		const h = setup();
		const draft: IChatModelInputState = {
			inputText: 'unsent child draft', attachments: [], selections: [],
			mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, contrib: {},
		};
		h.widget.getInputState.returns(draft);
		h.content.dispose();
		const reopened = store.add(h.instantiation.createInstance(ProjectBoardChatContent, h.card, h.cache, h.pendingInputs, () => { }));
		await reopened.load(CancellationToken.None);
		assert.deepStrictEqual({ restored: h.setInputState.firstCall.args[0], pending: h.pendingInputs.size }, { restored: draft, pending: 0 });
	});

	test('a draft already persisted on the model wins over a stale loading draft', async () => {
		const h = setup();
		const draft: IChatModelInputState = {
			inputText: 'loading draft', attachments: [], selections: [],
			mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, contrib: {},
		};
		h.widget.getInputState.returns(draft);
		h.content.dispose();
		const persistedDraft = { ...draft, inputText: 'newer draft from another view' };
		h.inputState.set(persistedDraft, undefined);
		const reopened = store.add(h.instantiation.createInstance(ProjectBoardChatContent, h.card, h.cache, h.pendingInputs, () => { }));
		await reopened.load(CancellationToken.None);
		assert.deepStrictEqual({ persisted: h.inputState.get(), overwrites: h.setInputState.callCount }, { persisted: persistedDraft, overwrites: 0 });
	});

	test('missing and mismatched chat models fail rather than rendering another chat', async () => {
		const h = setup();
		h.load.resolves(undefined);
		await assert.rejects(h.content.load(CancellationToken.None), /could not be loaded/);
		const wrong = {
			object: new class extends mock<IChatModel>() {
				override readonly sessionResource = URI.parse('test-chat:wrong');
			}(), dispose: sinon.spy()
		};
		h.load.resolves(wrong);
		await assert.rejects(h.content.load(CancellationToken.None), /changed while it was loading/);
		assert.deepStrictEqual([h.widget.setModel.callCount, wrong.dispose.callCount], [0, 1]);
	});
});

suite('ProjectBoardChatViewPane', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the base pane body while laying out its nested chat container', () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.AuxiliaryBar,
		});
		class TestChatPane extends ProjectBoardChatViewPane {
			protected override renderHeader(): void { }
		}
		const pane = store.add(instantiation.createInstance<TestChatPane>(new SyncDescriptor(TestChatPane, [{ id: 'test-kanban-chat', title: 'Kanban Chat' }])));
		pane.render();
		pane.headerVisible = false;
		pane.setVisible(true);
		pane.orthogonalSize = 640;
		pane.layout(480);
		const body = pane.element.querySelector<HTMLElement>(':scope > .pane-body');
		const chat = body?.querySelector<HTMLElement>(':scope > .project-board-chat-pane');
		assert.deepStrictEqual({
			baseBodyIsWide: body?.classList.contains('wide'),
			chatIsWide: chat?.classList.contains('wide'),
			chatWidth: chat?.style.width,
			chatHeight: chat?.style.height,
		}, { baseBodyIsWide: true, chatIsWide: false, chatWidth: '640px', chatHeight: '480px' });
	});
});
