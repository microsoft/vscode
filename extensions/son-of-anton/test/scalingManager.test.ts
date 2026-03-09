/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ScalingManager } from '../src/parallel/ScalingManager';

suite('ScalingManager', () => {
	let manager: ScalingManager;

	setup(() => {
		manager = new ScalingManager();
	});

	test('getTestSuite returns 10 test cases', () => {
		const suite = manager.getTestSuite();
		assert.strictEqual(suite.length, 10);
	});

	test('recordBenchmarkRun tracks results per agent count', () => {
		manager.recordBenchmarkRun(2, 1, {
			runNumber: 1,
			agentCount: 2,
			durationMs: 5000,
			conflicts: [],
			mergeSuccess: true,
			lockContentionEvents: 0,
			diskUsageMb: 500,
			tokenUsage: 10000,
		});

		const aggregate = manager.getAggregate(2);
		assert.strictEqual(aggregate.agentCount, 2);
		assert.strictEqual(aggregate.overallConflictRate, 0);
		assert.strictEqual(aggregate.mergeSuccessRate, 1);
	});

	test('getAggregate calculates conflict rate correctly', () => {
		manager.recordBenchmarkRun(4, 1, {
			runNumber: 1,
			agentCount: 4,
			durationMs: 5000,
			conflicts: ['file1.ts'],
			mergeSuccess: false,
			lockContentionEvents: 2,
			diskUsageMb: 500,
			tokenUsage: 10000,
		});

		manager.recordBenchmarkRun(4, 2, {
			runNumber: 1,
			agentCount: 4,
			durationMs: 4000,
			conflicts: [],
			mergeSuccess: true,
			lockContentionEvents: 0,
			diskUsageMb: 500,
			tokenUsage: 8000,
		});

		const aggregate = manager.getAggregate(4);
		// 1 conflict in 2 runs = 0.5
		assert.strictEqual(aggregate.overallConflictRate, 0.5);
		assert.strictEqual(aggregate.passesDecisionGate, false);
	});

	test('checkScalingReadiness reports blockers for high conflict rate', () => {
		manager.recordBenchmarkRun(4, 1, {
			runNumber: 1,
			agentCount: 4,
			durationMs: 5000,
			conflicts: ['file1.ts', 'file2.ts'],
			mergeSuccess: false,
			lockContentionEvents: 0,
			diskUsageMb: 500,
			tokenUsage: 10000,
		});

		const readiness = manager.checkScalingReadiness(4);
		assert.strictEqual(readiness.ready, false);
		assert.ok(readiness.blockers.some(b => b.category === 'conflict-rate'));
	});

	test('checkScalingReadiness passes with zero conflicts', () => {
		manager.recordBenchmarkRun(2, 1, {
			runNumber: 1,
			agentCount: 2,
			durationMs: 5000,
			conflicts: [],
			mergeSuccess: true,
			lockContentionEvents: 0,
			diskUsageMb: 500,
			tokenUsage: 10000,
		});

		const readiness = manager.checkScalingReadiness(4);
		// Should pass since 4-agent results don't exist (0 conflict rate)
		assert.strictEqual(readiness.ready, true);
	});

	test('promoteMaxAgents updates max when ready', () => {
		assert.strictEqual(manager.getMaxAgents(), 2);

		const promoted = manager.promoteMaxAgents(4);
		// No 4-agent results = 0 conflict rate = passes gate
		assert.strictEqual(promoted, true);
		assert.strictEqual(manager.getMaxAgents(), 4);
	});

	test('formatReport produces markdown output', () => {
		manager.recordBenchmarkRun(2, 1, {
			runNumber: 1,
			agentCount: 2,
			durationMs: 5000,
			conflicts: [],
			mergeSuccess: true,
			lockContentionEvents: 0,
			diskUsageMb: 500,
			tokenUsage: 10000,
		});

		const report = manager.formatReport(2);
		assert.ok(report.includes('Parallel Agent Benchmark'));
		assert.ok(report.includes('Aggregate Metrics'));
	});
});
