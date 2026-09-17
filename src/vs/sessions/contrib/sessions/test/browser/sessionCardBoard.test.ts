/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ARCHIVE_WORK_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { readSessionWorkSummary } from '../../../../services/sessions/common/sessionWorkSummary.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { ISessionCardBoardOptions, SessionCardBoard } from '../../browser/views/sessionCardBoard.js';
import { SessionWorkCardContent } from '../../browser/views/sessionWorkCardContent.js';

suite('Wrapping session card board', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(count = 6, height = 700, options: ISessionCardBoardOptions = {}) {
		const instantiation = workbenchInstantiationService(undefined, store);
		const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
		const getDraft = (resource: URI) => {
			let state = drafts.get(resource);
			if (!state) {
				state = observableValue<ISessionInputDraft>('draft', { inputText: '', attachments: [] });
				drafts.set(resource, state);
			}
			return state;
		};
		instantiation.stub(ISessionInputDraftService, { getDraft, setDraft: (resource, state) => getDraft(resource).set(state, undefined) });
		const stopped: IChat[] = [];
		const errors: unknown[] = [];
		const commands: { id: string; args: readonly unknown[] }[] = [];
		let stopFailure: Error | undefined;
		instantiation.stub(ISessionReviewService, {
			send: async () => true,
			stop: async (_session, chat) => {
				stopped.push(chat);
				if (stopFailure) { throw stopFailure; }
			},
		});
		instantiation.stub(INotificationService, { error: error => { errors.push(error); }, info: () => { } });
		instantiation.stub(ICommandService, { executeCommand: async (id, ...args) => { commands.push({ id, args }); } });
		instantiation.stub(ISessionsService, { visibleSessions: constObservable([]) });
		instantiation.stub(ISessionsBoardService, store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService())));
		let loads = 0;
		let disposals = 0;
		instantiation.stubInstance(SessionWorkCardContent, new class extends mock<SessionWorkCardContent>() {
			override readonly element = document.createElement('div');
			override readonly onDidChangeHeight = Event.None;
			override setInput(_session: ISession, _chat: IChat): void { loads++; }
			override layout(): void { }
			override focus(): void { }
			override getAccessibleContent(): string { return 'Native conversation'; }
			override dispose(): void { disposals++; this.element.remove(); }
		}());
		const data = Array.from({ length: count }, (_, index) => {
			const session = makeSession(URI.parse(`test:/wrapping-${index}`), { status: SessionStatus.InProgress });
			return {
				session,
				summary: readSessionWorkSummary(session, {}, { now: Date.now(), inactivityDays: 30, active: false, pinned: false }),
				pinned: false, archive: false, description: 'Working',
			};
		});
		const board = store.add(instantiation.createInstance(SessionCardBoard, data, options));
		const container = document.createElement('div');
		container.style.width = '984px';
		container.style.height = `${height}px`;
		document.body.appendChild(container);
		container.appendChild(board.element);
		store.add(toDisposable(() => container.remove()));
		board.layout(984, height);
		return { board, data, container, getDraft, stopped, errors, commands, failStop: (error?: Error) => { stopFailure = error; }, counts: () => ({ loads, disposals }), ids: data.map(data => data.session.sessionId) };
	}

	test('cards own their rectangles and do not create a native tree or transcript at rest', () => {
		const { board, container, counts } = setup();
		assert.deepStrictEqual({
			columns: board.layoutInfo.columns,
			widths: [...container.querySelectorAll<HTMLElement>('.session-card-board-slot')].map(element => element.clientWidth),
			trees: container.querySelectorAll('[role=tree]').length,
			counts: counts(),
		}, { columns: 3, widths: [320, 320, 320, 320, 320, 320], trees: 0, counts: { loads: 0, disposals: 0 } });
	});

	test('unchanged data, layout state and viewport do not recompute card placement', () => {
		const h = setup(2);
		const layout = h.board.layoutInfo;
		h.board.setItems([...h.data]);
		h.board.setLayoutState({ order: [...h.board.layoutState.order], sizes: [...h.board.layoutState.sizes] });
		h.board.layout(984, 700);
		h.board.setViewport(0, 700);
		assert.strictEqual(h.board.layoutInfo, layout);
	});

	test('action keys avoid constructing replacements for unchanged action state', () => {
		let creations = 0;
		const h = setup(1, 700, {
			getActions: (_entry, actions) => { creations++; return actions; },
			getActionsKey: entry => String(entry.pinned),
		});
		const initial = creations;
		h.board.setItems([{ ...h.data[0], description: 'New activity' }]);
		const activity = creations;
		h.board.setItems([{ ...h.data[0], pinned: true }]);
		assert.deepStrictEqual({ initial, activity, changed: creations }, { initial: 1, activity: 1, changed: 2 });
	});

	test('a waiting card exposes an icon-only Stop Response targeting its pending peer', async () => {
		const h = setup(1);
		const original = h.data[0].session;
		const main = { ...original.mainChat.get(), status: constObservable(SessionStatus.Completed) };
		const peer = { ...main, resource: URI.parse('test:/pending-peer'), status: observableValue('status', SessionStatus.NeedsInput) };
		const session = { ...original, mainChat: constObservable(main), chats: constObservable([main, peer]), status: peer.status };
		h.board.setItems([{ ...h.data[0], session, summary: readSessionWorkSummary(session, {}, { now: Date.now(), inactivityDays: 30, active: false, pinned: false }) }]);
		const stop = h.container.querySelector<HTMLElement>('.session-work-card-actions .codicon-debug-stop')!;
		assert.ok(stop);
		const label = stop.getAttribute('aria-label');
		const text = stop.textContent;
		stop.focus();
		stop.click();
		await timeout(0);
		peer.status.set(SessionStatus.Completed, undefined);
		assert.deepStrictEqual({
			label, text, stopped: h.stopped, errors: h.errors,
			remainingStop: h.container.querySelectorAll('.codicon-debug-stop').length,
			replyFocused: document.activeElement === h.container.querySelector('textarea'),
		}, { label: 'Stop Response', text: '', stopped: [peer], errors: [], remainingStop: 0, replyFocused: true });
	});

	test('a failed stop is reported and leaves the response control available', async () => {
		const h = setup(1);
		const failure = new Error('Could not stop the response');
		h.failStop(failure);
		h.container.querySelector<HTMLElement>('.codicon-debug-stop')!.click();
		await timeout(0);
		h.failStop();
		h.container.querySelector<HTMLElement>('.codicon-debug-stop')!.click();
		await timeout(0);
		assert.deepStrictEqual({ errors: h.errors, requests: h.stopped.length }, { errors: [failure], requests: 2 });
	});

	test('an idle card offers an archive codicon for its own session', async () => {
		const h = setup(1);
		const original = h.data[0].session;
		const chat = { ...original.mainChat.get(), status: constObservable(SessionStatus.Completed) };
		const session = { ...original, status: chat.status, mainChat: constObservable(chat), chats: constObservable([chat]) };
		h.board.setItems([{ ...h.data[0], session }]);
		const archive = h.container.querySelector<HTMLElement>('.session-work-card-actions .codicon-archive')!;
		assert.ok(archive);
		archive.click();
		await timeout(0);
		assert.deepStrictEqual({ label: archive.getAttribute('aria-label'), text: archive.textContent, commands: h.commands, errors: h.errors },
			{ label: 'Archive Session', text: '', commands: [{ id: ARCHIVE_WORK_SESSION_COMMAND_ID, args: [session] }], errors: [] });
	});

	test('resize preview moves neighboring cards and cancellation restores the original geometry', () => {
		const { board, ids, container } = setup();
		const original = board.layoutInfo;
		const before = board.layoutState;
		let commits = 0;
		store.add(board.onDidChangeLayout(() => commits++));
		board.beginResize(ids[0]);
		board.previewResize(652, 360);
		const preview = board.layoutInfo;
		const card = container.querySelector<HTMLElement>('.session-work-card')!;
		const actualWidth = card.getBoundingClientRect().width;
		board.cancelGesture();
		board.commitGesture();
		assert.deepStrictEqual({
			previewWidth: preview.cards[0].width,
			actualWidth,
			neighborLeft: preview.cards[1].left,
			restored: board.layoutInfo.cards,
			stateUnchanged: board.layoutState === before,
			commits,
		}, { previewWidth: 652, actualWidth: 652, neighborLeft: 664, restored: original.cards, stateUnchanged: true, commits: 0 });
	});

	test('a committed resize and reorder preserve the same input and conversation instance', () => {
		const { board, ids, container, getDraft, data, counts } = setup();
		getDraft(data[0].session.mainChat.get().resource).set({ inputText: 'Keep my reply', attachments: [] }, undefined);
		const input = container.querySelector('textarea');
		input?.focus();
		board.beginResize(ids[0]);
		board.previewResize(652, 360);
		board.commitGesture();
		const inputFocusedAfterResize = document.activeElement === input;
		board.beginReorder(ids[0]);
		board.previewReorder(400, board.layoutInfo.height + 10);
		const previewOrder = board.layoutInfo.cards.map(card => card.id);
		const stateDuringPreview = board.layoutState.order;
		board.commitGesture();
		assert.deepStrictEqual({
			stateDuringPreview,
			previewOrder,
			order: board.layoutState.order,
			inputKept: input?.isConnected,
			inputFocusedAfterResize,
			text: input?.value,
			counts: counts(),
		}, {
			stateDuringPreview: ids,
			previewOrder: [...ids.slice(1), ids[0]], order: [...ids.slice(1), ids[0]],
			inputKept: true, inputFocusedAfterResize: true, text: 'Keep my reply', counts: { loads: 1, disposals: 0 },
		});
	});

	test('native drag events preview then commit the same placement logic', () => {
		const { board, ids, container } = setup();
		const source = container.querySelector<HTMLElement>('.session-work-card-header')!;
		const transfer = new DataTransfer();
		source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		const bounds = board.element.getBoundingClientRect();
		board.element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: bounds.left + 400, clientY: bounds.bottom + 5 }));
		const previewVisible = !container.querySelector<HTMLElement>('.session-card-board-placeholder')!.hidden;
		board.element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
		assert.deepStrictEqual({ previewVisible, order: board.layoutState.order, inputs: container.querySelectorAll('textarea').length },
			{ previewVisible: true, order: [...ids.slice(1), ids[0]], inputs: 6 });
	});

	test('Escape cancels an active gesture and ignores remaining pointer updates', () => {
		const { board, ids } = setup();
		const before = board.layoutState;
		board.beginResize(ids[0]);
		board.previewResize(984, 400);
		getWindow(board.element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		board.previewResize(652, 500);
		board.commitGesture();
		assert.strictEqual(board.layoutState, before);
	});

	test('resize previews reject invalid dimensions rather than persisting a fallback', () => {
		const { board, ids } = setup(1);
		board.beginResize(ids[0]);
		assert.throws(() => board.previewResize(undefined, Infinity), /Invalid session card height/);
		assert.throws(() => board.previewResize(NaN), /Invalid session card width/);
		board.cancelGesture();
	});

	test('a no-op gesture does not commit, and incoming cards survive a pending reorder', () => {
		const { board, ids, data } = setup();
		let commits = 0;
		store.add(board.onDidChangeLayout(() => commits++));
		board.beginResize(ids[0]);
		board.previewResize(320, 112);
		board.commitGesture();
		const noOpCommits = commits;
		board.beginReorder(ids[0]);
		board.previewReorder(0, board.layoutInfo.height + 10);
		const incoming = { ...data[0], session: makeSession(URI.parse('test:/incoming'), { status: SessionStatus.InProgress }) };
		board.setItems([...data, incoming]);
		board.commitGesture();
		assert.deepStrictEqual({ noOpCommits, commits, order: board.layoutState.order }, {
			noOpCommits: 0, commits: 1, order: [...ids.slice(1), ids[0], incoming.session.sessionId],
		});
	});

	test('header keyboard movement and resizing do not consume text-input keys', () => {
		const { board, ids, container } = setup();
		const header = container.querySelector<HTMLElement>('.session-work-card-header')!;
		header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
		header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
		const before = board.layoutState;
		container.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ order: board.layoutState.order, span: board.layoutState.sizes[0].columnSpan, inputDidNotMove: before === board.layoutState },
			{ order: [ids[1], ids[0], ...ids.slice(2)], span: 2, inputDidNotMove: true });
	});

	test('title and Enter activation delegate the current session without expanding a card', () => {
		const opened: string[] = [];
		const { board, container, data, counts } = setup(1, 700, { onOpen: entry => opened.push(entry.session.title.get()) });
		container.querySelector<HTMLElement>('.session-work-title')!.click();
		board.setItems([{ ...data[0], session: { ...data[0].session, title: constObservable('Renamed work') } }]);
		container.querySelector<HTMLElement>('.session-work-card-header')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ opened, sizes: board.layoutState.sizes, counts: counts() }, {
			opened: ['Test', 'Renamed work'], sizes: [], counts: { loads: 0, disposals: 0 },
		});
	});

	test('checkbox and keyboard selection share state without emitting on programmatic updates', () => {
		const { board, container, ids } = setup(1, 700, { selectable: true });
		const changes: string[][] = [];
		store.add(board.onDidChangeSelection(ids => changes.push([...ids])));
		const checkbox = container.querySelector<HTMLElement>('[role=checkbox]')!;
		checkbox.click();
		container.querySelector<HTMLElement>('.session-work-card-header')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
		board.setSelection(ids);
		assert.deepStrictEqual({ changes, checked: checkbox.getAttribute('aria-checked') }, { changes: [ids, []], checked: 'true' });
	});

	test('modal suspension releases native content but keeps the initiating card and draft', () => {
		const { board, ids, container, counts, data, getDraft } = setup(1);
		getDraft(data[0].session.mainChat.get().resource).set({ inputText: 'Return here', attachments: [] }, undefined);
		board.toggleMaximizeSession(ids[0]);
		board.focusSession(ids[0]);
		const input = container.querySelector('textarea');
		const header = container.querySelector('.session-work-card-header');
		board.setSuspended(true);
		const suspended = counts();
		board.setItems([{ ...data[0], description: 'Updated while reviewing' }]);
		board.setSuspended(false);
		assert.deepStrictEqual({
			suspended, resumed: counts(),
			sameInput: input === container.querySelector('textarea'),
			sameHeader: header === container.querySelector('.session-work-card-header'),
			draft: input?.value,
		}, { suspended: { loads: 1, disposals: 1 }, resumed: { loads: 2, disposals: 1 }, sameInput: true, sameHeader: true, draft: 'Return here' });
	});

	test('an empty manual target accepts native drops only when its delegate validates them', () => {
		let accepted = false;
		let drops = 0;
		const { board, container } = setup(0, 700, { externalDrop: { canDrop: () => accepted, drop: () => drops++ } });
		const over = () => new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
		const denied = over();
		board.element.dispatchEvent(denied);
		const deniedHighlight = board.element.classList.contains('collection-drop-target');
		board.element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
		const deniedDrops = drops;
		accepted = true;
		const allowed = over();
		board.element.dispatchEvent(allowed);
		const highlighted = board.element.classList.contains('collection-drop-target');
		board.element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			deniedHighlight, deniedDrops, drops, highlighted,
			emptyHint: !container.querySelector<HTMLElement>('.session-card-board-empty')!.hidden,
			height: board.element.clientHeight,
		}, { deniedHighlight: false, deniedDrops: 0, drops: 1, highlighted: true, emptyHint: true, height: 112 });
	});

	test('a filtered board emits only its current IDs and sizes for persistence to merge', () => {
		const { board, ids, data } = setup();
		board.setLayoutState({ order: ids, sizes: [{ id: ids[0], columnSpan: 2, height: 400 }, { id: ids[1], columnSpan: 3 }] });
		board.setItems(data.slice(1));
		assert.deepStrictEqual(board.layoutState, { order: ids.slice(1), sizes: [{ id: ids[1], columnSpan: 3 }] });
	});

	test('narrowing the viewport preserves span intent and metadata remains windowed', async () => {
		const { board, ids, container, counts } = setup(100, 260);
		board.beginResize(ids[0]);
		board.previewResize(652);
		board.commitGesture();
		board.layout(300, 260);
		board.setViewport(1000, 260);
		await timeout(0);
		assert.deepStrictEqual({
			span: board.layoutState.sizes[0].columnSpan,
			effectiveSpan: board.layoutInfo.cards[0].columnSpan,
			bounded: container.querySelectorAll('.session-card-board-slot').length < 15,
			models: counts().loads,
		}, { span: 2, effectiveSpan: 1, bounded: true, models: 0 });
	});
});
