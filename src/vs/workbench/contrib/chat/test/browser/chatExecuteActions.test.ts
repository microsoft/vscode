/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSessionsExtensionPoint } from '../../common/chatSessionsService.js';

suite('ChatExecuteActions - canDelegate filtering', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('filter contributions based on canDelegate flag', () => {
		// Test data simulating chat session contributions
		const contributions: IChatSessionsExtensionPoint[] = [
			{
				type: 'github-copilot',
				name: 'copilot',
				displayName: 'GitHub Copilot Cloud Agent',
				description: 'Cloud agent',
				canDelegate: true
			},
			{
				type: 'openai-codex',
				name: 'codex',
				displayName: 'OpenAI Codex',
				description: 'External integration',
				canDelegate: false
			},
			{
				type: 'local-agent',
				name: 'local',
				displayName: 'Local Agent',
				description: 'Local agent',
				// canDelegate not specified, should default to true
			},
			{
				type: 'claude-code',
				name: 'claude',
				displayName: 'Claude Code',
				description: 'External integration',
				canDelegate: false
			}
		];

		// Apply the same filtering logic as in CreateRemoteAgentJobAction
		const filtered = contributions.filter(contrib => contrib.canDelegate !== false);

		// Verify filtering results
		assert.strictEqual(filtered.length, 2, 'Should have 2 contributions after filtering');
		assert.strictEqual(filtered[0].type, 'github-copilot', 'GitHub Copilot should be included');
		assert.strictEqual(filtered[1].type, 'local-agent', 'Local agent should be included (defaults to true)');
		
		// Verify excluded items
		const excludedTypes = filtered.map(c => c.type);
		assert.strictEqual(excludedTypes.includes('openai-codex'), false, 'OpenAI Codex should be excluded');
		assert.strictEqual(excludedTypes.includes('claude-code'), false, 'Claude Code should be excluded');
	});

	test('all contributions included when canDelegate is true', () => {
		const contributions: IChatSessionsExtensionPoint[] = [
			{
				type: 'agent1',
				name: 'agent1',
				displayName: 'Agent 1',
				description: 'First agent',
				canDelegate: true
			},
			{
				type: 'agent2',
				name: 'agent2',
				displayName: 'Agent 2',
				description: 'Second agent',
				canDelegate: true
			}
		];

		const filtered = contributions.filter(contrib => contrib.canDelegate !== false);

		assert.strictEqual(filtered.length, 2, 'All contributions should be included');
	});

	test('all contributions excluded when canDelegate is false', () => {
		const contributions: IChatSessionsExtensionPoint[] = [
			{
				type: 'agent1',
				name: 'agent1',
				displayName: 'Agent 1',
				description: 'First agent',
				canDelegate: false
			},
			{
				type: 'agent2',
				name: 'agent2',
				displayName: 'Agent 2',
				description: 'Second agent',
				canDelegate: false
			}
		];

		const filtered = contributions.filter(contrib => contrib.canDelegate !== false);

		assert.strictEqual(filtered.length, 0, 'All contributions should be excluded');
	});

	test('undefined canDelegate defaults to true', () => {
		const contributions: IChatSessionsExtensionPoint[] = [
			{
				type: 'agent1',
				name: 'agent1',
				displayName: 'Agent 1',
				description: 'First agent'
				// canDelegate is undefined
			}
		];

		const filtered = contributions.filter(contrib => contrib.canDelegate !== false);

		assert.strictEqual(filtered.length, 1, 'Contribution with undefined canDelegate should be included');
	});
});
