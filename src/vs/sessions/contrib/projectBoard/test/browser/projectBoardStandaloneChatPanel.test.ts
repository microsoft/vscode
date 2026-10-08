/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { ProjectBoardChatContent } from '../../browser/projectBoardChatSidePanel.js';
import { ProjectBoardStandaloneChatPanel, ProjectBoardStandaloneChatState } from '../../browser/projectBoardStandaloneChatPanel.js';
import { getProjectBoardCardId } from '../../common/projectBoardModel.js';

suite('ProjectBoardStandaloneChatPanel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function setup() {
		const instantiation = workbenchInstantiationService(undefined, store);
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const documentFocus = sinon.stub(container.ownerDocument, 'hasFocus').returns(true);
		const session = createTestSession('Standalone target').session;
		const card = { session, chat: { ...session.mainChat.get(), title: constObservable('Standalone target') } };
		const trust = sinon.stub().resolves(true);
		const markRead = sinon.stub().resolves();
		const notify = sinon.spy();
		const entitlementChanged = store.add(new Emitter<void>());
		const sentiment = { hidden: false };
		instantiation.stub(ISessionsService, { canOpenSession: trust });
		instantiation.stub(ISessionsManagementService, { markRead });
		instantiation.stub(IChatEntitlementService, { sentiment, onDidChangeSentiment: entitlementChanged.event });
		instantiation.stub(INotificationService, { error: notify });
		instantiation.stubInstance(WorkbenchToolBar, { setActions() { }, dispose() { } });
		const cardId = observableValue<string | undefined>('cardId', getProjectBoardCardId(session, card.chat));
		const loaded = sinon.stub().returns(false);
		const load = sinon.stub().callsFake(async (_token: CancellationToken) => { loaded.returns(true); });
		const fake = new class extends mock<ProjectBoardChatContent>() {
			override readonly element = container.ownerDocument.createElement('div');
			override readonly cardId = cardId;
			override load = load;
			override setVisible = sinon.spy();
			override layout = sinon.spy();
			override focus = sinon.spy();
			override hasLoadedModel = loaded;
			override dispose = sinon.spy(() => { loaded.returns(false); this.element.remove(); });
		}();
		instantiation.stubInstance(ProjectBoardChatContent, fake);
		const created = sinon.spy(instantiation, 'createInstance');
		const state = new ProjectBoardStandaloneChatState();
		const panel = store.add(instantiation.createInstance(ProjectBoardStandaloneChatPanel, container, state));
		panel.layout(480, 640);
		const close = sinon.spy();
		const widgetConstructions = () => created.getCalls().filter(call => call.args[0] === ProjectBoardChatContent);
		return { panel, container, card, trust, markRead, notify, documentFocus, sentiment, entitlementChanged, fake, load, loaded, cardId, close, widgetConstructions, state, instantiation };
	}

	test('shows native loading synchronously in its own host and constructs no content before trust', async () => {
		const h = setup();
		const trusted = new DeferredPromise<boolean>();
		h.trust.returns(trusted.p);
		const opening = h.panel.open(h.card, h.close);
		assert.deepStrictEqual({
			title: h.container.querySelector('.project-board-chat-title')?.textContent,
			loading: h.container.querySelector('.project-board-chat-loading')?.textContent,
			visible: h.panel.visible.get(), constructions: h.widgetConstructions().length, current: h.panel.activeCardId.get(),
		}, { title: h.card.chat.title.get(), loading: 'Loading...', visible: true, constructions: 0, current: undefined });
		await trusted.complete(true);
		await opening;
		assert.strictEqual(h.widgetConstructions()[0].args[1].container, h.container);
		assert.strictEqual(h.fake.element.parentElement, h.container);
		assert.deepStrictEqual(h.markRead.firstCall.args, [h.card.session]);
		assert.strictEqual(h.panel.activeCardId.get(), getProjectBoardCardId(h.card.session, h.card.chat));
	});

	test('denied trust hides its own loading surface without acquiring a model', async () => {
		const h = setup();
		h.trust.resolves(false);
		await h.panel.open(h.card, h.close);
		assert.deepStrictEqual({ visible: h.panel.visible.get(), constructions: h.widgetConstructions().length, reads: h.markRead.callCount, closes: h.close.callCount }, {
			visible: false, constructions: 0, reads: 0, closes: 1,
		});
	});

	test('closing or disposing while trust is pending cancels promptly and does not reopen the pane', async () => {
		for (const dispose of [false, true]) {
			const h = setup();
			const trusted = new DeferredPromise<boolean>();
			h.trust.returns(trusted.p);
			const opening = h.panel.open(h.card, h.close);
			if (dispose) { h.panel.dispose(); } else { h.panel.close(); }
			await opening;
			await trusted.complete(true);
			await timeout(0);
			assert.deepStrictEqual({ visible: h.panel.visible.get(), constructions: h.widgetConstructions().length, reads: h.markRead.callCount }, { visible: false, constructions: 0, reads: 0 });
			h.documentFocus.restore();
		}
	});

	test('loaded exact-chat reuse preserves content and view state without loading again', async () => {
		const h = setup();
		await h.panel.open(h.card, h.close);
		await h.panel.open(h.card, h.close);
		assert.deepStrictEqual({ constructions: h.widgetConstructions().length, loads: h.load.callCount, disposals: h.fake.dispose.callCount, focuses: h.fake.focus.callCount }, {
			constructions: 1, loads: 1, disposals: 0, focuses: 2,
		});
		h.panel.close();
		assert.deepStrictEqual({ closes: h.close.callCount, disposals: h.fake.dispose.callCount, current: h.panel.activeCardId.get(), visible: h.panel.visible.get() }, {
			closes: 1, disposals: 1, current: undefined, visible: false,
		});
	});

	test('a late model load does not steal focus or mark read after its auxiliary document loses focus', async () => {
		const h = setup();
		const model = new DeferredPromise<void>();
		h.load.callsFake(async () => { await model.p; h.loaded.returns(true); });
		const opening = h.panel.open(h.card, h.close);
		while (!h.load.called) { await timeout(0); }
		h.documentFocus.returns(false);
		await model.complete();
		await opening;
		assert.deepStrictEqual({ focuses: h.fake.focus.callCount, reads: h.markRead.callCount }, { focuses: 0, reads: 0 });
	});

	test('provider failure hides the pane and remains retryable without a standalone-window fallback', async () => {
		const h = setup();
		h.load.rejects(new Error('Provider failed'));
		await assert.rejects(h.panel.open(h.card, h.close), /Provider failed/);
		assert.strictEqual(h.panel.visible.get(), false);
		assert.strictEqual(h.markRead.callCount, 0);
		h.load.callsFake(async () => { h.loaded.returns(true); });
		await h.panel.open(h.card, h.close);
		assert.strictEqual(h.widgetConstructions().length, 2);
		assert.strictEqual(h.panel.activeCardId.get(), getProjectBoardCardId(h.card.session, h.card.chat));
	});

	test('newer card requests cancel stale trust and only bind the latest exact target', async () => {
		const h = setup();
		const oldTrust = new DeferredPromise<boolean>();
		h.trust.onFirstCall().returns(oldTrust.p);
		const first = h.panel.open(h.card, h.close);
		const nextSession = createTestSession('Latest target').session;
		const next = { session: nextSession, chat: { ...nextSession.mainChat.get(), title: constObservable('Latest target') } };
		h.cardId.set(getProjectBoardCardId(next.session, next.chat), undefined);
		const second = h.panel.open(next, h.close);
		await second;
		await oldTrust.complete(true);
		await first;
		assert.deepStrictEqual({ created: h.widgetConstructions().length, current: h.panel.activeCardId.get(), closeCallbacks: h.close.callCount, readTarget: h.markRead.lastCall.args[0] }, {
			created: 1, current: getProjectBoardCardId(next.session, next.chat), closeCallbacks: 0, readTarget: next.session,
		});
	});

	test('disabling AI closes only this owner-local pane without restoring background focus', async () => {
		const h = setup();
		await h.panel.open(h.card, h.close);
		h.sentiment.hidden = true;
		h.entitlementChanged.fire();
		assert.deepStrictEqual({ visible: h.panel.visible.get(), closes: h.close.callCount, disposed: h.fake.dispose.callCount }, { visible: false, closes: 0, disposed: 1 });
		await assert.rejects(h.panel.open(h.card, h.close), /not available/);
	});

	test('read-state errors are explicit without losing the already loaded pane', async () => {
		const h = setup();
		h.markRead.rejects(new Error('Read failed'));
		await h.panel.open(h.card, h.close);
		assert.deepStrictEqual({ visible: h.panel.visible.get(), notifications: h.notify.callCount }, { visible: true, notifications: 1 });
	});

	test('closing the owner retains bounded input and view-state caches for the next board-window instance', async () => {
		const h = setup();
		await h.panel.open(h.card, h.close);
		h.panel.dispose();
		const recreated = store.add(h.instantiation.createInstance(ProjectBoardStandaloneChatPanel, h.container, h.state));
		await recreated.open(h.card, h.close);
		const last = h.widgetConstructions().at(-1)!;
		assert.strictEqual(last.args[2], h.state.viewStates);
		assert.strictEqual(last.args[3], h.state.pendingInputs);
	});
});
