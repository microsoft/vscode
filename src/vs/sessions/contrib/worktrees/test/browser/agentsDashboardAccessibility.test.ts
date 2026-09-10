/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildAgentsDashboardAccessibleContent } from '../../browser/agentsDashboardAccessibility.js';
import { IWorktreeDashboardEntry, WorktreeEntryStatus } from '../../common/worktreeDashboard.js';

suite('AgentsDashboardAccessibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('describes empty sessions without listing unrelated worktrees', () => {
		const worktree: IWorktreeDashboardEntry = {
			repositoryRoot: URI.file('/repo'),
			worktreePath: URI.file('/repo.worktrees/example'),
			name: 'example',
			branchName: 'agents/example',
			status: WorktreeEntryStatus.Orphaned,
			session: undefined,
			hasUncommittedChanges: undefined,
			sizeBytes: 2048,
		};

		const content = buildAgentsDashboardAccessibleContent([], [worktree]);

		assert.ok(content.includes('0 sessions, 0 active, 0 archived.'));
		assert.ok(content.includes('0 sessions done, with 0 pull requests.'));
		assert.ok(!content.includes('Credits usage'));
		assert.ok(content.includes('No sessions.'));
		assert.ok(!content.includes('agents/example'));
	});
});
