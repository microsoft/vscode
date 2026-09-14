/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { DEFAULT_SESSIONS_BOARD_OPTIONS, ISessionsBoardOptions, ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ChatInteractivity, IChat } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionReviewState, SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionBoardCard, SessionBoardView } from '../../browser/views/sessionBoardView.js';
import { createTestSession, ITestSessionOptions } from './sessionsListTestUtils.js';

suite('Native session board card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(label = 'Review session', options?: ITestSessionOptions) {
		const sessionData = createTestSession(label, options).session;
		const title = observableValue('sessionTitle', label);
		const chat: IChat = {
			resource: sessionData.resource.with({ fragment: 'main' }), title, createdAt: new Date(0), updatedAt: constObservable(new Date(0)),
			status: sessionData.status, changes: constObservable([]), checkpoints: constObservable(undefined), modelId: constObservable(undefined), modelSource: constObservable(undefined),
			mode: constObservable(undefined), isArchived: constObservable(false), isRead: constObservable(true), interactivity: constObservable(ChatInteractivity.Full), description: constObservable(undefined), lastTurnEnd: constObservable(undefined),
		};
		const session = store.add(new VisibleSession({ ...sessionData, title, chats: constObservable([chat]), mainChat: constObservable(chat) }, chat));
		return { session, title };
	}

	function createServices(canOpen = async () => true) {
		const draft = observableValue<ISessionInputDraft>('cardDraft', { inputText: 'Existing reply', attachments: [] });
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiation.stub(IContextViewService, {});
		instantiation.stub(ICommandService, { executeCommand: async () => undefined });
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(ISessionInputDraftService, { getDraft: () => draft, setDraft: (_resource, value) => draft.set(value, undefined) });
		instantiation.stub(ISessionsService, { canOpenSession: canOpen, setActive: () => { } });
		instantiation.stub(ISessionChangesStatsCache, { get: () => undefined });
		instantiation.stub(IHoverService, { setupDelayedHover: () => Disposable.None });
		instantiation.stub(INotificationService, { error: error => { throw error; } });
		instantiation.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		let toolbarUpdates = 0;
		let resultActions: readonly IAction[] = [];
		instantiation.stubInstance(WorkbenchToolBar, { dispose: () => { }, setActions: actions => { toolbarUpdates++; resultActions = actions; } });
		let opened = 0, disposed = 0;
		const view = new class extends mock<SessionView>() {
			override readonly element = document.createElement('div');
			override openSession(): void { opened++; }
			override layout(): void { }
			override focus(): void { }
			override dispose(): void { disposed++; }
		}();
		instantiation.stubInstance(SessionView, view);
		return { instantiation, draft, counts: () => ({ opened, disposed }), toolbarUpdates: () => toolbarUpdates, resultActions: () => resultActions };
	}

	function createCard(canOpen = async () => true, initialOptions: ISessionsBoardOptions = DEFAULT_SESSIONS_BOARD_OPTIONS, sessionOptions?: ITestSessionOptions) {
		const services = createServices(canOpen);
		const { instantiation } = services;
		const { session } = createSession(undefined, sessionOptions);
		const options = observableValue('cardOptions', initialOptions);
		const card = store.add(instantiation.createInstance(SessionBoardCard, session, options, () => { }, () => { }));
		document.body.appendChild(card.element);
		store.add(toDisposable(() => card.element.remove()));
		card.layout(800);
		return { card, options, ...services };
	}

	function createBoard() {
		const services = createServices();
		const { instantiation } = services;
		const { session, title } = createSession();
		const sessions = observableValue<readonly IActiveSession[]>('boardSessions', [session]);
		const review = observableValue<ISessionReviewState | undefined>('review', undefined);
		instantiation.stub(ISessionsService, { visibleSessions: sessions, sessionReview: review, canOpenSession: async () => true, setActive: () => { } });
		instantiation.stub(ISessionGroupsService, { onDidChange: Event.None, getGroups: () => [], getGroupOfSession: () => undefined });
		instantiation.stub(ISessionsListModelService, { onDidChange: Event.None, getSortKey: () => 0 });
		instantiation.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(ISessionsBoardService, store.add(instantiation.createInstance(SessionsBoardService)));
		const board = store.add(instantiation.createInstance(SessionBoardView));
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		board.render(container);
		board.layout(800, 600);
		return { ...services, board, container, session, title, sessions, review };
	}

	test('collapsed cards show a native input without constructing a session view', () => {
		const { card, counts } = createCard();
		assert.deepStrictEqual({ view: card.view, input: card.element.querySelector('textarea')?.value, counts: counts() }, {
			view: undefined, input: 'Existing reply', counts: { opened: 0, disposed: 0 },
		});
	});

	test('explicit expansion creates a native session view and collapse disposes it', async () => {
		const { card, counts } = createCard();
		await card.setExpanded(true);
		const expanded = counts();
		await card.setExpanded(false);
		assert.deepStrictEqual({ expanded, collapsed: counts(), view: card.view }, {
			expanded: { opened: 1, disposed: 0 }, collapsed: { opened: 1, disposed: 1 }, view: undefined,
		});
	});

	test('collapsing during a trust check cancels the pending expansion', async () => {
		const trust = new DeferredPromise<boolean>();
		const { card, counts } = createCard(() => trust.p);
		const expanding = card.setExpanded(true);
		await card.setExpanded(false);
		await trust.complete(true);
		await expanding;
		assert.deepStrictEqual({ expanded: card.expanded, counts: counts() }, { expanded: false, counts: { opened: 0, disposed: 0 } });
	});

	test('reply references remain visible in the compact card', () => {
		const { card, draft } = createCard();
		draft.set({ inputText: 'Discuss this', attachments: [toFileVariableEntry(URI.file('/project/policy.ts'))] }, undefined);
		assert.deepStrictEqual({
			input: card.element.querySelector('textarea')?.value,
			context: card.element.querySelector('.session-board-card-draft-context')?.textContent,
			view: card.view,
		}, { input: 'Discuss this', context: 'About: policy.ts', view: undefined });
	});

	test('editing a draft does not rebuild result actions', () => {
		const { draft, toolbarUpdates } = createCard();
		const before = toolbarUpdates();
		draft.set({ inputText: 'Continue typing', attachments: [] }, undefined);
		assert.strictEqual(toolbarUpdates(), before);
	});

	test('compact cards ignore saved widths and derive height from their content', () => {
		const { card, counts } = createCard();
		const widths: number[] = [];
		for (const width of [305, 480, 900]) {
			card.layout(1000, { width, height: 600 });
			widths.push(card.resizable.size.width);
		}
		assert.deepStrictEqual({ widths, height: card.element.style.height, span: card.element.style.gridColumn, views: counts().opened }, {
			widths: [968 / 3, 968 / 3, 968 / 3], height: 'auto', span: 'span 1', views: 0,
		});
	});

	test('missing metadata does not reserve empty rows or repeat the project heading', () => {
		const { card } = createCard();
		assert.deepStrictEqual({
			description: card.element.querySelector<HTMLElement>('.session-board-card-description')?.hidden,
			resources: card.element.querySelector<HTMLElement>('.session-board-card-resources')?.hidden,
			context: card.element.querySelector<HTMLElement>('.session-board-card-draft-context')?.hidden,
			titleBorder: card.element.querySelector<HTMLElement>('.session-board-card-title')?.style.border,
			titleBackground: card.element.querySelector<HTMLElement>('.session-board-card-title')?.style.backgroundColor,
		}, { description: true, resources: true, context: true, titleBorder: '', titleBackground: 'transparent' });
	});

	test('collection cards retain their project label and respond to field choices', () => {
		const { card, options } = createCard(async () => true, { ...DEFAULT_SESSIONS_BOARD_OPTIONS, grouping: 'collection' });
		const description = card.element.querySelector<HTMLElement>('.session-board-card-description');
		const initial = { text: description?.textContent, hidden: description?.hidden };
		options.set({ ...options.get(), grouping: 'project', showReply: false }, undefined);
		assert.deepStrictEqual({ initial, hidden: description?.hidden, replyHidden: card.element.querySelector<HTMLElement>('.session-board-card-reply')?.hidden }, {
			initial: { text: 'Workspace', hidden: false }, hidden: true, replyHidden: true,
		});
	});

	test('a single changed file uses a singular label and shows real diff totals', () => {
		const { card, resultActions } = createCard(async () => true, DEFAULT_SESSIONS_BOARD_OPTIONS, { changesSummary: { files: 1, additions: 24, deletions: 8 } });
		assert.deepStrictEqual({
			labels: resultActions().map(action => action.label),
			insertions: card.element.querySelector('.session-board-card-insertions')?.textContent,
			deletions: card.element.querySelector('.session-board-card-deletions')?.textContent,
			hidden: card.element.querySelector<HTMLElement>('.session-board-card-resources')?.hidden,
		}, { labels: ['1 file'], insertions: '+24', deletions: '-8', hidden: false });
	});

	test('expanded cards use whole columns and return to the compact grid without losing the saved size', async () => {
		const { card } = createCard();
		card.layout(1000, { width: 700, height: 440 });
		await card.setExpanded(true);
		const expanded = { span: card.element.style.gridColumn, height: card.resizable.size.height };
		await card.setExpanded(false);
		const compact = { span: card.element.style.gridColumn, height: card.element.style.height };
		await card.setExpanded(true);
		assert.deepStrictEqual({ expanded, compact, restored: { span: card.element.style.gridColumn, height: card.resizable.size.height } }, {
			expanded: { span: 'span 2', height: 440 }, compact: { span: 'span 1', height: 'auto' }, restored: { span: 'span 2', height: 440 },
		});
	});

	test('keyboard focus falls back to the title when compact replies are hidden', () => {
		const { card } = createCard(async () => true, { ...DEFAULT_SESSIONS_BOARD_OPTIONS, showReply: false });
		card.focus();
		assert.strictEqual(document.activeElement, card.element.querySelector('.session-board-card-title'));
	});

	test('catalog updates retain an expanded card and its native view', async () => {
		const { board, session, title, sessions, container, counts } = createBoard();
		const element = container.querySelector('.session-board-card');
		board.toggleMaximizeSession(session.sessionId);
		await timeout(0);
		const view = board.getSessionView(session.sessionId);
		title.set('Updated title', undefined);
		sessions.set([session, createSession('Another session').session], undefined);
		assert.deepStrictEqual({
			retainedElement: container.querySelector('.session-board-card') === element,
			retainedView: board.getSessionView(session.sessionId) === view,
			counts: counts(),
			cards: container.querySelectorAll('.session-board-card').length,
		}, { retainedElement: true, retainedView: true, counts: { opened: 1, disposed: 0 }, cards: 2 });
	});

	test('closing review retains the initiating control while applying deferred catalog updates', () => {
		const { board, session, sessions, review, container } = createBoard();
		const input = container.querySelector<HTMLTextAreaElement>('textarea');
		board.focusSession(session.sessionId);
		review.set({ sessionResource: session.resource, section: SessionReviewSection.Artifacts }, undefined);
		sessions.set([session, createSession('Another session').session], undefined);
		const during = container.querySelectorAll('.session-board-card').length;
		review.set(undefined, undefined);
		assert.deepStrictEqual({
			during,
			after: container.querySelectorAll('.session-board-card').length,
			retained: container.querySelector('textarea') === input,
			focused: document.activeElement === input,
		}, { during: 1, after: 2, retained: true, focused: true });
	});

	test('the board presents grouping and status controls without opening a settings menu', () => {
		const { container } = createBoard();
		assert.deepStrictEqual({
			grouping: !!container.querySelector('[aria-label="Group sessions"]'),
			status: !!container.querySelector('[aria-label="Filter sessions by status"]'),
			emptySavedViewsHidden: container.querySelector<HTMLElement>('.sessions-board-saved-views')?.hidden,
		}, { grouping: true, status: true, emptySavedViewsHidden: true });
	});
});
