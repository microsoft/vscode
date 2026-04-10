/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsDataSource, AgentSessionListItem, IAgentSessionsFilter, sessionDateFromNow, getRepositoryName, AgentSessionsSorter, groupAgentSessionsByDate } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionSection, IAgentSession, IAgentSessionSection, IAgentSessionsModel, isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore } from '../../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus } from '../../../common/chatSessionsService.js';
import { ITreeSorter } from '../../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { AgentSessionsGrouping, AgentSessionsSorting } from '../../../browser/agentSessions/agentSessionsFilter.js';

suite('sessionDateFromNow', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_DAY = 24 * 60 * 60 * 1000;

	test('returns "1 day" for yesterday', () => {
		const now = Date.now();
		const startOfToday = new Date(now).setHours(0, 0, 0, 0);
		// Time in the middle of yesterday
		const yesterday = startOfToday - ONE_DAY / 2;
		assert.strictEqual(sessionDateFromNow(yesterday), '1 day');
	});

	test('returns "2 days" for two days ago', () => {
		const now = Date.now();
		const startOfToday = new Date(now).setHours(0, 0, 0, 0);
		const startOfYesterday = startOfToday - ONE_DAY;
		// Time in the middle of two days ago
		const twoDaysAgo = startOfYesterday - ONE_DAY / 2;
		assert.strictEqual(sessionDateFromNow(twoDaysAgo), '2 days');
	});

	test('returns fromNow result for today', () => {
		const now = Date.now();
		const startOfToday = new Date(now).setHours(0, 0, 0, 0);
		// A time from today - guaranteed to be after startOfToday
		const fiveMinutesAfterMidnight = startOfToday + 5 * 60 * 1000;
		const result = sessionDateFromNow(fiveMinutesAfterMidnight);
		// Should return a time ago string, not "1 day ago" or "2 days ago"
		assert.ok(result.includes('min') || result.includes('sec') || result.includes('hr') || result === 'now', `Expected minutes/seconds/hours ago or now, got: ${result}`);
	});

	test('returns fromNow result for three or more days ago', () => {
		const now = Date.now();
		const startOfToday = new Date(now).setHours(0, 0, 0, 0);
		// Time 5 days ago
		const fiveDaysAgo = startOfToday - 5 * ONE_DAY;
		const result = sessionDateFromNow(fiveDaysAgo);
		// Should return "5 days ago" from fromNow, not our special handling
		assert.ok(result.includes('day'), `Expected days ago, got: ${result}`);
		assert.ok(!result.includes('1 day') && !result.includes('2 days'), `Should not be 1 or 2 days ago, got: ${result}`);
	});

	test('appends "ago" when appendAgoLabel is true', () => {
		const now = Date.now();
		const startOfToday = new Date(now).setHours(0, 0, 0, 0);

		const yesterday = startOfToday - ONE_DAY / 2;
		assert.strictEqual(sessionDateFromNow(yesterday, true), '1 day ago');

		const startOfYesterday = startOfToday - ONE_DAY;
		const twoDaysAgo = startOfYesterday - ONE_DAY / 2;
		assert.strictEqual(sessionDateFromNow(twoDaysAgo, true), '2 days ago');

		const fiveDaysAgo = startOfToday - 5 * ONE_DAY;
		const result = sessionDateFromNow(fiveDaysAgo, true);
		assert.ok(result.includes('ago'), `Expected "ago" in result, got: ${result}`);
	});
});

