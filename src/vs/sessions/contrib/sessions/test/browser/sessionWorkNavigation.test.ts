/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import '../../../../../workbench/browser/actions/listCommands.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { ISessionGroup, ISessionGroupsChangeEvent, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { getSessionWorkViewLabel, PromotableSessionWorkView } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { SessionWorkNavigation } from '../../browser/views/sessionWorkNavigation.js';
import { createListHarness, createTestSession } from './sessionsListTestUtils.js';

class TestContextMenuService extends mock<IContextMenuService>() {
	override readonly onDidShowContextMenu = Event.None;
	override readonly onDidHideContextMenu = Event.None;
	delegate: IContextMenuDelegate | undefined;

	override showContextMenu(delegate: IContextMenuDelegate): void {
		this.delegate = delegate;
	}
}

suite('Native session work navigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const release: ISessionGroup = { id: 'release', name: 'Release', createdAt: 1 };
	const fixes: ISessionGroup = { id: 'fixes', name: 'Fixes', createdAt: 2 };

	function createNavigation(sessions: ISession[] = []) {
		const harness = createListHarness(store, sessions);
		const instantiation = harness.instantiationService;
		const board = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		const groupsChanged = store.add(new Emitter<ISessionGroupsChangeEvent>());
		const visible = observableValue('boardVisible', true);
		const memberships = new Map<string, string>();
		const moves: { sessions: string[]; collection: string }[] = [];
		const errors: (string | Error)[] = [];
		let groups: readonly ISessionGroup[] = [];
		let acquisitions = 0;
		const menus = new TestContextMenuService();
		harness.managementService.getSession = resource => sessions.find(session => isEqual(session.resource, resource));
		instantiation.stub(IListService, store.add(new ListService()));
		instantiation.stub(ISessionsBoardService, board);
		instantiation.stub(ISessionsService, { isSessionBoardVisible: visible, activeSession: constObservable(undefined), visibleSessions: constObservable([]) });
		instantiation.stub(ISessionGroupsService, {
			onDidChange: groupsChanged.event,
			getGroups: () => [...groups],
			getGroup: id => groups.find(group => group.id === id),
			getGroupOfSession: id => memberships.get(id),
			getSessionIdsInGroup: id => [...memberships].filter(([, group]) => id === group).map(([session]) => session),
			addToGroup: (sessionIdOrIds: string | Iterable<string>, collection: string) => {
				const ids = typeof sessionIdOrIds === 'string' ? [sessionIdOrIds] : [...sessionIdOrIds];
				moves.push({ sessions: ids, collection });
				for (const id of ids) { memberships.set(id, collection); }
				groupsChanged.fire({ groupsChanged: false, membershipChanged: new Set(ids) });
			},
		});
		instantiation.stub(IContextMenuService, menus);
		instantiation.stub(INotificationService, { error: error => errors.push(...Array.isArray(error) ? error : [error]) });
		instantiation.stub(IChatService, {
			chatModels: constObservable([]),
			acquireOrLoadSession: async () => { acquisitions++; throw new Error('Navigation must not load chat models'); },
		});
		const container = harness.createContainer(320, 600);
		const navigation = store.add(instantiation.createInstance(SessionWorkNavigation, container));
		navigation.layout(600, 320);
		const setGroups = (value: readonly ISessionGroup[]) => {
			groups = value;
			groupsChanged.fire({ groupsChanged: true, membershipChanged: new Set() });
		};
		return { ...harness, board, visible, navigation, container, setGroups, moves, errors, menus, acquisitions: () => acquisitions };
	}

	function row(container: HTMLElement, label: string): HTMLElement {
		const element = [...container.querySelectorAll<HTMLElement>('.session-work-navigation-label')]
			.find(element => element.textContent === label)?.closest<HTMLElement>('.monaco-list-row');
		assert.ok(element, `Missing navigation row: ${label}`);
		return element;
	}

	function labels(container: HTMLElement): (string | null)[] {
		return [...container.querySelectorAll('.session-work-navigation-label')].map(element => element.textContent);
	}

	function click(element: HTMLElement): void {
		element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
	}

	function contextMenu(element: HTMLElement): void {
		element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
	}

	test('defaults to My work and a discoverable create action without permanent peer views or headings', () => {
		const { container, acquisitions } = createNavigation();
		assert.deepStrictEqual({
			labels: labels(container),
			levels: [...container.querySelectorAll('.monaco-list-row')].map(element => element.getAttribute('aria-level')),
			draggable: [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].some(element => element.draggable),
			acquisitions: acquisitions(),
		}, { labels: ['My work', 'Create Collection...'], levels: ['1', '1'], draggable: false, acquisitions: 0 });
	});

	test('manual collections, promoted builtin filters, and saved queries are flat and in that order', () => {
		const { container, board, setGroups } = createNavigation();
		setGroups([fixes, release]);
		board.setViewPromoted('needsInput', true);
		board.setViewPromoted('review', true);
		board.updateOptions({ filter: 'reconnect' });
		board.saveView('Reconnect');
		assert.deepStrictEqual({
			labels: labels(container),
			levels: [...container.querySelectorAll('.monaco-list-row')].map(element => element.getAttribute('aria-level')),
			selected: container.querySelector('.monaco-list-row.selected .session-work-navigation-label')?.textContent,
		}, {
			labels: ['My work', 'Fixes', 'Release', 'Needs you', 'Needs review', 'Reconnect', 'Create Collection...'],
			levels: ['1', '1', '1', '1', '1', '1', '1'], selected: 'Reconnect',
		});
	});

	test('opening My work or a promoted builtin clears collection, text, and status without changing other choices', () => {
		const { container, board, setGroups } = createNavigation();
		setGroups([release]);
		const views: PromotableSessionWorkView[] = ['needsInput', 'review', 'inProgress', 'all'];
		for (const view of views) { board.setViewPromoted(view, true); }
		board.updateOptions({ grouping: 'collection', sort: 'updated', showBranch: true, showReply: false });
		const before = board.options.get();
		const results = ['overview' as const, ...views].map(view => {
			board.updateOptions({ collection: release.id, filter: 'previous search', status: SessionStatus.Error });
			click(row(container, getSessionWorkViewLabel(view)));
			return board.options.get();
		});
		assert.deepStrictEqual(results, ['overview', ...views].map(view => ({ ...before, view, collection: undefined, filter: '', status: undefined })));
	});

	test('a manual collection opens all of its sessions while saved queries keep their filters', () => {
		const { container, board, setGroups } = createNavigation();
		setGroups([release]);
		board.updateOptions({ view: 'review', collection: release.id, filter: 'reconnect', status: SessionStatus.Completed, showBranch: true });
		board.saveView('Release review');
		const saved = board.options.get();
		click(row(container, 'Release'));
		const collectionOptions = board.options.get();
		click(row(container, 'Release review'));
		assert.deepStrictEqual({ collectionOptions, savedOptions: board.options.get(), definition: board.savedViews.get()[0].options }, {
			collectionOptions: { ...saved, view: 'all', filter: '', status: undefined }, savedOptions: saved, definition: saved,
		});
	});

	test('collections use the native Arrow Down and Enter list commands', async () => {
		const { container, navigation, board, setGroups, instantiationService } = createNavigation();
		setGroups([release]);
		click(row(container, 'My work'));
		navigation.focus();
		container.querySelector('.monaco-list')!.dispatchEvent(new FocusEvent('focus'));
		assert.ok(instantiationService.get(IListService).lastFocusedList, 'The navigation tree must be registered as the focused workbench list');
		const focusedLabels: (string | null | undefined)[] = [container.querySelector('.monaco-list-row.focused .session-work-navigation-label')?.textContent];
		for (const id of ['list.focusDown', 'list.select']) {
			const command = CommandsRegistry.getCommand(id);
			assert.ok(command);
			await instantiationService.invokeFunction(accessor => command.handler(accessor));
			focusedLabels.push(container.querySelector('.monaco-list-row.focused .session-work-navigation-label')?.textContent);
		}
		assert.deepStrictEqual({
			view: board.options.get().view, collection: board.options.get().collection,
			selected: container.querySelector('.monaco-list-row.selected .session-work-navigation-label')?.textContent, focusedLabels,
		}, { view: 'all', collection: release.id, selected: 'Release', focusedLabels: ['My work', 'Release', 'Release'] });
	});

	test('creation and existing collection and saved-view actions remain reachable', () => {
		const { container, board, setGroups, commandService } = createNavigation();
		setGroups([release]);
		board.saveView('Saved work');
		click(row(container, 'Create Collection...'));
		contextMenu(row(container, 'Release'));
		contextMenu(row(container, 'Saved work'));
		assert.deepStrictEqual(commandService.calls, [
			{ commandId: 'sessions.work.createCollection', args: [] },
			{ commandId: 'sessions.work.manageCollection', args: [release.id] },
			{ commandId: 'sessions.work.removeSavedView', args: [board.savedViews.get()[0].id] },
		]);
	});

	test('the keyboard context menu only unpins an automatic collection without changing its query or manual collections', async () => {
		const { container, board, setGroups, menus } = createNavigation();
		setGroups([release]);
		board.setViewPromoted('review', true);
		click(row(container, 'Needs review'));
		const before = board.options.get();
		const tree = container.querySelector<HTMLElement>('.monaco-list')!;
		for (const type of ['keydown', 'keyup']) {
			tree.dispatchEvent(new KeyboardEvent(type, { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
		}
		assert.ok(menus.delegate);
		const action = menus.delegate.getActions()[0];
		await action.run();
		assert.deepStrictEqual({
			action: action.label, promoted: board.promotedViews.get(), query: board.options.get(), labels: labels(container),
			selected: container.querySelector('.monaco-list-row.selected .session-work-navigation-label')?.textContent,
		}, { action: 'Remove from Sidebar', promoted: [], query: before, labels: ['My work', 'Release', 'Create Collection...'], selected: undefined });
	});

	test('renames and removals update the flat list and hidden destinations do not leave stale selection', () => {
		const { container, board, setGroups } = createNavigation();
		setGroups([release]);
		click(row(container, 'Release'));
		setGroups([{ ...release, name: 'Release renamed' }]);
		const renamed = labels(container);
		board.updateOptions({ view: 'archived', collection: undefined });
		const archivedSelection = container.querySelector('.monaco-list-row.selected .session-work-navigation-label')?.textContent;
		setGroups([]);
		assert.deepStrictEqual({ renamed, archivedSelection, final: labels(container) }, {
			renamed: ['My work', 'Release renamed', 'Create Collection...'], archivedSelection: undefined, final: ['My work', 'Create Collection...'],
		});
	});

	test('reports failed navigation commands', async () => {
		const { container, commandService, errors } = createNavigation();
		const error = new Error('Cannot create collection');
		commandService.executeCommand = async () => { throw error; };
		click(row(container, 'Create Collection...'));
		await Promise.resolve();
		assert.deepStrictEqual(errors, [error]);
	});

	test('the native old Sessions list can drop onto a manual collection and clears its highlight and transfer', () => {
		const session = createTestSession('Session').session;
		const harness = createNavigation([session]);
		harness.setGroups([release]);
		const sourceContainer = harness.createContainer();
		const list = store.add(harness.instantiationService.createInstance(SessionsList, sourceContainer, {
			grouping: () => SessionsGrouping.Workspace, sorting: () => SessionsSorting.Created, onSessionOpen: () => { },
		}));
		list.layout(300, 400);
		const source = sourceContainer.querySelector<HTMLElement>('.session-title')?.closest<HTMLElement>('.monaco-list-row');
		assert.ok(source);
		const target = row(harness.container, 'Release');
		const dataTransfer = new DataTransfer();
		source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
		target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
		const highlighted = target.classList.contains('drop-target');
		const payload = JSON.parse(dataTransfer.getData(SessionsDataTransfers.SESSION));
		target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		sourceContainer.querySelector('.monaco-list')!.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
		assert.deepStrictEqual({
			highlighted, payload, moves: harness.moves, acquisitions: harness.acquisitions(), errors: harness.errors,
			remainingHighlights: harness.container.querySelectorAll('.drop-target').length,
			transfer: LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>().hasData(DraggedSessionIdentifier.prototype),
		}, {
			highlighted: true, payload: { sessionId: session.sessionId, resource: session.resource.toString() },
			moves: [{ sessions: [session.sessionId], collection: release.id }], acquisitions: 0, errors: [], remainingHighlights: 0, transfer: false,
		});
	});

	test('promoted automatic and saved views never accept native collection drops', () => {
		const session = createTestSession('Session').session;
		const { container, board, moves, errors } = createNavigation([session]);
		board.setViewPromoted('review', true);
		board.saveView('Saved work');
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() }));
		const accepted = ['My work', 'Needs review', 'Saved work', 'Create Collection...'].map(label => {
			const target = row(container, label);
			target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
			const highlighted = target.classList.contains('drop-target');
			target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			return highlighted;
		});
		assert.deepStrictEqual({ accepted, moves, errors }, { accepted: [false, false, false, false], moves: [], errors: [] });
	});
});
