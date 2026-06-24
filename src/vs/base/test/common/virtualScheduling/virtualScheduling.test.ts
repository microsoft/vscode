/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../common/cancellation.js';
import { DisposableStore } from '../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';
import {
	createTraceRoot,
	createVirtualTimeApi,
	drainMicrotasksEmbedding,
	nextMacrotask,
	pushGlobalTimeApi,
	realTimeApi,
	runWithFakedTimers,
	Trace,
	TraceContext,
	untilIdle,
	untilTime,
	untilToken,
	VirtualClock,
	VirtualTimeProcessor,
} from './index.js';

function traceInfo(t: Trace): { labels: string[]; rootLabel: string; depth: number } {
	const labels: string[] = [];
	for (let c: Trace | undefined = t; c; c = c.parent) { labels.push(c.label); }
	return { labels, rootLabel: t.root.label, depth: t.depth };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>(res => { resolve = res; });
	return { promise, resolve };
}

const realSink = { afterMicrotaskClosure: (cb: () => void) => nextMacrotask(realTimeApi, cb) };

suite('virtualScheduling - Trace + TraceContext', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => TraceContext.instance._resetForTesting());

	test('Trace.describe builds causal chain from leaf to root', () => {
		const root = createTraceRoot('fixture');
		const t1 = root.child('setTimeout(100ms)');
		const t2 = t1.child('await continuation');
		assert.deepStrictEqual(traceInfo(t2), {
			labels: ['await continuation', 'setTimeout(100ms)', 'fixture'],
			rootLabel: 'fixture',
			depth: 2,
		});
	});

	test('runWithTrace installs and restores synchronously; supports nesting', () => {
		const a = createTraceRoot('a');
		const b = createTraceRoot('b');
		const observations: string[] = [];
		observations.push(TraceContext.instance.currentTrace().label);
		TraceContext.instance.runWithTrace(a, () => {
			observations.push(TraceContext.instance.currentTrace().label);
			TraceContext.instance.runWithTrace(b, () => {
				observations.push(TraceContext.instance.currentTrace().label);
			});
			observations.push(TraceContext.instance.currentTrace().label);
		});
		observations.push(TraceContext.instance.currentTrace().label);
		assert.deepStrictEqual(observations, ['<root>', 'a', 'b', 'a', '<root>']);
	});

	test('runAsHandler throws on sync re-entry', () => {
		const a = createTraceRoot('a');
		const b = createTraceRoot('b');
		assert.throws(
			() => TraceContext.instance.runAsHandler(a,
				() => TraceContext.instance.runAsHandler(b, () => { }, realSink),
				realSink),
			/re-entrant/,
		);
	});

	test('runAsHandler leaks trace across awaited microtasks', async () => {
		const root = createTraceRoot('fixture');
		const observed: string[] = [];

		await TraceContext.instance.runAsHandler(root, async () => {
			observed.push(TraceContext.instance.currentTrace().label);
			await Promise.resolve();
			observed.push(TraceContext.instance.currentTrace().label);
			await Promise.resolve().then(() => Promise.resolve());
			observed.push(TraceContext.instance.currentTrace().label);
		}, realSink);

		assert.deepStrictEqual(observed, ['fixture', 'fixture', 'fixture']);
	});
});

suite('virtualScheduling - createVirtualTimeApi trace propagation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => TraceContext.instance._resetForTesting());

	test('virtual setTimeout: callback fires under trace child of schedule-time trace', async () => {
		await runWithFakedTimers({}, async () => {
			const root = createTraceRoot('root');
			const { promise, resolve } = deferred<Trace>();
			TraceContext.instance.runAsHandler(root, () => {
				setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
			}, realSink);
			const observed = await promise;
			assert.deepStrictEqual(traceInfo(observed), {
				labels: ['setTimeout(0ms)', 'root'],
				rootLabel: 'root',
				depth: 1,
			});
		});
	});

	test('virtual nested setTimeout preserves full causal chain', async () => {
		await runWithFakedTimers({}, async () => {
			const root = createTraceRoot('root');
			const { promise, resolve } = deferred<Trace>();
			TraceContext.instance.runAsHandler(root, () => {
				setTimeout(() => {
					setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
				}, 0);
			}, realSink);
			const observed = await promise;
			assert.deepStrictEqual(traceInfo(observed), {
				labels: ['setTimeout(0ms)', 'setTimeout(0ms)', 'root'],
				rootLabel: 'root',
				depth: 2,
			});
		});
	});

	test('virtual setInterval: each tick gets a fresh child trace', async () => {
		await runWithFakedTimers({}, async () => {
			const root = createTraceRoot('root');
			const observed: Trace[] = [];
			const { promise, resolve } = deferred<void>();
			TraceContext.instance.runAsHandler(root, () => {
				const id = setInterval(() => {
					observed.push(TraceContext.instance.currentTrace());
					if (observed.length === 3) { clearInterval(id); resolve(); }
				}, 5);
			}, realSink);
			await promise;
			assert.deepStrictEqual(observed.map(traceInfo), [
				{ labels: ['tick #1', 'setInterval(5ms)', 'root'], rootLabel: 'root', depth: 2 },
				{ labels: ['tick #2', 'setInterval(5ms)', 'root'], rootLabel: 'root', depth: 2 },
				{ labels: ['tick #3', 'setInterval(5ms)', 'root'], rootLabel: 'root', depth: 2 },
			]);
		});
	});

	test('concurrent runAsHandler via setTimeout(0): traces do not leak across handlers', async () => {
		await runWithFakedTimers({}, async () => {
			const a = createTraceRoot('a');
			const b = createTraceRoot('b');
			const { promise: doneA, resolve: resA } = deferred<Trace>();
			const { promise: doneB, resolve: resB } = deferred<Trace>();
			TraceContext.instance.runAsHandler(a, () => {
				setTimeout(() => resA(TraceContext.instance.currentTrace()), 0);
			}, realSink);
			TraceContext.instance.runAsHandler(b, () => {
				setTimeout(() => resB(TraceContext.instance.currentTrace()), 0);
			}, realSink);
			const [tA, tB] = await Promise.all([doneA, doneB]);
			assert.deepStrictEqual({
				aRoot: tA.root.label,
				aLabels: traceInfo(tA).labels,
				bRoot: tB.root.label,
				bLabels: traceInfo(tB).labels,
			}, {
				aRoot: 'a',
				aLabels: ['setTimeout(0ms)', 'a'],
				bRoot: 'b',
				bLabels: ['setTimeout(0ms)', 'b'],
			});
		});
	});
});

