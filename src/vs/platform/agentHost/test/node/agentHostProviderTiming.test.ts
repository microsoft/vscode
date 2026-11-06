/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, Sequencer } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostProviderTiming, agentHostProviderMilestones, agentHostProviderOperations, agentHostProviderTimingMeasurements, groupAgentHostProviderTimings, measureAgentProviderOperation, sanitizeAgentHostProviderTiming } from '../../common/agentHostProviderTiming.js';
import { validateTelemetryData } from '../../../telemetry/common/telemetryUtils.js';
import type { IAgentProviderSendStageRecorder } from '../../common/agentHostTelemetry.js';

suite('AgentHostProviderTiming', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('separates queue and execution time and clips each at first progress', () => {
		let now = 10;
		const timing = new AgentHostProviderTiming(() => now);
		const operation = timing.startOperation('permission')!;
		now = 30;
		operation.start();
		timing.markFirstProgress(45);
		now = 70;
		operation.end(false);
		operation.end(true);
		assert.deepStrictEqual(timing.finish(80), [{
			kind: 'operation', name: 'permission', startMs: 10, endMs: 70,
			queueMs: 20, executionMs: 40, queueBeforeProgressMs: 20, executionBeforeProgressMs: 15,
			count: 1, errorCount: 0, incompleteCount: 0,
		}]);
	});

	test('aggregates retries and retains pending queue and execution at cancellation', () => {
		let now = 0;
		const timing = new AgentHostProviderTiming(() => now);
		const failed = timing.startOperation('permissionRpc')!;
		failed.start();
		now = 5;
		failed.end(true);
		const retry = timing.startOperation('permissionRpc')!;
		retry.start();
		const queued = timing.startOperation('shell')!;
		timing.markFirstProgress(7);
		now = 10;
		const rows = timing.finish(now);
		now = 100;
		retry.end(false);
		queued.start();
		queued.end(false);
		timing.markMilestone('sdkIdle');
		assert.deepStrictEqual({
			rows, lateStart: timing.startOperation('mode'), repeatedFinish: timing.finish(now),
		}, {
			rows: [
				{ kind: 'operation', name: 'permissionRpc', startMs: 0, endMs: 10, queueMs: 0, executionMs: 10, queueBeforeProgressMs: 0, executionBeforeProgressMs: 7, count: 2, errorCount: 1, incompleteCount: 1 },
				{ kind: 'operation', name: 'shell', startMs: 5, endMs: 10, queueMs: 5, executionMs: 0, queueBeforeProgressMs: 2, executionBeforeProgressMs: 0, count: 1, errorCount: 0, incompleteCount: 1 },
			],
			lateStart: undefined, repeatedFinish: [],
		});
	});

	test('omits skipped operations, preserves zero, and retains only the first milestone', () => {
		let now = 0;
		const timing = new AgentHostProviderTiming(() => now);
		timing.markMilestone('sdkSend');
		const operation = timing.startOperation('mode')!;
		operation.start();
		operation.end(false);
		now = 10;
		timing.markMilestone('sdkSend');
		assert.deepStrictEqual(timing.finish(now).map(row => [row.kind, row.name, row.startMs, row.executionMs]), [
			['operation', 'mode', 0, 0], ['milestone', 'sdkSend', 0, 0],
		]);
	});

	test('keeps rows bounded when operations and observations repeat', () => {
		const timing = new AgentHostProviderTiming(() => 0);
		for (let i = 0; i < 10; i++) {
			for (const name of agentHostProviderOperations) {
				const operation = timing.startOperation(name)!;
				operation.start();
				operation.end(false);
			}
			for (const name of agentHostProviderMilestones) {
				timing.markMilestone(name);
			}
		}
		assert.strictEqual(timing.finish(0).length, agentHostProviderOperations.length + agentHostProviderMilestones.length);
	});

	test('measures actual sequencer contention without swallowing an operation rejection', async () => {
		let now = 0;
		const timing = new AgentHostProviderTiming(() => now);
		const recorder: IAgentProviderSendStageRecorder = { mark() { }, startOperation: name => timing.startOperation(name) };
		const gate = new DeferredPromise<void>();
		const sequencer = new Sequencer();
		const blocker = sequencer.queue(() => gate.p);
		const error = new Error('operation failure');
		const operation = measureAgentProviderOperation(recorder, 'sandbox', async () => {
			now = 20;
			throw error;
		}, sequencer);
		const rejected = assert.rejects(operation, e => e === error);
		now = 12;
		await gate.complete();
		await blocker;
		await rejected;
		assert.deepStrictEqual(timing.finish(25).map(row => [row.queueMs, row.executionMs, row.errorCount]), [[12, 8, 1]]);
	});

	test('groups every measurement into seven bounded numeric events without loss or truncation', () => {
		const timing = new AgentHostProviderTiming(() => 0);
		for (const name of agentHostProviderOperations) {
			const operation = timing.startOperation(name)!;
			operation.start();
			operation.end(false);
		}
		for (const name of agentHostProviderMilestones) {
			timing.markMilestone(name);
		}
		const rows = timing.finish(0);
		const groups = groupAgentHostProviderTimings(rows);
		const expected = Object.fromEntries(rows.flatMap(row => row.kind === 'milestone'
			? [[`milestone.${row.name}`, row.startMs]]
			: agentHostProviderTimingMeasurements.map(key => [`${row.name}.${key}`, row[key]])));
		assert.deepStrictEqual({
			sizes: [...groups].map(([group, values]) => [group, Object.keys(values).length]),
			measurements: Object.assign({}, ...[...groups.values()].map(values => validateTelemetryData(values).measurements)),
			bounded: [...groups.values()].every(values => Object.keys(values).every(key => key.length < 150) && Buffer.byteLength(JSON.stringify(values)) < 8192),
		}, {
			sizes: [['input', 27], ['permissions', 36], ['sandboxShell', 54], ['mcp', 36], ['execution', 27], ['interactions', 54], ['milestones', 21]],
			measurements: expected,
			bounded: true,
		});
	});

	test('projects only bounded names and finite nonnegative numeric fields', () => {
		const timing = new AgentHostProviderTiming(() => 0);
		timing.markMilestone('sdkSend');
		const row = timing.finish(0)[0];
		assert.deepStrictEqual({
			projected: sanitizeAgentHostProviderTiming(Object.assign({}, row, { prompt: 'secret', server: 'secret' })),
			invalid: [
				{ ...row, name: 'attachments' as const },
				{ ...row, queueMs: NaN }, { ...row, endMs: Infinity }, { ...row, errorCount: -1 },
			].map(sanitizeAgentHostProviderTiming),
		}, { projected: row, invalid: [undefined, undefined, undefined, undefined] });
	});
});
