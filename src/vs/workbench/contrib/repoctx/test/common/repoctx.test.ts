/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildRepoctxAgentContext, findRepoctxEvidence, getRepoctxStageInvocation, getRepoctxStageState, RepoctxEvidence } from '../../common/repoctx.js';

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

	test('builds concise automatic agent context with on-demand evidence paths', () => {
		const evidencePaths: RepoctxEvidence = {
			context: '/workspace/.dev-context/context-pack.md',
			impact: '/workspace/.dev-context/impact.md',
			review: '/workspace/.dev-context/pr-review.md',
			gate: undefined,
			audit: '/workspace/.dev-context/convergence.md',
		};
		const context = buildRepoctxAgentContext({
			repositoryName: 'fallback-name',
			evidencePaths,
			indexContent: JSON.stringify({
				generatedAt: '2026-07-24T08:00:00.000Z',
				map: {
					repo: {
						name: 'repoctx-ide',
						sourceFileCount: 12115,
						languages: [{ language: 'TypeScript' }, { language: 'JSON' }, { language: 'Markdown' }, { language: 'Rust' }],
						entrypoints: ['./out/main.js', 'src/main.ts'],
					},
					domains: [{ name: 'vs' }, { name: 'extensions' }],
				},
				ignoredLargePayload: 'must not be copied into agent context',
			}),
		});

		assert.ok(context);
		assert.match(context, /<repository name="repoctx-ide" sourceFiles="12115">/);
		assert.match(context, /<languages>TypeScript, JSON, Markdown<\/languages>/);
		assert.match(context, /<domains>vs, extensions<\/domains>/);
		assert.match(context, /<file stage="context">\/workspace\/.dev-context\/context-pack.md<\/file>/);
		assert.match(context, /Load only the deeper evidence needed for the current task/);
		assert.doesNotMatch(context, /must not be copied/);
	});

	test('requires Context evidence before attaching agent context', () => {
		const context = buildRepoctxAgentContext({
			repositoryName: 'repoctx-ide',
			evidencePaths: { context: undefined, impact: '/impact.md', review: undefined, gate: undefined, audit: undefined },
		});

		assert.strictEqual(context, undefined);
	});

	test('falls back safely when index evidence is invalid and escapes repository labels', () => {
		const context = buildRepoctxAgentContext({
			repositoryName: 'repoctx <IDE> & tools',
			evidencePaths: { context: '/context-pack.md', impact: undefined, review: undefined, gate: undefined, audit: undefined },
			indexContent: '{invalid',
		});

		assert.match(context ?? '', /name="repoctx &lt;IDE&gt; &amp; tools"/);
		assert.match(context ?? '', /<file stage="context">\/context-pack.md<\/file>/);
	});
});
