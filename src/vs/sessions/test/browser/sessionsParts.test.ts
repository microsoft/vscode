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

suite('Sessions - Auxiliary Parts', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