suite('AgentSessionsDataSource', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_DAY = 24 * 60 * 60 * 1000;
	const WEEK_THRESHOLD = 7 * ONE_DAY; // 7 days

	function createMockSession(overrides: Partial<{
		id: string;
		status: ChatSessionStatus;
		isArchived: boolean;
		isPinned: boolean;
		isRead: boolean;
		hasChanges: boolean;
		startTime: number;
		endTime: number;
		metadata: { [key: string]: unknown };
		badge: string;
	}> = {}): IAgentSession {
		const now = Date.now();
		return {
			providerType: 'test',
			providerLabel: 'Test',
			resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
			status: overrides.status ?? ChatSessionStatus.Completed,
			label: `Session ${overrides.id ?? 'default'}`,
			icon: Codicon.terminal,
			timing: {
				created: overrides.startTime ?? now,
				lastRequestEnded: undefined,
				lastRequestStarted: undefined,
			},
			changes: overrides.hasChanges ? { files: 1, insertions: 10, deletions: 5 } : undefined,
			metadata: overrides.metadata,
			badge: overrides.badge,
			isArchived: () => overrides.isArchived ?? false,
			setArchived: () => { },
			isPinned: () => overrides.isPinned ?? false,
			setPinned: () => { },
			isRead: () => overrides.isRead ?? true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	function createMockModel(sessions: IAgentSession[]): IAgentSessionsModel {
		return {
			sessions,
			resolved: true,
			getSession: () => undefined,
			onWillResolve: Event.None as Event<string>,
			onDidResolve: Event.None as Event<string>,
			onDidChangeSessions: Event.None,
			onDidChangeSessionArchivedState: Event.None,
			resolve: async () => { },
		};
	}

	function createMockFilter(options: {
		groupBy?: AgentSessionsGrouping;
		exclude?: (session: IAgentSession) => boolean;
		excludeRead?: boolean;
		repositoryGroupCapped?: boolean;
	}): IAgentSessionsFilter {
		return {
			onDidChange: Event.None,
			groupResults: () => options.groupBy,
			exclude: options.exclude ?? (() => false),
			getExcludes: () => ({ providers: [], states: [], archived: false, read: options.excludeRead ?? false, repositoryGroupCapped: options.repositoryGroupCapped ?? true }),
			isDefault: () => true,
			reset: () => { },
		};
	}

	function createMockSorter(): ITreeSorter<IAgentSession> {
		return {
			compare: (a, b) => {
				// Sort by creation time, most recent first
				const aTime = a.timing.created;
				const bTime = b.timing.created;
				return bTime - aTime;
			}
		};
	}

	function getSectionsFromResult(result: Iterable<AgentSessionListItem>): IAgentSessionSection[] {
		return Array.from(result).filter((item): item is IAgentSessionSection => isAgentSessionSection(item));
	}

	suite('groupSessionsIntoSections', () => {

		test('returns flat list when groupResults is false', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', startTime: now, endTime: now }),
				createMockSession({ id: '2', startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: undefined });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Should be a flat list without sections
			assert.strictEqual(result.length, 2);
			assert.strictEqual(getSectionsFromResult(result).length, 0);
		});

		test('in-progress sessions are placed in their date-based section', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
				createMockSession({ id: '3', status: ChatSessionStatus.NeedsInput, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// No InProgress section - sessions go into date-based sections
			const todaySection = sections.find(s => s.section === AgentSessionSection.Today);
			assert.ok(todaySection);
			assert.strictEqual(todaySection.sessions.length, 2); // completed + needs-input
		});

		test('in-progress sessions appear in Today section alongside completed', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.InProgress, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// Only a Today section, no InProgress section
			assert.strictEqual(sections.length, 1);
			assert.strictEqual(sections[0].section, AgentSessionSection.Today);
			assert.strictEqual(sections[0].sessions.length, 2);
		});

		test('adds Today header when there are no active sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// Now all sections have headers, so Today section should be present
			assert.strictEqual(sections.filter(s => s.section === AgentSessionSection.Today).length, 1);
		});

		test('adds Older header for sessions older than week threshold', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			assert.strictEqual(sections.filter(s => s.section === AgentSessionSection.Older).length, 1);
		});

		test('adds Archived header for archived sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, isArchived: true, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			assert.strictEqual(sections.filter(s => s.section === AgentSessionSection.Archived).length, 1);
		});

		test('archived sessions come after older sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			const olderIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
			const archivedIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Archived);

			assert.ok(olderIndex < archivedIndex, 'Older section should come before Archived section');
		});

		test('archived in-progress sessions appear in Archived section', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'archived-active', status: ChatSessionStatus.InProgress, isArchived: true, startTime: now }),
				createMockSession({ id: 'active', status: ChatSessionStatus.InProgress, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// Verify there is both a Today and Archived section (no InProgress section)
			const todaySection = sections.find(s => s.section === AgentSessionSection.Today);
			const archivedSection = sections.find(s => s.section === AgentSessionSection.Archived);

			assert.ok(todaySection, 'Today section should exist');
			assert.ok(archivedSection, 'Archived section should exist');

			// The active session should be in Today
			assert.strictEqual(todaySection.sessions.length, 1);
			assert.strictEqual(todaySection.sessions[0].label, 'Session active');

			// The archived session should appear in Archived
			assert.strictEqual(archivedSection.sessions.length, 1);
			assert.strictEqual(archivedSection.sessions[0].label, 'Session archived-active');
		});

		test('correct order: today, week, older, archived', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'archived', status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
				createMockSession({ id: 'today', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: 'week', status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
				createMockSession({ id: 'old', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'active', status: ChatSessionStatus.InProgress, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Today section (includes in-progress session)
			assert.ok(isAgentSessionSection(result[0]));
			assert.strictEqual((result[0] as IAgentSessionSection).section, AgentSessionSection.Today);
			assert.strictEqual((result[0] as IAgentSessionSection).sessions.length, 2);

			// Week section
			assert.ok(isAgentSessionSection(result[1]));
			assert.strictEqual((result[1] as IAgentSessionSection).section, AgentSessionSection.Week);
			assert.strictEqual((result[1] as IAgentSessionSection).sessions[0].label, 'Session week');

			// Older section
			assert.ok(isAgentSessionSection(result[2]));
			assert.strictEqual((result[2] as IAgentSessionSection).section, AgentSessionSection.Older);
			assert.strictEqual((result[2] as IAgentSessionSection).sessions[0].label, 'Session old');

			// Archived section
			assert.ok(isAgentSessionSection(result[3]));
			assert.strictEqual((result[3] as IAgentSessionSection).section, AgentSessionSection.Archived);
			assert.strictEqual((result[3] as IAgentSessionSection).sessions[0].label, 'Session archived');
		});

		test('empty sessions returns empty result', () => {
			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel([]);
			const result = Array.from(dataSource.getChildren(mockModel));

			assert.strictEqual(result.length, 0);
		});

		test('only today sessions produces a Today section header', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - 1000, endTime: now - 1000 }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// All sections now have headers, so a Today section should be present
			assert.strictEqual(sections.length, 1);
			assert.strictEqual(sections[0].section, AgentSessionSection.Today);
			assert.strictEqual(sections[0].sessions.length, 2);
		});

		test('sessions are sorted within each group', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'old1', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - 2 * ONE_DAY, endTime: now - WEEK_THRESHOLD - 2 * ONE_DAY }),
				createMockSession({ id: 'old2', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'week1', status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
				createMockSession({ id: 'week2', status: ChatSessionStatus.Completed, startTime: now - 2 * ONE_DAY, endTime: now - 2 * ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// All sections now have headers
			// Week section should be first and contain sorted sessions
			const weekSection = result.find((item): item is IAgentSessionSection => isAgentSessionSection(item) && item.section === AgentSessionSection.Week);
			assert.ok(weekSection);
			assert.strictEqual(weekSection.sessions[0].label, 'Session week2');
			assert.strictEqual(weekSection.sessions[1].label, 'Session week1');

			// Older section with sorted sessions
			const olderSection = result.find((item): item is IAgentSessionSection => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
			assert.ok(olderSection);
			assert.strictEqual(olderSection.sessions[0].label, 'Session old2');
			assert.strictEqual(olderSection.sessions[1].label, 'Session old1');
		});

		test('capped grouping with unread filter returns flat list without More section', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', startTime: now, isRead: false }),
				createMockSession({ id: '2', startTime: now - ONE_DAY, isRead: false }),
				createMockSession({ id: '3', startTime: now - 2 * ONE_DAY, isRead: false }),
				createMockSession({ id: '4', startTime: now - 3 * ONE_DAY, isRead: false }),
				createMockSession({ id: '5', startTime: now - 4 * ONE_DAY, isRead: false }),
			];

			const filter = createMockFilter({
				groupBy: AgentSessionsGrouping.Capped,
				excludeRead: true  // Filtering to show only unread sessions
			});
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Should be a flat list without sections (no More section)
			assert.strictEqual(result.length, 5);
			assert.strictEqual(getSectionsFromResult(result).length, 0);
		});

		test('capped grouping without unread filter includes More section', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', startTime: now }),
				createMockSession({ id: '2', startTime: now - ONE_DAY }),
				createMockSession({ id: '3', startTime: now - 2 * ONE_DAY }),
				createMockSession({ id: '4', startTime: now - 3 * ONE_DAY }),
				createMockSession({ id: '5', startTime: now - 4 * ONE_DAY }),
			];

			const filter = createMockFilter({
				groupBy: AgentSessionsGrouping.Capped,
				excludeRead: false  // Not filtering to unread only
			});
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Should have 3 top sessions + 1 More section
			assert.strictEqual(result.length, 4);
			const sections = getSectionsFromResult(result);
			assert.strictEqual(sections.length, 1);
			assert.strictEqual(sections[0].section, AgentSessionSection.More);
			assert.strictEqual(sections[0].sessions.length, 2);
		});

		test('pinned sessions appear in Pinned section at the top with date grouping', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'pinned1', isPinned: true, startTime: now - WEEK_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'today', startTime: now }),
				createMockSession({ id: 'pinned2', isPinned: true, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			assert.strictEqual(sections[0].section, AgentSessionSection.Pinned);
			assert.strictEqual(sections[0].sessions.length, 2);
			assert.strictEqual(sections[1].section, AgentSessionSection.Today);
			assert.strictEqual(sections[1].sessions.length, 1);
		});

		test('archived pinned sessions go to Archived, not Pinned', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'archived-pinned', isPinned: true, isArchived: true, startTime: now }),
				createMockSession({ id: 'pinned', isPinned: true, startTime: now }),
				createMockSession({ id: 'today', startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			const pinnedSection = sections.find(s => s.section === AgentSessionSection.Pinned);
			const archivedSection = sections.find(s => s.section === AgentSessionSection.Archived);

			assert.ok(pinnedSection);
			assert.strictEqual(pinnedSection.sessions.length, 1);
			assert.strictEqual(pinnedSection.sessions[0].label, 'Session pinned');

			assert.ok(archivedSection);
			assert.strictEqual(archivedSection.sessions.length, 1);
			assert.strictEqual(archivedSection.sessions[0].label, 'Session archived-pinned');
		});

		test('pinned sessions are always shown above the cap with capped grouping', () => {
			const now = Date.now();
			const sessions = [
				// Recent unpinned sessions fill the top 3 by time
				createMockSession({ id: 's1', startTime: now }),
				createMockSession({ id: 's2', startTime: now - ONE_DAY }),
				createMockSession({ id: 's3', startTime: now - 2 * ONE_DAY }),
				// Unpinned overflow
				createMockSession({ id: 's4', startTime: now - 3 * ONE_DAY }),
				// Two pinned sessions with old timestamps — would fall outside top 3 by time alone
				createMockSession({ id: 'pinned1', isPinned: true, startTime: now - 4 * ONE_DAY }),
				createMockSession({ id: 'pinned2', isPinned: true, startTime: now - 5 * ONE_DAY }),
			];

			const filter = createMockFilter({
				groupBy: AgentSessionsGrouping.Capped,
				excludeRead: false
			});
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);
			const topSessions = result.filter((r): r is IAgentSession => !isAgentSessionSection(r));

			// Pinned sessions first, then up to 3 non-pinned sessions
			assert.deepStrictEqual(topSessions.map(s => s.label), [
				'Session pinned1',
				'Session pinned2',
				'Session s1',
				'Session s2',
				'Session s3',
			]);

			// Only unpinned overflow goes to More
			const moreSection = sections.find(s => s.section === AgentSessionSection.More);
			assert.ok(moreSection);
			assert.deepStrictEqual(moreSection.sessions.map(s => s.label), [
				'Session s4',
			]);
		});

		test('more pinned sessions than cap limit are all shown', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'pinned1', isPinned: true, startTime: now }),
				createMockSession({ id: 'pinned2', isPinned: true, startTime: now - ONE_DAY }),
				createMockSession({ id: 'pinned3', isPinned: true, startTime: now - 2 * ONE_DAY }),
				createMockSession({ id: 'pinned4', isPinned: true, startTime: now - 3 * ONE_DAY }),
				// Unpinned session — still fits within the cap of 3 non-pinned
				createMockSession({ id: 'unpinned1', startTime: now - 4 * ONE_DAY }),
			];

			const filter = createMockFilter({
				groupBy: AgentSessionsGrouping.Capped,
				excludeRead: false
			});
			const sorter = createMockSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);
			const topSessions = result.filter((r): r is IAgentSession => !isAgentSessionSection(r));

			// All 4 pinned + 1 unpinned (fits within cap of 3 non-pinned)
			assert.deepStrictEqual(topSessions.map(s => s.label), [
				'Session pinned1',
				'Session pinned2',
				'Session pinned3',
				'Session pinned4',
				'Session unpinned1',
			]);

			// No More section needed since unpinned count (1) is within cap (3)
			const moreSection = sections.find(s => s.section === AgentSessionSection.More);
			assert.strictEqual(moreSection, undefined);
		});

		test('unpinned NeedsInput session appears in the non-pinned section below pinned', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'needs-input', status: ChatSessionStatus.NeedsInput, startTime: now }),
				createMockSession({ id: 'pinned1', isPinned: true, startTime: now }),
				createMockSession({ id: 'pinned2', isPinned: true, startTime: now - ONE_DAY }),
				createMockSession({ id: 'pinned3', isPinned: true, startTime: now - 2 * ONE_DAY }),
				createMockSession({ id: 's1', startTime: now }),
			];

			const filter = createMockFilter({
				groupBy: AgentSessionsGrouping.Capped,
				excludeRead: false
			});
			// Use real sorter to exercise NeedsInput prioritization in capped mode
			const sorter = new AgentSessionsSorter();
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);
			const topSessions = result.filter((r): r is IAgentSession => !isAgentSessionSection(r));

			// Pinned sessions come first, then up to 3 non-pinned (NeedsInput + s1 both fit in cap)
			assert.deepStrictEqual(topSessions.map(s => s.label), [
				'Session pinned1',
				'Session pinned2',
				'Session pinned3',
				'Session needs-input',
				'Session s1',
			]);

			// All non-pinned fit within cap of 3, so no More section
			const moreSection = sections.find(s => s.section === AgentSessionSection.More);
			assert.strictEqual(moreSection, undefined);
		});
	});

	suite('groupSessionsByRepository', () => {

		function sortedGroups(result: IAgentSessionSection[]) {
			return result
				.map(s => ({ label: s.label, count: s.sessions.length }))
				.sort((a, b) => a.label.localeCompare(b.label));
		}

		test('groups sessions by metadata.owner + metadata.name (cloud sessions)', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', startTime: now, metadata: { owner: 'microsoft', name: 'vscode' } }),
				createMockSession({ id: '2', startTime: now - 1, metadata: { owner: 'microsoft', name: 'vscode' } }),
				createMockSession({ id: '3', startTime: now - 2, metadata: { owner: 'microsoft', name: 'typescript' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'typescript', count: 1 },
				{ label: 'vscode', count: 2 },
			]);
		});

		test('groups sessions by metadata.repositoryNwo', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repositoryNwo: 'microsoft/vscode' } }),
				createMockSession({ id: '2', metadata: { repositoryNwo: 'microsoft/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 2 },
			]);
		});

		test('groups sessions by metadata.repository (nwo format)', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repository: 'microsoft/vscode' } }),
				createMockSession({ id: '2', metadata: { repository: 'microsoft/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 2 },
			]);
		});

		test('groups sessions by metadata.repository (URL format)', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repository: 'https://github.com/microsoft/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('strips .git suffix from repository URLs', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repository: 'https://github.com/microsoft/vscode.git' } }),
				createMockSession({ id: '2', metadata: { repositoryUrl: 'https://github.com/microsoft/vscode.git' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 2 },
			]);
		});

		test('handles git@ SSH URLs', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repository: 'git@github.com:microsoft/vscode.git' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('groups sessions by metadata.repositoryUrl', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repositoryUrl: 'https://github.com/microsoft/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('groups sessions by metadata.repositoryPath (basename)', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repositoryPath: '/Users/user/Projects/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('groups sessions by metadata.worktreePath', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { worktreePath: '/Users/user/Projects/vscode.worktrees/my-branch' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('groups sessions by metadata.workingDirectoryPath', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { workingDirectoryPath: '/Users/user/Projects/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('resolves worktree paths to parent repo name', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { workingDirectoryPath: '/Users/user/Projects/vscode.worktrees/copilot-branch' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 1 },
			]);
		});

		test('groups sessions by badge with $(repo) prefix', () => {
			const sessions = [
				createMockSession({ id: '1', badge: '$(repo) vscode' }),
				createMockSession({ id: '2', badge: '$(repo) vscode' }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 2 },
			]);
		});

		test('groups sessions by badge with $(folder) prefix', () => {
			const sessions = [
				createMockSession({ id: '1', badge: '$(folder) my-project' }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'my-project', count: 1 },
			]);
		});

		test('cloud and local sessions for same repo merge into one group', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { owner: 'microsoft', name: 'vscode' } }),
				createMockSession({ id: '2', metadata: { repositoryPath: '/Users/user/Projects/vscode' } }),
				createMockSession({ id: '3', badge: '$(repo) vscode' }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'vscode', count: 3 },
			]);
		});

		test('sessions without any repo info go to Other', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { isolationMode: 'workspace' } }),
				createMockSession({ id: '2' }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(sortedGroups(result), [
				{ label: 'Other', count: 2 },
			]);
		});

		test('repo named "other" does not collide with the Other fallback group', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', startTime: now, metadata: { repositoryPath: '/path/other' } }),
				createMockSession({ id: '2', startTime: now - 1 }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.strictEqual(result.length, 2, 'should have 2 separate groups');
			const labels = result.map(s => s.label);
			assert.ok(labels.includes('other'), 'should have a group for repo named "other"');
			assert.ok(labels.includes('Other'), 'should have the fallback "Other" group');
			assert.strictEqual(result.find(s => s.label === 'other')!.sessions.length, 1);
			assert.strictEqual(result.find(s => s.label === 'Other')!.sessions.length, 1);
		});

		test('archived sessions go to Archived section', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repositoryPath: '/path/vscode' } }),
				createMockSession({ id: '2', isArchived: true, metadata: { repositoryPath: '/path/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(result.map(s => ({ label: s.label, section: s.section, count: s.sessions.length })), [
				{ label: 'vscode', section: AgentSessionSection.Repository, count: 1 },
				{ label: 'Archived', section: AgentSessionSection.Archived, count: 1 },
			]);
		});

		test('metadata extraction priority: owner+name > repositoryNwo > repository > repositoryUrl > repositoryPath > workingDirectoryPath > badge', () => {
			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });

			// owner+name takes priority over repositoryNwo
			const ds1 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			assert.strictEqual(getSectionsFromResult(ds1.getChildren(createMockModel([
				createMockSession({ id: '1', metadata: { owner: 'org', name: 'fromOwner', repositoryNwo: 'org/fromNwo' } }),
			])))[0].label, 'fromOwner');

			// repositoryNwo takes priority over repository
			const ds2 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			assert.strictEqual(getSectionsFromResult(ds2.getChildren(createMockModel([
				createMockSession({ id: '2', metadata: { repositoryNwo: 'org/fromNwo', repository: 'org/fromRepo' } }),
			])))[0].label, 'fromNwo');

			// badge is used when no metadata fields match
			const ds3 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			assert.strictEqual(getSectionsFromResult(ds3.getChildren(createMockModel([
				createMockSession({ id: '3', metadata: { isolationMode: 'workspace' }, badge: '$(repo) fromBadge' }),
			])))[0].label, 'fromBadge');
		});

		test('empty string metadata values are treated as missing', () => {
			const sessions = [
				createMockSession({ id: '1', metadata: { repositoryNwo: '', repositoryPath: '/path/vscode' } }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			assert.deepStrictEqual(result.map(s => s.label), ['vscode']);
		});

		test('Other group appears after named repos and before Archived', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'no-repo', startTime: now }),
				createMockSession({ id: 'repo-a', startTime: now - 1, metadata: { repositoryPath: '/path/alpha' } }),
				createMockSession({ id: 'archived', startTime: now - 2, isArchived: true }),
				createMockSession({ id: 'repo-b', startTime: now - 3, metadata: { repositoryPath: '/path/beta' } }),
				createMockSession({ id: 'no-repo-2', startTime: now - 4 }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));

			const labels = result.map(s => s.label);
			const otherIndex = labels.indexOf('Other');
			const archivedIndex = labels.indexOf('Archived');

			// Other must exist and contain the 2 sessions without repo info
			assert.ok(otherIndex !== -1, 'Other section should be present');
			assert.strictEqual(result[otherIndex].sessions.length, 2);

			// Other must come after all named repo groups
			for (let i = 0; i < otherIndex; i++) {
				assert.strictEqual(result[i].section, AgentSessionSection.Repository, `section at index ${i} should be a named repository group`);
			}

			// Archived must come after Other
			assert.ok(archivedIndex > otherIndex, 'Archived section should come after Other');
		});

		test('pinned sessions are top-level items before alphabetized repository sections', () => {
			const now = Date.now();
			const pinnedSession = createMockSession({ id: 'pinned', isPinned: true, startTime: now + 10, metadata: { repositoryPath: '/path/zebra' } });
			const sessions = [
				createMockSession({ id: 'other', startTime: now + 9 }),
				createMockSession({ id: 'zebra', startTime: now + 8, metadata: { repositoryPath: '/path/zebra' } }),
				createMockSession({ id: 'alpha', startTime: now + 7, metadata: { repositoryPath: '/path/Alpha' } }),
				createMockSession({ id: 'archived', isArchived: true, startTime: now + 6, metadata: { repositoryPath: '/path/middle' } }),
				pinnedSession,
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const result = Array.from(dataSource.getChildren(createMockModel(sessions)));

			assert.ok(isAgentSession(result[0]), 'first item should be the pinned session');
			assert.strictEqual(result[0].resource.toString(), pinnedSession.resource.toString());

			const sections = result.filter((item): item is IAgentSessionSection => isAgentSessionSection(item));
			assert.deepStrictEqual(sections.map(section => ({ label: section.label, section: section.section, count: section.sessions.length })), [
				{ label: 'Alpha', section: AgentSessionSection.Repository, count: 1 },
				{ label: 'zebra', section: AgentSessionSection.Repository, count: 1 },
				{ label: 'Other', section: AgentSessionSection.Repository, count: 1 },
				{ label: 'Archived', section: AgentSessionSection.Archived, count: 1 },
			]);
		});
	});

	suite('repositoryGroupLimit', () => {

		test('caps repo group children at limit and appends show-more item', () => {
			const now = Date.now();
			const sessions = Array.from({ length: 8 }, (_, i) =>
				createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 })
			);

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
			const model = createMockModel(sessions);
			const topLevel = Array.from(dataSource.getChildren(model));
			const section = topLevel.find(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository) as IAgentSessionSection;
			assert.ok(section);

			const children = Array.from(dataSource.getChildren(section));
			assert.strictEqual(children.length, 6); // 5 sessions + 1 show-more
			const showMore = children[5];
			assert.ok(isAgentSessionShowMore(showMore));
			assert.strictEqual(showMore.remainingCount, 3);
			assert.strictEqual(showMore.sectionLabel, 'vscode');
		});

		test('does not cap when group has fewer items than limit', () => {
			const now = Date.now();
			const sessions = Array.from({ length: 3 }, (_, i) =>
				createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 })
			);

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
			const model = createMockModel(sessions);
			const topLevel = Array.from(dataSource.getChildren(model));
			const section = topLevel.find(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository) as IAgentSessionSection;

			const children = Array.from(dataSource.getChildren(section));
			assert.strictEqual(children.length, 3);
			assert.ok(!children.some(isAgentSessionShowMore));
		});

		test('expanding a group removes the cap and appends show-less item', () => {
			const now = Date.now();
			const sessions = Array.from({ length: 8 }, (_, i) =>
				createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 })
			);

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
			const model = createMockModel(sessions);
			const topLevel = Array.from(dataSource.getChildren(model));
			const section = topLevel.find(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository) as IAgentSessionSection;

			dataSource.expandRepositoryGroup('vscode');
			const children = Array.from(dataSource.getChildren(section));
			assert.strictEqual(children.length, 9); // 8 sessions + 1 show-less
			assert.ok(!children.some(isAgentSessionShowMore));
			const showLess = children[8];
			assert.ok(isAgentSessionShowLess(showLess));
			assert.strictEqual(showLess.sectionLabel, 'vscode');
		});

		test('does not cap non-repository sections', () => {
			const now = Date.now();
			const sessions = Array.from({ length: 8 }, (_, i) =>
				createMockSession({ id: `s${i}`, startTime: now - i * 1000 })
			);

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
			const model = createMockModel(sessions);
			const topLevel = Array.from(dataSource.getChildren(model));
			const todaySection = topLevel.find(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Today) as IAgentSessionSection;

			const children = Array.from(dataSource.getChildren(todaySection));
			assert.strictEqual(children.length, 8);
			assert.ok(!children.some(isAgentSessionShowMore));
		});

		test('does not cap when repositoryGroupLimit is not set', () => {
			const now = Date.now();
			const sessions = Array.from({ length: 8 }, (_, i) =>
				createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 })
			);

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
			const model = createMockModel(sessions);
			const topLevel = Array.from(dataSource.getChildren(model));
			const section = topLevel.find(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository) as IAgentSessionSection;

			const children = Array.from(dataSource.getChildren(section));
			assert.strictEqual(children.length, 8);
			assert.ok(!children.some(isAgentSessionShowMore));
		});

		test('does not cap when repositoryGroupCapped filter is disabled', () => {
			const now = Date.now();
			const sessions = Array.from({ length: 8 }, (_, i) =>
				createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 })
			);

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository, repositoryGroupCapped: false });
			const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
			const model = createMockModel(sessions);
			const topLevel = Array.from(dataSource.getChildren(model));
			const section = topLevel.find(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository) as IAgentSessionSection;

			const children = Array.from(dataSource.getChildren(section));
			assert.strictEqual(children.length, 8);
			assert.ok(!children.some(isAgentSessionShowMore));
		});
	});

	suite('getRepositoryName', () => {

		test('returns metadata.name when owner and name are present', () => {
			const session = createMockSession({ id: '1', metadata: { owner: 'microsoft', name: 'vscode' } });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns repo from repositoryNwo', () => {
			const session = createMockSession({ id: '1', metadata: { repositoryNwo: 'microsoft/vscode' } });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns repo from repository URL', () => {
			const session = createMockSession({ id: '1', metadata: { repository: 'https://github.com/microsoft/vscode' } });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns repo from repositoryPath basename', () => {
			const session = createMockSession({ id: '1', metadata: { repositoryPath: '/Users/user/Projects/vscode' } });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns parent repo name from worktree path', () => {
			const session = createMockSession({ id: '1', metadata: { worktreePath: '/Users/user/Projects/vscode.worktrees/my-branch' } });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns name from badge with $(repo) prefix', () => {
			const session = createMockSession({ id: '1', badge: '$(repo) vscode' });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns name from badge with $(folder) prefix', () => {
			const session = createMockSession({ id: '1', badge: '$(folder) my-project' });
			assert.strictEqual(getRepositoryName(session), 'my-project');
		});

		test('metadata repo name takes priority over badge name', () => {
			const session = createMockSession({ id: '1', metadata: { owner: 'microsoft', name: 'vscode' }, badge: '$(folder) copilot-worktree-branch' });
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});

		test('returns undefined when no repo info is available', () => {
			const session = createMockSession({ id: '1' });
			assert.strictEqual(getRepositoryName(session), undefined);
		});

		test('badge name can differ from metadata repo name (worktree scenario)', () => {
			// This is the key scenario: a session in a worktree where the badge shows
			// the worktree folder name but the repo name (from metadata) is different.
			// The renderer uses this to decide whether to hide the badge when grouped by repo.
			const session = createMockSession({
				id: '1',
				metadata: { repositoryPath: '/Users/user/Projects/vscode' },
				badge: '$(folder) copilot-worktree-2026-03-13T00-27-32',
			});
			assert.strictEqual(getRepositoryName(session), 'vscode');
			// Badge text shows a different name than the repo — renderer should NOT hide it
		});

		test('archived session still returns repo name from metadata', () => {
			// Archived sessions are grouped under "Archived", not under a repo section,
			// so the renderer must keep their badge visible even when the badge name
			// matches the repo name. getRepositoryName still resolves normally.
			const session = createMockSession({
				id: '1',
				isArchived: true,
				metadata: { repositoryPath: '/Users/user/Projects/vscode' },
				badge: '$(repo) vscode',
			});
			assert.strictEqual(getRepositoryName(session), 'vscode');
		});
	});
});

