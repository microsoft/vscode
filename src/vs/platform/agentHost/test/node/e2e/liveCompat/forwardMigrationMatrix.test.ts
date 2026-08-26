/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit coverage for the forward-migration matrix's *composition* rules.
 *
 * What this file deliberately does not do is launch a build. The scenario body
 * is exercised for real by the live run (`--run-forward-migrations`), and
 * duplicating that here would trade a twelve-minute honest signal for a fast
 * dishonest one. What is worth pinning cheaply is the surrounding contract: the
 * pair list, and the promise that an unresolvable checkpoint is reported as a
 * failed row carrying the resolver's explanation rather than skipped.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostBuildId } from '../harness/agentHostLiveCompatBuilds.js';
import { FORWARD_MIGRATION_SOURCES, runForwardMigrations } from './runForwardMigrationMatrix.js';

suite('Agent Host forward-migration matrix', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('every historical checkpoint upgrades to the current working tree', () => {
		assert.deepStrictEqual(
			[...FORWARD_MIGRATION_SOURCES],
			[AgentHostBuildId.Legacy, AgentHostBuildId.Predecessor, AgentHostBuildId.Intermediate],
		);
	});

	test('an unpreparable checkpoint is a reported failure, never a silent skip', async () => {
		const summary = await runForwardMigrations({
			// A repository root with no prepared cache: resolution must fail for
			// every pair, which is precisely the condition under test.
			repoRoot: '/nonexistent-agent-host-live-compat-root',
			cacheRoot: '/nonexistent-agent-host-live-compat-cache',
			resolveCommit: () => undefined,
			includeMultiSession: false,
		});

		assert.deepStrictEqual(
			{
				outcome: summary.outcome,
				rows: summary.results.map(result => ({
					build: result.build,
					outcome: result.outcome,
					steps: result.steps.map(step => step.name),
					hasExplanation: (result.error ?? '').length > 0,
				})),
			},
			{
				outcome: 'failed',
				rows: [
					{ build: 'legacy->current', outcome: 'failed', steps: ['resolve-build'], hasExplanation: true },
					{ build: 'predecessor->current', outcome: 'failed', steps: ['resolve-build'], hasExplanation: true },
					{ build: 'intermediate->current', outcome: 'failed', steps: ['resolve-build'], hasExplanation: true },
				],
			},
		);
	});
});
