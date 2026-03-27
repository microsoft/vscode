/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionStatus, countUnreadSessions, IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { Codicon } from '../../../../../../base/common/codicons.js';

suite('countUnreadSessions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockSession(overrides: Partial<{
		id: string;
		status: AgentSessionStatus;
		archived: boolean;
		read: boolean;
	}> = {}): IAgentSession {
		const now = Date.now();
		return {
			providerType: 'test',
			providerLabel: 'Test',
			resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
			status: overrides.status ?? AgentSessionStatus.Completed,
			label: `Session ${overrides.id ?? 'default'}`,
			icon: Codicon.terminal,
			timing: {
				created: now,
				lastRequestEnded: undefined,
				lastRequestStarted: undefined,
			},
			changes: undefined,
			isArchived: () => overrides.archived ?? false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => overrides.read ?? true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	test('returns 0 for empty sessions', () => {
		assert.strictEqual(countUnreadSessions([]), 0);
	});

	test('counts completed, non-archived, unread sessions', () => {
		const sessions = [
			createMockSession({ id: '1', status: AgentSessionStatus.Completed, read: false }),
			createMockSession({ id: '2', status: AgentSessionStatus.Completed, read: false }),
		];
		assert.strictEqual(countUnreadSessions(sessions), 2);
	});

	test('ignores archived sessions', () => {
		const sessions = [
			createMockSession({ id: '1', status: AgentSessionStatus.Completed, read: false, archived: true }),
		];
		assert.strictEqual(countUnreadSessions(sessions), 0);
	});

	test('ignores read sessions', () => {
		const sessions = [
			createMockSession({ id: '1', status: AgentSessionStatus.Completed, read: true }),
		];
		assert.strictEqual(countUnreadSessions(sessions), 0);
	});

	test('ignores non-Completed sessions', () => {
		const sessions = [
			createMockSession({ id: '1', status: AgentSessionStatus.InProgress, read: false }),
			createMockSession({ id: '2', status: AgentSessionStatus.Failed, read: false }),
			createMockSession({ id: '3', status: AgentSessionStatus.NeedsInput, read: false }),
		];
		assert.strictEqual(countUnreadSessions(sessions), 0);
	});

	test('counts correctly with mixed sessions', () => {
		const sessions = [
			createMockSession({ id: '1', status: AgentSessionStatus.Completed, read: false }),              // counted
			createMockSession({ id: '2', status: AgentSessionStatus.Completed, read: true }),               // read — skip
			createMockSession({ id: '3', status: AgentSessionStatus.Completed, read: false, archived: true }), // archived — skip
			createMockSession({ id: '4', status: AgentSessionStatus.InProgress, read: false }),             // in-progress — skip
			createMockSession({ id: '5', status: AgentSessionStatus.Completed, read: false }),              // counted
		];
		assert.strictEqual(countUnreadSessions(sessions), 2);
	});
});
