/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, spy } from 'sinon';
import type { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatInteractivity, ChatOriginKind, type IChat, type ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { getCollapsedFindAncestors, SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession, TestSessionsManagementService } from './sessionsListTestUtils.js';

suite('Sessions - SessionsList state', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const collapseStateKey = 'sessionsListControl.sectionCollapseState';

	teardown(() => restore());

	function withPeerChats(session: ISession, ...titles: string[]): ISession {
		const peers = titles.map((title, index) => upcastPartial<IChat>({
			resource: session.resource.with({ fragment: `peer-${index}` }),
			title: constObservable(title),
			updatedAt: constObservable(session.createdAt),
			status: constObservable(SessionStatus.Completed),
			interactivity: constObservable(ChatInteractivity.Full),
			origin: { kind: ChatOriginKind.User },
		}));
		return {
			...session,
			chats: constObservable([session.mainChat.get(), ...peers]),
			capabilities: constObservable({ supportsMultipleChats: true }),
		};
	}

	function renderList(sessions: ISession[], options: Parameters<typeof createListHarness>[2] = {}) {
		const harness = createListHarness(disposables, sessions, options);
		const container = harness.createContainer(400, 1000);
		const createList = (container: HTMLElement) => {
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(1000, 400);
			return list;
		};
		return { ...harness, container, list: createList(container), createList };
	}

	function rowFor(container: HTMLElement, title: string): HTMLElement {
		const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
			.find(row => row.querySelector('.session-title, .session-chat-title')?.textContent === title);
		assert.ok(row, `Missing tree row: ${title}`);
		return row;
	}

	function collapse(container: HTMLElement, title: string): void {
		const twistie = rowFor(container, title).querySelector<HTMLElement>('.session-chat-twistie');
		assert.ok(twistie);
		twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
	}

	function chatRowTitles(container: HTMLElement): string[] {
		return [...container.querySelectorAll<HTMLElement>('.session-chat-title')].map(element => element.textContent ?? '');
	}

	test('find expansion targets collapsed ancestors once, not every matching sibling', () => {
		const node = (element: string | null, children: ITreeNode<string | null, FuzzyScore>[] = [], collapsed = false, matched = false) =>
			upcastPartial<ITreeNode<string | null, FuzzyScore>>({ element, children, collapsed, filterData: matched ? [1, 0, 0] : FuzzyScore.Default });
		const matches = Array.from({ length: 5000 }, (_, index) => node(`match-${index}`, [], false, true));
		const open = node(null, [node('parent', matches)]);
		const collapsed = node(null, [node('parent', matches, true)]);
		const nested = node(null, [
			node('outer', [node('inner', matches, true)], true),
			node('unrelated', [node('not a match')], true),
			node('matching parent only', [node('not a match')], true, true),
		]);

		assert.deepStrictEqual({
			open: getCollapsedFindAncestors(open),
			collapsed: getCollapsedFindAncestors(collapsed),
			nested: getCollapsedFindAncestors(nested),
		}, { open: [], collapsed: ['parent'], nested: ['inner', 'outer'] });
	});

	test('reads one fresh collapse-state snapshot per list update', () => {
		const sessions = Array.from({ length: 30 }, (_, index) => withPeerChats({
			...createTestSession(`Owner ${index}`).session,
			createdAt: new Date(Date.now() - index * 1000),
		}, `Peer ${index}`));
		const { list, container, instantiationService } = renderList(sessions);
		list.setWorkspaceGroupCapped(false);
		const storage = instantiationService.get(IStorageService);
		storage.store(collapseStateKey, JSON.stringify(Object.fromEntries(sessions.map(session => [`session:${session.sessionId}`, true]))), StorageScope.PROFILE, StorageTarget.USER);
		const reads = spy(storage, 'get');

		list.update();
		const first = {
			reads: reads.withArgs(collapseStateKey, StorageScope.PROFILE).callCount,
			expanded: rowFor(container, 'Owner 0').getAttribute('aria-expanded'),
		};
		reads.resetHistory();
		storage.store(collapseStateKey, JSON.stringify({ 'session:Owner 0': false }), StorageScope.PROFILE, StorageTarget.USER);
		list.update();

		assert.deepStrictEqual({
			first,
			second: {
				reads: reads.withArgs(collapseStateKey, StorageScope.PROFILE).callCount,
				expanded: rowFor(container, 'Owner 0').getAttribute('aria-expanded'),
				chats: chatRowTitles(container),
			},
		}, {
			first: { reads: 1, expanded: 'false' },
			second: { reads: 1, expanded: 'true', chats: ['Peer 0'] },
		});
	});

	test('ignores invalid stored values without losing boolean branch intent', () => {
		const parent = withPeerChats(createTestSession('Parent').session, 'Peer');
		const other = withPeerChats(createTestSession('Other').session, 'Other peer');
		const { list, container, instantiationService } = renderList([parent, other]);
		const storage = instantiationService.get(IStorageService);
		storage.store(collapseStateKey, JSON.stringify({ 'session:Parent': 'true', 'session:Other': true, invalid: 1 }), StorageScope.PROFILE, StorageTarget.USER);

		list.update();
		const expanded = ['Parent', 'Other'].map(title => rowFor(container, title).getAttribute('aria-expanded'));
		collapse(container, 'Parent');

		assert.deepStrictEqual({
			expanded,
			saved: storage.getObject(collapseStateKey, StorageScope.PROFILE),
		}, { expanded: ['true', 'false'], saved: { 'session:Parent': true, 'session:Other': true } });
	});

	test('batches Collapse All for sections, groups, and peer-chat owners without dropping absent branch state', () => {
		const parent = withPeerChats(createTestSession('Parent').session, 'Peer');
		const other = withPeerChats(createTestSession('Other').session, 'Other peer');
		const { list, instantiationService } = renderList([parent, other], {
			groups: [{ id: 'group', name: 'Group', createdAt: 1 }],
			memberships: new Map([[parent.sessionId, 'group']]),
		});
		const storage = instantiationService.get(IStorageService);
		storage.store(collapseStateKey, JSON.stringify({ 'session:Absent': false }), StorageScope.PROFILE, StorageTarget.USER);
		const reads = spy(storage, 'get');
		const writes = spy(storage, 'store');

		list.collapseAllSections();
		const counts = {
			reads: reads.withArgs(collapseStateKey, StorageScope.PROFILE).callCount,
			writes: writes.getCalls().filter(call => call.args[0] === collapseStateKey && call.args[2] === StorageScope.PROFILE).length,
		};

		assert.deepStrictEqual({
			counts,
			saved: storage.getObject(collapseStateKey, StorageScope.PROFILE),
			visible: list.getVisibleSessions().map(session => session.sessionId),
		}, {
			counts: { reads: 1, writes: 1 },
			saved: { 'session:Absent': false, 'group:group': true, 'session:Parent': true, 'workspace:Workspace': true, 'session:Other': true },
			visible: [],
		});
	});

	test('persists find expansion once for many collapsed branches', async () => {
		const owners = Array.from({ length: 50 }, (_, index) => withPeerChats(createTestSession(`Owner ${index}`).session, `Needle ${index}`));
		const { list, container, instantiationService } = renderList(owners);
		list.setWorkspaceGroupCapped(false);
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		list.collapseAllSections();
		list.openFind();
		const storage = instantiationService.get(IStorageService);
		const reads = spy(storage, 'get');
		const writes = spy(storage, 'store');
		const input = container.querySelector<HTMLInputElement>('.monaco-findInput input');
		assert.ok(input);
		input.value = 'Needle';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(0);
		const result = {
			reads: reads.withArgs(collapseStateKey, StorageScope.PROFILE).callCount,
			writes: writes.getCalls().filter(call => call.args[0] === collapseStateKey && call.args[2] === StorageScope.PROFILE).length,
			visibleSessions: list.getVisibleSessions().length,
		};
		const saved = storage.getObject<Record<string, boolean>>(collapseStateKey, StorageScope.PROFILE, {});
		list.closeFind();
		await timeout(300);

		assert.deepStrictEqual({
			...result,
			expandedOwners: owners.filter(owner => saved[`session:${owner.sessionId}`] === false).length,
		}, { reads: 2, writes: 1, visibleSessions: 50, expandedOwners: 50 });
	});

	test('preserves branch collapse across grouping changes and list recreation', () => {
		const parent = withPeerChats(createTestSession('Parent').session, 'Peer');
		const harness = createListHarness(disposables, [parent]);
		let grouping = SessionsGrouping.Workspace;
		const createList = () => {
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(500, 400);
			return { list, container };
		};
		const initial = createList();
		initial.list.collapseAllSections();
		grouping = SessionsGrouping.Date;
		initial.list.resetSectionCollapseState();
		initial.list.update(true);
		initial.list.dispose();

		const snapshot = ({ list, container }: ReturnType<typeof createList>) => ({
			sessions: list.getVisibleSessions().map(session => session.sessionId),
			chats: chatRowTitles(container),
			expanded: rowFor(container, 'Parent').getAttribute('aria-expanded'),
		});
		const dateList = createList();
		const date = snapshot(dateList);
		dateList.list.dispose();
		grouping = SessionsGrouping.Workspace;
		const workspaceList = createList();

		assert.deepStrictEqual({
			date,
			workspace: snapshot(workspaceList),
			saved: harness.instantiationService.get(IStorageService).getObject(collapseStateKey, StorageScope.PROFILE),
		}, {
			date: { sessions: ['Parent'], chats: [], expanded: 'false' },
			workspace: { sessions: ['Parent'], chats: [], expanded: 'false' },
			saved: { 'session:Parent': true },
		});
	});

	for (const collapsed of [true, false]) {
		test(`removes ${collapsed ? 'collapsed' : 'expanded'} branch state only after definitive deletion`, () => {
			const parent = withPeerChats(createTestSession('Parent').session, 'Peer');
			const other = withPeerChats(createTestSession('Other').session, 'Other peer');
			const sessions = [parent, other];
			const deleted = disposables.add(new Emitter<ISession>());
			const management = new class extends TestSessionsManagementService {
				override readonly onDidDeleteSession = deleted.event;
			}(sessions);
			const { list, container, instantiationService } = renderList(sessions, service => service.stub(ISessionsManagementService, management));
			const storage = instantiationService.get(IStorageService);
			const state = () => storage.getObject<Record<string, boolean>>(collapseStateKey, StorageScope.PROFILE, {});
			collapse(container, 'Parent');
			if (!collapsed) {
				collapse(container, 'Parent');
			}
			collapse(container, 'Other');
			management.sessions = [];
			list.refresh();
			const duringRemoval = state()[`session:${parent.sessionId}`];
			management.sessions = sessions;
			list.refresh();
			const restored = rowFor(container, 'Parent').getAttribute('aria-expanded');
			management.sessions = [other];
			list.refresh();
			deleted.fire(parent);
			const afterDelete = state();
			management.sessions = [];
			list.refresh();
			deleted.fire(other);

			assert.deepStrictEqual({
				duringRemoval,
				restored,
				afterDelete,
				emptyStateRemoved: storage.get(collapseStateKey, StorageScope.PROFILE) === undefined,
			}, {
				duringRemoval: collapsed,
				restored: String(!collapsed),
				afterDelete: { [`session:${other.sessionId}`]: true },
				emptyStateRemoved: true,
			});
		});
	}

	test('expands matching peer-chat owners without expanding unrelated branches', async () => {
		const parent = withPeerChats(createTestSession('Parent', { workspaceLabel: 'Repo A' }).session, 'First needle');
		const other = withPeerChats(createTestSession('Other', { workspaceLabel: 'Repo B' }).session, 'Second needle');
		const unrelated = withPeerChats(createTestSession('Unrelated', { workspaceLabel: 'Repo C' }).session, 'Unrelated peer');
		const { list, container } = renderList([parent, other, unrelated]);
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		const snapshot = () => ({
			sessions: list.getVisibleSessions().map(session => session.sessionId),
			chats: chatRowTitles(container),
		});
		list.collapseAllSections();
		list.openFind();
		const emptyFind = snapshot();
		const input = container.querySelector<HTMLInputElement>('.monaco-findInput input');
		assert.ok(input);
		const search = async (pattern: string) => {
			input.value = pattern;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await timeout(0);
			return snapshot();
		};
		const first = await search('First needle');
		const second = await search('Second needle');
		list.closeFind();
		await timeout(300);

		assert.deepStrictEqual({ emptyFind, first, second, after: snapshot() }, {
			emptyFind: { sessions: [], chats: [] },
			first: { sessions: ['Parent'], chats: ['First needle'] },
			second: { sessions: ['Other'], chats: ['Second needle'] },
			after: { sessions: ['Parent', 'Other'], chats: ['First needle', 'Second needle'] },
		});
	});

	for (const highlight of [false, true]) {
		test(`focuses and reveals a hidden match in ${highlight ? 'highlight' : 'filter'} mode without stealing input focus`, async () => {
			const ordinary = Array.from({ length: 20 }, (_, index) => createTestSession(`Ordinary ${index}`).session);
			const parent = withPeerChats({ ...createTestSession('Parent').session, createdAt: new Date(2020, 0, 1) }, 'Needle');
			const { list, container } = renderList([...ordinary, parent]);
			list.setWorkspaceGroupCapped(false);
			list.layout(300, 400);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			list.reveal(parent.resource);
			collapse(container, 'Parent');
			list.reveal(ordinary[0].resource);
			list.openFind();
			const input = container.querySelector<HTMLInputElement>('.monaco-findInput input');
			const tree = container.querySelector<HTMLElement>('[role="tree"]');
			assert.ok(input && tree);
			if (highlight) {
				const toggle = container.querySelector<HTMLElement>('.codicon-list-filter');
				assert.ok(toggle);
				toggle.click();
			}
			input.focus();
			input.value = 'Needle';
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await timeout(0);
			const focused = container.querySelector('.monaco-list-row.focused .session-chat-title')?.textContent;
			const inputRetainedFocus = mainWindow.document.activeElement === input;
			const bounds = rowFor(container, 'Needle').getBoundingClientRect();
			const viewport = tree.getBoundingClientRect();
			const inViewport = bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
			const treeRegainedFocus = mainWindow.document.activeElement === tree;
			list.closeFind();
			await timeout(300);

			assert.deepStrictEqual({ focused, inputRetainedFocus, inViewport, treeRegainedFocus }, {
				focused: 'Needle', inputRetainedFocus: true, inViewport: true, treeRegainedFocus: true,
			});
		});
	}
});
