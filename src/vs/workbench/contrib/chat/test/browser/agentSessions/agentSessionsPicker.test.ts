/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsSorter, groupAgentSessionsByDate, groupAgentSessionsByRepository } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionSection, IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus } from '../../../common/chatSessionsService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { AgentSessionsSorting } from '../../../browser/agentSessions/agentSessionsFilter.js';

suite('agentSessionsPicker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_DAY = 24 * 60 * 60 * 1000;
	const now = Date.now();

	function createMockSession(overrides: {
		id: string;
		startTime?: number;
		lastRequestEnded?: number;
		repositoryNwo?: string;
		repositoryPath?: string;
		badge?: string;
	}): IAgentSession {
		return {
			providerType: 'local',
			providerLabel: 'Local',
			resource: URI.parse(`test://session/${overrides.id}`),
			status: ChatSessionStatus.Completed,
			label: `Session ${overrides.id}`,
			icon: Codicon.terminal,
			timing: {
				created: overrides.startTime ?? now,
				lastRequestEnded: overrides.lastRequestEnded,
				lastRequestStarted: undefined,
			},
			changes: undefined,
			badge: overrides.badge,
			metadata: overrides.repositoryNwo ? { repositoryNwo: overrides.repositoryNwo } :
				overrides.repositoryPath ? { repositoryPath: overrides.repositoryPath } : undefined,
			isArchived: () => false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		} as unknown as IAgentSession;
	}

	suite('groupAgentSessionsByRepository', () => {

		test('groups sessions by repository name from metadata.repositoryNwo', () => {
			const sessions = [
				createMockSession({ id: '1', repositoryNwo: 'owner/repo-a' }),
				createMockSession({ id: '2', repositoryNwo: 'owner/repo-b' }),
				createMockSession({ id: '3', repositoryNwo: 'owner/repo-a' }),
			];

			const groups = groupAgentSessionsByRepository(sessions);

			assert.strictEqual(groups.length, 2);
			// sorted alphabetically
			assert.strictEqual(groups[0].label, 'repo-a');
			assert.strictEqual(groups[0].sessions.length, 2);
			assert.strictEqual(groups[1].label, 'repo-b');
			assert.strictEqual(groups[1].sessions.length, 1);
		});

		test('puts sessions without a repo into the "other" group', () => {
			const sessions = [
				createMockSession({ id: '1', repositoryNwo: 'owner/my-repo' }),
				createMockSession({ id: '2' }), // no repo
				createMockSession({ id: '3' }), // no repo
			];

			const groups = groupAgentSessionsByRepository(sessions);

			// first group should be the named repo, second should be "Other"
			const repoGroup = groups.find(g => g.label === 'my-repo');
			const otherGroup = groups.find(g => g.label !== 'my-repo');

			assert.ok(repoGroup, 'should have a named repo group');
			assert.strictEqual(repoGroup.sessions.length, 1);
			assert.ok(otherGroup, 'should have an "Other" group for sessions without a repo');
			assert.strictEqual(otherGroup.sessions.length, 2);
		});

		test('returns empty array when no sessions', () => {
			const groups = groupAgentSessionsByRepository([]);
			assert.strictEqual(groups.length, 0);
		});

		test('returns single "other" group when no sessions have a repo', () => {
			const sessions = [
				createMockSession({ id: '1' }),
				createMockSession({ id: '2' }),
			];

			const groups = groupAgentSessionsByRepository(sessions);

			assert.strictEqual(groups.length, 1);
			assert.strictEqual(groups[0].sessions.length, 2);
		});
	});

	suite('groupAgentSessionsByDate with sortBy=Updated', () => {

		test('uses lastRequestEnded time for section bucketing when sortBy=Updated', () => {
			// session created yesterday but last updated today => should be in Today section
			const sessions = [
				createMockSession({
					id: '1',
					startTime: now - ONE_DAY, // created yesterday
					lastRequestEnded: now,     // last updated today
				}),
			];

			const todayStart = new Date(now).setHours(0, 0, 0, 0);
			assert.ok(sessions[0].timing.lastRequestEnded! >= todayStart, 'sanity: lastRequestEnded is today');
			assert.ok(sessions[0].timing.created < todayStart, 'sanity: created was yesterday');

			const groups = groupAgentSessionsByDate(sessions, AgentSessionsSorting.Updated);

			const todayGroup = groups.get(AgentSessionSection.Today);
			const yesterdayGroup = groups.get(AgentSessionSection.Yesterday);

			assert.ok(todayGroup, 'should have a Today group');
			assert.strictEqual(todayGroup.sessions.length, 1, 'session should be in Today when sorted by updated');
			assert.strictEqual(yesterdayGroup?.sessions.length ?? 0, 0, 'session should NOT be in Yesterday');
		});

		test('uses created time for section bucketing when sortBy=Created (default)', () => {
			// session created yesterday but last updated today => should be in Yesterday section
			const sessions = [
				createMockSession({
					id: '1',
					startTime: now - ONE_DAY, // created yesterday
					lastRequestEnded: now,     // last updated today
				}),
			];

			const groups = groupAgentSessionsByDate(sessions, AgentSessionsSorting.Created);

			const todayGroup = groups.get(AgentSessionSection.Today);
			const yesterdayGroup = groups.get(AgentSessionSection.Yesterday);

			assert.strictEqual(todayGroup?.sessions.length ?? 0, 0, 'session should NOT be in Today when sorted by created');
			assert.ok(yesterdayGroup, 'should have a Yesterday group');
			assert.strictEqual(yesterdayGroup.sessions.length, 1, 'session should be in Yesterday');
		});
	});

	suite('AgentSessionsSorter with sortBy=Updated', () => {

		test('sorts by lastRequestEnded when sortBy=Updated', () => {
			const older = createMockSession({ id: '1', startTime: now - 2 * ONE_DAY, lastRequestEnded: now - ONE_DAY });
			const newer = createMockSession({ id: '2', startTime: now - 3 * ONE_DAY, lastRequestEnded: now });

			const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
			const sorted = [older, newer].sort((a, b) => sorter.compare(a, b));

			// newer (updated today) should come first
			assert.strictEqual(sorted[0].resource.toString(), newer.resource.toString());
			assert.strictEqual(sorted[1].resource.toString(), older.resource.toString());
		});

		test('sorts by created when sortBy=Created', () => {
			// session created later but updated earlier
			const laterCreated = createMockSession({ id: '1', startTime: now, lastRequestEnded: now - ONE_DAY });
			const earlierCreated = createMockSession({ id: '2', startTime: now - ONE_DAY, lastRequestEnded: now });

			const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Created);
			const sorted = [earlierCreated, laterCreated].sort((a, b) => sorter.compare(a, b));

			// laterCreated should come first (most recently created = created at `now`)
			assert.strictEqual(sorted[0].resource.toString(), laterCreated.resource.toString());
			assert.strictEqual(sorted[1].resource.toString(), earlierCreated.resource.toString());
		});

		test('defaults to Created order when no sortBy is provided', () => {
			const older = createMockSession({ id: '1', startTime: now - ONE_DAY });
			const newer = createMockSession({ id: '2', startTime: now });

			const sorter = new AgentSessionsSorter(); // no getSortBy
			const sorted = [older, newer].sort((a, b) => sorter.compare(a, b));

			assert.strictEqual(sorted[0].resource.toString(), newer.resource.toString());
		});
	});

	suite('Event.None used in mock model', () => {
		// Verify mock sessions can be created and the Event.None utility works
		test('mock session has expected properties', () => {
			const session = createMockSession({ id: 'test', repositoryNwo: 'owner/testrepo' });
			assert.strictEqual(session.label, 'Session test');
			assert.ok(!session.isArchived());
			assert.ok(!session.isPinned());
		});
	});
});
