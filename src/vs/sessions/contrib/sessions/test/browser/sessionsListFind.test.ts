/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, spy } from 'sinon';
import { TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import type { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ChatInteractivity, ChatOriginKind, type IChat, type ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { getCollapsedFindAncestors, SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession, type IListHarnessOptions } from './sessionsListTestUtils.js';

suite('Sessions - SessionsList Find', () => {
	const lists = new Set<SessionsList>();

	teardown(async () => {
		for (const list of lists) {
			list.closeFind();
		}
		lists.clear();
		await timeout(300);
		restore();
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const sectionCollapseStateKey = 'sessionsListControl.sectionCollapseState';
	const sessionCollapseStateKey = 'sessionsListControl.sessionCollapseState';

	function withPeerChats(session: ISession, ...titles: string[]): ISession {
		const peers = titles.map(title => upcastPartial<IChat>({
			resource: session.resource.with({ fragment: title }),
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

	async function renderList(sessions: ISession[], options: IListHarnessOptions = {}) {
		const harness = createListHarness(disposables, sessions, options);
		const createList = async () => {
			const container = harness.createContainer(400, 800);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			lists.add(list);
			list.setWorkspaceGroupCapped(false);
			list.layout(800, 400);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			return { list, container };
		};
		return { ...harness, ...await createList(), createList };
	}

	function rowFor(container: HTMLElement, label: string): HTMLElement {
		const row = [...container.querySelectorAll<HTMLElement>('.session-title, .session-chat-title, .session-section-label')]
			.find(element => element.textContent === label)?.closest<HTMLElement>('.monaco-list-row');
		assert.ok(row, `Missing row: ${label}`);
		return row;
	}

	function setExpanded(container: HTMLElement, label: string, expanded: boolean): void {
		const row = rowFor(container, label);
		assert.notStrictEqual(row.getAttribute('aria-expanded'), null);
		if (row.getAttribute('aria-expanded') === String(expanded)) {
			return;
		}
		const twistie = row.querySelector<HTMLElement>('.monaco-tl-twistie');
		assert.ok(twistie);
		twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
	}

	function openFind(list: SessionsList, container: HTMLElement, mode = TreeFindMode.Filter): HTMLInputElement {
		list.openFind();
		if (mode === TreeFindMode.Highlight) {
			const toggle = container.querySelector<HTMLElement>('.codicon-list-filter');
			assert.ok(toggle);
			toggle.click();
		}
		const input = container.querySelector<HTMLInputElement>('.monaco-findInput input');
		assert.ok(input);
		input.focus();
		return input;
	}

	function typePattern(input: HTMLInputElement, pattern: string): void {
		input.value = pattern;
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
	}

	function chatTitles(container: HTMLElement): string[] {
		return [...container.querySelectorAll<HTMLElement>('.session-chat-title')].map(element => element.textContent ?? '').sort();
	}

	function collapseState(storage: IStorageService) {
		return {
			sections: storage.get(sectionCollapseStateKey, StorageScope.PROFILE),
			sessions: storage.get(sessionCollapseStateKey, StorageScope.PROFILE),
		};
	}

	test('collects each collapsed ancestor once, inside out, across every sibling subtree', () => {
		const node = (element: string | null, children: ITreeNode<string | null, FuzzyScore>[] = [], collapsed = false, matched = false) =>
			upcastPartial<ITreeNode<string | null, FuzzyScore>>({ element, children, collapsed, filterData: matched ? [1, 0, 0] : FuzzyScore.Default });
		const matches = Array.from({ length: 5000 }, (_, index) => node(`match-${index}`, [], false, true));
		const nested = node(null, [
			node('outer', [
				node('first', matches, true),
				node('second', [node('match', [], false, true)], true),
			], true),
			node('unrelated', [node('not a match')], true),
			node('matching parent only', [node('not a match')], true, true),
		]);

		assert.deepStrictEqual({
			open: getCollapsedFindAncestors(node(null, [node('parent', matches)])),
			collapsed: getCollapsedFindAncestors(node(null, [node('parent', matches, true)])),
			nested: getCollapsedFindAncestors(nested),
		}, { open: [], collapsed: ['parent'], nested: ['first', 'second', 'outer'] });
	});

	for (const mode of [TreeFindMode.Filter, TreeFindMode.Highlight]) {
		const modeName = mode === TreeFindMode.Filter ? 'filter' : 'highlight';

		test(`reveals only ancestors of matching labels in ${modeName} mode`, async () => {
			const workspaceOwner = withPeerChats(createTestSession('Workspace owner', { workspaceLabel: 'Repo A' }).session, 'Needle first', 'Needle second');
			const groupOwner = withPeerChats(createTestSession('Group owner').session, 'Needle third');
			const parentOnly = withPeerChats(createTestSession('Needle owner', { workspaceLabel: 'Repo B' }).session, 'Other chat');
			const unrelated = withPeerChats(createTestSession('Unrelated', { workspaceLabel: 'Repo C' }).session, 'Unrelated chat');
			const workspaceOnly = withPeerChats(createTestSession('Workspace only', { workspaceLabel: 'Needle workspace' }).session, 'Separate chat');
			const groupOnly = withPeerChats(createTestSession('Group only').session, 'Different chat');
			const sessions = [workspaceOwner, groupOwner, parentOnly, unrelated, workspaceOnly, groupOnly];
			const { list, container } = await renderList(sessions, {
				groups: [{ id: 'custom', name: 'Custom', createdAt: 1 }, { id: 'parent', name: 'Needle group', createdAt: 2 }],
				memberships: new Map([[groupOwner.sessionId, 'custom'], [groupOnly.sessionId, 'parent']]),
			});
			for (const session of sessions) {
				setExpanded(container, session.title.get(), false);
			}
			for (const section of ['Repo A', 'Custom', 'Repo B', 'Repo C', 'Needle workspace', 'Needle group']) {
				setExpanded(container, section, false);
			}
			const expand = spy(WorkbenchObjectTree.prototype, 'expand');
			const input = openFind(list, container, mode);
			await timeout(0);
			const empty = { sessions: list.getVisibleSessions().length, expansions: expand.callCount };

			typePattern(input, 'Needle');
			const beforeReconciliation = chatTitles(container);
			await timeout(0);

			assert.deepStrictEqual({
				empty,
				beforeReconciliation,
				sessions: list.getVisibleSessions().map(session => session.title.get()).sort(),
				chats: chatTitles(container),
				parentOnlyExpanded: ['Needle owner', 'Needle workspace', 'Needle group'].map(label => rowFor(container, label).getAttribute('aria-expanded')),
				expansions: expand.callCount,
			}, {
				empty: { sessions: 0, expansions: 0 },
				beforeReconciliation: [],
				sessions: ['Group owner', 'Needle owner', 'Workspace owner'],
				chats: ['Needle first', 'Needle second', 'Needle third'],
				parentOnlyExpanded: ['false', 'false', 'false'],
				expansions: 5,
			});
		});

		test(`reconciles hidden match focus and scrolling in ${modeName} mode without taking input focus`, async () => {
			const ordinary = Array.from({ length: 20 }, (_, index) => createTestSession(`Ordinary ${index}`).session);
			const owner = withPeerChats({ ...createTestSession('Owner').session, createdAt: new Date(2020, 0, 1) }, 'Needle');
			const { list, container } = await renderList([...ordinary, owner]);
			list.layout(300, 400);
			list.reveal(owner.resource);
			setExpanded(container, 'Owner', false);
			list.reveal(ordinary[0].resource);
			const input = openFind(list, container, mode);
			const tree = container.querySelector<HTMLElement>('[role="tree"]');
			assert.ok(tree);

			typePattern(input, 'Nee');
			await timeout(0);
			const typingRetainedFocus = mainWindow.document.activeElement === input;
			typePattern(input, 'Needle');
			await timeout(0);
			const focused = container.querySelector('.monaco-list-row.focused .session-chat-title')?.textContent;
			const inputRetainedFocus = mainWindow.document.activeElement === input;
			const bounds = rowFor(container, 'Needle').getBoundingClientRect();
			const viewport = tree.getBoundingClientRect();
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

			assert.deepStrictEqual({
				focused,
				typingRetainedFocus,
				inputRetainedFocus,
				inViewport: bounds.top >= viewport.top && bounds.bottom <= viewport.bottom,
				treeRegainedFocus: mainWindow.document.activeElement === tree,
			}, { focused: 'Needle', typingRetainedFocus: true, inputRetainedFocus: true, inViewport: true, treeRegainedFocus: true });
		});

		test(`preserves saved collapse choices through ${modeName} Find and recreation but persists user expansion`, async () => {
			const workspaceOwner = withPeerChats(createTestSession('Workspace owner', { workspaceLabel: 'Repo' }).session, 'Needle workspace');
			const groupOwner = withPeerChats(createTestSession('Group owner').session, 'Needle group');
			const first = await renderList([workspaceOwner, groupOwner], {
				groups: [{ id: 'custom', name: 'Custom', createdAt: 1 }],
				memberships: new Map([[groupOwner.sessionId, 'custom']]),
			});
			for (const label of ['Workspace owner', 'Group owner', 'Repo', 'Custom']) {
				setExpanded(first.container, label, false);
			}
			const storage = first.instantiationService.get(IStorageService);
			const saved = collapseState(storage);
			const writes = spy(storage, 'store');
			const removals = spy(storage, 'remove');
			const input = openFind(first.list, first.container, mode);
			typePattern(input, 'Needle');
			await timeout(0);
			const revealedChats = chatTitles(first.container);
			const afterFind = collapseState(storage);
			typePattern(input, '');
			await timeout(0);
			const afterClear = collapseState(storage);
			const focusAfterClear = first.container.querySelector('.monaco-list-row.focused .session-chat-title')?.textContent;
			typePattern(input, 'Needle');
			await timeout(0);
			first.list.closeFind();
			await timeout(300);
			const afterClose = collapseState(storage);
			const automaticWrites = [...writes.getCalls(), ...removals.getCalls()]
				.filter(call => call.args[0] === sectionCollapseStateKey || call.args[0] === sessionCollapseStateKey).length;
			lists.delete(first.list);
			first.list.dispose();

			const second = await first.createList();
			const restoredSections = ['Repo', 'Custom'].map(label => rowFor(second.container, label).getAttribute('aria-expanded'));
			for (const label of ['Repo', 'Custom']) {
				setExpanded(second.container, label, true);
			}
			const restoredOwners = ['Workspace owner', 'Group owner'].map(label => rowFor(second.container, label).getAttribute('aria-expanded'));
			for (const label of ['Workspace owner', 'Group owner']) {
				setExpanded(second.container, label, true);
			}
			lists.delete(second.list);
			second.list.dispose();

			const third = await first.createList();
			assert.deepStrictEqual({
				revealedChats, afterFind, afterClear, focusAfterClear, afterClose, automaticWrites, restoredSections, restoredOwners,
				userExpanded: ['Repo', 'Custom', 'Workspace owner', 'Group owner'].map(label => rowFor(third.container, label).getAttribute('aria-expanded')),
			}, {
				revealedChats: ['Needle group', 'Needle workspace'],
				afterFind: saved,
				afterClear: saved,
				focusAfterClear: 'Needle group',
				afterClose: saved,
				automaticWrites: 0,
				restoredSections: ['false', 'false'],
				restoredOwners: ['false', 'false'],
				userExpanded: ['true', 'true', 'true', 'true'],
			});
		});

		test(`persists user collapse and expansion while ${modeName} Find remains open`, async () => {
			const owner = withPeerChats(createTestSession('Owner', { workspaceLabel: 'Repo' }).session, 'Needle');
			const { list, container, instantiationService } = await renderList([owner]);
			setExpanded(container, 'Owner', false);
			const input = openFind(list, container, mode);
			typePattern(input, 'Needle');
			await timeout(0);
			const storage = instantiationService.get(IStorageService);

			setExpanded(container, 'Owner', false);
			setExpanded(container, 'Owner', true);
			const expandedSessionState = storage.get(sessionCollapseStateKey, StorageScope.PROFILE);
			setExpanded(container, 'Owner', false);
			setExpanded(container, 'Repo', false);
			const collapsedSectionState = storage.getObject(sectionCollapseStateKey, StorageScope.PROFILE);
			setExpanded(container, 'Repo', true);

			assert.deepStrictEqual({
				expandedSessionState,
				collapsedSectionState,
				expandedSectionState: storage.getObject(sectionCollapseStateKey, StorageScope.PROFILE),
				collapsedSessions: storage.getObject(sessionCollapseStateKey, StorageScope.PROFILE),
				ownerExpanded: rowFor(container, 'Owner').getAttribute('aria-expanded'),
			}, {
				expandedSessionState: undefined,
				collapsedSectionState: { 'workspace:Repo': true },
				expandedSectionState: { 'workspace:Repo': false },
				collapsedSessions: [owner.resource.toString()],
				ownerExpanded: 'false',
			});
		});
	}

	test('keeps an already visible focused match stationary while expanding another matching branch', async () => {
		const visible = createTestSession('Needle visible').session;
		const ordinary = Array.from({ length: 20 }, (_, index) => createTestSession(`Ordinary ${index}`).session);
		const owner = withPeerChats({ ...createTestSession('Owner').session, createdAt: new Date(2020, 0, 1) }, 'Needle hidden');
		const { list, container } = await renderList([visible, ...ordinary, owner]);
		list.layout(300, 400);
		list.reveal(owner.resource);
		setExpanded(container, 'Owner', false);
		list.reveal(visible.resource);
		const input = openFind(list, container, TreeFindMode.Highlight);
		const before = rowFor(container, 'Needle visible').getBoundingClientRect().top;
		const reveal = spy(WorkbenchObjectTree.prototype, 'reveal');
		const expand = spy(WorkbenchObjectTree.prototype, 'expand');

		typePattern(input, 'Needle');
		await timeout(0);

		assert.deepStrictEqual({
			focused: container.querySelector('.monaco-list-row.focused .session-title')?.textContent,
			top: rowFor(container, 'Needle visible').getBoundingClientRect().top,
			reveals: reveal.callCount,
			expansions: expand.callCount,
			inputRetainedFocus: mainWindow.document.activeElement === input,
		}, { focused: 'Needle visible', top: before, reveals: 0, expansions: 1, inputRetainedFocus: true });
	});

	test('coalesces refiltering and expands only the latest pattern matches', async () => {
		const first = withPeerChats(createTestSession('First owner', { workspaceLabel: 'Repo A' }).session, 'First needle');
		const second = withPeerChats(createTestSession('Second owner', { workspaceLabel: 'Repo B' }).session, 'Second needle');
		const { list, container } = await renderList([first, second]);
		list.collapseAllSections();
		const input = openFind(list, container);
		const expand = spy(WorkbenchObjectTree.prototype, 'expand');

		typePattern(input, 'First needle');
		typePattern(input, 'Second needle');
		list.update();
		await timeout(0);

		assert.deepStrictEqual({
			sessions: list.getVisibleSessions().map(session => session.title.get()),
			chats: chatTitles(container),
			expansions: expand.callCount,
		}, { sessions: ['Second owner'], chats: ['Second needle'], expansions: 2 });
	});

	test('uses native fuzzy and contiguous match scores when the matching option changes', async () => {
		const owner = withPeerChats(createTestSession('Owner').session, 'Needle');
		const { list, container } = await renderList([owner]);
		setExpanded(container, 'Owner', false);
		const input = openFind(list, container);
		typePattern(input, 'ndl');
		await timeout(0);
		const fuzzyMatches = chatTitles(container);
		setExpanded(container, 'Owner', false);
		const toggle = container.querySelector<HTMLElement>('.codicon-search-fuzzy');
		assert.ok(toggle);
		const expand = spy(WorkbenchObjectTree.prototype, 'expand');
		toggle.click();
		await timeout(0);
		const contiguousMatches = { chats: chatTitles(container), expansions: expand.callCount };
		toggle.click();
		await timeout(0);

		assert.deepStrictEqual({ fuzzyMatches, contiguousMatches, fuzzyAgain: chatTitles(container), expansions: expand.callCount }, {
			fuzzyMatches: ['Needle'], contiguousMatches: { chats: [], expansions: 0 }, fuzzyAgain: ['Needle'], expansions: 1,
		});
	});

	for (const cancellation of ['clear', 'close', 'dispose']) {
		test(`cancels pending Find expansion on ${cancellation}`, async () => {
			const owner = withPeerChats(createTestSession('Owner').session, 'Needle');
			const { list, container, instantiationService } = await renderList([owner]);
			setExpanded(container, 'Owner', false);
			const storage = instantiationService.get(IStorageService);
			const saved = collapseState(storage);
			const input = openFind(list, container);
			const expand = spy(WorkbenchObjectTree.prototype, 'expand');
			typePattern(input, 'Needle');
			if (cancellation === 'clear') {
				typePattern(input, '');
			} else if (cancellation === 'close') {
				list.closeFind();
			} else {
				lists.delete(list);
				list.dispose();
			}
			await timeout(0);

			assert.deepStrictEqual({ expansions: expand.callCount, saved: collapseState(storage) }, { expansions: 0, saved });
		});
	}
});
