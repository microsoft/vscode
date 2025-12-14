/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSessionsDataSource, AgentSessionListItem, IAgentSessionsFilter } from '../../browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionSection, IAgentSession, IAgentSessionSection, IAgentSessionsModel, isAgentSessionSection } from '../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus, isSessionInProgressStatus } from '../../common/chatSessionsService.js';
import { ITreeSorter } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';

suite('AgentSessionsDataSource', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_DAY = 24 * 60 * 60 * 1000;
	const WEEK_THRESHOLD = 7 * ONE_DAY; // 7 days

	function createMockSession(overrides: Partial<{
		id: string;
		status: ChatSessionStatus;
		isArchived: boolean;
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
				startTime: overrides.startTime ?? now,
				endTime: overrides.endTime ?? now,
			},
			isArchived: () => overrides.isArchived ?? false,
			setArchived: () => { },
			isRead: () => true,
			setRead: () => { },
		};
	}

	function createMockModel(sessions: IAgentSession[]): IAgentSessionsModel {
		return {
			sessions,
			getSession: () => undefined,
			onWillResolve: Event.None,
			onDidResolve: Event.None,
			onDidChangeSessions: Event.None,
			resolve: async () => { },
		};
	}

	function createMockFilter(options: {
		groupResults: boolean;
		exclude?: (session: IAgentSession) => boolean;
	}): IAgentSessionsFilter {
		return {
			onDidChange: Event.None,
			groupResults: () => options.groupResults,
			exclude: options.exclude ?? (() => false),
		};
	}

	function createMockSorter(): ITreeSorter<IAgentSession> {
		return {
			compare: (a, b) => {
				// Sort by end time, most recent first
				const aTime = a.timing.endTime || a.timing.startTime;
				const bTime = b.timing.endTime || b.timing.startTime;
				return bTime - aTime;
			}
		};
	}

	function getSessionsFromResult(result: Iterable<AgentSessionListItem>): IAgentSession[] {
		return Array.from(result).filter((item): item is IAgentSession => !isAgentSessionSection(item));
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

			const filter = createMockFilter({ groupResults: false });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Should be a flat list without sections
			assert.strictEqual(result.length, 2);
			assert.strictEqual(getSectionsFromResult(result).length, 0);
		});

		test('groups active sessions first without header', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
				createMockSession({ id: '3', status: ChatSessionStatus.NeedsInput, startTime: now - 2 * ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Active sessions should come first
			const firstItem = result[0];
			assert.ok(!isAgentSessionSection(firstItem), 'First item should be a session, not a section header');
			assert.ok(isSessionInProgressStatus((firstItem as IAgentSession).status) || (firstItem as IAgentSession).status === ChatSessionStatus.NeedsInput);
		});

		test('adds Today header when there are active sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			assert.strictEqual(sections.length, 1);
			assert.strictEqual(sections[0].section, AgentSessionSection.Today);
		});

		test('does not add Today header when there are no active sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			assert.strictEqual(sections.filter(s => s.section === AgentSessionSection.Today).length, 0);
		});

		test('adds Older header for sessions older than week threshold', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
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

			const filter = createMockFilter({ groupResults: true });
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

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			const olderIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
			const archivedIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Archived);

			assert.ok(olderIndex < archivedIndex, 'Older section should come before Archived section');
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

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Verify order: first section (active) is flat, subsequent sections are parent nodes with children
			// Active session is flat (first section)
			assert.ok(!isAgentSessionSection(result[0]));
			assert.strictEqual((result[0] as IAgentSession).label, 'Session active');

			// Today section as parent node
			assert.ok(isAgentSessionSection(result[1]));
			assert.strictEqual((result[1] as IAgentSessionSection).section, AgentSessionSection.Today);
			assert.strictEqual((result[1] as IAgentSessionSection).sessions[0].label, 'Session today');

			// Week section as parent node
			assert.ok(isAgentSessionSection(result[2]));
			assert.strictEqual((result[2] as IAgentSessionSection).section, AgentSessionSection.Week);
			assert.strictEqual((result[2] as IAgentSessionSection).sessions[0].label, 'Session week');

			// Older section as parent node
			assert.ok(isAgentSessionSection(result[3]));
			assert.strictEqual((result[3] as IAgentSessionSection).section, AgentSessionSection.Older);
			assert.strictEqual((result[3] as IAgentSessionSection).sessions[0].label, 'Session old');

			// Archived section as parent node
			assert.ok(isAgentSessionSection(result[4]));
			assert.strictEqual((result[4] as IAgentSessionSection).section, AgentSessionSection.Archived);
			assert.strictEqual((result[4] as IAgentSessionSection).sessions[0].label, 'Session archived');
		});

		test('empty sessions returns empty result', () => {
			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel([]);
			const result = Array.from(dataSource.getChildren(mockModel));

			assert.strictEqual(result.length, 0);
		});

		test('only today sessions produces no section headers', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - 1000, endTime: now - 1000 }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			// No headers when only today sessions exist
			assert.strictEqual(sections.length, 0);
			assert.strictEqual(getSessionsFromResult(result).length, 2);
		});

		test('sessions are sorted within each group', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'old1', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - 2 * ONE_DAY, endTime: now - WEEK_THRESHOLD - 2 * ONE_DAY }),
				createMockSession({ id: 'old2', status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'week1', status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
				createMockSession({ id: 'week2', status: ChatSessionStatus.Completed, startTime: now - 2 * ONE_DAY, endTime: now - 2 * ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// First section (week) is flat, second section (older) is a parent node
			// Week sessions are flat (first section) and should be sorted most recent first
			const weekSessions = result.filter((item): item is IAgentSession => !isAgentSessionSection(item));
			assert.strictEqual(weekSessions[0].label, 'Session week2');
			assert.strictEqual(weekSessions[1].label, 'Session week1');

			// Old sessions are in the Older section parent node
			const olderSection = result.find((item): item is IAgentSessionSection => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
			assert.ok(olderSection);
			assert.strictEqual(olderSection.sessions[0].label, 'Session old2');
			assert.strictEqual(olderSection.sessions[1].label, 'Session old1');
		});
	});
});
