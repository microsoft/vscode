/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LogLevel, NullLogService } from '../../../log/common/log.js';
import { traceAgentHostOperation } from '../../node/agentHostOperationDiagnostics.js';

class RecordingLogService extends NullLogService {
	readonly entries: { phase: string; operationId: string; outcome: string; hasDuration: boolean }[] = [];

	override getLevel(): LogLevel {
		return LogLevel.Trace;
	}

	override trace(message: string): void {
		const match = /phase=(?<phase>\S+) operationId=(?<operationId>\S+) outcome=(?<outcome>\S+)(?: durationMs=(?<durationMs>[\d.]+))?$/.exec(message);
		assert.ok(match?.groups, message);
		this.entries.push({
			phase: match.groups.phase,
			operationId: match.groups.operationId,
			outcome: match.groups.outcome,
			hasDuration: match.groups.durationMs !== undefined,
		});
	}
}

suite('AgentHostOperationDiagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('records a pending phase before completion and preserves its result', async () => {
		const log = store.add(new RecordingLogService());
		const pending = new DeferredPromise<{ value: string }>();
		const result = { value: 'not logged' };
		const operation = traceAgentHostOperation(log, 'session', 'read', () => pending.p);
		const operationId = log.entries[0]?.operationId;
		assert.deepStrictEqual(log.entries, [{ phase: 'read', operationId, outcome: 'started', hasDuration: false }]);
		await pending.complete(result);
		assert.strictEqual(await operation, result);
		assert.deepStrictEqual(log.entries, [
			{ phase: 'read', operationId, outcome: 'started', hasDuration: false },
			{ phase: 'read', operationId, outcome: 'succeeded', hasDuration: true },
		]);
	});

	test('records failure and rethrows the original error without logging its contents', async () => {
		const log = store.add(new RecordingLogService());
		const error = new Error('sensitive error contents');
		await assert.rejects(traceAgentHostOperation(log, 'session', 'read', () => { throw error; }), actual => actual === error);
		const operationId = log.entries[0]?.operationId;
		assert.deepStrictEqual(log.entries, [
			{ phase: 'read', operationId, outcome: 'started', hasDuration: false },
			{ phase: 'read', operationId, outcome: 'failed', hasDuration: true },
		]);
	});

	test('correlates concurrent operations independently', async () => {
		const log = store.add(new RecordingLogService());
		await Promise.all([
			traceAgentHostOperation(log, 'session', 'read', async () => 1),
			traceAgentHostOperation(log, 'session', 'read', async () => 2),
		]);
		assert.notStrictEqual(log.entries[0].operationId, log.entries[1].operationId);
		assert.deepStrictEqual(log.entries.map(({ outcome }) => outcome), ['started', 'started', 'succeeded', 'succeeded']);
	});

	test('preserves the original promise and synchronous errors when trace logging is disabled', () => {
		const log = store.add(new NullLogService());
		const pending = Promise.resolve(1);
		const error = new Error('original error');
		assert.strictEqual(traceAgentHostOperation(log, 'session', 'read', () => pending), pending);
		assert.throws(() => traceAgentHostOperation(log, 'session', 'read', () => { throw error; }), actual => actual === error);
	});
});
