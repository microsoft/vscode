/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { PerformanceProfiler } from '../src/performance/PerformanceProfiler';

suite('PerformanceProfiler', () => {
	let profiler: PerformanceProfiler;

	setup(() => {
		profiler = new PerformanceProfiler();
	});

	teardown(() => {
		profiler.dispose();
	});

	test('takeMemorySnapshot returns valid snapshot', () => {
		const snapshot = profiler.takeMemorySnapshot();

		assert.ok(snapshot.rssBytes > 0);
		assert.ok(snapshot.heapUsedBytes > 0);
		assert.ok(snapshot.timestamp > 0);
		assert.strictEqual(snapshot.processName, 'extension-host');
	});

	test('recordQueryLatency tracks latency data', () => {
		profiler.recordQueryLatency('MATCH (n:Symbol) RETURN n', 50, 10);
		profiler.recordQueryLatency('MATCH (n:Symbol) RETURN n', 45, 8);
		profiler.recordQueryLatency('MATCH (n:File) RETURN n', 30, 5);

		const topQueries = profiler.getTopQueries(2);
		assert.strictEqual(topQueries.length, 2);
		assert.strictEqual(topQueries[0].frequency, 2); // MATCH Symbol appears twice
	});

	test('query cache stores and retrieves results', () => {
		profiler.setCachedQuery('MATCH (n) RETURN n', { data: 'test' });

		const cached = profiler.getCachedQuery('MATCH (n) RETURN n');
		assert.deepStrictEqual(cached, { data: 'test' });
	});

	test('query cache returns undefined for missing entries', () => {
		const cached = profiler.getCachedQuery('nonexistent query');
		assert.strictEqual(cached, undefined);
	});

	test('recordSubgraphAccess tracks hot subgraphs', () => {
		profiler.recordSubgraphAccess('src/vs/editor');
		profiler.recordSubgraphAccess('src/vs/editor');
		profiler.recordSubgraphAccess('src/vs/base');

		const hot = profiler.getHotSubgraphs();
		assert.ok(hot.includes('src/vs/editor'));
		assert.ok(hot.includes('src/vs/base'));
		// src/vs/editor should be first (more accesses)
		assert.strictEqual(hot[0], 'src/vs/editor');
	});

	test('checkBudget passes with no violations', () => {
		const result = profiler.checkBudget(2);
		assert.strictEqual(result.withinBudget, true);
		assert.strictEqual(result.violations.length, 0);
	});

	test('checkBudget fails when agent count exceeds limit', () => {
		const result = profiler.checkBudget(10);
		assert.strictEqual(result.withinBudget, false);
		assert.ok(result.violations.some(v => v.includes('Agent count')));
	});

	test('startProfiling and stopProfiling capture scenario', () => {
		profiler.startProfiling('test-scenario', 2);
		profiler.takeMemorySnapshot();
		profiler.recordQueryLatency('MATCH (n) RETURN n', 50, 10);
		const scenario = profiler.stopProfiling();

		assert.ok(scenario);
		assert.strictEqual(scenario!.name, 'test-scenario');
		assert.strictEqual(scenario!.activeAgentCount, 2);
		assert.ok(scenario!.memorySnapshots.length > 0);
		assert.ok(scenario!.graphQueryLatencies.length > 0);
	});

	test('identifyHotPaths categorizes queries', () => {
		profiler.recordQueryLatency('MATCH (n:Symbol) WHERE n.name = "foo" RETURN n', 100, 5);
		profiler.recordQueryLatency('MATCH (n:File) WHERE n.path = "bar" RETURN n', 50, 3);

		const hotPaths = profiler.identifyHotPaths();
		assert.ok(hotPaths.length > 0);
		assert.ok(hotPaths[0].percentage > 0);
	});

	test('formatSummary produces markdown output', () => {
		profiler.recordQueryLatency('MATCH (n) RETURN n', 50, 10);

		const summary = profiler.formatSummary();
		assert.ok(summary.includes('Performance Profile Summary'));
		assert.ok(summary.includes('Memory Usage'));
	});
});
