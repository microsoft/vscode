/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ModelRouter } from '../src/llm/ModelRouter';

suite('ModelRouter', () => {
	let router: ModelRouter;

	setup(() => {
		router = new ModelRouter();
	});

	test('selectModel returns correct default models', () => {
		assert.deepStrictEqual(
			{
				planning: router.selectModel('planning').model,
				codeGen: router.selectModel('code-generation').model,
				docs: router.selectModel('documentation').model,
				exploration: router.selectModel('exploration').model,
			},
			{
				planning: 'opus',
				codeGen: 'sonnet',
				docs: 'haiku',
				exploration: 'haiku',
			}
		);
	});

	test('recordTrial tracks success and cost', () => {
		const trial = router.recordTrial(
			'code-generation', 'sonnet', true, 1000, 500, 2000
		);

		assert.strictEqual(trial.success, true);
		assert.ok(trial.cost > 0);
		assert.strictEqual(trial.latencyMs, 2000);
	});

	test('startExperiment creates experiment entry', () => {
		router.startExperiment('documentation', 'sonnet', 'haiku');

		const experiments = router.getExperiments();
		assert.strictEqual(experiments.length, 1);
		assert.strictEqual(experiments[0].taskCategory, 'documentation');
		assert.strictEqual(experiments[0].modelA, 'sonnet');
		assert.strictEqual(experiments[0].modelB, 'haiku');
	});

	test('recordTrial updates experiment stats', () => {
		router.startExperiment('documentation', 'sonnet', 'haiku');

		for (let i = 0; i < 10; i++) {
			router.recordTrial('documentation', 'sonnet', true, 500, 200, 1000);
			router.recordTrial('documentation', 'haiku', true, 500, 200, 500);
		}

		const experiments = router.getExperiments();
		assert.strictEqual(experiments[0].modelATrials, 10);
		assert.strictEqual(experiments[0].modelBTrials, 10);
		assert.strictEqual(experiments[0].totalTrials, 20);
	});

	test('evaluateExperiments promotes cheaper model when success rate matches', () => {
		router.startExperiment('documentation', 'sonnet', 'haiku');

		// Record enough trials where haiku succeeds
		for (let i = 0; i < 15; i++) {
			router.recordTrial('documentation', 'sonnet', true, 500, 200, 1000);
		}
		for (let i = 0; i < 15; i++) {
			router.recordTrial('documentation', 'haiku', true, 500, 200, 500);
		}

		const promotions = router.evaluateExperiments();
		assert.ok(promotions.length > 0);
		assert.strictEqual(promotions[0].winner, 'haiku');
	});

	test('calculateCost uses correct model pricing', () => {
		const opusCost = router.calculateCost('opus', 1000000, 1000000);
		const haikuCost = router.calculateCost('haiku', 1000000, 1000000);

		// Opus should be much more expensive than Haiku
		assert.ok(opusCost > haikuCost * 10);
	});

	test('calculateCost applies cached input discount', () => {
		const fullCost = router.calculateCost('sonnet', 1000000, 0, 0);
		const cachedCost = router.calculateCost('sonnet', 1000000, 0, 500000);

		assert.ok(cachedCost < fullCost);
	});

	test('getTaskAnalysis returns data for recorded trials', () => {
		router.recordTrial('code-generation', 'sonnet', true, 1000, 500, 2000);
		router.recordTrial('documentation', 'haiku', true, 500, 200, 500);

		const analysis = router.getTaskAnalysis();
		assert.strictEqual(analysis.size, 2);
		assert.ok(analysis.has('code-generation'));
		assert.ok(analysis.has('documentation'));
	});

	test('formatSummary produces markdown output', () => {
		router.recordTrial('code-generation', 'sonnet', true, 1000, 500, 2000);

		const summary = router.formatSummary();
		assert.ok(summary.includes('Model Routing Summary'));
		assert.ok(summary.includes('Current Routing Rules'));
	});
});
