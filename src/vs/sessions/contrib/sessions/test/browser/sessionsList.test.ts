/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { computeReorderSortChanges, groupByDate, groupByWorkspace, groupSessionsForList, limitSessionsForList, sortSessions, SessionsGrouping, SessionsSorting } from '../../browser/views/sessionsList.js';

function createSession(id: string, opts: {
	workspaceLabel?: string;
	createdAt?: Date;
	updatedAt?: Date;
	isArchived?: boolean;
}): ISession {
	const createdAt = opts.createdAt ?? new Date();
	const updatedAt = opts.updatedAt ?? createdAt;
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt,
		workspace: observableValue(`workspace-${id}`, opts.workspaceLabel !== undefined ? {
			uri: URI.parse(`session://workspace/${id}`),
			label: opts.workspaceLabel,
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		} : undefined),
		isQuickChat: observableValue(`isQuickChat-${id}`, opts.workspaceLabel === undefined),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		changesets: observableValue(`changesets-${id}`, []),
		changes: observableValue(`changes-${id}`, []),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, opts.isArchived ?? false),
		isRead: observableValue(`isRead-${id}`, true),
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		chats: observableValue<readonly IChat[]>(`chats-${id}`, []),
		mainChat: observableValue<IChat>(`mainChat-${id}`, undefined!),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

