/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, getWindow, size } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { constObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionsDataTransfers } from '../../../../browser/dnd.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { ISessionGroupsChangeEvent, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionWorkTrackingService } from '../../../../services/sessions/browser/sessionWorkTrackingService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionRemoteConnectionFailureReason, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionReviewState, SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { SessionWorkView } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { readSessionWorkResultVersion, readSessionWorkSummary } from '../../../../services/sessions/common/sessionWorkSummary.js';
import { createWorkTestSession } from '../../../../services/sessions/test/common/sessionWorkTestUtils.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { ISessionIntentService } from '../../../intent/common/sessionIntent.js';
import { IDashboardWorkService } from '../../../intent/common/dashboardWork.js';
import { SessionWorkCard } from '../../browser/views/sessionWorkCard.js';
import { SessionBoardView } from '../../browser/views/sessionBoardView.js';
import { SessionWorkCardContent } from '../../browser/views/sessionWorkCardContent.js';

suite('Native wrapping work overview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createOverview(sessions: ISession[], view: SessionWorkView = 'overview', options?: {
		readonly confirm?: () => boolean;
		readonly archive?: (session: ISession) => void;
		readonly draft?: string;
		readonly reviewed?: boolean;
		readonly reviewCheckpoints?: ResourceMap<string>;
		readonly cachedModels?: boolean;
		readonly collection?: string;
		readonly collectionMembers?: readonly string[];
		readonly dashboardConversation?: ISession;
	}) {
		const instantiation = workbenchInstantiationService(undefined, store);
		const board = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		board.updateOptions({ view, collection: options?.collection });
		const archived: string[] = [];
		const opened: string[] = [];
		const openDetails: { sessionId: string; section: SessionReviewSection; chatResource?: string }[] = [];
		const contentInputs: string[] = [];
		let contentDisposals = 0;
		let loadCount = 0;
		const catalog = store.add(new Emitter<ISessionsChangeEvent>());
		const review = observableValue<ISessionReviewState | undefined>('review', undefined);
		const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
		const getDraft = (resource: URI) => {
			let draft = drafts.get(resource);
			if (!draft) { draft = observableValue<ISessionInputDraft>('draft', { inputText: options?.draft ?? '', attachments: [] }); drafts.set(resource, draft); }
			return draft;
		};
		instantiation.stub(ISessionsBoardService, board);
		instantiation.stub(ISessionIntentService, { intakes: constObservable([]) });
		instantiation.stub(IDashboardWorkService, {
			sessions: constObservable(options?.dashboardConversation ? [options.dashboardConversation] : []), executions: constObservable([]),
			getSessionForChat: () => options?.dashboardConversation,
		});
		instantiation.stub(ISessionsManagementService, {
			getSessions: () => sessions,
			getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()),
			onDidChangeSessions: catalog.event,
			archiveSession: async session => { archived.push(session.sessionId); options?.archive?.(session); },
		});
		instantiation.stub(ISessionsService, {
			activeSession: constObservable(undefined), visibleSessions: constObservable([]), sessionReview: review,
			openSessionReview: async (session, section = SessionReviewSection.Conversation, options) => {
				opened.push(session.sessionId);
				openDetails.push({ sessionId: session.sessionId, section, chatResource: options?.chatResource?.toString() });
			},
		});
		const group = { id: 'collection', name: 'Release work', createdAt: 0 };
		const memberships = new Map((options?.collectionMembers ?? (options?.collection ? sessions.map(session => session.sessionId) : [])).map(id => [id, group.id]));
		const groupsChanged = store.add(new Emitter<ISessionGroupsChangeEvent>());
		instantiation.stub(ISessionGroupsService, {
			onDidChange: groupsChanged.event, getGroups: () => [group], getGroup: id => id === group.id ? group : undefined,
			getGroupOfSession: id => memberships.get(id),
			addToGroup: (ids, groupId) => {
				const membershipChanged = new Set(typeof ids === 'string' ? [ids] : ids);
				for (const id of membershipChanged) { memberships.set(id, groupId); }
				groupsChanged.fire({ groupsChanged: false, membershipChanged });
			},
		});
		instantiation.stub(ISessionsListModelService, { onDidChange: Event.None, isSessionPinned: () => false, getSortKey: session => session.createdAt.getTime() });
		instantiation.stub(ISessionWorkTrackingService, {
			getState: resource => {
				const session = sessions.find(session => session.resource.toString() === resource.toString());
				const reviewedResult = options?.reviewCheckpoints?.get(resource) ?? (options?.reviewed && session
					? readSessionWorkSummary(session, {}, { now: Date.now(), inactivityDays: 30, pinned: false, active: false }).resultVersion : undefined);
				return constObservable({ lastOpenedAt: Date.now() - 60 * 86400000, reviewedResult });
			},
			markOpened: () => { }, markReviewed: () => { }, keep: () => { },
		});
		instantiation.stub(ISessionInputDraftService, { getDraft, setDraft: (resource, draft) => getDraft(resource).set(draft, undefined) });
		instantiation.stub(ISessionReviewService, { send: async () => true });
		instantiation.stubInstance(SessionWorkCardContent, new class extends mock<SessionWorkCardContent>() {
			override readonly element = document.createElement('div');
			override readonly onDidChangeHeight = Event.None;
			override setInput(_session: ISession, chat: { resource: URI }): void { contentInputs.push(chat.resource.toString()); }
			override layout(): void { }
			override focus(): void { }
			override getAccessibleContent(): string { return ''; }
			override dispose(): void { contentDisposals++; this.element.remove(); }
		}());
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden: false } });
		const models = options?.cachedModels === false ? [] : sessions.flatMap(session => session.chats.get()).map(chat => new class extends mock<IChatModel>() {
			override readonly sessionResource = chat.resource;
			override readonly hasActiveRequest = constObservable(false);
			override readonly onDidChangePendingRequests = Event.None;
			override getPendingRequests() { return []; }
			override getRequests(): never { throw new Error('The catalog must not inspect chat history'); }
		}());
		instantiation.stub(IChatService, {
			chatModels: constObservable(models), getSession: resource => models.find(model => model.sessionResource.toString() === resource.toString()),
			acquireOrLoadSession: async () => { loadCount++; throw new Error('The catalog must not load chat history'); },
		});
		instantiation.stub(IDialogService, { confirm: async () => ({ confirmed: options?.confirm?.() ?? false }) });
		const container = $('.work-overview-test');
		container.style.width = '1100px';
		container.style.height = '740px';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const host = store.add(instantiation.createInstance(CustomViewNode, { id: 'test.work', ctor: new SyncDescriptor(SessionBoardView) }));
		container.appendChild(host.element);
		size(host.element, 1100, 740);
		host.layout(1100, 740);
		const overview = board.activeView.get();
		assert.ok(overview instanceof SessionBoardView);
		return { overview, host, board, container, archived, opened, openDetails, catalog, review, getDraft, memberships, contentInputs, contentDisposals: () => contentDisposals, loadCount: () => loadCount };
	}

	function section(container: HTMLElement, label: string): HTMLElement {
		const header = [...container.querySelectorAll<HTMLElement>('.session-work-section-header')].find(header => header.querySelector('.session-work-section-toggle')?.textContent === label);
		assert.ok(header, `Missing section ${label}`);
		return header;
	}

	function card(container: HTMLElement, id: string): HTMLElement {
		const slot = [...container.querySelectorAll<HTMLElement>('.session-card-board-slot')].find(element => element.dataset.cardId === id);
		assert.ok(slot, `Missing visible card ${id}`);
		return slot;
	}

	test('an unreviewed catalog does not eagerly calculate result fingerprints', () => {
		const { session } = createWorkTestSession();
		session.changes.set([{ modifiedUri: URI.file('/repo/file.ts'), insertions: 4, deletions: 2 }], undefined);
		const hashes = sinon.spy(StringSHA1.prototype, 'update');
		const h = createOverview([session], 'all');
		assert.deepStrictEqual({ hashes: hashes.callCount, cards: h.container.querySelectorAll('.session-work-card').length }, { hashes: 0, cards: 1 });
	});

	test('one result update rehashes and updates only its session card', async () => {
		const first = createWorkTestSession(URI.parse('test:/first')).session;
		const second = createWorkTestSession(URI.parse('test:/second')).session;
		const change = { modifiedUri: URI.file('/repo/file.ts'), insertions: 4, deletions: 2 };
		first.changes.set([change], undefined);
		second.changes.set([change], undefined);
		const checkpoints = new ResourceMap([[first.resource, readSessionWorkResultVersion(first)], [second.resource, readSessionWorkResultVersion(second)]]);
		const h = createOverview([first, second], 'all', { reviewCheckpoints: checkpoints });
		const hashes = sinon.spy(StringSHA1.prototype, 'update');
		const updates = sinon.spy(SessionWorkCard.prototype, 'update');
		first.changes.set([{ ...change, insertions: 5 }], undefined);
		h.catalog.fire({ added: [], removed: [], changed: [first] });
		await new Promise<void>(resolve => getWindow(h.container).requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual({ hashes: hashes.callCount, updated: updates.getCalls().map(call => call.args[0].session.sessionId) },
			{ hashes: 1, updated: [first.sessionId] });
	});

	test('a burst of metadata changes produces one update for the affected card', async () => {
		const first = createWorkTestSession(URI.parse('test:/first')).session;
		const second = createWorkTestSession(URI.parse('test:/second')).session;
		const h = createOverview([first, second], 'all');
		const updates = sinon.spy(SessionWorkCard.prototype, 'update');
		const hashes = sinon.spy(StringSHA1.prototype, 'update');
		for (let index = 0; index < 20; index++) { first.title.set(`Title ${index}`, undefined); }
		const synchronousUpdates = updates.callCount;
		await new Promise<void>(resolve => getWindow(h.container).requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual({
			synchronousUpdates, updated: updates.getCalls().map(call => call.args[0].session.sessionId), hashes: hashes.callCount,
			title: card(h.container, first.sessionId).querySelector('.session-work-title')?.textContent,
		}, { synchronousUpdates: 0, updated: [first.sessionId], hashes: 0, title: 'Title 19' });
	});

	test('filtering, sorting and resizing do not rehash unchanged reviewed results', () => {
		const { session } = createWorkTestSession();
		session.changes.set([{ modifiedUri: URI.file('/repo/file.ts'), insertions: 4, deletions: 2 }], undefined);
		const h = createOverview([session], 'all', { reviewCheckpoints: new ResourceMap([[session.resource, readSessionWorkResultVersion(session)]]) });
		const hashes = sinon.spy(StringSHA1.prototype, 'update');
		h.board.updateOptions({ filter: 'Work' });
		h.board.updateOptions({ sort: 'updated' });
		h.overview.resizeCard(session.sessionId, 1, 0);
		assert.strictEqual(hashes.callCount, 0);
	});

	test('Stop and pending controls remain available before a scheduled catalog repaint', async () => {
		const { session, chat } = createWorkTestSession();
		const h = createOverview([session], 'all');
		transaction(tx => {
			session.status.set(SessionStatus.NeedsInput, tx);
			chat.status.set(SessionStatus.NeedsInput, tx);
		});
		assert.strictEqual(card(h.container, session.sessionId).querySelectorAll('.codicon-debug-stop').length, 1);
		await new Promise<void>(resolve => getWindow(h.container).requestAnimationFrame(() => resolve()));
		assert.strictEqual(card(h.container, session.sessionId).querySelectorAll('.codicon-debug-stop').length, 1);
	});

	test('real work uses wrapping cards and only the custom-view host owns board scrolling', () => {
		const sessions = Array.from({ length: 30 }, (_, index) => makeSession(URI.parse(`test:/work-${index}`), { status: SessionStatus.InProgress }));
		const { overview, container, loadCount } = createOverview(sessions);
		const slots = [...container.querySelectorAll<HTMLElement>('.session-card-board-slot')];
		assert.deepStrictEqual({
			total: overview.sessions.length, loads: loadCount(),
			columns: new Set(slots.map(slot => Math.round(slot.getBoundingClientRect().left))).size,
			windowed: slots.length > 0 && slots.length < 30,
			trees: container.querySelectorAll('.session-work-overview [role=tree]').length,
			hostScrollers: container.querySelectorAll('.custom-view-body').length,
			duplicateHeading: container.querySelectorAll('.session-work-heading').length,
		}, { total: 30, loads: 0, columns: 3, windowed: true, trees: 0, hostScrollers: 1, duplicateHeading: 0 });
	});

	test('My work keeps four sections and opening it does not expand historical cards', () => {
		const { overview, container } = createOverview([makeSession(URI.parse('test:/settled'))]);
		overview.focus();
		assert.deepStrictEqual({
			labels: [...container.querySelectorAll('.session-work-section-toggle')].map(element => element.textContent),
			allCollapsed: section(container, 'All sessions').querySelector('.session-work-section-toggle')?.getAttribute('aria-expanded'),
			cards: container.querySelectorAll('.session-work-card').length,
			focus: document.activeElement === section(container, 'Needs you').querySelector('.session-work-section-toggle'),
		}, { labels: ['Needs you', 'Needs review', 'In progress', 'All sessions'], allCollapsed: 'false', cards: 0, focus: true });
	});

	test('unavailable connections are counted in the attention section but remain collapsed', () => {
		const session = { ...makeSession(URI.parse('test:/disconnected')), remoteConnectionStatus: constObservable({ kind: 'disconnected' as const, reason: SessionRemoteConnectionFailureReason.HostNotRunning }) };
		const { container } = createOverview([session]);
		assert.deepStrictEqual({
			count: section(container, 'Needs you').querySelector('.session-work-section-count')?.textContent,
			collapsed: section(container, 'Unavailable connections').querySelector('.session-work-section-toggle')?.getAttribute('aria-expanded'),
			cards: container.querySelectorAll('.session-work-card').length,
		}, { count: '1', collapsed: 'false', cards: 0 });
	});

	test('section labels do not inherit the codicon font from their disclosure icon', () => {
		const { container } = createOverview([]);
		const toggle = section(container, 'Needs you').querySelector<HTMLElement>('.session-work-section-toggle')!;
		assert.deepStrictEqual({
			iconFontOnLabel: toggle.classList.contains('codicon'),
			label: toggle.querySelector('.monaco-button-mdlabel')?.textContent,
			decorativeIcon: toggle.querySelector('.codicon')?.getAttribute('aria-hidden'),
		}, { iconFontOnLabel: false, label: 'Needs you', decorativeIcon: 'true' });
	});

	test('a collection has one native title and no repeated inner heading', () => {
		const { overview, container } = createOverview([makeSession(URI.parse('test:/collection'))], 'all', { collection: 'collection' });
		assert.deepStrictEqual({
			title: overview.title.get(),
			nativeTitles: container.querySelectorAll('.custom-view-header-title').length,
			repeatedVisibleHeaders: [...container.querySelectorAll<HTMLElement>('.session-work-section-header')].filter(header => !header.hidden).length,
		}, { title: 'Release work', nativeTitles: 1, repeatedVisibleHeaders: 0 });
	});

	test('catalog refreshes preserve the input, loaded content, and current layout', async () => {
		const original = makeSession(URI.parse('test:/refresh'), { status: SessionStatus.InProgress });
		const title = observableValue('title', 'Initial title');
		const session = { ...original, title };
		const { overview, container, catalog, contentInputs, contentDisposals } = createOverview([session], 'all');
		overview.toggleMaximizeSession(session.sessionId);
		await timeout(30);
		const input = card(container, session.sessionId).querySelector('textarea');
		title.set('Updated title', undefined);
		for (let index = 0; index < 5; index++) { catalog.fire({ added: [], removed: [], changed: [session] }); }
		await timeout(30);
		assert.deepStrictEqual({
			retained: card(container, session.sessionId).querySelector('textarea') === input,
			title: card(container, session.sessionId).querySelector('.session-work-title')?.textContent,
			loads: contentInputs.length, disposed: contentDisposals(),
		}, { retained: true, title: 'Updated title', loads: 1, disposed: 0 });
	});

	test('pinning a section keeps it in My work and adds an automatic collection', () => {
		const { board, container } = createOverview([]);
		section(container, 'Needs review').querySelector<HTMLElement>('.action-label')!.click();
		assert.deepStrictEqual({ promoted: board.promotedViews.get(), remains: !!section(container, 'Needs review') }, { promoted: ['review'], remains: true });
	});

	test('visiting a standalone view does not remove its pin action from My work', () => {
		const { board, container } = createOverview([], 'all');
		board.updateOptions({ view: 'overview' });
		section(container, 'All sessions').querySelector<HTMLElement>('.action-label')!.click();
		assert.deepStrictEqual(board.promotedViews.get(), ['all']);
	});

	test('below-viewport pending cards do not load until explicitly revealed through the host', async () => {
		const sessions = Array.from({ length: 60 }, (_, index) => ({
			...makeSession(URI.parse(`test:/pending-${index}`), { status: index > 55 ? SessionStatus.NeedsInput : SessionStatus.InProgress }),
			createdAt: new Date(60 - index),
		}));
		const { overview, contentInputs } = createOverview(sessions, 'all');
		await timeout(30);
		const initial = contentInputs.length;
		overview.focusSession(sessions[59].sessionId);
		await timeout(30);
		assert.deepStrictEqual({
			initial, lastLoaded: contentInputs.includes(sessions[59].mainChat.get().resource.toString()),
			middleSkipped: !contentInputs.includes(sessions[30].mainChat.get().resource.toString()),
		}, { initial: 0, lastLoaded: true, middleSkipped: true });
	});

	test('resizing persists scoped spans and height and survives leaving the view', () => {
		const session = makeSession(URI.parse('test:/sizing'));
		const { overview, board, container } = createOverview([session], 'all');
		overview.resizeCard(session.sessionId, 1, 200);
		const size = board.getCardLayout('status:all:created')?.sizes.find(size => size.id === session.sessionId);
		board.updateOptions({ view: 'overview' });
		board.updateOptions({ view: 'all' });
		assert.deepStrictEqual({
			span: size?.columnSpan, height: size?.height,
			restoredHeight: card(container, session.sessionId).querySelector('.session-work-card')?.getBoundingClientRect().height,
		}, { span: 2, height: 312, restoredHeight: 312 });
	});

	test('reordering filtered real sessions preserves hidden canonical positions', () => {
		const sessions = ['Keep A', 'Match B', 'Keep C', 'Match D'].map((title, index) => ({
			...makeSession(URI.parse(`test:/order-${index}`)), title: constObservable(title), createdAt: new Date(4 - index),
		}));
		const { board, container } = createOverview(sessions, 'all');
		board.updateOptions({ filter: 'Match' });
		card(container, sessions[1].sessionId).querySelector<HTMLElement>('.session-work-card-header')!.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true,
		}));
		assert.deepStrictEqual(board.getCardLayout('status:all:created')?.order, [sessions[0].sessionId, sessions[3].sessionId, sessions[2].sessionId, sessions[1].sessionId]);
	});

	test('resizing cannot produce a height the persistence service would reject', () => {
		const session = makeSession(URI.parse('test:/maximum-height'));
		const { overview, board, container } = createOverview([session], 'all');
		overview.resizeCard(session.sessionId, 0, 20000);
		const saved = board.getCardLayout('status:all:created');
		overview.resizeCard(session.sessionId, 0, 40);
		assert.deepStrictEqual({
			height: saved?.sizes[0]?.height,
			renderedHeight: card(container, session.sessionId).getBoundingClientRect().height,
			unchangedAtLimit: board.getCardLayout('status:all:created') === saved,
		}, { height: 10000, renderedHeight: 10000, unchangedAtLimit: true });
	});

	test('title activation opens the real session review path', async () => {
		const session = makeSession(URI.parse('test:/open'));
		const { container, opened } = createOverview([session], 'all');
		card(container, session.sessionId).querySelector<HTMLElement>('.session-work-title')!.click();
		await timeout(0);
		assert.deepStrictEqual(opened, [session.sessionId]);
	});

	test('opening a waiting session targets its attention chat rather than the main chat', async () => {
		const session = makeSession(URI.parse('test:/multiple-chats'));
		const waiting = { ...session.mainChat.get(), resource: URI.parse('test:/waiting-chat'), status: constObservable(SessionStatus.NeedsInput) };
		const current = { ...session, status: waiting.status, chats: constObservable([session.mainChat.get(), waiting]) };
		const { container, openDetails } = createOverview([current], 'all');
		card(container, current.sessionId).querySelector<HTMLElement>('.session-work-title')!.click();
		await timeout(0);
		assert.deepStrictEqual(openDetails, [{ sessionId: current.sessionId, section: SessionReviewSection.Conversation, chatResource: waiting.resource.toString() }]);
	});

	test('Open Work on a workspace-less dashboard conversation uses review without moving its card into the draft area', async () => {
		const base = makeSession(URI.parse('test:/dashboard-work'));
		const chat = { ...base.mainChat.get(), status: constObservable(SessionStatus.NeedsInput) };
		const session = { ...base, status: chat.status, mainChat: constObservable(chat), chats: constObservable([chat]), workspace: constObservable(undefined), isQuickChat: constObservable(true) };
		const { container, openDetails } = createOverview([session], 'all', { dashboardConversation: session });
		const original = card(container, session.sessionId);
		original.querySelector<HTMLElement>('.codicon-link-external')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			openDetails, retainedCard: card(container, session.sessionId) === original,
			creationPanels: container.querySelectorAll('.session-work-intake').length,
		}, {
			openDetails: [{ sessionId: session.sessionId, section: SessionReviewSection.Conversation, chatResource: chat.resource.toString() }],
			retainedCard: true, creationPanels: 0,
		});
	});

	test('opening completed changes selects the existing native changes review', async () => {
		const session = makeSession(URI.parse('test:/changed'), { changes: [{ uri: URI.file('/repo/test.ts'), insertions: 1, deletions: 0 }] });
		const { container, openDetails } = createOverview([session], 'all');
		card(container, session.sessionId).querySelector<HTMLElement>('.session-work-title')!.click();
		await timeout(0);
		assert.deepStrictEqual(openDetails, [{ sessionId: session.sessionId, section: SessionReviewSection.Changes, chatResource: undefined }]);
	});

	test('opening modal review suspends content without replacing the initiating card', async () => {
		const session = makeSession(URI.parse('test:/review-modal'));
		const { overview, container, review, contentInputs, contentDisposals } = createOverview([session], 'all');
		overview.toggleMaximizeSession(session.sessionId);
		overview.focusSession(session.sessionId);
		const input = card(container, session.sessionId).querySelector('textarea');
		const header = card(container, session.sessionId).querySelector<HTMLElement>('.session-work-card-header')!;
		review.set({ sessionResource: session.resource, section: SessionReviewSection.Conversation }, undefined);
		const suspendedDisposals = contentDisposals();
		review.set(undefined, undefined);
		header.focus();
		await timeout(0);
		assert.deepStrictEqual({
			suspendedDisposals, loads: contentInputs.length,
			sameInput: input === card(container, session.sessionId).querySelector('textarea'),
			restoredFocus: document.activeElement === header,
		}, { suspendedDisposals: 1, loads: 2, sameInput: true, restoredFocus: true });
	});

	test('closing review reveals completed work that moved into collapsed All sessions', async () => {
		const original = makeSession(URI.parse('test:/stopped-work'));
		const state = observableValue('status', SessionStatus.NeedsInput);
		const chat = { ...original.mainChat.get(), status: state };
		const session = { ...original, status: state, mainChat: constObservable(chat), chats: constObservable([chat]), workspace: constObservable(undefined) };
		const h = createOverview([session]);
		const all = section(h.container, 'All sessions').querySelector<HTMLElement>('.session-work-section-toggle')!;
		assert.strictEqual(all.getAttribute('aria-expanded'), 'false');
		h.review.set({ sessionResource: session.resource, section: SessionReviewSection.Conversation }, undefined);
		state.set(SessionStatus.Completed, undefined);
		h.review.set(undefined, undefined);
		await new Promise<void>(resolve => getWindow(h.container).requestAnimationFrame(() => resolve()));
		const returned = card(h.container, session.sessionId);
		assert.deepStrictEqual({
			allExpanded: all.getAttribute('aria-expanded'),
			focused: document.activeElement === returned.querySelector('.session-work-card-header'),
			view: h.board.options.get().view,
			draftPanels: h.container.querySelectorAll('.session-work-intake').length,
		}, { allExpanded: 'true', focused: true, view: 'overview', draftPanels: 0 });
	});

	test('returning from review does not change a query that no longer matches the session', async () => {
		const original = makeSession(URI.parse('test:/filtered-stop'));
		const state = observableValue('status', SessionStatus.NeedsInput);
		const chat = { ...original.mainChat.get(), status: state };
		const session = { ...original, status: state, mainChat: constObservable(chat), chats: constObservable([chat]) };
		const h = createOverview([session], 'needsInput');
		h.review.set({ sessionResource: session.resource, section: SessionReviewSection.Conversation }, undefined);
		state.set(SessionStatus.Completed, undefined);
		h.review.set(undefined, undefined);
		await new Promise<void>(resolve => getWindow(h.container).requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual({ view: h.board.options.get().view, cards: h.container.querySelectorAll('.session-work-card').length },
			{ view: 'needsInput', cards: 0 });
	});

	test('regrouping waits for the reply to lose focus but does not remain stale afterwards', async () => {
		const original = makeSession(URI.parse('test:/finish'), { status: SessionStatus.InProgress });
		const status = observableValue('status', SessionStatus.InProgress);
		const chat = { ...original.mainChat.get(), status };
		const session = { ...original, status, mainChat: constObservable(chat), chats: constObservable([chat]) };
		const { overview, container } = createOverview([session]);
		const input = card(container, session.sessionId).querySelector('textarea')!;
		input.focus();
		input.dispatchEvent(new FocusEvent('focus'));
		status.set(SessionStatus.Completed, undefined);
		const retainedWhileTyping = input.isConnected;
		overview.focusSearch();
		input.dispatchEvent(new FocusEvent('blur'));
		await timeout(30);
		assert.deepStrictEqual({ retainedWhileTyping, regrouped: !input.isConnected }, { retainedWhileTyping: true, regrouped: true });
	});

	test('closing review does not reload content filtered out while the board was suspended', () => {
		const session = makeSession(URI.parse('test:/suspended-filter'));
		const { overview, board, container, review, contentInputs, contentDisposals } = createOverview([session], 'all');
		overview.toggleMaximizeSession(session.sessionId);
		review.set({ sessionResource: session.resource, section: SessionReviewSection.Conversation }, undefined);
		board.updateOptions({ filter: 'No match' });
		review.set(undefined, undefined);
		assert.deepStrictEqual({
			loads: contentInputs.length, disposals: contentDisposals(), cards: container.querySelectorAll('.session-work-card').length,
		}, { loads: 1, disposals: 1, cards: 0 });
	});

	test('native collection drops clear the filter and reveal the moved real session', async () => {
		const session = makeSession(URI.parse('test:/move'));
		const { board, container, memberships, loadCount } = createOverview([session], 'all', { collection: 'collection', collectionMembers: [] });
		board.updateOptions({ filter: 'No match' });
		const target = container.querySelector<HTMLElement>('.session-card-board')!;
		const transfer = new DataTransfer();
		transfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() }));
		const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer });
		target.dispatchEvent(over);
		target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		await timeout(0);
		assert.deepStrictEqual({
			accepted: over.defaultPrevented, membership: memberships.get(session.sessionId),
			filter: board.options.get().filter, visible: !!card(container, session.sessionId), loads: loadCount(),
		}, { accepted: true, membership: 'collection', filter: '', visible: true, loads: 0 });
	});

	function oldSession(resource = URI.parse('test:/old')) {
		const session = makeSession(resource, { isQuickChat: true });
		const ended = constObservable(new Date(Date.now() - 61 * 86400000));
		const archived = observableValue('archived', false);
		const chat = { ...session.mainChat.get(), isArchived: archived, lastTurnEnd: ended };
		return { ...session, isArchived: archived, lastTurnEnd: ended, mainChat: constObservable(chat), chats: constObservable([chat]) };
	}

	for (const view of ['overview', 'review'] as const) {
		test(`${view} shows all unreviewed results directly in one flat section`, () => {
			const previouslyReviewed = oldSession(URI.parse('test:/previously-reviewed'));
			const neverReviewed = oldSession(URI.parse('test:/never-reviewed'));
			const { container, contentInputs, loadCount } = createOverview([previouslyReviewed, neverReviewed], view, {
				reviewCheckpoints: new ResourceMap([[previouslyReviewed.resource, 'older-results']]),
			});
			const reviewHeader = section(container, 'Needs review');
			const reviewSection = reviewHeader.parentElement!;
			assert.deepStrictEqual({
				count: reviewHeader.querySelector('.session-work-section-count')?.textContent,
				cards: [...reviewSection.querySelectorAll<HTMLElement>('.session-card-board-slot')].map(card => card.dataset.cardId).sort(),
				subsections: reviewSection.querySelectorAll('.session-work-section').length,
				expandedCards: reviewSection.querySelectorAll('.session-work-card.expanded').length,
				contentInputs, loads: loadCount(),
			}, {
				count: '2', cards: [previouslyReviewed.sessionId, neverReviewed.sessionId].sort(),
				subsections: 0, expandedCards: 0, contentInputs: [], loads: 0,
			});
		});
	}

	test('search shows matching review results without repeating them in All sessions', () => {
		const { board, container } = createOverview([oldSession()]);
		board.updateOptions({ filter: 'Test' });
		assert.strictEqual(container.querySelectorAll('.session-work-card').length, 1);
	});

	test('search remains a metadata filter and never performs archive commands', () => {
		const { board, overview, archived, loadCount } = createOverview([makeSession(URI.parse('test:/search'))], 'all');
		board.updateOptions({ filter: 'archive everything' });
		assert.deepStrictEqual({ count: overview.sessions.length, archived, loads: loadCount() }, { count: 0, archived: [], loads: 0 });
	});

	async function clickArchive(overview: SessionBoardView, container: HTMLElement, id: string): Promise<void> {
		overview.focusSession(id);
		const checkbox = card(container, id).querySelector<HTMLElement>('[role=checkbox]');
		assert.ok(checkbox);
		checkbox.click();
		const button = container.querySelector<HTMLElement>('.session-work-batch .monaco-button')!;
		assert.notStrictEqual(button.getAttribute('aria-disabled'), 'true');
		button.click();
		await timeout(0);
	}

	test('cancelling archive confirmation does not change the selected session', async () => {
		const session = oldSession();
		const { overview, container, archived } = createOverview([session], 'archive', { reviewed: true });
		await clickArchive(overview, container, session.sessionId);
		assert.deepStrictEqual({ archived, state: session.isArchived.get() }, { archived: [], state: false });
	});

	test('archive rechecks activity after confirmation instead of trusting the card snapshot', async () => {
		const session = oldSession();
		const state = observableValue('status', SessionStatus.Completed);
		const chat = { ...session.mainChat.get(), status: state };
		const current = { ...session, status: state, mainChat: constObservable(chat), chats: constObservable([chat]) };
		const { overview, container, archived } = createOverview([current], 'archive', {
			reviewed: true, confirm: () => { state.set(SessionStatus.InProgress, undefined); return true; },
		});
		await clickArchive(overview, container, session.sessionId);
		assert.deepStrictEqual(archived, []);
	});

	test('archive protects an unsent draft without acquiring its model', async () => {
		const session = oldSession();
		const { overview, container, archived, loadCount } = createOverview([session], 'archive', { reviewed: true, draft: 'Keep this draft', confirm: () => true });
		await clickArchive(overview, container, session.sessionId);
		assert.deepStrictEqual({ archived, loads: loadCount() }, { archived: [], loads: 0 });
	});

	test('confirmed archive routes through management and displays its inspection reason', async () => {
		const session = oldSession();
		const { overview, container, archived } = createOverview([session], 'archive', {
			reviewed: true, confirm: () => true, archive: () => session.isArchived.set(true, undefined),
		});
		const reasonVisible = !card(container, session.sessionId).querySelector<HTMLElement>('.session-work-card-unavailable')!.hidden;
		await clickArchive(overview, container, session.sessionId);
		assert.deepStrictEqual({ reasonVisible, archived, state: session.isArchived.get() }, { reasonVisible: true, archived: [session.sessionId], state: true });
	});

	test('unknown queues remain inspection-only', () => {
		const { overview, loadCount } = createOverview([oldSession()], 'archive', { reviewed: true, cachedModels: false });
		assert.deepStrictEqual({ unknownQueue: overview.getAccessibleContent().includes('Pending request information is unavailable'), loads: loadCount() }, { unknownQueue: true, loads: 0 });
	});
});