suite('AgentSessionsSorter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(overrides: Partial<{
		id: string;
		status: ChatSessionStatus;
		isArchived: boolean;
		isPinned: boolean;
		created: number;
		lastRequestStarted: number;
		lastRequestEnded: number;
	}>): IAgentSession {
		const now = Date.now();
		return {
			providerType: 'test',
			providerLabel: 'Test',
			resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
			status: overrides.status ?? ChatSessionStatus.Completed,
			label: `Session ${overrides.id ?? 'default'}`,
			icon: Codicon.terminal,
			timing: {
				created: overrides.created ?? now,
				lastRequestEnded: overrides.lastRequestEnded,
				lastRequestStarted: overrides.lastRequestStarted,
			},
			changes: undefined,
			metadata: undefined,
			isArchived: () => overrides.isArchived ?? false,
			setArchived: () => { },
			isPinned: () => overrides.isPinned ?? false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	test('default: sorts by creation time (most recent first)', () => {
		const sorter = new AgentSessionsSorter();
		const old = createSession({ id: 'old', created: 1000 });
		const recent = createSession({ id: 'recent', created: 2000 });

		const sorted = [old, recent].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session recent', 'Session old']);
	});

	test('default: archived sessions come last', () => {
		const sorter = new AgentSessionsSorter();
		const archived = createSession({ id: 'archived', isArchived: true, created: 3000 });
		const active = createSession({ id: 'active', created: 1000 });

		const sorted = [archived, active].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session active', 'Session archived']);
	});

	test('default: does NOT prioritize needs-input sessions', () => {
		const sorter = new AgentSessionsSorter();
		const needsInput = createSession({ id: 'needs', status: ChatSessionStatus.NeedsInput, created: 1000 });
		const completed = createSession({ id: 'done', status: ChatSessionStatus.Completed, created: 2000 });

		const sorted = [needsInput, completed].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session done', 'Session needs']);
	});

	test('prioritizeActive: needs-input sessions come first', () => {
		const sorter = new AgentSessionsSorter();
		const needsInput = createSession({ id: 'needs', status: ChatSessionStatus.NeedsInput, created: 1000 });
		const completed = createSession({ id: 'done', status: ChatSessionStatus.Completed, created: 2000 });

		const sorted = [completed, needsInput].sort((a, b) => sorter.compare(a, b, true));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session needs', 'Session done']);
	});

	test('prioritizeActive: archived still come last when not active', () => {
		const sorter = new AgentSessionsSorter();
		const archived = createSession({ id: 'archived', isArchived: true, created: 3000 });
		const active = createSession({ id: 'active', created: 1000 });

		const sorted = [archived, active].sort((a, b) => sorter.compare(a, b, true));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session active', 'Session archived']);
	});

	test('prioritizeActive: uses lastRequestStarted for time sorting', () => {
		const sorter = new AgentSessionsSorter();
		const recentlyActive = createSession({ id: 'recent-active', created: 1000, lastRequestStarted: 5000 });
		const recentlyCreated = createSession({ id: 'recent-created', created: 3000 });

		const sorted = [recentlyCreated, recentlyActive].sort((a, b) => sorter.compare(a, b, true));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session recent-active', 'Session recent-created']);
	});

	test('pinned sessions come before non-pinned sessions', () => {
		const sorter = new AgentSessionsSorter();
		const pinned = createSession({ id: 'pinned', isPinned: true, created: 1000 });
		const regular = createSession({ id: 'regular', created: 2000 });

		const sorted = [regular, pinned].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session pinned', 'Session regular']);
	});

	test('archived pinned sessions do not sort before non-archived', () => {
		const sorter = new AgentSessionsSorter();
		const archivedPinned = createSession({ id: 'archived-pinned', isPinned: true, isArchived: true, created: 3000 });
		const regular = createSession({ id: 'regular', created: 1000 });

		const sorted = [archivedPinned, regular].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session regular', 'Session archived-pinned']);
	});

	test('sortBy Created: sorts by creation time regardless of lastRequestEnded', () => {
		const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Created);
		const olderCreated = createSession({ id: 'older', created: 1000, lastRequestEnded: 5000 });
		const newerCreated = createSession({ id: 'newer', created: 3000, lastRequestEnded: 2000 });

		const sorted = [olderCreated, newerCreated].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session newer', 'Session older']);
	});

	test('sortBy Updated: sorts by lastRequestEnded', () => {
		const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
		const recentlyUpdated = createSession({ id: 'updated', created: 1000, lastRequestEnded: 5000 });
		const recentlyCreated = createSession({ id: 'created', created: 3000, lastRequestEnded: 2000 });

		const sorted = [recentlyCreated, recentlyUpdated].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session updated', 'Session created']);
	});

	test('sortBy Updated: falls back to created when lastRequestEnded is undefined', () => {
		const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
		const withRequest = createSession({ id: 'with-request', created: 1000, lastRequestEnded: 3000 });
		const withoutRequest = createSession({ id: 'no-request', created: 4000 });

		const sorted = [withRequest, withoutRequest].sort((a, b) => sorter.compare(a, b));
		assert.deepStrictEqual(sorted.map(s => s.label), ['Session no-request', 'Session with-request']);
	});
});

