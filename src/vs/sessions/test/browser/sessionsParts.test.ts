/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Direction } from '../../../base/browser/ui/grid/grid.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { mock } from '../../../base/test/common/mock.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { AbstractChatView, IChatViewOptions, IChatViewTransferState } from '../../browser/parts/chatView.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { createTestActiveSession } from './sessionViewTestUtils.js';
import { createSessionWindowsTestHarness } from './sessionWindowsTestUtils.js';
import { mainWindow } from '../../../base/browser/window.js';
import { waitForState } from '../../../base/common/observable.js';
import { ContextKeyValue, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { AuxiliaryBarFocusContext, EditorAreaFocusContext, FocusedViewContext, IsAuxiliaryWindowContext, PanelFocusContext, PanelVisibleContext, SideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { CustomViewVisibleContext, IsNewChatSessionContext, MultipleSessionsVisibleContext, SessionIdContext, SessionIsMaximizedContext, SessionsAuxiliaryWindowContext, SessionsAuxiliaryWindowFocusedContext, SessionsFocusContext, SessionsVisibleContext, SessionWorkspacePickerVisibleContext } from '../../common/contextkeys.js';
import { setActiveSessionContextKeys } from '../../services/sessions/common/sessionContextKeys.js';

function contextValue<T extends ContextKeyValue>(service: IContextKeyService, key: RawContextKey<T>, element?: HTMLElement): T | undefined {
	return element ? service.getContext(element).getValue<T>(key.key) : service.getContextKeyValue<T>(key.key);
}

suite('Sessions - Auxiliary Parts', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('part and session contexts are local while global grid keys follow the focused window', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const main = createTestActiveSession('main-session');
		const draft = createTestActiveSession('draft', false);
		const a = createTestActiveSession('a');
		const b = createTestActiveSession('b');
		const c = createTestActiveSession('c');
		const global = createTestActiveSession('shared-tools');
		setActiveSessionContextKeys(global, h.contextKeyService, undefined);
		h.parts.updateVisibleSessions([main, draft], draft, [{ id: 'main' }, { id: 'draft' }]);
		h.chatViews.find(view => view.kind === 'newSession')!.inputPickerVisibility.setVisible('workspace', true);
		const first = await h.parts.createAuxiliaryPart(undefined, 'first');
		h.parts.updateVisibleSessions([a, b], a, [{ id: 'a' }, { id: 'b' }], undefined, first.partId);
		const second = await h.parts.createAuxiliaryPart(undefined, 'second');
		h.parts.updateVisibleSessions([c], c, [{ id: 'c' }], undefined, second.partId);
		const snapshot = () => ({
			globalSession: contextValue(h.contextKeyService, SessionIdContext),
			globalMultiple: contextValue(h.contextKeyService, MultipleSessionsVisibleContext),
			globalPicker: contextValue(h.contextKeyService, SessionWorkspacePickerVisibleContext),
			globalAuxiliary: contextValue(h.contextKeyService, SessionsAuxiliaryWindowFocusedContext),
			globalMaximized: contextValue(h.contextKeyService, SessionIsMaximizedContext),
		});
		const initial = snapshot();
		h.hostService.setActiveWindow(h.windows[1].window.vscodeWindowId);
		first.toggleMaximizeSession('a');
		const inactiveMaximize = snapshot();
		h.hostService.setActiveWindow(h.windows[0].window.vscodeWindowId);
		const firstFocused = snapshot();
		h.hostService.setActiveWindow(mainWindow.vscodeWindowId);
		const mainFocused = snapshot();
		assert.deepStrictEqual({
			initial, inactiveMaximize, firstFocused, mainFocused,
			parts: [h.main, first, second].map(part => ({
				session: contextValue(h.contextKeyService, SessionIdContext, part.getContainer()),
				multiple: contextValue(h.contextKeyService, MultipleSessionsVisibleContext, part.getContainer()),
				picker: contextValue(h.contextKeyService, SessionWorkspacePickerVisibleContext, part.getContainer()),
			})),
			mainIsNew: contextValue(h.contextKeyService, IsNewChatSessionContext, h.main.getSessionView(main.sessionId)!.element),
			draftIsNew: contextValue(h.contextKeyService, IsNewChatSessionContext, h.main.getSessionView(draft.sessionId)!.element),
			globalIsNew: contextValue(h.contextKeyService, IsNewChatSessionContext),
		}, {
			initial: {
				globalSession: 'shared-tools', globalMultiple: true, globalPicker: true, globalAuxiliary: false, globalMaximized: false,
			},
			inactiveMaximize: {
				globalSession: 'shared-tools', globalMultiple: false, globalPicker: false, globalAuxiliary: true, globalMaximized: false,
			},
			firstFocused: {
				globalSession: 'shared-tools', globalMultiple: true, globalPicker: false, globalAuxiliary: true, globalMaximized: true,
			},
			mainFocused: {
				globalSession: 'shared-tools', globalMultiple: true, globalPicker: true, globalAuxiliary: false, globalMaximized: false,
			},
			parts: [
				{ session: 'draft', multiple: true, picker: true },
				{ session: 'a', multiple: true, picker: false },
				{ session: 'c', multiple: false, picker: false },
			],
			mainIsNew: false, draftIsNew: true, globalIsNew: false,
		});
	});

	test('auxiliary chrome masks absent main surfaces without changing their global state', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const mainOnlyKeys = [CustomViewVisibleContext, EditorAreaFocusContext, AuxiliaryBarFocusContext, PanelFocusContext, SideBarVisibleContext, PanelVisibleContext];
		for (const key of mainOnlyKeys) {
			key.bindTo(h.contextKeyService).set(true);
		}
		FocusedViewContext.bindTo(h.contextKeyService).set('main-view');
		const main = createTestActiveSession('main-session');
		const auxiliarySession = createTestActiveSession('auxiliary-session');
		setActiveSessionContextKeys(main, h.contextKeyService, undefined);
		h.parts.updateVisibleSessions([main], main);
		const auxiliary = await h.parts.createAuxiliaryPart(undefined, 'auxiliary');
		h.parts.updateVisibleSessions([auxiliarySession], auxiliarySession, undefined, undefined, auxiliary.partId);
		const root = h.windows[0].container;
		const input = h.chatViews.find(view => view.chat === auxiliarySession.mainChat.get())!.input;
		const check = (element?: HTMLElement) => ({
			session: contextValue(h.contextKeyService, SessionIdContext, element),
			mainOnly: mainOnlyKeys.map(key => contextValue(h.contextKeyService, key, element)),
			focusedView: contextValue(h.contextKeyService, FocusedViewContext, element),
		});
		assert.deepStrictEqual({
			global: check(), chrome: check(root), input: check(input),
			auxiliaryFlags: [IsAuxiliaryWindowContext, SessionsAuxiliaryWindowContext, SessionsVisibleContext].map(key => contextValue(h.contextKeyService, key, root)),
		}, {
			global: { session: 'main-session', mainOnly: [true, true, true, true, true, true], focusedView: 'main-view' },
			chrome: { session: 'auxiliary-session', mainOnly: [false, false, false, false, false, false], focusedView: '' },
			input: { session: 'auxiliary-session', mainOnly: [false, false, false, false, false, false], focusedView: '' },
			auxiliaryFlags: [true, true, true],
		});
	});

	test('late focus changes from a background part cannot reset the active window context', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const main = createTestActiveSession('main-session');
		const a = createTestActiveSession('a');
		h.parts.updateVisibleSessions([main], main);
		const auxiliary = await h.parts.createAuxiliaryPart(undefined, 'auxiliary');
		h.parts.updateVisibleSessions([a], a, undefined, undefined, auxiliary.partId);
		const mainInput = h.chatViews.find(view => view.chat === main.mainChat.get())!.input;
		const auxiliaryInput = h.chatViews.find(view => view.chat === a.mainChat.get())!.input;
		mainInput.dispatchEvent(new FocusEvent('focus'));
		auxiliaryInput.dispatchEvent(new FocusEvent('focus'));
		h.hostService.setActiveWindow(h.windows[0].window.vscodeWindowId);
		mainInput.dispatchEvent(new FocusEvent('blur'));
		await waitForState(h.main.context, state => !state.focused);
		const focused = contextValue(h.contextKeyService, SessionsFocusContext);
		h.main.setContentVisible(false);
		const visible = contextValue(h.contextKeyService, SessionsVisibleContext);
		h.parts.closeAuxiliaryPart(auxiliary.partId);
		assert.deepStrictEqual({
			focused, visible,
			auxiliaryAfterClose: contextValue(h.contextKeyService, SessionsAuxiliaryWindowFocusedContext),
			focusAfterClose: contextValue(h.contextKeyService, SessionsFocusContext),
			visibleAfterClose: contextValue(h.contextKeyService, SessionsVisibleContext),
		}, { focused: true, visible: true, auxiliaryAfterClose: false, focusAfterClose: false, visibleAfterClose: false });
	});

	test('reconstructs transferred views in the destination document and retains unaffected views', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const a = createTestActiveSession('a');
		const b = createTestActiveSession('b');
		h.parts.updateVisibleSessions([a, b], a, [{ id: 'a' }, { id: 'b' }]);
		const originalA = h.main.getSessionView('a');
		const originalB = h.main.getSessionView('b');
		const input = h.chatViews.find(view => view.chat === a.mainChat.get())!;
		input.input.value = 'unsent reply';
		const auxiliary = await h.parts.createAuxiliaryPart(undefined, 'auxiliary');
		let committed = false;
		h.parts.transferSessions([a], auxiliary.partId, () => {
			committed = true;
			h.parts.updateVisibleSessions([b], b, [{ id: 'b' }]);
			h.parts.updateVisibleSessions([a], a, [{ id: 'a' }], undefined, auxiliary.partId);
		});
		const replacement = h.chatViews.find(view => !view.disposed && view.chat === a.mainChat.get())!;
		assert.deepStrictEqual({
			committed,
			widgetRecreated: auxiliary.getSessionView('a') !== originalA,
			unaffectedRetained: h.main.getSessionView('b') === originalB,
			sourceDisposed: input.disposed,
			draft: replacement.input.value,
			destinationDocument: replacement.createdWindow.document === auxiliary.getContainer()?.ownerDocument,
			windowLookup: h.parts.getPartForWindow(replacement.createdWindow) === auxiliary,
		}, {
			committed: true, widgetRecreated: true, unaffectedRetained: true, sourceDisposed: true,
			draft: 'unsent reply', destinationDocument: true, windowLookup: true,
		});
	});

	test('failed destination rendering reconstructs the source with its state and geometry', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const a = createTestActiveSession('a');
		const b = createTestActiveSession('b');
		h.parts.updateVisibleSessions([a, b], a, [{ id: 'a' }, { id: 'b' }]);
		h.main.resizeSession('a', Direction.Left, 100);
		const layout = h.main.getGridLayout();
		const input = h.chatViews.find(view => view.chat === a.mainChat.get())!;
		input.input.value = 'keep on failure';
		const auxiliary = await h.parts.createAuxiliaryPart(undefined, 'auxiliary');
		const original = h.instantiationService.get(IChatViewFactory);
		h.instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
			override createChatView(parent: HTMLElement, instantiationService?: IInstantiationService, state?: IChatViewTransferState): AbstractChatView {
				if (parent.ownerDocument === auxiliary.getContainer()?.ownerDocument) {
					throw new Error('Rendering failed');
				}
				return original.createChatView(parent, instantiationService, state);
			}
			override createNewChatView(parent: HTMLElement, peer: boolean, options: IChatViewOptions, instantiationService?: IInstantiationService, state?: IChatViewTransferState): AbstractChatView {
				return original.createNewChatView(parent, peer, options, instantiationService, state);
			}
		}());
		let committed = false;
		assert.throws(() => h.parts.transferSessions([a], auxiliary.partId, () => committed = true), /Rendering failed/);
		const restored = h.chatViews.find(view => !view.disposed && view.chat === a.mainChat.get());
		assert.deepStrictEqual({
			committed, input: restored?.input.value, layout: h.main.getGridLayout(),
			main: !!h.main.getSessionView('a'), auxiliary: !!auxiliary.getSessionView('a'),
		}, { committed: false, input: 'keep on failure', layout, main: true, auxiliary: false });
	});

	test('closing a host invokes synchronous recovery before disposing the part', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const a = createTestActiveSession('a');
		const auxiliary = await h.parts.createAuxiliaryPart(undefined, 'auxiliary');
		h.parts.updateVisibleSessions([a], a, [{ id: 'a' }], undefined, auxiliary.partId);
		let sourceAvailableDuringClose = false;
		h.parts.setAuxiliaryWindowCloseHandler(id => {
			sourceAvailableDuringClose = !!h.parts.getPart(id)?.getSessionView('a');
			h.parts.transferSessions([a], 'main', () => h.parts.updateVisibleSessions([a], a, [{ id: 'a' }]));
		});
		h.parts.closeAuxiliaryPart(auxiliary.partId);
		assert.deepStrictEqual({
			sourceAvailableDuringClose,
			remaining: h.parts.getParts().map(part => part.partId),
			returned: !!h.main.getSessionView('a'),
			windowClosed: h.windows[0].window.closed,
		}, { sourceAvailableDuringClose: true, remaining: ['main'], returned: true, windowClosed: true });
	});

	test('unfinished request edits veto movement and auxiliary closure before retiring views', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const a = createTestActiveSession('a');
		const auxiliary = await h.parts.createAuxiliaryPart(undefined, 'auxiliary');
		h.parts.updateVisibleSessions([a], a, [{ id: 'a' }], undefined, auxiliary.partId);
		const view = auxiliary.getSessionView('a');
		const chat = h.chatViews.find(view => view.chat === a.mainChat.get())!;
		chat.input.value = 'unfinished request edit';
		chat.transferVeto = 'Finish editing first';
		let committed = false;
		assert.throws(() => h.parts.transferSessions([a], 'main', () => committed = true), /Finish editing first/);
		h.parts.closeAuxiliaryPart(auxiliary.partId);
		assert.deepStrictEqual({
			committed,
			sourceRetained: auxiliary.getSessionView('a') === view,
			input: chat.input.value,
			disposed: chat.disposed,
			closed: h.windows[0].window.closed,
		}, { committed: false, sourceRetained: true, input: 'unfinished request edit', disposed: false, closed: false });
	});

	test('window creation failure does not change the main part', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		const a = createTestActiveSession('a');
		h.parts.updateVisibleSessions([a], a, [{ id: 'a' }]);
		const view = h.main.getSessionView('a');
		h.failOpen(new Error('Popup blocked'));
		await assert.rejects(h.parts.createAuxiliaryPart(), /Popup blocked/);
		assert.deepStrictEqual({
			parts: h.parts.getParts().map(part => part.partId), sameView: h.main.getSessionView('a') === view,
		}, { parts: ['main'], sameView: true });
	});

	test('disposing the owner closes auxiliary hosts without running user-close recovery', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		await h.parts.createAuxiliaryPart();
		let recovered = false;
		h.parts.setAuxiliaryWindowCloseHandler(() => recovered = true);
		h.parts.dispose();
		assert.deepStrictEqual({ recovered, closed: h.windows[0].window.closed }, { recovered: false, closed: true });
	});

	test('renderer shutdown closes every auxiliary even when the part registry stays alive', async () => {
		const h = createSessionWindowsTestHarness(disposables.add(new DisposableStore()));
		await h.parts.createAuxiliaryPart();
		await h.parts.createAuxiliaryPart();
		let recovered = false;
		h.parts.setAuxiliaryWindowCloseHandler(() => recovered = true);
		h.lifecycle.willShutdown = true;
		h.shutdown.fire();
		assert.deepStrictEqual({ recovered, closed: h.windows.map(window => window.window.closed), parts: h.parts.getParts().map(part => part.partId) }, {
			recovered: false, closed: [true, true], parts: ['main'],
		});
	});
});
