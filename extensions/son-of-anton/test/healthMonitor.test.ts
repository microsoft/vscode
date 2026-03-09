/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { HealthMonitor } from '../src/monitoring/HealthMonitor';

suite('HealthMonitor', () => {
	let monitor: HealthMonitor;

	setup(() => {
		monitor = new HealthMonitor({ checkIntervalMs: 60000 }); // Don't auto-run checks in tests
	});

	teardown(() => {
		monitor.dispose();
	});

	test('recordHealthCheck tracks component status', () => {
		const result = monitor.recordHealthCheck('falkordb', 'healthy', 5, 'All good');

		assert.deepStrictEqual(
			{
				component: result.component,
				status: result.status,
				consecutiveFailures: result.consecutiveFailures,
			},
			{
				component: 'falkordb',
				status: 'healthy',
				consecutiveFailures: 0,
			}
		);
	});

	test('recordHealthCheck tracks consecutive failures', () => {
		monitor.recordHealthCheck('qdrant', 'unhealthy', 0, 'Connection refused');
		monitor.recordHealthCheck('qdrant', 'unhealthy', 0, 'Connection refused');
		const result = monitor.recordHealthCheck('qdrant', 'unhealthy', 0, 'Connection refused');

		assert.strictEqual(result.consecutiveFailures, 3);
	});

	test('consecutive failures reset on healthy check', () => {
		monitor.recordHealthCheck('mcp-gateway', 'unhealthy', 0, 'Down');
		monitor.recordHealthCheck('mcp-gateway', 'unhealthy', 0, 'Down');
		const result = monitor.recordHealthCheck('mcp-gateway', 'healthy', 10, 'OK');

		assert.strictEqual(result.consecutiveFailures, 0);
	});

	test('getSystemHealth returns overall status', () => {
		monitor.recordHealthCheck('falkordb', 'healthy', 5);
		monitor.recordHealthCheck('qdrant', 'healthy', 10);

		const health = monitor.getSystemHealth();
		assert.strictEqual(health.overallStatus, 'healthy');
	});

	test('getSystemHealth reports unhealthy when any component is down', () => {
		monitor.recordHealthCheck('falkordb', 'healthy', 5);
		monitor.recordHealthCheck('qdrant', 'unhealthy', 0, 'Down');

		const health = monitor.getSystemHealth();
		assert.strictEqual(health.overallStatus, 'unhealthy');
	});

	test('recordError tracks error rates', () => {
		// Record 20 calls, 2 errors = 10% rate (above 5% threshold)
		for (let i = 0; i < 18; i++) {
			monitor.recordError('llm-api', false);
		}
		for (let i = 0; i < 2; i++) {
			monitor.recordError('llm-api', true);
		}

		const alerts = monitor.getActiveAlerts();
		assert.ok(alerts.some(a => a.component === 'llm-api'));
	});

	test('acknowledgeAlert marks alert as acknowledged', () => {
		monitor.recordHealthCheck('falkordb', 'unhealthy', 0, 'Down');

		const alerts = monitor.getActiveAlerts();
		assert.ok(alerts.length > 0);

		const acked = monitor.acknowledgeAlert(alerts[0].id);
		assert.strictEqual(acked, true);

		const remainingAlerts = monitor.getActiveAlerts();
		assert.strictEqual(remainingAlerts.length, 0);
	});

	test('healthy check resolves active alerts', () => {
		monitor.recordHealthCheck('falkordb', 'unhealthy', 0, 'Down');
		assert.ok(monitor.getActiveAlerts().length > 0);

		monitor.recordHealthCheck('falkordb', 'healthy', 5, 'Recovered');
		assert.strictEqual(monitor.getActiveAlerts().length, 0);
	});

	test('onAlert callback fires for new alerts', () => {
		let alertReceived = false;
		monitor.onAlert(() => {
			alertReceived = true;
		});

		monitor.recordHealthCheck('falkordb', 'unhealthy', 0, 'Down');
		assert.strictEqual(alertReceived, true);
	});

	test('formatSummary produces markdown output', () => {
		monitor.recordHealthCheck('falkordb', 'healthy', 5);
		monitor.recordHealthCheck('qdrant', 'healthy', 10);

		const summary = monitor.formatSummary();
		assert.ok(summary.includes('System Health'));
		assert.ok(summary.includes('Components'));
		assert.ok(summary.includes('falkordb'));
	});
});
