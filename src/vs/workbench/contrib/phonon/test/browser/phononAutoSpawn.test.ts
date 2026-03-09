/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PhononAutoSpawnAnalyzer, ISpawnPlan } from '../../browser/phononAutoSpawn.js';

suite('PhononAutoSpawnAnalyzer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const MODEL = 'claude-opus-4';
	let analyzer: PhononAutoSpawnAnalyzer;

	setup(() => {
		analyzer = new PhononAutoSpawnAnalyzer();
	});

	// ==================== Solo mode (score < 0.4) ====================

	suite('solo mode', () => {

		test('empty string yields solo with no team indicators', () => {
			const plan = analyzer.analyzePlan('', MODEL);
			assert.deepStrictEqual(plan, {
				mode: 'solo',
				workers: [],
				reasoning: 'Solo mode (score=0.00): no team indicators',
			} satisfies ISpawnPlan);
		});

		test('short greeting yields solo', () => {
			const plan = analyzer.analyzePlan('hello', MODEL);
			assert.strictEqual(plan.mode, 'solo');
			assert.strictEqual(plan.workers.length, 0);
		});

		test('single task verb scores 0.25, stays solo', () => {
			const plan = analyzer.analyzePlan('fix the bug', MODEL);
			assert.strictEqual(plan.mode, 'solo');
			assert.ok(plan.reasoning.includes('score=0.25'));
			assert.ok(plan.reasoning.includes('task verbs (+0.25)'));
		});

		test('long prompt with no verbs scores only 0.1, stays solo', () => {
			const filler = 'a '.repeat(200); // 400 chars, no verbs
			const plan = analyzer.analyzePlan(filler, MODEL);
			assert.strictEqual(plan.mode, 'solo');
			assert.ok(plan.reasoning.includes('+0.10'));
		});
	});

	// ==================== Team mode threshold ====================

	suite('team mode threshold', () => {

		test('two verbs reach 0.50, triggers team', () => {
			const plan = analyzer.analyzePlan('implement and review the auth module', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('score=0.50'));
		});

		test('one verb + two file references = 0.45, triggers team', () => {
			const plan = analyzer.analyzePlan('implement changes in foo.ts and bar.js', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('file references'));
		});

		test('one verb + numbered list = 0.45, triggers team', () => {
			const plan = analyzer.analyzePlan('implement:\n1. do X\n2. do Y', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('multi-task pattern'));
		});

		test('one verb + long prompt + file refs triggers team', () => {
			const padding = ' some description'.repeat(25); // well over 300 chars
			const prompt = `implement${padding} in foo.ts and bar.js`;
			const plan = analyzer.analyzePlan(prompt, MODEL);
			assert.strictEqual(plan.mode, 'team');
			// 0.25 (verb) + 0.2 (files) + 0.1 (length) = 0.55
			assert.ok(parseFloat(plan.reasoning.match(/score=([\d.]+)/)![1]) >= 0.4);
		});
	});

	// ==================== Worker inference ====================

	suite('worker inference', () => {

		test('coding verb produces coder worker', () => {
			const plan = analyzer.analyzePlan('implement and review the feature', MODEL);
			assert.strictEqual(plan.mode, 'team');
			const roles = plan.workers.map(w => w.role);
			assert.ok(roles.includes('coder'));
		});

		test('review verb produces reviewer worker', () => {
			const plan = analyzer.analyzePlan('review and analyze the codebase', MODEL);
			assert.strictEqual(plan.mode, 'team');
			const roles = plan.workers.map(w => w.role);
			assert.ok(roles.includes('reviewer'));
		});

		test('testing verbs produce tester worker (and coder from "write")', () => {
			const plan = analyzer.analyzePlan('write a test for the module', MODEL);
			// "write" = coder verb AND task verb, "test" = tester verb AND task verb
			// two task verbs => score 0.50 => team
			assert.strictEqual(plan.mode, 'team');
			const roles = plan.workers.map(w => w.role);
			assert.ok(roles.includes('tester'), 'should have tester');
			assert.ok(roles.includes('coder'), 'should have coder from "write"');
		});

		test('all three worker types from combined verbs', () => {
			const plan = analyzer.analyzePlan('implement, review and test the system', MODEL);
			assert.strictEqual(plan.mode, 'team');
			const roles = plan.workers.map(w => w.role);
			assert.deepStrictEqual(roles.sort(), ['coder', 'reviewer', 'tester']);
		});

		test('team mode with no specific worker verbs falls back to coder', () => {
			// "refactor" and "optimize" are task verbs but NOT worker-inference verbs
			const plan = analyzer.analyzePlan('refactor and optimize the pipeline', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.deepStrictEqual(plan.workers, [{ role: 'coder', model: MODEL }]);
		});

		test('all workers carry the defaultModel', () => {
			const customModel = 'gpt-4o';
			const plan = analyzer.analyzePlan('implement, review and test it', customModel);
			assert.strictEqual(plan.mode, 'team');
			for (const worker of plan.workers) {
				assert.strictEqual(worker.model, customModel);
			}
		});
	});

	// ==================== Verb cap ====================

	suite('verb score cap', () => {

		test('five or more verbs cap verbScore at 0.50', () => {
			const plan = analyzer.analyzePlan(
				'implement, refactor, review, build, create, write, fix all the things',
				MODEL,
			);
			assert.strictEqual(plan.mode, 'team');
			// verbScore capped at 0.50 — should not exceed it
			assert.ok(plan.reasoning.includes('task verbs (+0.50)'));
		});
	});

	// ==================== Multi-task patterns ====================

	suite('multi-task patterns', () => {

		test('numbered list triggers multi-task pattern', () => {
			// Need a verb to push over threshold: 0.25 + 0.2 = 0.45
			const plan = analyzer.analyzePlan('implement:\n1. first task\n2. second task', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('multi-task pattern (+0.20)'));
		});

		test('"and also" triggers multi-task pattern', () => {
			const plan = analyzer.analyzePlan('implement the auth and also refactor the DB', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('multi-task pattern'));
		});

		test('"first...then" triggers multi-task pattern', () => {
			const plan = analyzer.analyzePlan('first implement the feature, then review it', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('multi-task pattern'));
		});

		test('multi-task pattern only contributes once', () => {
			// Both "and also" AND numbered list present, but score += 0.2 only once
			const plan = analyzer.analyzePlan(
				'implement it and also:\n1. do X\n2. do Y',
				MODEL,
			);
			assert.strictEqual(plan.mode, 'team');
			// Count occurrences of 'multi-task pattern' in reasoning
			const matches = plan.reasoning.match(/multi-task pattern/g);
			assert.strictEqual(matches?.length, 1, 'multi-task should contribute only once');
		});
	});

	// ==================== Reasoning string ====================

	suite('reasoning format', () => {

		test('team reasoning includes score value', () => {
			const plan = analyzer.analyzePlan('implement and review it', MODEL);
			assert.strictEqual(plan.mode, 'team');
			assert.ok(/Team mode \(score=\d+\.\d{2}\)/.test(plan.reasoning));
		});

		test('solo reasoning includes score value', () => {
			const plan = analyzer.analyzePlan('fix the bug', MODEL);
			assert.strictEqual(plan.mode, 'solo');
			assert.ok(/Solo mode \(score=\d+\.\d{2}\)/.test(plan.reasoning));
		});

		test('solo with zero indicators says "no team indicators"', () => {
			const plan = analyzer.analyzePlan('hello world', MODEL);
			assert.strictEqual(plan.mode, 'solo');
			assert.ok(plan.reasoning.includes('no team indicators'));
		});

		test('solo with partial indicators lists them', () => {
			const plan = analyzer.analyzePlan('fix the bug', MODEL);
			assert.strictEqual(plan.mode, 'solo');
			assert.ok(plan.reasoning.includes('task verbs'));
			assert.ok(!plan.reasoning.includes('no team indicators'));
		});
	});

	// ==================== File reference detection ====================

	suite('file reference detection', () => {

		test('single file reference does not trigger file bonus', () => {
			const plan = analyzer.analyzePlan('implement changes in app.ts', MODEL);
			assert.ok(!plan.reasoning.includes('file references'));
		});

		test('two file references trigger +0.20', () => {
			const plan = analyzer.analyzePlan('change app.ts and index.html', MODEL);
			assert.ok(plan.reasoning.includes('2 file references (+0.20)'));
		});

		test('many file extensions are recognized', () => {
			const plan = analyzer.analyzePlan(
				'edit main.py and lib.rs and style.css',
				MODEL,
			);
			assert.ok(plan.reasoning.includes('3 file references'));
		});
	});

	// ==================== Edge cases ====================

	suite('edge cases', () => {

		test('verb embedded in a longer word is still matched (includes check)', () => {
			// "implement" is found via `lower.includes(verb)`, so
			// "reimplementation" contains "implement"
			const plan = analyzer.analyzePlan('the reimplementation and review', MODEL);
			assert.strictEqual(plan.mode, 'team');
		});

		test('case insensitivity for verbs', () => {
			const plan = analyzer.analyzePlan('IMPLEMENT and REVIEW it', MODEL);
			assert.strictEqual(plan.mode, 'team');
		});

		test('score boundary: exactly 0.40 triggers team', () => {
			// One verb (0.25) + numbered list (0.20) = 0.45 >= 0.4 => team
			// Actually we need exactly 0.40: two file refs (0.20) + multi-task (0.20) = 0.40
			const plan = analyzer.analyzePlan('update foo.ts and bar.js:\n1. do X\n2. do Y', MODEL);
			// No task verbs matched (update is not in the list), files + multi-task = 0.40
			assert.strictEqual(plan.mode, 'team');
			assert.ok(plan.reasoning.includes('score=0.40'));
		});

		test('score 0.39 stays solo', () => {
			// file refs only (0.20) + length only (0.10) = 0.30 => solo
			const padding = 'x '.repeat(200); // >300 chars
			const plan = analyzer.analyzePlan(`${padding}edit foo.ts and bar.js`, MODEL);
			// 0.20 (files) + 0.10 (length) = 0.30 => solo
			assert.strictEqual(plan.mode, 'solo');
		});

		test('solo mode always returns empty workers array', () => {
			const plan = analyzer.analyzePlan('just a question', MODEL);
			assert.deepStrictEqual(plan.workers, []);
		});
	});
});
