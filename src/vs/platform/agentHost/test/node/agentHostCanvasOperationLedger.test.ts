/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostCanvasOperationLedger, CanvasOperationIndeterminateError, CanvasRequestConflictError } from '../../node/agentHostCanvasOperationLedger.js';

suite('AgentHostCanvasOperationLedger', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const identity = { clientId: 'first', chat: URI.parse('ahp-chat:/session/first'), requestId: 'one' };

	test('coalesces identical authenticated retries, including while the effect is in flight', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		const gate = new DeferredPromise<number>();
		let calls = 0;
		const run = () => ledger.execute(identity, { kind: 'action', input: { b: 2, a: 1 } }, async execution => {
			execution.startEffects();
			calls++;
			return gate.p;
		});
		const first = run();
		const second = ledger.execute(identity, { input: { a: 1, b: 2 }, kind: 'action' }, async () => { calls++; return 9; });
		assert.strictEqual(first, second);
		await gate.complete(7);
		assert.deepStrictEqual({ first: await first, retry: await run(), calls }, { first: 7, retry: 7, calls: 1 });
	});

	test('a reused request ID with different input conflicts, while new explicit opens execute', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		let calls = 0;
		const run = () => Promise.resolve(++calls);
		await ledger.execute(identity, { kind: 'open', instanceId: 'same', input: 1 }, run);
		assert.throws(() => ledger.execute(identity, { kind: 'open', instanceId: 'same', input: 2 }, run), CanvasRequestConflictError);
		await ledger.execute({ ...identity, requestId: 'two' }, { kind: 'open', instanceId: 'same', input: 2 }, run);
		assert.strictEqual(calls, 2);
	});

	test('isolates clients and rejects a changed peer-chat target under a reused request ID', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		let calls = 0;
		const run = () => Promise.resolve(++calls);
		const results = await Promise.all([
			ledger.execute(identity, null, run),
			ledger.execute({ ...identity, clientId: 'second' }, null, run),
		]);
		assert.throws(() => ledger.execute({ ...identity, chat: URI.parse('ahp-chat:/session/peer') }, null, run), CanvasRequestConflictError);
		results.push(await ledger.execute({ ...identity, requestId: 'peer-request', chat: URI.parse('ahp-chat:/session/peer') }, null, run));
		assert.deepStrictEqual(results, [1, 2, 3]);
	});

	test('retains an uncertain effect result rather than replaying after provider failure', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		const failure = new Error('Connection lost after writing');
		let calls = 0;
		const run = () => ledger.execute(identity, null, async execution => {
			execution.startEffects();
			calls++;
			throw failure;
		});
		for (let i = 0; i < 2; i++) {
			await assert.rejects(run(), error => error instanceof CanvasOperationIndeterminateError && error.cause === failure);
		}
		assert.strictEqual(calls, 1);
	});

	test('keeps pre-effect rejections definite and preserves the original Error', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		const denied = new Error('Not approved');
		await assert.rejects(ledger.execute(identity, null, async () => { throw denied; }), error => error === denied);
	});

	test('invalidation settles pending effects as indeterminate and ignores late completion', async () => {
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>());
		const gate = new DeferredPromise<number>();
		const pending = ledger.execute(identity, null, async execution => { execution.startEffects(); return gate.p; });
		const rejected = assert.rejects(pending, CanvasOperationIndeterminateError);
		ledger.invalidateChat(identity.chat);
		await rejected;
		await gate.complete(42);
		await assert.rejects(ledger.execute(identity, null, async () => 8), CanvasOperationIndeterminateError);
	});

	test('does not evict in-flight or unexpired requests to make room for new effects', async () => {
		let now = 0;
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>(1, 100, () => now));
		await ledger.execute(identity, null, async () => 1);
		assert.throws(() => ledger.execute({ ...identity, requestId: 'two' }, null, async () => 2), /retry window is full/);
		now = 101;
		assert.strictEqual(await ledger.execute({ ...identity, requestId: 'two' }, null, async () => 2), 2);
	});

	test('the default 256-entry budget refuses overload until the five-minute retry window expires', async () => {
		let now = 0;
		let effects = 0;
		const ledger = store.add(new AgentHostCanvasOperationLedger<number>(undefined, undefined, () => now));
		for (let index = 0; index < 256; index++) {
			await ledger.execute({ ...identity, requestId: String(index) }, null, async execution => {
				execution.startEffects();
				return ++effects;
			});
		}
		const overflow = () => ledger.execute({ ...identity, requestId: 'overflow' }, null, async () => ++effects);
		assert.throws(overflow, /retry window is full/);
		now = 299_999;
		assert.throws(overflow, /retry window is full/);
		const replay = await ledger.execute({ ...identity, requestId: '0' }, null, async () => ++effects);
		now = 300_000;
		const recovered = await overflow();
		assert.deepStrictEqual({ replay, recovered, effects }, { replay: 1, recovered: 257, effects: 257 });
	});
});
