/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { findRepoctxEvidence, getRepoctxStageInvocation, getRepoctxStageState } from '../../common/repoctx.js';

suite('Repoctx evidence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the first available artifact for each stage', async () => {
		const available = new Set(['index.json', 'impact.json', 'pr-review.md', 'gate.json', 'convergence.json']);
		const evidence = await findRepoctxEvidence(async path => available.has(path));

		assert.deepStrictEqual(evidence, {
			context: 'index.json',
			impact: 'impact.json',
			review: 'pr-review.md',
			gate: 'gate.json',
			audit: 'convergence.json',
		});
	});

	test('prefers human-readable context evidence', async () => {
		const available = new Set(['context-pack.md', 'index.json']);
		const evidence = await findRepoctxEvidence(async path => available.has(path));

		assert.strictEqual(evidence.context, 'context-pack.md');
	});

	test('keeps missing stages explicit', async () => {
		const evidence = await findRepoctxEvidence(async () => false);

		assert.deepStrictEqual(evidence, {
			context: undefined,
			impact: undefined,
			review: undefined,
			gate: undefined,
			audit: undefined,
		});
	});

	test('derives explicit stage states in priority order', () => {
		assert.strictEqual(getRepoctxStageState({ artifactPath: undefined, isRunning: true, hasFailed: false, requiresTask: true, hasTask: false }), 'running');
		assert.strictEqual(getRepoctxStageState({ artifactPath: 'impact.md', isRunning: false, hasFailed: true, requiresTask: true, hasTask: false }), 'available');
		assert.strictEqual(getRepoctxStageState({ artifactPath: undefined, isRunning: false, hasFailed: true, requiresTask: true, hasTask: false }), 'failed');
		assert.strictEqual(getRepoctxStageState({ artifactPath: undefined, isRunning: false, hasFailed: false, requiresTask: true, hasTask: false }), 'needs-request');
		assert.strictEqual(getRepoctxStageState({ artifactPath: undefined, isRunning: false, hasFailed: false, requiresTask: true, hasTask: true }), 'ready');
	});

	test('builds durable stage invocations without shell command construction', () => {
		assert.deepStrictEqual(getRepoctxStageInvocation('impact', '  add Stripe refunds  '), {
			stageId: 'impact',
			title: 'Repoctx Impact',
			args: ['impact', '.', 'add Stripe refunds', '--out', '.dev-context/impact.md'],
			artifactPath: 'impact.md',
		});

		assert.deepStrictEqual(getRepoctxStageInvocation('review', ''), {
			stageId: 'review',
			title: 'Repoctx Review',
			args: ['pr', '.', '--base', 'origin/main', '--out', '.dev-context/pr-review.md'],
			artifactPath: 'pr-review.md',
		});

		assert.deepStrictEqual(getRepoctxStageInvocation('gate', '  add Stripe refunds  '), {
			stageId: 'gate',
			title: 'Repoctx Gate',
			args: ['gate', '.', '--base', 'origin/main', '--request', 'add Stripe refunds', '--out', '.dev-context/gate.md'],
			artifactPath: 'gate.md',
		});
	});
});
