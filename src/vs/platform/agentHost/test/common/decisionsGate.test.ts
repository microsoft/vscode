/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentDecisionErrorData, type IAgentDecisionsRequest, type IAgentDecisionsResult } from '../../common/agentDecisions.js';
import { DecisionsGate } from '../../common/decisionsGate.js';

function request(model = 'gpt-6-luna-decisions', text = 'hi'): IAgentDecisionsRequest {
	return { model, context: { kind: 'text', text }, questions: [{ kind: 'boolean', name: 'q', instructions: 'Yes?' }] };
}

function failure(kind: string, retryAfterMs?: number): Error {
	return Object.assign(new Error(kind), { data: { kind, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) } });
}

const answer: IAgentDecisionsResult = { model: 'gpt-6-luna-decisions', answers: [{ kind: 'boolean', name: 'q', probability: 0.9 }] };

suite('DecisionsGate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let now = 0;
	let calls: IAgentDecisionsRequest[];
	let pending: DeferredPromise<IAgentDecisionsResult>[];
	let gate: DecisionsGate;

	setup(() => {
		now = 0;
		calls = [];
		pending = [];
		gate = new DecisionsGate(r => {
			calls.push(r);
			const deferred = new DeferredPromise<IAgentDecisionsResult>();
			pending.push(deferred);
			return deferred.p;
		}, () => now);
	});

	async function kindOf(promise: Promise<unknown>): Promise<string | undefined> {
		try {
			await promise;
			return 'ok';
		} catch (error) {
			return agentDecisionErrorData(error)?.kind ?? (error as Error).name;
		}
	}

	test('a caller that stops waiting doesn\'t cancel the call, and its late failure still shuts the gate', async () => {
		const cts = new CancellationTokenSource();
		const first = gate.ask(request(), cts.token);
		cts.cancel();
		assert.strictEqual(await kindOf(first), 'Canceled');
		cts.dispose();
		pending[0].error(failure('rateLimited', 10_000));
		await Promise.resolve();

		now = 9_999;
		assert.strictEqual(await kindOf(gate.ask(request(undefined, 'new'), CancellationToken.None)), 'rateLimited');
		assert.strictEqual(calls.length, 1, 'shut: no call');
		now = 10_000;
		const reopened = gate.ask(request(undefined, 'new'), CancellationToken.None);
		pending[1].complete(answer);
		assert.strictEqual(await kindOf(reopened), 'ok');
	});

	test('cooldowns only lengthen, and a late success doesn\'t reopen the gate', async () => {
		const slow = gate.ask(request(undefined, 'slow'), CancellationToken.None);
		const limited = gate.ask(request(undefined, 'limited'), CancellationToken.None);
		pending[1].error(failure('notEnabled'));
		await kindOf(limited);
		pending[0].complete(answer);
		await slow;
		now = 1_000;
		assert.strictEqual(await kindOf(gate.ask(request(undefined, 'x'), CancellationToken.None)), 'notEnabled');
		now = 5 * 60_000;
		const after = gate.ask(request(undefined, 'x'), CancellationToken.None);
		pending[2].complete(answer);
		assert.strictEqual(await kindOf(after), 'ok');
	});

	test('noModel shuts only that decision model; other failures don\'t shut the gate', async () => {
		const missing = gate.ask(request('missing-model'), CancellationToken.None);
		pending[0].error(failure('noModel'));
		await kindOf(missing);
		const timeout = gate.ask(request(undefined, 'timeout'), CancellationToken.None);
		pending[1].error(failure('timeout'));
		await kindOf(timeout);
		assert.strictEqual(await kindOf(gate.ask(request('missing-model', 'again'), CancellationToken.None)), 'noModel');
		const other = gate.ask(request(undefined, 'again'), CancellationToken.None);
		pending[2].complete(answer);
		assert.deepStrictEqual({ other: await kindOf(other), calls: calls.length }, { other: 'ok', calls: 3 });
	});
});
