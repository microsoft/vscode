/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { AbstractDebugAdapter } from '../../common/abstractDebugAdapter.js';
import { MockDebugAdapter } from './mockDebug.js';

class TestDebugAdapter extends AbstractDebugAdapter {
	startSession(): Promise<void> { return Promise.resolve(); }
	stopSession(): Promise<void> { return Promise.resolve(); }
	sendMessage(message: DebugProtocol.ProtocolMessage): void { }
	public cancelRequests(): Promise<void> {
		return this.cancelPendingRequests();
	}
}

suite('Debug - AbstractDebugAdapter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('event ordering', () => {
		let adapter: MockDebugAdapter;
		let output: string[];
		setup(() => {
			adapter = new MockDebugAdapter();
			output = [];
			adapter.onEvent(ev => {
				output.push((ev as DebugProtocol.OutputEvent).body.output);
				Promise.resolve().then(() => output.push('--end microtask--'));
			});
		});

		const evaluate = async (expression: string) => {
			await new Promise(resolve => adapter.sendRequest('evaluate', { expression }, resolve));
			output.push(`=${expression}`);
			Promise.resolve().then(() => output.push('--end microtask--'));
		};

		test('inserts task boundary before response', async () => {
			await evaluate('before.foo');
			await timeout(0);

			assert.deepStrictEqual(output, ['before.foo', '--end microtask--', '=before.foo', '--end microtask--']);
		});

		test('inserts task boundary after response', async () => {
			await evaluate('after.foo');
			await timeout(0);

			assert.deepStrictEqual(output, ['=after.foo', '--end microtask--', 'after.foo', '--end microtask--']);
		});

		test('does not insert boundaries between events', async () => {
			adapter.sendEventBody('output', { output: 'a' });
			adapter.sendEventBody('output', { output: 'b' });
			adapter.sendEventBody('output', { output: 'c' });
			await timeout(0);

			assert.deepStrictEqual(output, ['a', 'b', 'c', '--end microtask--', '--end microtask--', '--end microtask--']);
		});
	});

	suite('request cancellation', () => {
		test('does not invoke callback twice if request resolves during cancellation grace period', async () => {
			await runWithFakedTimers({}, async () => {
				const adapter = store.add(new TestDebugAdapter());
				const callbacks: string[] = [];
				const seq = adapter.sendRequest('testCommand', {}, res => {
					callbacks.push(res.success ? 'success' : 'canceled');
				});

				const cancelPromise = adapter.cancelRequests();

				// Simulate response arriving during the 500ms grace period
				await timeout(50);
				const response: DebugProtocol.Response = {
					type: 'response',
					seq: 1,
					request_seq: seq,
					command: 'testCommand',
					success: true
				};
				adapter.acceptMessage(response);

				await cancelPromise;
				assert.deepStrictEqual(callbacks, ['success']);
			});
		});

		test('invokes callback with canceled response if request does not resolve within grace period', async () => {
			await runWithFakedTimers({}, async () => {
				const adapter = store.add(new TestDebugAdapter());
				const callbacks: string[] = [];
				adapter.sendRequest('testCommand', {}, res => {
					callbacks.push(res.success ? 'success' : 'canceled');
				});

				await adapter.cancelRequests();
				assert.deepStrictEqual(callbacks, ['canceled']);
			});
		});

		test('handles mixed resolution and cancellation correctly', async () => {
			await runWithFakedTimers({}, async () => {
				const adapter = store.add(new TestDebugAdapter());
				const results = new Map<number, string>();
				const seq1 = adapter.sendRequest('cmd1', {}, res => {
					results.set(seq1, res.success ? 'success' : 'canceled');
				});
				const seq2 = adapter.sendRequest('cmd2', {}, res => {
					results.set(seq2, res.success ? 'success' : 'canceled');
				});

				const cancelPromise = adapter.cancelRequests();

				// seq1 resolves during grace period
				await timeout(50);
				const response: DebugProtocol.Response = {
					type: 'response',
					seq: 1,
					request_seq: seq1,
					command: 'cmd1',
					success: true
				};
				adapter.acceptMessage(response);

				await cancelPromise;
				assert.strictEqual(results.get(seq1), 'success');
				assert.strictEqual(results.get(seq2), 'canceled');
			});
		});
	});
});
