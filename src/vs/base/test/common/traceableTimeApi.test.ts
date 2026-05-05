/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import {
	createTraceRoot,
	Trace,
	TraceContext,
} from './traceableTimeApi.js';
import { AsyncSchedulerProcessor, captureGlobalTimeApi, createVirtualTimeApi, TimeTravelScheduler } from './timeTravelScheduler.js';
import { buildHistoryFromTasks, renderSwimlanes } from './executionGraph.js';
import { DisposableStore } from '../../common/lifecycle.js';

/** Stable serialisation of a trace for snapshot assertions. */
function traceInfo(t: Trace): { labels: string[]; rootLabel: string; depth: number } {
	const labels: string[] = [];
	for (let c: Trace | undefined = t; c; c = c.parent) { labels.push(c.label); }
	return { labels, rootLabel: t.root.label, depth: t.depth };
}

suite('traceableTimeApi', () => {
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
		const realTime = captureGlobalTimeApi();
		const a = createTraceRoot('a');
		const b = createTraceRoot('b');
		assert.throws(
			() => TraceContext.instance.runAsHandler(a, () => TraceContext.instance.runAsHandler(b, () => { }, realTime), realTime),
			/re-entrant runAsHandler/,
		);
	});

	test('runAsHandler leaks trace across awaited microtasks', async () => {
		const realTime = captureGlobalTimeApi();
		const fixtureRoot = createTraceRoot('fixture');
		const observations: string[] = [];

		await TraceContext.instance.runAsHandler(fixtureRoot, async () => {
			observations.push(TraceContext.instance.currentTrace().label);
			await Promise.resolve();
			observations.push(TraceContext.instance.currentTrace().label);
			await Promise.resolve().then(() => Promise.resolve());
			observations.push(TraceContext.instance.currentTrace().label);
		}, realTime);

		assert.deepStrictEqual(observations, ['fixture', 'fixture', 'fixture']);
	});

	test('tracing time api tags setTimeout, fires callback under captured trace', async () => {
		const realTime = captureGlobalTimeApi();
		const tracing = TraceContext.instance.createTracingTimeApi(realTime, realTime);
		const root = createTraceRoot('root');

		const { promise, resolve } = deferred<Trace>();
		TraceContext.instance.runAsHandler(root, () => {
			tracing.setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
		}, realTime);

		const observed = await promise;
		assert.deepStrictEqual(traceInfo(observed), {
			labels: ['setTimeout(0ms)', 'root'],
			rootLabel: 'root',
			depth: 1,
		});
	});

	test('tracing time api: nested setTimeout preserves full causal chain', async () => {
		const realTime = captureGlobalTimeApi();
		const tracing = TraceContext.instance.createTracingTimeApi(realTime, realTime);
		const root = createTraceRoot('root');

		const { promise, resolve } = deferred<Trace>();
		TraceContext.instance.runAsHandler(root, () => {
			tracing.setTimeout(() => {
				tracing.setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
			}, 0);
		}, realTime);

		const observed = await promise;
		assert.deepStrictEqual(traceInfo(observed), {
			labels: ['setTimeout(0ms)', 'setTimeout(0ms)', 'root'],
			rootLabel: 'root',
			depth: 2,
		});
	});

	test('setInterval: each tick gets a fresh child trace', async () => {
		const realTime = captureGlobalTimeApi();
		const tracing = TraceContext.instance.createTracingTimeApi(realTime, realTime);
		const root = createTraceRoot('root');

		const observed: Trace[] = [];
		const { promise, resolve } = deferred<void>();
		let id: unknown;
		TraceContext.instance.runAsHandler(root, () => {
			id = tracing.setInterval(() => {
				observed.push(TraceContext.instance.currentTrace());
				if (observed.length === 3) { tracing.clearInterval(id); resolve(); }
			}, 5);
		}, realTime);

		await promise;
		assert.deepStrictEqual(observed.map(t => traceInfo(t)), [
			{ labels: ['tick #1', 'setInterval(5ms)', 'root'], rootLabel: 'root', depth: 2 },
			{ labels: ['tick #2', 'setInterval(5ms)', 'root'], rootLabel: 'root', depth: 2 },
			{ labels: ['tick #3', 'setInterval(5ms)', 'root'], rootLabel: 'root', depth: 2 },
		]);
	});

	test('concurrent runAsHandler via setTimeout 0: traces do not leak across handlers', async () => {
		const realTime = captureGlobalTimeApi();
		const tracing = TraceContext.instance.createTracingTimeApi(realTime, realTime);
		const a = createTraceRoot('a');
		const b = createTraceRoot('b');

		const { promise: doneA, resolve: resA } = deferred<Trace>();
		const { promise: doneB, resolve: resB } = deferred<Trace>();
		TraceContext.instance.runAsHandler(a, () => {
			tracing.setTimeout(() => resA(TraceContext.instance.currentTrace()), 0);
		}, realTime);
		TraceContext.instance.runAsHandler(b, () => {
			tracing.setTimeout(() => resB(TraceContext.instance.currentTrace()), 0);
		}, realTime);

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

	test('buildHistoryFromTasks adapter: scheduler history feeds the renderer', async () => {
		const startTime = 1000;
		const store = new DisposableStore();
		const scheduler = new TimeTravelScheduler(startTime);
		const p = store.add(new AsyncSchedulerProcessor(scheduler, { maxTaskCount: 100 }));
		const vt = createVirtualTimeApi(scheduler, { fakeRequestAnimationFrame: true });

		const rootA = createTraceRoot('A');
		const rootB = createTraceRoot('B');

		// A: setTimeout(+0) spawns rAF(+16) and setTimeout(+50); rAF(+16) → rAF(+32).
		TraceContext.instance.runWithTrace(rootA, () => {
			vt.setTimeout(() => {
				vt.requestAnimationFrame!(() => {
					vt.requestAnimationFrame!(() => { /* A deep paint */ });
				});
				vt.setTimeout(() => { /* A delayed work */ }, 50);
			}, 0);
		});

		// B: setTimeout(+10) → rAF(+26) → setTimeout(+46).
		TraceContext.instance.runWithTrace(rootB, () => {
			vt.setTimeout(() => {
				vt.requestAnimationFrame!(() => {
					vt.setTimeout(() => { /* B work */ }, 20);
				});
			}, 10);
		});

		await p.run();

		const history = buildHistoryFromTasks(p.history, startTime);
		assert.deepStrictEqual(
			{
				rootLabels: history.roots.map(r => r.label),
				events: history.events.map(e => ({
					time: e.time,
					label: e.label,
					root: e.root.label,
					parent: e.parent ? `${e.parent.label}@+${e.parent.time}` : undefined,
				})),
			},
			{
				rootLabels: ['A', 'B'],
				events: [
					{ time: 0, label: 'setTimeout', root: 'A', parent: undefined },
					{ time: 10, label: 'setTimeout', root: 'B', parent: undefined },
					{ time: 16, label: 'requestAnimationFrame', root: 'A', parent: 'setTimeout@+0' },
					{ time: 26, label: 'requestAnimationFrame', root: 'B', parent: 'setTimeout@+10' },
					{ time: 32, label: 'requestAnimationFrame', root: 'A', parent: 'requestAnimationFrame@+16' },
					{ time: 46, label: 'setTimeout', root: 'B', parent: 'requestAnimationFrame@+26' },
					{ time: 50, label: 'setTimeout', root: 'A', parent: 'setTimeout@+0' },
				],
			},
		);

		// Sanity check: the renderer still works on adapter output. Output
		// correctness is covered by `executionGraph.test.ts`.
		assert.ok(renderSwimlanes(history).length > 0);

		store.dispose();
	});

	test('complex graph: async/await + setTimeout + setInterval + rAF interleave with preserved causality', async () => {
		const startTime = 1000;
		const store = new DisposableStore();
		const scheduler = new TimeTravelScheduler(startTime);
		const p = store.add(new AsyncSchedulerProcessor(scheduler, { maxTaskCount: 200 }));
		const vt = createVirtualTimeApi(scheduler, { fakeRequestAnimationFrame: true });
		const log = TraceContext.instance.log.bind(TraceContext.instance);

		const rootA = createTraceRoot('A');
		const rootB = createTraceRoot('B');

		// A: setTimeout(+1) runs an async handler that, after a microtask,
		// fans out into rAF (+16) and setInterval(10ms). The rAF callback
		// itself awaits a microtask before scheduling a setTimeout(+20).
		// The interval ticks twice and then clears itself.
		TraceContext.instance.runWithTrace(rootA, () => {
			vt.setTimeout(async () => {
				log('A:start');
				await Promise.resolve();
				log('A:after-await');
				vt.requestAnimationFrame!(async () => {
					log('A:rAF');
					await Promise.resolve();
					vt.setTimeout(() => log('A:post-rAF'), 20);
				});
				let ticks = 0;
				const id = vt.setInterval(() => {
					ticks++;
					log(`A:tick#${ticks}`);
					if (ticks === 2) { vt.clearInterval(id); }
				}, 10);
			}, 1);
		});

		// B: setTimeout(+3) → rAF (+19) → setTimeout(+39). Starts close to A
		// so the two roots' events interleave on the timeline.
		TraceContext.instance.runWithTrace(rootB, () => {
			vt.setTimeout(() => {
				log('B:start');
				vt.requestAnimationFrame!(() => {
					log('B:rAF');
					vt.setTimeout(() => log('B:post-rAF'), 20);
				});
			}, 3);
		});

		await p.run();

		const history = buildHistoryFromTasks(p.history, startTime, TraceContext.instance.takeLog());
		assert.deepStrictEqual(
			{
				rootLabels: history.roots.map(r => r.label),
				events: history.events.map(e => ({
					time: e.time,
					label: e.label,
					root: e.root.label,
					parent: e.parent ? `${e.parent.label}@+${e.parent.time}` : undefined,
				})),
			},
			{
				rootLabels: ['A', 'B'],
				events: [
					{ time: 1, label: 'setTimeout', root: 'A', parent: undefined },
					{ time: 1, label: 'log: A:start', root: 'A', parent: 'setTimeout@+1' },
					{ time: 1, label: 'log: A:after-await', root: 'A', parent: 'setTimeout@+1' },
					{ time: 3, label: 'setTimeout', root: 'B', parent: undefined },
					{ time: 3, label: 'log: B:start', root: 'B', parent: 'setTimeout@+3' },
					{ time: 11, label: 'setInterval (iteration 1)', root: 'A', parent: 'setTimeout@+1' },
					{ time: 11, label: 'log: A:tick#1', root: 'A', parent: 'setInterval (iteration 1)@+11' },
					{ time: 17, label: 'requestAnimationFrame', root: 'A', parent: 'setTimeout@+1' },
					{ time: 17, label: 'log: A:rAF', root: 'A', parent: 'requestAnimationFrame@+17' },
					{ time: 19, label: 'requestAnimationFrame', root: 'B', parent: 'setTimeout@+3' },
					{ time: 19, label: 'log: B:rAF', root: 'B', parent: 'requestAnimationFrame@+19' },
					{ time: 21, label: 'setInterval (iteration 2)', root: 'A', parent: 'setTimeout@+1' },
					{ time: 21, label: 'log: A:tick#2', root: 'A', parent: 'setInterval (iteration 2)@+21' },
					{ time: 37, label: 'setTimeout', root: 'A', parent: 'requestAnimationFrame@+17' },
					{ time: 37, label: 'log: A:post-rAF', root: 'A', parent: 'setTimeout@+37' },
					{ time: 39, label: 'setTimeout', root: 'B', parent: 'requestAnimationFrame@+19' },
					{ time: 39, label: 'log: B:post-rAF', root: 'B', parent: 'setTimeout@+39' },
				],
			},
		);

		// Sanity check: the renderer accepts the adapter output.
		assert.ok(renderSwimlanes(history).length > 0);

		store.dispose();
	});
});

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
}
