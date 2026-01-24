/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsDataSource, AgentSessionListItem, groupAgentSessionsByPending, IAgentSessionsFilter } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionSection, IAgentSession, IAgentSessionSection, IAgentSessionsModel, isAgentSessionSection } from '../../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus, isSessionInProgressStatus } from '../../../common/chatSessionsService.js';
import { ITreeSorter } from '../../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { AgentSessionsGrouping } from '../../../browser/agentSessions/agentSessionsFilter.js';

suite('AgentSessionsDataSource', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_DAY = 24 * 60 * 60 * 1000;
	const WEEK_THRESHOLD = 7 * ONE_DAY; // 7 days

	function createMockSession(overrides: Partial<{
		id: string;
		status: ChatSessionStatus;
		isArchived: boolean;
		isRead: boolean;
		hasChanges: boolean;
		startTime: number;
		endTime: number;
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
			isArchived: () => overrides.isArchived ?? false,
			setArchived: () => { },
			isRead: () => overrides.isRead ?? true,
			setRead: () => { },
		};
	}

	function createMockModel(sessions: IAgentSession[]): IAgentSessionsModel {
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

	function createMockFilter(options: {
		groupBy?: AgentSessionsGrouping;
		exclude?: (session: IAgentSession) => boolean;
	}): IAgentSessionsFilter {
		return {
			onDidChange: Event.None,
			groupResults: () => options.groupBy,
			exclude: options.exclude ?? (() => false),
			getExcludes: () => ({ providers: [], states: [], archived: false, read: false })
		};
	}

	function createMockSorter(): ITreeSorter<IAgentSession> {
		return {
			compare: (a, b) => {
				// Sort by end time, most recent first
				const aTime = a.timing.lastRequestEnded ?? a.timing.lastRequestStarted ?? a.timing.created;
				const bTime = b.timing.lastRequestEnded ?? b.timing.lastRequestStarted ?? b.timing.created;
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
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Should be a flat list without sections
			assert.strictEqual(result.length, 2);
			assert.strictEqual(getSectionsFromResult(result).length, 0);
		});

		test('groups active sessions first with header', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
				createMockSession({ id: '3', status: ChatSessionStatus.NeedsInput, startTime: now - 2 * ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// First item should be the In Progress section header
			const firstItem = result[0];
			assert.ok(isAgentSessionSection(firstItem), 'First item should be a section header');
			assert.strictEqual((firstItem as IAgentSessionSection).section, AgentSessionSection.InProgress);
			// Verify the sessions in the section have active status
			const activeSessions = (firstItem as IAgentSessionSection).sessions;
			assert.ok(activeSessions.every(s => isSessionInProgressStatus(s.status) || s.status === ChatSessionStatus.NeedsInput));
		});

		test('adds Today header when there are active sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// Now all sections have headers, so we expect In Progress and Today sections
			assert.strictEqual(sections.length, 2);
			assert.strictEqual(sections[0].section, AgentSessionSection.InProgress);
			assert.strictEqual(sections[1].section, AgentSessionSection.Today);
		});

		test('adds Today header when there are no active sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

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

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

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

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

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

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			const olderIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
			const archivedIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Archived);

			assert.ok(olderIndex < archivedIndex, 'Older section should come before Archived section');
		});

		test('archived in-progress sessions appear in Archived section not In Progress', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'archived-active', status: ChatSessionStatus.InProgress, isArchived: true, startTime: now }),
				createMockSession({ id: 'active', status: ChatSessionStatus.InProgress, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// Verify there is both an In Progress and Archived section
			const inProgressSection = sections.find(s => s.section === AgentSessionSection.InProgress);
			const archivedSection = sections.find(s => s.section === AgentSessionSection.Archived);

			assert.ok(inProgressSection, 'In Progress section should exist');
			assert.ok(archivedSection, 'Archived section should exist');

			// The archived session should NOT appear in In Progress
			assert.strictEqual(inProgressSection.sessions.length, 1);
			assert.strictEqual(inProgressSection.sessions[0].label, 'Session active');

			// The archived session should appear in Archived even though it's in progress
			assert.strictEqual(archivedSection.sessions.length, 1);
			assert.strictEqual(archivedSection.sessions[0].label, 'Session archived-active');
		});

		test('correct order: active, today, week, older, archived', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'archived', status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
				createMockSession({ id: 'today', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: 'week', status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
				createMockSession({ id: 'old', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'active', status: ChatSessionStatus.InProgress, startTime: now }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// All sections now have headers
			// In Progress section
			assert.ok(isAgentSessionSection(result[0]));
			assert.strictEqual((result[0] as IAgentSessionSection).section, AgentSessionSection.InProgress);
			assert.strictEqual((result[0] as IAgentSessionSection).sessions[0].label, 'Session active');

			// Today section
			assert.ok(isAgentSessionSection(result[1]));
			assert.strictEqual((result[1] as IAgentSessionSection).section, AgentSessionSection.Today);
			assert.strictEqual((result[1] as IAgentSessionSection).sessions[0].label, 'Session today');

			// Week section
			assert.ok(isAgentSessionSection(result[2]));
			assert.strictEqual((result[2] as IAgentSessionSection).section, AgentSessionSection.Week);
			assert.strictEqual((result[2] as IAgentSessionSection).sessions[0].label, 'Session week');

			// Older section
			assert.ok(isAgentSessionSection(result[3]));
			assert.strictEqual((result[3] as IAgentSessionSection).section, AgentSessionSection.Older);
			assert.strictEqual((result[3] as IAgentSessionSection).sessions[0].label, 'Session old');

			// Archived section
			assert.ok(isAgentSessionSection(result[4]));
			assert.strictEqual((result[4] as IAgentSessionSection).section, AgentSessionSection.Archived);
			assert.strictEqual((result[4] as IAgentSessionSection).sessions[0].label, 'Session archived');
		});

		test('empty sessions returns empty result', () => {
			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

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

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

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

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Default });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

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
	});

	suite('groupSessionsByPending', () => {

		test('groups sessions into Pending and Done sections', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY }),
			];

			const result = groupAgentSessionsByPending(sessions);

			assert.strictEqual(result.size, 2);
			assert.ok(result.has(AgentSessionSection.Pending));
			assert.ok(result.has(AgentSessionSection.Done));
		});

		test('In-progress sessions appear in Pending', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.InProgress, startTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.NeedsInput, startTime: now - 1000 }),
				createMockSession({ id: '3', status: ChatSessionStatus.Completed, startTime: now - 2000 }),
				createMockSession({ id: '4', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY }),
			];

			const result = groupAgentSessionsByPending(sessions);
			const pendingSection = result.get(AgentSessionSection.Pending);
			const doneSection = result.get(AgentSessionSection.Done);

			assert.ok(pendingSection);
			assert.ok(doneSection);
			// In-progress sessions in Pending, plus session 1 is also the most recent non-archived
			assert.ok(pendingSection.sessions.some(s => s.label === 'Session 1'));
			assert.ok(pendingSection.sessions.some(s => s.label === 'Session 2'));
			assert.strictEqual(pendingSection.sessions.length, 2);
			// Completed sessions in Done
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 3'));
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 4'));
		});

		test('Unread sessions appear in Pending', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, isRead: false }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - 1000 }),
				createMockSession({ id: '3', status: ChatSessionStatus.Completed, startTime: now - 2000 }),
			];

			const result = groupAgentSessionsByPending(sessions);
			const pendingSection = result.get(AgentSessionSection.Pending);
			const doneSection = result.get(AgentSessionSection.Done);

			assert.ok(pendingSection);
			assert.ok(doneSection);
			// Unread session 1 is in Pending (also most recent)
			assert.ok(pendingSection.sessions.some(s => s.label === 'Session 1'));
			// Read sessions 2, 3 are in Done (session 2 not most recent since session 1 is)
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 2'));
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 3'));
		});

		test('Sessions with changes appear in Pending', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, hasChanges: true }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - 1000 }),
				createMockSession({ id: '3', status: ChatSessionStatus.Completed, startTime: now - 2000, hasChanges: true }),
			];

			const result = groupAgentSessionsByPending(sessions);
			const pendingSection = result.get(AgentSessionSection.Pending);
			const doneSection = result.get(AgentSessionSection.Done);

			assert.ok(pendingSection);
			assert.ok(doneSection);
			// Sessions with changes in Pending
			assert.ok(pendingSection.sessions.some(s => s.label === 'Session 1'));
			assert.ok(pendingSection.sessions.some(s => s.label === 'Session 3'));
			// Session 2 is in Done (no changes, read)
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 2'));
		});

		test('Most recent non-archived session always appears in Pending', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - 1000 }),
				createMockSession({ id: '3', status: ChatSessionStatus.Completed, startTime: now - 2000 }),
			];

			const result = groupAgentSessionsByPending(sessions);
			const pendingSection = result.get(AgentSessionSection.Pending);
			const doneSection = result.get(AgentSessionSection.Done);

			assert.ok(pendingSection);
			assert.ok(doneSection);
			// Most recent non-archived (session 1) in Pending
			assert.strictEqual(pendingSection.sessions.length, 1);
			assert.strictEqual(pendingSection.sessions[0].label, 'Session 1');
			// Other sessions in Done
			assert.strictEqual(doneSection.sessions.length, 2);
		});

		test('Archived sessions go to Done even if unread or have changes', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - 1000, isArchived: true, isRead: false }),
				createMockSession({ id: '3', status: ChatSessionStatus.Completed, startTime: now - 2000, isArchived: true, hasChanges: true }),
			];

			const result = groupAgentSessionsByPending(sessions);
			const pendingSection = result.get(AgentSessionSection.Pending);
			const doneSection = result.get(AgentSessionSection.Done);

			assert.ok(pendingSection);
			assert.ok(doneSection);
			// Only most recent non-archived in Pending
			assert.strictEqual(pendingSection.sessions.length, 1);
			assert.strictEqual(pendingSection.sessions[0].label, 'Session 1');
			// Archived sessions go to Done regardless of unread/changes
			assert.strictEqual(doneSection.sessions.length, 2);
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 2'));
			assert.ok(doneSection.sessions.some(s => s.label === 'Session 3'));
		});

		test('works with AgentSessionsDataSource when groupBy is Pending', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.InProgress, startTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY }),
				createMockSession({ id: '3', status: ChatSessionStatus.Completed, startTime: now - 2 * ONE_DAY }),
			];

			const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Pending });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			assert.strictEqual(result.length, 2);
			assert.ok(isAgentSessionSection(result[0]));
			assert.ok(isAgentSessionSection(result[1]));
			assert.strictEqual((result[0] as IAgentSessionSection).section, AgentSessionSection.Pending);
			assert.strictEqual((result[1] as IAgentSessionSection).section, AgentSessionSection.Done);
		});
	});
});
