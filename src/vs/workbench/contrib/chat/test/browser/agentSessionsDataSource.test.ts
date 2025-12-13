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
	const RECENT_THRESHOLD = 5 * ONE_DAY; // 5 days

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

		test('adds Recent header when there are active sessions', () => {
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
			assert.strictEqual(sections[0].section, AgentSessionSection.Recent);
		});

		test('does not add Recent header when there are no active sessions', () => {
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

			assert.strictEqual(sections.filter(s => s.section === AgentSessionSection.Recent).length, 0);
		});

		test('adds Older header for sessions older than threshold', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - RECENT_THRESHOLD - ONE_DAY, endTime: now - RECENT_THRESHOLD - ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const sections = getSectionsFromResult(result);

			assert.strictEqual(sections.filter(s => s.section === AgentSessionSection.Old).length, 1);
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

		test('archived sessions come after old sessions', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: '1', status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
				createMockSession({ id: '2', status: ChatSessionStatus.Completed, startTime: now - RECENT_THRESHOLD - ONE_DAY, endTime: now - RECENT_THRESHOLD - ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			const oldIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Old);
			const archivedIndex = result.findIndex(item => isAgentSessionSection(item) && item.section === AgentSessionSection.Archived);

			assert.ok(oldIndex < archivedIndex, 'Older section should come before Archived section');
		});

		test('correct order: active, recent, older, archived', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'archived', status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
				createMockSession({ id: 'recent', status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
				createMockSession({ id: 'old', status: ChatSessionStatus.Completed, startTime: now - RECENT_THRESHOLD - ONE_DAY, endTime: now - RECENT_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'active', status: ChatSessionStatus.InProgress, startTime: now }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));

			// Verify order
			const resultLabels = result.map(item => {
				if (isAgentSessionSection(item)) {
					return `[${item.section}]`;
				}
				return item.label;
			});

			// Active first, then Recent header, then recent sessions, then Older header, old sessions, Archived header, archived sessions
			assert.strictEqual(resultLabels[0], 'Session active');
			assert.strictEqual(resultLabels[1], '[recent]');
			assert.strictEqual(resultLabels[2], 'Session recent');
			assert.strictEqual(resultLabels[3], '[old]');
			assert.strictEqual(resultLabels[4], 'Session old');
			assert.strictEqual(resultLabels[5], '[archived]');
			assert.strictEqual(resultLabels[6], 'Session archived');
		});

		test('empty sessions returns empty result', () => {
			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel([]);
			const result = Array.from(dataSource.getChildren(mockModel));

			assert.strictEqual(result.length, 0);
		});

		test('only recent sessions produces no section headers', () => {
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

			// No headers when only recent sessions exist
			assert.strictEqual(sections.length, 0);
			assert.strictEqual(getSessionsFromResult(result).length, 2);
		});

		test('sessions are sorted within each group', () => {
			const now = Date.now();
			const sessions = [
				createMockSession({ id: 'old1', status: ChatSessionStatus.Completed, startTime: now - RECENT_THRESHOLD - 2 * ONE_DAY, endTime: now - RECENT_THRESHOLD - 2 * ONE_DAY }),
				createMockSession({ id: 'old2', status: ChatSessionStatus.Completed, startTime: now - RECENT_THRESHOLD - ONE_DAY, endTime: now - RECENT_THRESHOLD - ONE_DAY }),
				createMockSession({ id: 'recent1', status: ChatSessionStatus.Completed, startTime: now - 2 * ONE_DAY, endTime: now - 2 * ONE_DAY }),
				createMockSession({ id: 'recent2', status: ChatSessionStatus.Completed, startTime: now - ONE_DAY, endTime: now - ONE_DAY }),
			];

			const filter = createMockFilter({ groupResults: true });
			const sorter = createMockSorter();
			const dataSource = new AgentSessionsDataSource(filter, sorter);

			const mockModel = createMockModel(sessions);
			const result = Array.from(dataSource.getChildren(mockModel));
			const allSessions = getSessionsFromResult(result);

			// Recent sessions should be sorted most recent first
			const recentSessions = allSessions.filter(s => !s.label.includes('old'));
			assert.strictEqual(recentSessions[0].label, 'Session recent2');
			assert.strictEqual(recentSessions[1].label, 'Session recent1');

			// Old sessions should also be sorted most recent first
			const oldSessions = allSessions.filter(s => s.label.includes('old'));
			assert.strictEqual(oldSessions[0].label, 'Session old2');
			assert.strictEqual(oldSessions[1].label, 'Session old1');
		});
	});
});