suite('groupAgentSessionsByDate with sortBy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(overrides: Partial<{
		id: string;
		isArchived: boolean;
		isPinned: boolean;
		created: number;
		lastRequestEnded: number;
	}>): IAgentSession {
		return {
			providerType: 'test',
			providerLabel: 'Test',
			resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
			status: ChatSessionStatus.Completed,
			label: `Session ${overrides.id ?? 'default'}`,
			icon: Codicon.terminal,
			timing: {
				created: overrides.created ?? Date.now(),
				lastRequestEnded: overrides.lastRequestEnded,
				lastRequestStarted: undefined,
			},
			changes: undefined,
			metadata: undefined,
			isArchived: () => overrides.isArchived ?? false,
			setArchived: () => { },
			isPinned: () => overrides.isPinned ?? false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	test('default (Created): buckets by created time', () => {
		const now = Date.now();
		const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

		const oldSession = createSession({ id: 'old', created: tenDaysAgo, lastRequestEnded: now });

		const grouped = groupAgentSessionsByDate([oldSession]);
		const todaySessions = grouped.get(AgentSessionSection.Today)!.sessions;
		const olderSessions = grouped.get(AgentSessionSection.Older)!.sessions;

		assert.deepStrictEqual(todaySessions.length, 0);
		assert.deepStrictEqual(olderSessions.length, 1);
	});

	test('Updated: session created long ago but recently updated goes into Today', () => {
		const now = Date.now();
		const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

		const oldButUpdated = createSession({ id: 'old-updated', created: tenDaysAgo, lastRequestEnded: now });

		const grouped = groupAgentSessionsByDate([oldButUpdated], AgentSessionsSorting.Updated);
		const todaySessions = grouped.get(AgentSessionSection.Today)!.sessions;
		const olderSessions = grouped.get(AgentSessionSection.Older)!.sessions;

		assert.deepStrictEqual(todaySessions.length, 1);
		assert.deepStrictEqual(olderSessions.length, 0);
	});

	test('Updated: falls back to created when lastRequestEnded is undefined', () => {
		const now = Date.now();
		const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

		const oldNoUpdate = createSession({ id: 'old-no-update', created: tenDaysAgo });

		const grouped = groupAgentSessionsByDate([oldNoUpdate], AgentSessionsSorting.Updated);
		const todaySessions = grouped.get(AgentSessionSection.Today)!.sessions;
		const olderSessions = grouped.get(AgentSessionSection.Older)!.sessions;

		assert.deepStrictEqual(todaySessions.length, 0);
		assert.deepStrictEqual(olderSessions.length, 1);
	});

	test('Updated: pinned and archived sessions are not affected by sortBy', () => {
		const now = Date.now();
		const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

		const pinnedOld = createSession({ id: 'pinned', created: tenDaysAgo, lastRequestEnded: now, isPinned: true });
		const archivedOld = createSession({ id: 'archived', created: tenDaysAgo, lastRequestEnded: now, isArchived: true });

		const grouped = groupAgentSessionsByDate([pinnedOld, archivedOld], AgentSessionsSorting.Updated);
		const pinnedSessions = grouped.get(AgentSessionSection.Pinned)!.sessions;
		const archivedSessions = grouped.get(AgentSessionSection.Archived)!.sessions;
		const todaySessions = grouped.get(AgentSessionSection.Today)!.sessions;

		assert.deepStrictEqual(pinnedSessions.length, 1);
		assert.deepStrictEqual(archivedSessions.length, 1);
		assert.deepStrictEqual(todaySessions.length, 0);
	});
});
