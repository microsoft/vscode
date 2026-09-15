/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { readSessionWorkSummary } from '../../../../services/sessions/common/sessionWorkSummary.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SESSION_WORK_CARD_HEIGHT, SessionWorkCard } from '../../browser/views/sessionWorkCard.js';
import { SessionWorkCardContent, SessionWorkCardContentMode } from '../../browser/views/sessionWorkCardContent.js';
import { SessionWorkOverview } from '../../browser/views/sessionWorkOverview.js';
import { SessionBoardView } from '../../browser/views/sessionBoardView.js';

suite('Unified session work card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCard(session = makeSession(URI.parse('test:/card'), { status: SessionStatus.InProgress }), send?: (session: ISession, chat: IChat, text: string) => Promise<boolean>) {
		const instantiation = store.add(new TestInstantiationService());
		const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
		const draftFor = (resource: URI) => {
			let draft = drafts.get(resource);
			if (!draft) {
				draft = observableValue<ISessionInputDraft>('draft', { inputText: '', attachments: [] });
				drafts.set(resource, draft);
			}
			return draft;
		};
		instantiation.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiation.stub(IContextViewService, {});
		instantiation.stub(IHoverService, { setupDelayedHover: () => Disposable.None });
		instantiation.stub(INotificationService, { error: error => { throw error; } });
		instantiation.stub(ISessionsService, { visibleSessions: constObservable([]) });
		instantiation.stub(ISessionInputDraftService, { getDraft: draftFor, setDraft: (resource, draft) => draftFor(resource).set(draft, undefined) });
		const sends: { session: string; chat: string; text: string }[] = [];
		instantiation.stub(ISessionReviewService, {
			send: async (session, chat, text) => { sends.push({ session: session.sessionId, chat: chat.resource.toString(), text }); return send ? send(session, chat, text) : true; },
		});
		instantiation.stubInstance(WorkbenchToolBar, { setActions: () => { }, dispose: () => { } });
		const inputs: { chat: string; mode: SessionWorkCardContentMode }[] = [];
		let disposed = 0;
		const contentHeights = store.add(new Emitter<number>());
		const contentElement = document.createElement('div');
		instantiation.stubInstance(SessionWorkCardContent, new class extends mock<SessionWorkCardContent>() {
			override readonly element = contentElement;
			override readonly onDidChangeHeight = contentHeights.event;
			override setInput(_session: ISession, chat: IChat, mode: SessionWorkCardContentMode): void { inputs.push({ chat: chat.resource.toString(), mode }); }
			override layout(): void { }
			override focus(): void { this.element.tabIndex = 0; this.element.focus(); }
			override getAccessibleContent(): string { return 'Native request details'; }
			override dispose(): void { disposed++; this.element.remove(); }
		}());
		const card = store.add(instantiation.createInstance(SessionWorkCard));
		document.body.appendChild(card.element);
		store.add(toDisposable(() => card.element.remove()));
		const update = () => card.update({
			session,
			summary: readSessionWorkSummary(session, {}, { now: Date.now(), inactivityDays: 30, active: false, pinned: false }),
			pinned: false,
			archive: false,
			description: 'Session status',
		});
		card.layout(700);
		update();
		return { card, session, update, draftFor, inputs, sends, instantiation, contentHeights, contentElement, disposed: () => disposed };
	}

	test('ordinary compact cards keep their input without creating conversation content', () => {
		const { card, inputs } = createCard();
		card.setVisible(true);
		assert.deepStrictEqual({
			inputs,
			input: !!card.element.querySelector('textarea'),
			expanded: card.expanded,
			height: card.height,
		}, { inputs: [], input: true, expanded: false, height: SESSION_WORK_CARD_HEIGHT });
	});

	test('opening the board focuses its overview rather than expanding the first available session', () => {
		const { instantiation } = createCard();
		const focused: string[] = [];
		instantiation.stub(ISessionsBoardService, { registerView: () => Disposable.None });
		instantiation.stub(ISessionGroupsService, { onDidChange: Event.None });
		instantiation.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stubInstance(SessionWorkOverview, {
			element: document.createElement('div'),
			focus: () => focused.push('overview'),
			focusSession: () => focused.push('session'),
			dispose: () => { },
		});
		const board = store.add(instantiation.createInstance(SessionBoardView));
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		board.render(container);
		board.focus();
		assert.deepStrictEqual(focused, ['overview']);
	});
	test('a waiting card loads only once visible and releases its content offscreen', () => {
		const { card, session, inputs, disposed } = createCard(makeSession(URI.parse('test:/waiting'), { status: SessionStatus.NeedsInput }));
		const before = inputs.length;
		card.setVisible(true);
		card.setVisible(true);
		card.setVisible(false);
		assert.deepStrictEqual({
			before, inputs, disposed: disposed(), draftVisible: !card.element.querySelector<HTMLElement>('.session-work-card-reply')!.hidden,
		}, { before: 0, inputs: [{ chat: session.mainChat.get().resource.toString(), mode: 'pending' }], disposed: 1, draftVisible: false });
	});

	test('a pending supporting chat owns the approval instead of the main chat', () => {
		const main = makeSession(URI.parse('test:/parent'), { status: SessionStatus.InProgress });
		const peer = { ...main.mainChat.get(), resource: URI.parse('test:/peer'), status: constObservable(SessionStatus.NeedsInput) };
		const { card, inputs } = createCard({ ...main, chats: constObservable([main.mainChat.get(), peer]) });
		card.setVisible(true);
		assert.deepStrictEqual(inputs, [{ chat: peer.resource.toString(), mode: 'pending' }]);
	});

	test('a resolved pending control restores the compact input and its keyboard focus', () => {
		const { card, contentElement, contentHeights, inputs } = createCard(makeSession(URI.parse('test:/resolve'), { status: SessionStatus.NeedsInput }));
		card.setVisible(true);
		const approval = document.createElement('button');
		contentElement.appendChild(approval);
		approval.focus();
		// An unfocused Electron runner updates activeElement without firing native focus events.
		approval.dispatchEvent(new FocusEvent('focus'));
		approval.remove();
		contentHeights.fire(0);
		assert.deepStrictEqual({
			height: card.height,
			replyVisible: !card.element.querySelector<HTMLElement>('.session-work-card-reply')!.hidden,
			focusRestored: document.activeElement === card.element.querySelector('textarea'),
			loads: inputs.length,
		}, { height: SESSION_WORK_CARD_HEIGHT, replyVisible: true, focusRestored: true, loads: 1 });
	});

	test('a resolved request does not steal focus from another control', () => {
		const { card, contentElement, contentHeights } = createCard(makeSession(URI.parse('test:/background-resolution'), { status: SessionStatus.NeedsInput }));
		card.setVisible(true);
		const approval = document.createElement('button');
		const elsewhere = document.createElement('input');
		contentElement.appendChild(approval);
		document.body.appendChild(elsewhere);
		store.add(toDisposable(() => elsewhere.remove()));
		approval.focus();
		approval.dispatchEvent(new FocusEvent('focus'));
		elsewhere.focus();
		approval.remove();
		contentHeights.fire(0);
		assert.strictEqual(document.activeElement, elsewhere);
	});

	test('resizing reveals native history and preserves the same draft and input on collapse', () => {
		const { card, session, inputs, draftFor, disposed } = createCard();
		const reference = toFileVariableEntry(URI.file('/repo/change.ts'));
		draftFor(session.mainChat.get().resource).set({ inputText: 'Keep this reply', attachments: [reference] }, undefined);
		const input = card.element.querySelector('textarea');
		card.setVisible(true);
		card.layout(700, { width: 540, height: 400 });
		card.layout(700, { width: 540, height: 500 });
		card.layout(700, { width: 420, height: SESSION_WORK_CARD_HEIGHT });
		assert.deepStrictEqual({
			inputs, disposed: disposed(), retainedInput: input === card.element.querySelector('textarea'),
			draft: draftFor(session.mainChat.get().resource).get(), width: card.resizable.size.width, expanded: card.expanded,
		}, {
			inputs: [{ chat: session.mainChat.get().resource.toString(), mode: 'conversation' }],
			disposed: 1, retainedInput: true, draft: { inputText: 'Keep this reply', attachments: [reference] }, width: 420, expanded: false,
		});
	});

	test('a saved expanded size does not load content before the card enters the viewport', () => {
		const { card, inputs } = createCard();
		card.layout(500, { width: 700, height: 420 });
		assert.deepStrictEqual({ inputs, expanded: card.expanded, width: card.resizable.size.width }, { inputs: [], expanded: true, width: 500 });
	});

	test('accessible content includes only already-rendered native content and the shared draft', () => {
		const { card, session, draftFor, inputs } = createCard();
		draftFor(session.mainChat.get().resource).set({ inputText: 'Follow up', attachments: [] }, undefined);
		const compact = card.getAccessibleContent();
		const before = inputs.length;
		card.layout(600, { width: 600, height: 400 });
		card.setVisible(true);
		assert.deepStrictEqual({
			before, compactHasDraft: compact.includes('Unsent reply: Follow up'), compactHasHistory: compact.includes('Native request details'),
			expandedHasHistory: card.getAccessibleContent().includes('Native request details'),
		}, { before: 0, compactHasDraft: true, compactHasHistory: false, expandedHasHistory: true });
	});
	test('read-only and archived chats have no editable input or automatic approval controls', () => {
		const original = makeSession(URI.parse('test:/readonly'), { status: SessionStatus.Completed });
		const chat = { ...original.mainChat.get(), interactivity: constObservable(ChatInteractivity.ReadOnly) };
		const { card, inputs } = createCard({ ...original, chats: constObservable([chat]), mainChat: constObservable(chat) });
		card.setVisible(true);
		const archivedSession = makeSession(URI.parse('test:/archived'), { status: SessionStatus.NeedsInput });
		const archived = createCard({ ...archivedSession, isArchived: constObservable(true) });
		archived.card.setVisible(true);
		assert.deepStrictEqual({
			replyHidden: card.element.querySelector<HTMLElement>('.session-work-card-reply')!.hidden, inputs,
			archivedReplyHidden: archived.card.element.querySelector<HTMLElement>('.session-work-card-reply')!.hidden, archivedInputs: archived.inputs,
		}, { replyHidden: true, inputs: [], archivedReplyHidden: true, archivedInputs: [] });
	});

	test('sending captures the owning chat and does not erase a newer shared draft', async () => {
		const completion = new DeferredPromise<boolean>();
		const { card, session, draftFor, sends } = createCard(undefined, () => completion.p);
		const draft = draftFor(session.mainChat.get().resource);
		draft.set({ inputText: 'First reply', attachments: [] }, undefined);
		card.element.querySelector<HTMLTextAreaElement>('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		draft.set({ inputText: 'Newer reply from another view', attachments: [] }, undefined);
		await completion.complete(true);
		await timeout(0);
		assert.deepStrictEqual({ sends, text: draft.get().inputText }, {
			sends: [{ session: session.sessionId, chat: session.mainChat.get().resource.toString(), text: 'First reply' }],
			text: 'Newer reply from another view',
		});
	});
});
