/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsDataSource, sessionDateFromNow, getRepositoryName, AgentSessionsSorter, groupAgentSessionsByDate } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore } from '../../../browser/agentSessions/agentSessionsModel.js';
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
    function createMockSession(overrides = {}) {
        const now = Date.now();
        return {
            providerType: 'test',
            providerLabel: 'Test',
            resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
            status: overrides.status ?? 1 /* ChatSessionStatus.Completed */,
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
    function createMockModel(sessions) {
        return {
            sessions,
            resolved: true,
            getSession: () => undefined,
            onWillResolve: Event.None,
            onDidResolve: Event.None,
            onDidChangeSessions: Event.None,
            onDidChangeSessionArchivedState: Event.None,
            resolve: async () => { },
        };
    }
    function createMockFilter(options) {
        return {
            onDidChange: Event.None,
            groupResults: () => options.groupBy,
            exclude: options.exclude ?? (() => false),
            getExcludes: () => ({ providers: [], states: [], archived: false, read: options.excludeRead ?? false, repositoryGroupCapped: options.repositoryGroupCapped ?? true }),
            isDefault: () => true,
            reset: () => { },
        };
    }
    function createMockSorter() {
        return {
            compare: (a, b) => {
                // Sort by creation time, most recent first
                const aTime = a.timing.created;
                const bTime = b.timing.created;
                return bTime - aTime;
            }
        };
    }
    function getSectionsFromResult(result) {
        return Array.from(result).filter((item) => isAgentSessionSection(item));
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
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 2 /* ChatSessionStatus.InProgress */, startTime: now - ONE_DAY }),
                createMockSession({ id: '3', status: 3 /* ChatSessionStatus.NeedsInput */, startTime: now }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            // No InProgress section - sessions go into date-based sections
            const todaySection = sections.find(s => s.section === "today" /* AgentSessionSection.Today */);
            assert.ok(todaySection);
            assert.strictEqual(todaySection.sessions.length, 2); // completed + needs-input
        });
        test('in-progress sessions appear in Today section alongside completed', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 2 /* ChatSessionStatus.InProgress */, startTime: now }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            // Only a Today section, no InProgress section
            assert.strictEqual(sections.length, 1);
            assert.strictEqual(sections[0].section, "today" /* AgentSessionSection.Today */);
            assert.strictEqual(sections[0].sessions.length, 2);
        });
        test('adds Today header when there are no active sessions', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 1 /* ChatSessionStatus.Completed */, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            // Now all sections have headers, so Today section should be present
            assert.strictEqual(sections.filter(s => s.section === "today" /* AgentSessionSection.Today */).length, 1);
        });
        test('adds Older header for sessions older than week threshold', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 1 /* ChatSessionStatus.Completed */, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            assert.strictEqual(sections.filter(s => s.section === "older" /* AgentSessionSection.Older */).length, 1);
        });
        test('adds Archived header for archived sessions', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 1 /* ChatSessionStatus.Completed */, isArchived: true, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            assert.strictEqual(sections.filter(s => s.section === "archived" /* AgentSessionSection.Archived */).length, 1);
        });
        test('archived sessions come after older sessions', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, isArchived: true, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 1 /* ChatSessionStatus.Completed */, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const olderIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === "older" /* AgentSessionSection.Older */);
            const archivedIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === "archived" /* AgentSessionSection.Archived */);
            assert.ok(olderIndex < archivedIndex, 'Older section should come before Archived section');
        });
        test('archived in-progress sessions appear in Archived section', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: 'archived-active', status: 2 /* ChatSessionStatus.InProgress */, isArchived: true, startTime: now }),
                createMockSession({ id: 'active', status: 2 /* ChatSessionStatus.InProgress */, startTime: now }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            // Verify there is both a Today and Archived section (no InProgress section)
            const todaySection = sections.find(s => s.section === "today" /* AgentSessionSection.Today */);
            const archivedSection = sections.find(s => s.section === "archived" /* AgentSessionSection.Archived */);
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
                createMockSession({ id: 'archived', status: 1 /* ChatSessionStatus.Completed */, isArchived: true, startTime: now, endTime: now }),
                createMockSession({ id: 'today', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: 'week', status: 1 /* ChatSessionStatus.Completed */, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
                createMockSession({ id: 'old', status: 1 /* ChatSessionStatus.Completed */, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
                createMockSession({ id: 'active', status: 2 /* ChatSessionStatus.InProgress */, startTime: now }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            // Today section (includes in-progress session)
            assert.ok(isAgentSessionSection(result[0]));
            assert.strictEqual(result[0].section, "today" /* AgentSessionSection.Today */);
            assert.strictEqual(result[0].sessions.length, 2);
            // Week section
            assert.ok(isAgentSessionSection(result[1]));
            assert.strictEqual(result[1].section, "week" /* AgentSessionSection.Week */);
            assert.strictEqual(result[1].sessions[0].label, 'Session week');
            // Older section
            assert.ok(isAgentSessionSection(result[2]));
            assert.strictEqual(result[2].section, "older" /* AgentSessionSection.Older */);
            assert.strictEqual(result[2].sessions[0].label, 'Session old');
            // Archived section
            assert.ok(isAgentSessionSection(result[3]));
            assert.strictEqual(result[3].section, "archived" /* AgentSessionSection.Archived */);
            assert.strictEqual(result[3].sessions[0].label, 'Session archived');
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
                createMockSession({ id: '1', status: 1 /* ChatSessionStatus.Completed */, startTime: now, endTime: now }),
                createMockSession({ id: '2', status: 1 /* ChatSessionStatus.Completed */, startTime: now - 1000, endTime: now - 1000 }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            const sections = getSectionsFromResult(result);
            // All sections now have headers, so a Today section should be present
            assert.strictEqual(sections.length, 1);
            assert.strictEqual(sections[0].section, "today" /* AgentSessionSection.Today */);
            assert.strictEqual(sections[0].sessions.length, 2);
        });
        test('sessions are sorted within each group', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: 'old1', status: 1 /* ChatSessionStatus.Completed */, startTime: now - WEEK_THRESHOLD - 2 * ONE_DAY, endTime: now - WEEK_THRESHOLD - 2 * ONE_DAY }),
                createMockSession({ id: 'old2', status: 1 /* ChatSessionStatus.Completed */, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
                createMockSession({ id: 'week1', status: 1 /* ChatSessionStatus.Completed */, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
                createMockSession({ id: 'week2', status: 1 /* ChatSessionStatus.Completed */, startTime: now - 2 * ONE_DAY, endTime: now - 2 * ONE_DAY }),
            ];
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            // All sections now have headers
            // Week section should be first and contain sorted sessions
            const weekSection = result.find((item) => isAgentSessionSection(item) && item.section === "week" /* AgentSessionSection.Week */);
            assert.ok(weekSection);
            assert.strictEqual(weekSection.sessions[0].label, 'Session week2');
            assert.strictEqual(weekSection.sessions[1].label, 'Session week1');
            // Older section with sorted sessions
            const olderSection = result.find((item) => isAgentSessionSection(item) && item.section === "older" /* AgentSessionSection.Older */);
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
                excludeRead: true // Filtering to show only unread sessions
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
                excludeRead: false // Not filtering to unread only
            });
            const sorter = createMockSorter();
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
            const mockModel = createMockModel(sessions);
            const result = Array.from(dataSource.getChildren(mockModel));
            // Should have 3 top sessions + 1 More section
            assert.strictEqual(result.length, 4);
            const sections = getSectionsFromResult(result);
            assert.strictEqual(sections.length, 1);
            assert.strictEqual(sections[0].section, "more" /* AgentSessionSection.More */);
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
            assert.strictEqual(sections[0].section, "pinned" /* AgentSessionSection.Pinned */);
            assert.strictEqual(sections[0].sessions.length, 2);
            assert.strictEqual(sections[1].section, "today" /* AgentSessionSection.Today */);
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
            const pinnedSection = sections.find(s => s.section === "pinned" /* AgentSessionSection.Pinned */);
            const archivedSection = sections.find(s => s.section === "archived" /* AgentSessionSection.Archived */);
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
            const topSessions = result.filter((r) => !isAgentSessionSection(r));
            // Pinned sessions first, then up to 3 non-pinned sessions
            assert.deepStrictEqual(topSessions.map(s => s.label), [
                'Session pinned1',
                'Session pinned2',
                'Session s1',
                'Session s2',
                'Session s3',
            ]);
            // Only unpinned overflow goes to More
            const moreSection = sections.find(s => s.section === "more" /* AgentSessionSection.More */);
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
            const topSessions = result.filter((r) => !isAgentSessionSection(r));
            // All 4 pinned + 1 unpinned (fits within cap of 3 non-pinned)
            assert.deepStrictEqual(topSessions.map(s => s.label), [
                'Session pinned1',
                'Session pinned2',
                'Session pinned3',
                'Session pinned4',
                'Session unpinned1',
            ]);
            // No More section needed since unpinned count (1) is within cap (3)
            const moreSection = sections.find(s => s.section === "more" /* AgentSessionSection.More */);
            assert.strictEqual(moreSection, undefined);
        });
        test('unpinned NeedsInput session appears in the non-pinned section below pinned', () => {
            const now = Date.now();
            const sessions = [
                createMockSession({ id: 'needs-input', status: 3 /* ChatSessionStatus.NeedsInput */, startTime: now }),
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
            const topSessions = result.filter((r) => !isAgentSessionSection(r));
            // Pinned sessions come first, then up to 3 non-pinned (NeedsInput + s1 both fit in cap)
            assert.deepStrictEqual(topSessions.map(s => s.label), [
                'Session pinned1',
                'Session pinned2',
                'Session pinned3',
                'Session needs-input',
                'Session s1',
            ]);
            // All non-pinned fit within cap of 3, so no More section
            const moreSection = sections.find(s => s.section === "more" /* AgentSessionSection.More */);
            assert.strictEqual(moreSection, undefined);
        });
    });
    suite('groupSessionsByRepository', () => {
        function sortedGroups(result) {
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
            assert.strictEqual(result.find(s => s.label === 'other').sessions.length, 1);
            assert.strictEqual(result.find(s => s.label === 'Other').sessions.length, 1);
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
                { label: 'vscode', section: "repository" /* AgentSessionSection.Repository */, count: 1 },
                { label: 'Archived', section: "archived" /* AgentSessionSection.Archived */, count: 1 },
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
                assert.strictEqual(result[i].section, "repository" /* AgentSessionSection.Repository */, `section at index ${i} should be a named repository group`);
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
            const sections = result.filter((item) => isAgentSessionSection(item));
            assert.deepStrictEqual(sections.map(section => ({ label: section.label, section: section.section, count: section.sessions.length })), [
                { label: 'Alpha', section: "repository" /* AgentSessionSection.Repository */, count: 1 },
                { label: 'zebra', section: "repository" /* AgentSessionSection.Repository */, count: 1 },
                { label: 'Other', section: "repository" /* AgentSessionSection.Repository */, count: 1 },
                { label: 'Archived', section: "archived" /* AgentSessionSection.Archived */, count: 1 },
            ]);
        });
    });
    suite('repositoryGroupLimit', () => {
        test('caps repo group children at limit and appends show-more item', () => {
            const now = Date.now();
            const sessions = Array.from({ length: 8 }, (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 }));
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
            const model = createMockModel(sessions);
            const topLevel = Array.from(dataSource.getChildren(model));
            const section = topLevel.find(item => isAgentSessionSection(item) && item.section === "repository" /* AgentSessionSection.Repository */);
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
            const sessions = Array.from({ length: 3 }, (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 }));
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
            const model = createMockModel(sessions);
            const topLevel = Array.from(dataSource.getChildren(model));
            const section = topLevel.find(item => isAgentSessionSection(item) && item.section === "repository" /* AgentSessionSection.Repository */);
            const children = Array.from(dataSource.getChildren(section));
            assert.strictEqual(children.length, 3);
            assert.ok(!children.some(isAgentSessionShowMore));
        });
        test('expanding a group removes the cap and appends show-less item', () => {
            const now = Date.now();
            const sessions = Array.from({ length: 8 }, (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 }));
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
            const model = createMockModel(sessions);
            const topLevel = Array.from(dataSource.getChildren(model));
            const section = topLevel.find(item => isAgentSessionSection(item) && item.section === "repository" /* AgentSessionSection.Repository */);
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
            const sessions = Array.from({ length: 8 }, (_, i) => createMockSession({ id: `s${i}`, startTime: now - i * 1000 }));
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
            const model = createMockModel(sessions);
            const topLevel = Array.from(dataSource.getChildren(model));
            const todaySection = topLevel.find(item => isAgentSessionSection(item) && item.section === "today" /* AgentSessionSection.Today */);
            const children = Array.from(dataSource.getChildren(todaySection));
            assert.strictEqual(children.length, 8);
            assert.ok(!children.some(isAgentSessionShowMore));
        });
        test('does not cap when repositoryGroupLimit is not set', () => {
            const now = Date.now();
            const sessions = Array.from({ length: 8 }, (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 }));
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
            const model = createMockModel(sessions);
            const topLevel = Array.from(dataSource.getChildren(model));
            const section = topLevel.find(item => isAgentSessionSection(item) && item.section === "repository" /* AgentSessionSection.Repository */);
            const children = Array.from(dataSource.getChildren(section));
            assert.strictEqual(children.length, 8);
            assert.ok(!children.some(isAgentSessionShowMore));
        });
        test('does not cap when repositoryGroupCapped filter is disabled', () => {
            const now = Date.now();
            const sessions = Array.from({ length: 8 }, (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: 'owner/vscode' }, startTime: now - i * 1000 }));
            const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository, repositoryGroupCapped: false });
            const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
            const model = createMockModel(sessions);
            const topLevel = Array.from(dataSource.getChildren(model));
            const section = topLevel.find(item => isAgentSessionSection(item) && item.section === "repository" /* AgentSessionSection.Repository */);
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
    function createSession(overrides) {
        const now = Date.now();
        return {
            providerType: 'test',
            providerLabel: 'Test',
            resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
            status: overrides.status ?? 1 /* ChatSessionStatus.Completed */,
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
        const needsInput = createSession({ id: 'needs', status: 3 /* ChatSessionStatus.NeedsInput */, created: 1000 });
        const completed = createSession({ id: 'done', status: 1 /* ChatSessionStatus.Completed */, created: 2000 });
        const sorted = [needsInput, completed].sort((a, b) => sorter.compare(a, b));
        assert.deepStrictEqual(sorted.map(s => s.label), ['Session done', 'Session needs']);
    });
    test('prioritizeActive: needs-input sessions come first', () => {
        const sorter = new AgentSessionsSorter();
        const needsInput = createSession({ id: 'needs', status: 3 /* ChatSessionStatus.NeedsInput */, created: 1000 });
        const completed = createSession({ id: 'done', status: 1 /* ChatSessionStatus.Completed */, created: 2000 });
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
    function createSession(overrides) {
        return {
            providerType: 'test',
            providerLabel: 'Test',
            resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
            status: 1 /* ChatSessionStatus.Completed */,
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
        const todaySessions = grouped.get("today" /* AgentSessionSection.Today */).sessions;
        const olderSessions = grouped.get("older" /* AgentSessionSection.Older */).sessions;
        assert.deepStrictEqual(todaySessions.length, 0);
        assert.deepStrictEqual(olderSessions.length, 1);
    });
    test('Updated: session created long ago but recently updated goes into Today', () => {
        const now = Date.now();
        const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
        const oldButUpdated = createSession({ id: 'old-updated', created: tenDaysAgo, lastRequestEnded: now });
        const grouped = groupAgentSessionsByDate([oldButUpdated], AgentSessionsSorting.Updated);
        const todaySessions = grouped.get("today" /* AgentSessionSection.Today */).sessions;
        const olderSessions = grouped.get("older" /* AgentSessionSection.Older */).sessions;
        assert.deepStrictEqual(todaySessions.length, 1);
        assert.deepStrictEqual(olderSessions.length, 0);
    });
    test('Updated: falls back to created when lastRequestEnded is undefined', () => {
        const now = Date.now();
        const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
        const oldNoUpdate = createSession({ id: 'old-no-update', created: tenDaysAgo });
        const grouped = groupAgentSessionsByDate([oldNoUpdate], AgentSessionsSorting.Updated);
        const todaySessions = grouped.get("today" /* AgentSessionSection.Today */).sessions;
        const olderSessions = grouped.get("older" /* AgentSessionSection.Older */).sessions;
        assert.deepStrictEqual(todaySessions.length, 0);
        assert.deepStrictEqual(olderSessions.length, 1);
    });
    test('Updated: pinned and archived sessions are not affected by sortBy', () => {
        const now = Date.now();
        const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
        const pinnedOld = createSession({ id: 'pinned', created: tenDaysAgo, lastRequestEnded: now, isPinned: true });
        const archivedOld = createSession({ id: 'archived', created: tenDaysAgo, lastRequestEnded: now, isArchived: true });
        const grouped = groupAgentSessionsByDate([pinnedOld, archivedOld], AgentSessionsSorting.Updated);
        const pinnedSessions = grouped.get("pinned" /* AgentSessionSection.Pinned */).sessions;
        const archivedSessions = grouped.get("archived" /* AgentSessionSection.Archived */).sessions;
        const todaySessions = grouped.get("today" /* AgentSessionSection.Today */).sessions;
        assert.deepStrictEqual(pinnedSessions.length, 1);
        assert.deepStrictEqual(archivedSessions.length, 1);
        assert.deepStrictEqual(todaySessions.length, 0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx1QkFBdUIsRUFBOEMsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsTyxPQUFPLEVBQWlGLGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRzVPLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFcEgsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtJQUVoQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sT0FBTyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztJQUVwQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO1FBQzFDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN2QixNQUFNLFlB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