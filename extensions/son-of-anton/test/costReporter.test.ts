/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CostReporter } from '../src/monitoring/CostReporter';

suite('CostReporter', () => {
	let reporter: CostReporter;

	setup(() => {
		reporter = new CostReporter();
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

	test('getTotalCost returns total across all entries', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);

		const total = reporter.getTotalCost();
		assert.ok(total > 0);
	});

	test('getCostByModel breaks down by model', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);
		reporter.recordCost('opus', 'anton', 100000, 50000);

		const byModel = reporter.getCostByModel();
		assert.ok(byModel.opus > 0);
		assert.ok(byModel.sonnet > 0);
		assert.ok(byModel.haiku > 0);
		assert.ok(byModel.opus > byModel.sonnet);
		assert.ok(byModel.sonnet > byModel.haiku);
	});

	test('getCostByAgent breaks down by agent', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);

		const byAgent = reporter.getCostByAgent();
		assert.ok(byAgent['anton-code'] > 0);
		assert.ok(byAgent['anton-docs'] > 0);
		assert.ok(byAgent['anton-code'] > byAgent['anton-docs']);
	});

	test('generateWeeklyReport produces valid report', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);
		reporter.recordCost('haiku', 'anton-docs', 100000, 50000);

		const report = reporter.generateWeeklyReport();
		assert.ok(report.totalCost > 0);
		assert.ok(report.projectedMonthlyCost > 0);
		assert.ok(report.weekStart);
		assert.ok(report.weekEnd);
	});

	test('formatWeeklyReport produces markdown output', () => {
		reporter.recordCost('sonnet', 'anton-code', 100000, 50000);

		const formatted = reporter.formatWeeklyReport();
		assert.ok(formatted.includes('Weekly Cost Report'));
		assert.ok(formatted.includes('Spend by Model'));
		assert.ok(formatted.includes('Token Usage'));
	});
});
