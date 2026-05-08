/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CostReporter } from '../src/monitoring/CostReporter';

suite('CostReporter', () => {
	let reporter: CostReporter;

	setup(() => {
		reporter = new CostReporter();
	});

	teardown(() => {
		reporter.dispose();
	});

	test('recordCost calculates cost correctly for sonnet', () => {
		const entry = reporter.recordCost('sonnet', 'anton-code', 1000000, 500000);

		// sonnet: input=$3/1M, output=$15/1M
		// cost = (1M/1M)*3 + (500K/1M)*15 = 3 + 7.5 = 10.5
		assert.strictEqual(entry.cost, 10.5);
	});

	test('recordCost applies cached input discount', () => {
		const fullCost = reporter.recordCost('sonnet', 'anton-code', 1000000, 0, 0);
		const cachedCost = reporter.recordCost('sonnet', 'anton-code', 1000000, 0, 500000);

		assert.ok(cachedCost.cost < fullCost.cost);
	});

	test('recordCost calculates each pricing tier independently', () => {
		// Use 1M input + 1M output for each model so cost = input + output rates.
		const opus = reporter.recordCost('opus', 'anton', 1000000, 1000000);
		reporter.resetSession();
		const sonnet = reporter.recordCost('sonnet', 'anton', 1000000, 1000000);
		reporter.resetSession();
		const haiku = reporter.recordCost('haiku', 'anton', 1000000, 1000000);

		assert.deepStrictEqual(
			{ opus: opus.cost, sonnet: sonnet.cost, haiku: haiku.cost },
			{ opus: 90, sonnet: 18, haiku: 1.5 },
		);
	});

	test('getTotalCost filters by sinceMs window', () => {
		// Backdate one entry so it falls outside a tight window.
		reporter.recordCost('sonnet', 'anton-code', 1000000, 0);
		const entries = (reporter as unknown as { entries: { timestamp: number }[] }).entries;
		entries[0].timestamp = Date.now() - 60_000; // 60s ago

		reporter.recordCost('sonnet', 'anton-code', 1000000, 0);

		const totalAll = reporter.getTotalCost();
		const totalRecent = reporter.getTotalCost(30_000); // last 30s only

		assert.ok(totalAll > totalRecent, 'all-time total should exceed last-30s total');
		assert.ok(Math.abs(totalRecent - 3) < 1e-9, 'recent total should equal one $3 entry');
	});

	test('getCostByModel includes zero entries for unused models', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);

		const byModel = reporter.getCostByModel();
		assert.deepStrictEqual(
			{
				opus: byModel.opus,
				haiku: byModel.haiku,
				sonnetUsed: byModel.sonnet > 0,
				keyCount: Object.keys(byModel).length,
			},
			{ opus: 0, haiku: 0, sonnetUsed: true, keyCount: 14 },
		);
	});

	test('getCostByAgent groups spending per agent handle', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);

		const byAgent = reporter.getCostByAgent();
		assert.ok(byAgent['anton-code'] > byAgent['anton-docs']);
		assert.deepStrictEqual(Object.keys(byAgent).sort(), ['anton-code', 'anton-docs']);
	});

	test('generateWeeklyReport produces a valid shape', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);

		const report = reporter.generateWeeklyReport();
		assert.deepStrictEqual(
			{
				totalCostPositive: report.totalCost > 0,
				monthlyProjected: report.projectedMonthlyCost > 0,
				hasWeekStart: typeof report.weekStart === 'string' && report.weekStart.length > 0,
				hasWeekEnd: typeof report.weekEnd === 'string' && report.weekEnd.length > 0,
				sonnetSpend: report.costByModel.sonnet > 0,
				haikuSpend: report.costByModel.haiku > 0,
				agentCount: Object.keys(report.costByAgent).length,
				wowChange: report.weekOverWeekChange,
			},
			{
				totalCostPositive: true,
				monthlyProjected: true,
				hasWeekStart: true,
				hasWeekEnd: true,
				sonnetSpend: true,
				haikuSpend: true,
				agentCount: 2,
				wowChange: null,
			},
		);
	});

	test('formatWeeklyReport hides rows for unused models', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		const formatted = reporter.formatWeeklyReport();

		assert.deepStrictEqual(
			{
				hasHeader: formatted.includes('Weekly Cost Report'),
				hasSpendByModel: formatted.includes('Spend by Model'),
				hasSonnetRow: formatted.includes('| sonnet |'),
				hasOpusRow: formatted.includes('| opus |'),
				hasHaikuRow: formatted.includes('| haiku |'),
				hasTokenUsage: formatted.includes('Token Usage'),
			},
			{
				hasHeader: true,
				hasSpendByModel: true,
				hasSonnetRow: true,
				hasOpusRow: false,
				hasHaikuRow: false,
				hasTokenUsage: true,
			},
		);
	});

	test('resetSession clears entries and zeros all totals', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);
		assert.ok(reporter.getTotalCost() > 0);

		reporter.resetSession();

		assert.deepStrictEqual(
			{
				total: reporter.getTotalCost(),
				byAgent: reporter.getCostByAgent(),
				sonnet: reporter.getCostByModel().sonnet,
			},
			{ total: 0, byAgent: {}, sonnet: 0 },
		);
	});

	test('onDidChange fires for recordCost and resetSession', () => {
		let count = 0;
		reporter.onDidChange(() => { count += 1; });

		reporter.recordCost('sonnet', 'anton-code', 100, 50);
		reporter.recordCost('haiku', 'anton-docs', 100, 50);
		reporter.resetSession();
		// resetSession on an empty reporter is a no-op — should not fire again.
		reporter.resetSession();

		assert.strictEqual(count, 3);
	});

	test('honours the 50,000-entry cap', () => {
		for (let i = 0; i < 50_001; i++) {
			reporter.recordCost('haiku', 'anton-docs', 1, 0);
		}
		const entries = (reporter as unknown as { entries: unknown[] }).entries;
		assert.strictEqual(entries.length, 50_000);
	});
});