suite('virtualScheduling - VirtualTimeProcessor termination policies', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => TraceContext.instance._resetForTesting());

	function makeProcessor(store: DisposableStore, clock: VirtualClock): VirtualTimeProcessor {
		return store.add(new VirtualTimeProcessor(
			clock,
			drainMicrotasksEmbedding(realTimeApi),
			realTimeApi,
			{ defaultMaxEvents: 50 },
		));
	}

	test('untilIdle: resolves when queue drains', async () => {
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);
		const log: string[] = [];

		clock.schedule({ time: 5, source: { toString: () => 't1' }, run: () => log.push('a') });
		clock.schedule({ time: 10, source: { toString: () => 't2' }, run: () => log.push('b') });

		await p.run({ until: untilIdle });
		assert.deepStrictEqual(log, ['a', 'b']);
		store.dispose();
	});

	test('untilTime: resolves at deadline even when no events scheduled', async () => {
		// The deadline alone — with no other events queued — must still drive
		// virtual time to the deadline. The processor inserts a sentinel
		// event at the deadline to guarantee this.
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);

		await p.run({ until: untilTime(100) });
		assert.strictEqual(clock.now, 100);
		store.dispose();
	});

	test('untilTime: pre-scheduled events run before deadline', async () => {
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);
		const log: string[] = [];

		clock.schedule({ time: 50, source: { toString: () => 't' }, run: () => log.push('a') });

		await p.run({ until: untilTime(100) });
		assert.deepStrictEqual({ log, virtualNow: clock.now }, { log: ['a'], virtualNow: 100 });
		store.dispose();
	});

	test('untilTime: events strictly past the deadline are NOT executed', async () => {
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);
		const log: string[] = [];

		clock.schedule({ time: 50, source: { toString: () => 'a' }, run: () => log.push('a') });
		clock.schedule({ time: 100, source: { toString: () => 'b' }, run: () => log.push('b') });
		clock.schedule({ time: 101, source: { toString: () => 'c' }, run: () => log.push('c') });

		await p.run({ until: untilTime(100) });
		assert.deepStrictEqual(log, ['a', 'b']);
		store.dispose();
	});

	test('untilToken: resolves only after token cancellation AND drain', async () => {
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);
		const cts = store.add(new CancellationTokenSource());
		const log: string[] = [];

		const runP = p.run({ until: untilToken(cts.token) });

		// While run is parked (no events), schedule + cancel.
		await Promise.resolve();
		clock.schedule({ time: 5, source: { toString: () => 't' }, run: () => log.push('a') });
		cts.cancel();

		await runP;
		assert.deepStrictEqual(log, ['a']);
		store.dispose();
	});

	test('maxEvents: rejects when too many events are executed', async () => {
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);

		// Self-rescheduling timer
		const tick = (n: number) => {
			clock.schedule({
				time: clock.now + 1,
				source: { toString: () => `t${n}` },
				run: () => tick(n + 1),
			});
		};
		tick(0);

		await assert.rejects(
			p.run({ until: untilIdle, maxEvents: 5 }),
			/exceeded maxEvents/,
		);
		store.dispose();
	});

	test('disposal rejects all active runs', async () => {
		const store = new DisposableStore();
		const clock = new VirtualClock();
		const p = makeProcessor(store, clock);
		const cts = store.add(new CancellationTokenSource());

		const runP = p.run({ until: untilToken(cts.token) });
		p.dispose();

		await assert.rejects(runP, /disposed/);
		store.dispose();
	});
});

suite('virtualScheduling - runWithFakedTimers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => TraceContext.instance._resetForTesting());

	test('drains queue after fn() resolves', async () => {
		const log: string[] = [];
		await runWithFakedTimers({}, async () => {
			setTimeout(() => log.push('a'), 100);
			setTimeout(() => log.push('b'), 50);
		});
		assert.deepStrictEqual(log, ['b', 'a']);
	});

	test('useFakeTimers=false bypasses virtual time', async () => {
		const before = globalThis.setTimeout;
		await runWithFakedTimers({ useFakeTimers: false }, async () => {
			assert.strictEqual(globalThis.setTimeout, before);
		});
	});

	test('promise chains awaited inside fn() resolve deterministically', async () => {
		const log: string[] = [];
		await runWithFakedTimers({}, async () => {
			await new Promise<void>(resolve => {
				setTimeout(async () => {
					log.push('1');
					await Promise.resolve();
					log.push('2');
					setTimeout(() => { log.push('3'); resolve(); }, 10);
				}, 5);
			});
		});
		assert.deepStrictEqual(log, ['1', '2', '3']);
	});
});

suite('virtualScheduling - createVirtualTimeApi without processor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('virtual Date.now() returns clock time', () => {
		const clock = new VirtualClock(12345);
		const api = createVirtualTimeApi(clock);
		const restore = pushGlobalTimeApi(api);
		try {
			assert.strictEqual(Date.now(), 12345);
		} finally {
			restore.dispose();
		}
	});
});