suite('Sessions - SessionsList Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('groupByWorkspace', () => {

		test('groups are sorted alphabetically regardless of insertion order', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zebra' }),
				createSession('2', { workspaceLabel: 'Apple' }),
				createSession('3', { workspaceLabel: 'Mango' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Apple', 'Mango', 'Zebra']);
		});

		test('sessions without workspace are grouped under "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Beta' }),
				createSession('2', {}),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Beta', 'Unknown']);
		});

		test('multiple sessions in same workspace are grouped together', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Repo-B' }),
				createSession('2', { workspaceLabel: 'Repo-A' }),
				createSession('3', { workspaceLabel: 'Repo-B' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Repo-A', 'Repo-B']);
			assert.strictEqual(groups[0].sessions.length, 1);
			assert.strictEqual(groups[1].sessions.length, 2);
		});

		test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
			const sessions = [
				createSession('1', {}),
				createSession('2', { workspaceLabel: 'Zulu' }),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Zulu', 'Unknown']);
		});

		test('empty workspace label is treated as "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zulu' }),
				createSession('2', { workspaceLabel: '' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Zulu', 'Unknown']);
			assert.strictEqual(groups[1].sessions.length, 1);
		});

		test('group ids are prefixed with workspace:', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'MyProject' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.strictEqual(groups[0].id, 'workspace:MyProject');
		});
	});

	suite('groupByDate', () => {

		const DAY_MS = 86_400_000;

		// `groupByDate` expects sessions pre-sorted most-recent-first.
		function minutesAgo(minutes: number): Date {
			return new Date(Date.now() - minutes * 60_000);
		}

		function daysAgo(days: number): Date {
			return new Date(Date.now() - days * DAY_MS);
		}

		test('sessions within the last 7 days go to "Recent", older ones to "Older"', () => {
			const sessions = [
				createSession('recent-1', { createdAt: minutesAgo(5) }),
				createSession('recent-2', { createdAt: daysAgo(3) }),
				createSession('old-1', { createdAt: daysAgo(10) }),
				createSession('old-2', { createdAt: daysAgo(30) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['recent-1', 'recent-2'] },
				{ id: 'older', sessions: ['old-1', 'old-2'] },
			]);
		});

		test('"Recent" is capped at 10 sessions; the overflow within 7 days falls into "Older"', () => {
			const sessions = Array.from({ length: 13 }, (_, i) =>
				createSession(`s${i}`, { createdAt: minutesAgo(i + 1) }));

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] },
				{ id: 'older', sessions: ['s10', 's11', 's12'] },
			]);
		});

		test('empty sections are omitted', () => {
			const sessions = [
				createSession('only-old', { createdAt: daysAgo(20) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => s.id), ['older']);
		});
	});

	suite('sortSessions', () => {

		test('sorts by createdAt descending when sorting is Created', () => {
			const sessions = [
				createSession('old', { createdAt: new Date('2024-01-01') }),
				createSession('new', { createdAt: new Date('2024-06-01') }),
				createSession('mid', { createdAt: new Date('2024-03-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['new', 'mid', 'old']);
		});

		test('sorts by updatedAt descending when sorting is Updated', () => {
			const sessions = [
				createSession('a', { createdAt: new Date('2024-06-01'), updatedAt: new Date('2024-07-01') }),
				createSession('b', { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-01') }),
				createSession('c', { createdAt: new Date('2024-03-01'), updatedAt: new Date('2024-08-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Updated);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['b', 'c', 'a']);
		});
	});

	suite('limitSessionsForList', () => {

		test('caps sessions and returns a show more item', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2'],
				showMore: {
					showMore: true,
					kind: 'sessions',
					mode: 'more',
					sectionId: 'group:alpha',
					sectionLabel: 'Alpha',
					remainingCount: 1,
				},
			});
		});

		test('returns all sessions and a show less item when expanded', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: true,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: {
					showMore: true,
					kind: 'sessions',
					mode: 'less',
					sectionId: 'group:alpha',
					sectionLabel: 'Alpha',
					remainingCount: 0,
				},
			});
		});

		test('does not cap when disabled', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: false,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: undefined,
			});
		});
	});

	suite('groupSessionsForList', () => {

		test('shows pinned sessions in a dedicated top section', () => {
			const pinned = createSession('pinned', { workspaceLabel: 'Alpha', createdAt: new Date('2024-06-01') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-05-01') });
			const sections = groupSessionsForList(
				[pinned, regular],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['pinned', 'workspace:Beta']);
			assert.deepStrictEqual(sections[0].sessions.map(session => session.sessionId), ['pinned']);
		});

		test('keeps archived sessions in Done even when pinned', () => {
			const archivedPinned = createSession('archived-pinned', { workspaceLabel: 'Alpha', isArchived: true, createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[archivedPinned],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['archived']);
			assert.deepStrictEqual(sections[0].sessions.map(session => session.sessionId), ['archived-pinned']);
		});

		test('sorts pinned sessions using supplied sort keys', () => {
			const first = createSession('first', { createdAt: new Date('2024-01-01') });
			const second = createSession('second', { createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[first, second],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
				session => session.sessionId === first.sessionId ? 200 : 100,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(session => session.sessionId) })), [
				{ id: 'pinned', sessions: ['first', 'second'] },
			]);
		});

		test('workspace-less sessions form a Chats section directly below Pinned (above groups)', () => {
			const pinned = createSession('pinned', { workspaceLabel: 'Alpha', createdAt: new Date('2024-06-03') });
			const quick = createSession('quick', { createdAt: new Date('2024-06-02') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-06-01') });
			const archived = createSession('archived', { workspaceLabel: 'Gamma', isArchived: true, createdAt: new Date('2024-05-01') });
			const sections = groupSessionsForList(
				[pinned, quick, regular, archived],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(s => s.sessionId) })), [
				{ id: 'pinned', sessions: ['pinned'] },
				{ id: 'quickchats', sessions: ['quick'] },
				{ id: 'workspace:Beta', sessions: ['regular'] },
				{ id: 'archived', sessions: ['archived'] },
			]);
		});

		test('pinned quick chat stays in Pinned, not Quick Chats', () => {
			const quick = createSession('quick', { createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[quick],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['pinned']);
		});

		test('Chats section sits directly below Pinned when grouping by date', () => {
			const pinned = createSession('pinned', { createdAt: new Date('2024-06-03') });
			const quick = createSession('quick', { createdAt: new Date('2024-06-02') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[pinned, quick, regular],
				SessionsGrouping.Date,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.strictEqual(sections[0].id, 'pinned');
			assert.strictEqual(sections[1].id, 'quickchats');
			assert.deepStrictEqual(sections[1].sessions.map(s => s.sessionId), ['quick']);
		});
	});

	suite('computeReorderSortChanges', () => {
		const NOW = 1_000_000;
		const STEP = 60_000;

		test('single drop between two neighbours uses the midpoint', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [10],
				aboveKey: 100,
				belowKey: 50,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], [['x', 75]]);
			assert.deepStrictEqual(clear, []);
		});

		test('drop above the first session uses the current time', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [10],
				aboveKey: undefined,
				belowKey: 200,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			const value = set.get('x')!;
			assert.ok(value > 200 && value < NOW, `expected ${value} between 200 and ${NOW}`);
		});

		test('drop below the last session steps below the last key', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [500],
				aboveKey: 100,
				belowKey: undefined,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			assert.ok(set.get('x')! < 100);
		});

		test('drops the fake value when the natural key already fits the slot', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [75],
				aboveKey: 100,
				belowKey: 50,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], []);
			assert.deepStrictEqual(clear, ['x']);
		});

		test('multi-block gets strictly descending keys inside the gap', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b', 'c'],
				naturalKeys: [5, 4, 3],
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			const values = ['a', 'b', 'c'].map(id => set.get(id)!);
			assert.deepStrictEqual(values, [85, 70, 55]);
			assert.ok(values.every(v => v > 40 && v < 100));
		});

		test('multi-block clears overrides when all natural keys already fit in order', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b'],
				naturalKeys: [80, 60],
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], []);
			assert.deepStrictEqual(clear, ['a', 'b']);
		});

		test('multi-block assigns synthetic keys when natural order does not fit', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b'],
				naturalKeys: [60, 80], // ascending: does not match descending display order
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			assert.strictEqual(set.size, 2);
			assert.ok(set.get('a')! > set.get('b')!);
		});
	});
});
