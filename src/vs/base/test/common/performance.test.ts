/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { clearMarks, createPerfTracer, getMarks, getPerfTracer, mark, PerformanceMark } from '../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

function marksFor(prefix: string): PerformanceMark[] {
	return getMarks().filter(m => m.name.startsWith(prefix));
}

function markNames(prefix: string): string[] {
	return marksFor(prefix).map(m => m.name);
}

function detailOf(m: PerformanceMark): Record<string, unknown> {
	return m.detail as Record<string, unknown>;
}

// Each test uses a unique prefix via a counter to avoid singleton state leaking between tests.
let testCounter = 0;
function uniquePrefix(): string {
	return `test/perf/${testCounter++}/`;
}

suite('PerfTracer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('createPerfTracer / getPerfTracer', () => {
		test('createPerfTracer() registers and getPerfTracer() returns it', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			assert.strictEqual(getPerfTracer(p), tracer);
			tracer.dispose();
		});

		test('createPerfTracer() replaces existing tracer with same prefix', () => {
			const p = uniquePrefix();
			const t1 = createPerfTracer(p);
			t1.start().mark('old');
			const t2 = createPerfTracer(p);
			assert.strictEqual(getPerfTracer(p), t2);
			// old tracer's marks were cleared by dispose
			assert.strictEqual(marksFor(p).length, 0);
			t2.dispose();
		});

		test('getPerfTracer() returns undefined for unknown prefix', () => {
			assert.strictEqual(getPerfTracer(uniquePrefix()), undefined);
		});

		test('dispose() removes from global registry', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			tracer.dispose();
			assert.strictEqual(getPerfTracer(p), undefined);
		});

		test('can re-create after dispose', () => {
			const p = uniquePrefix();
			const t1 = createPerfTracer(p);
			t1.dispose();
			const t2 = createPerfTracer(p);
			assert.strictEqual(getPerfTracer(p), t2);
			t2.dispose();
		});
	});

	suite('start() and mark()', () => {
		test('emits marks with the correct prefix', () => {
			const p = uniquePrefix();
			const trace = createPerfTracer(p).start();
			trace.mark('willDo');
			trace.mark('didDo');

			assert.deepStrictEqual(markNames(p), [`${p}willDo`, `${p}didDo`]);
		});

		test('all marks from a trace share the same traceId', () => {
			const p = uniquePrefix();
			const trace = createPerfTracer(p).start();
			trace.mark('a');
			trace.mark('b');

			const marks = marksFor(p);
			assert.strictEqual(detailOf(marks[0]).traceId, detailOf(marks[1]).traceId);
		});

		test('initial detail is included in all marks', () => {
			const p = uniquePrefix();
			const trace = createPerfTracer(p).start({ sessionResource: 'sess1' });
			trace.mark('step');

			assert.strictEqual(detailOf(marksFor(p)[0]).sessionResource, 'sess1');
		});

		test('per-mark detail is merged with initial detail', () => {
			const p = uniquePrefix();
			const trace = createPerfTracer(p).start({ session: 'A' });
			trace.mark('step', { requestId: 'req1' });

			const detail = detailOf(marksFor(p)[0]);
			assert.strictEqual(detail.session, 'A');
			assert.strictEqual(detail.requestId, 'req1');
			assert.ok(detail.traceId !== undefined);
		});

		test('each start() assigns a unique traceId', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const t1 = tracer.start();
			t1.mark('a');
			const t2 = tracer.start();
			t2.mark('b');

			const marks = marksFor(p);
			assert.notStrictEqual(detailOf(marks[0]).traceId, detailOf(marks[1]).traceId);
		});
	});

	suite('done() and cleanup', () => {
		test('done() then start() clears completed trace marks', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const t1 = tracer.start();
			t1.mark('old');
			t1.done();

			// Marks still present before next start()
			assert.strictEqual(marksFor(p).length, 1);

			const t2 = tracer.start();
			t2.mark('new');

			assert.deepStrictEqual(markNames(p), [`${p}new`]);
		});

		test('start() does not clear marks from in-flight (not done) traces', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const t1 = tracer.start();
			t1.mark('inflight');

			tracer.start().mark('new');

			assert.ok(markNames(p).includes(`${p}inflight`));
			assert.ok(markNames(p).includes(`${p}new`));
		});

		test('multiple done traces are all cleaned up on next start()', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const t1 = tracer.start();
			t1.mark('t1');
			t1.done();

			const t2 = tracer.start(); // clears t1
			t2.mark('t2');
			t2.done();

			tracer.start().mark('t3'); // clears t2

			assert.deepStrictEqual(markNames(p), [`${p}t3`]);
		});

		test('done() is idempotent', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const t = tracer.start();
			t.mark('step');
			t.done();
			t.done(); // second call should be harmless

			tracer.start();
			assert.strictEqual(marksFor(p).length, 0);
		});

		test('marks without detail are cleared as fallback', () => {
			const p = uniquePrefix();
			mark(`${p}noDetail`);

			const tracer = createPerfTracer(p);
			const t = tracer.start();
			t.mark('withDetail');
			t.done();

			tracer.start(); // clears done trace; noDetail also cleared (no traceId to filter against)

			assert.strictEqual(marksFor(p).filter(m => m.name === `${p}noDetail`).length, 0);
		});

		test('marks from other prefixes are never touched', () => {
			const p1 = uniquePrefix();
			const p2 = uniquePrefix();
			mark(`${p2}untouched`);

			const tracer = createPerfTracer(p1);
			const t = tracer.start();
			t.mark('step');
			t.done();
			tracer.start();

			assert.strictEqual(marksFor(p2).length, 1);
			clearMarks(p2);
		});

		test('different prefix tracers do not interfere with each other', () => {
			const pA = uniquePrefix();
			const pB = uniquePrefix();
			const tracerA = createPerfTracer(pA);
			const tracerB = createPerfTracer(pB);

			const tA = tracerA.start();
			tA.mark('step');
			tA.done();

			tracerB.start().mark('step');

			// Cleaning A should not affect B
			tracerA.start().mark('newStep');

			assert.deepStrictEqual(markNames(pA), [`${pA}newStep`]);
			assert.deepStrictEqual(markNames(pB), [`${pB}step`]);
		});
	});

	suite('registerCorrelation() and findTraceByCorrelation()', () => {
		test('findTraceByCorrelation() returns undefined when no trace is registered', () => {
			const p = uniquePrefix();
			assert.strictEqual(createPerfTracer(p).findTraceByCorrelation('requestId', 'nonexistent'), undefined);
		});

		test('registerCorrelation() makes trace findable', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');

			const found = tracer.findTraceByCorrelation('requestId', 'req1');
			assert.strictEqual(found, trace);
		});

		test('findTraceByCorrelation() returns undefined for wrong value', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');

			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req2'), undefined);
		});

		test('findTraceByCorrelation() returns undefined for wrong key', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');

			assert.strictEqual(tracer.findTraceByCorrelation('sessionId', 'req1'), undefined);
		});

		test('done() unregisters the trace from findTraceByCorrelation()', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');
			trace.done();

			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), undefined);
		});

		test('multiple registrations on the same trace', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('sessionResource', 'sess1');
			trace.registerCorrelation('requestId', 'req1');

			assert.strictEqual(tracer.findTraceByCorrelation('sessionResource', 'sess1'), trace);
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), trace);
		});

		test('done() unregisters all registrations', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('sessionResource', 'sess1');
			trace.registerCorrelation('requestId', 'req1');
			trace.done();

			assert.strictEqual(tracer.findTraceByCorrelation('sessionResource', 'sess1'), undefined);
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), undefined);
		});

		test('concurrent traces can be found independently', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const t1 = tracer.start();
			t1.registerCorrelation('requestId', 'req1');

			const t2 = tracer.start();
			t2.registerCorrelation('requestId', 'req2');

			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), t1);
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req2'), t2);
		});

		test('downstream code can emit marks to a joined trace', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			// Owner creates and registers
			const trace = tracer.start({ sessionResource: 'sess1' });
			trace.mark('willSendRequest');
			trace.registerCorrelation('requestId', 'req1');

			// Downstream joins and emits
			const joined = tracer.findTraceByCorrelation('requestId', 'req1');
			joined?.mark('willInvokeAgent');
			joined?.mark('didInvokeAgent');

			// All marks should share the same traceId
			const marks = marksFor(p);
			assert.strictEqual(marks.length, 3);
			const traceIds = new Set(marks.map(m => detailOf(m).traceId));
			assert.strictEqual(traceIds.size, 1);

			// All marks have the owner's initial detail
			for (const m of marks) {
				assert.strictEqual(detailOf(m).sessionResource, 'sess1');
			}
		});

		test('multiple tool calls within one request all use the same trace', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');
			trace.mark('willSendRequest');

			// Simulate two tool invocations — both find the same trace
			const toolTrace1 = tracer.findTraceByCorrelation('requestId', 'req1');
			toolTrace1?.mark('willInvokeTool');
			toolTrace1?.mark('didInvokeTool');

			const toolTrace2 = tracer.findTraceByCorrelation('requestId', 'req1');
			toolTrace2?.mark('willInvokeTool');
			toolTrace2?.mark('didInvokeTool');

			trace.mark('didCompleteRequest');
			trace.done();

			// All 6 marks should exist with the same traceId
			const marks = marksFor(p);
			assert.strictEqual(marks.length, 6);
			const traceIds = new Set(marks.map(m => detailOf(m).traceId));
			assert.strictEqual(traceIds.size, 1);

			// After done + next start, all are cleaned
			tracer.start();
			assert.strictEqual(marksFor(p).length, 0);
		});

		test('findTraceByCorrelation() on a different prefix returns undefined', () => {
			const p1 = uniquePrefix();
			const p2 = uniquePrefix();

			const trace = createPerfTracer(p1).start();
			trace.registerCorrelation('requestId', 'req1');

			assert.strictEqual(createPerfTracer(p2).findTraceByCorrelation('requestId', 'req1'), undefined);
		});
	});

	suite('real-world chat scenario', () => {
		test('full request lifecycle: owner + agent + tool + instructions', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			// 1. ChatService starts a trace (owner)
			const trace = tracer.start({ sessionResource: 'sess1' });
			trace.mark('willSendRequest');
			trace.mark('willSendRequestAsync');

			// 2. Request model is created — register requestId
			trace.registerCorrelation('requestId', 'req-abc');

			// 3. ComputeAutomaticInstructions joins via sessionResource
			trace.registerCorrelation('sessionResource', 'sess1');
			const instrTrace = tracer.findTraceByCorrelation('sessionResource', 'sess1');
			instrTrace?.mark('willCollectInstructions');
			instrTrace?.mark('didCollectInstructions');

			// 4. ChatAgentService joins via requestId
			const agentTrace = tracer.findTraceByCorrelation('requestId', 'req-abc');
			agentTrace?.mark('willInvokeAgent');

			// 5. Multiple tool calls join via requestId
			for (let i = 0; i < 3; i++) {
				const toolTrace = tracer.findTraceByCorrelation('requestId', 'req-abc');
				toolTrace?.mark('willInvokeTool');
				toolTrace?.mark('didInvokeTool');
			}

			agentTrace?.mark('didInvokeAgent');

			// 6. Request completes
			trace.mark('didCompleteRequest');
			trace.done();

			// Verify: all marks share the same traceId
			const marks = marksFor(p);
			assert.strictEqual(marks.length, 13);
			const traceIds = new Set(marks.map(m => detailOf(m).traceId));
			assert.strictEqual(traceIds.size, 1);

			// Verify: all marks have sessionResource from initial detail
			for (const m of marks) {
				assert.strictEqual(detailOf(m).sessionResource, 'sess1');
			}

			// 7. Next request cleans up previous
			tracer.start();
			assert.strictEqual(marksFor(p).length, 0);
		});

		test('parallel requests in same session maintain separate traces', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);

			const trace1 = tracer.start();
			trace1.registerCorrelation('requestId', 'req1');
			trace1.mark('trace1/willSendRequest');

			const trace2 = tracer.start();
			trace2.registerCorrelation('requestId', 'req2');
			trace2.mark('trace2/willSendRequest');

			// Both traces are independently findable
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), trace1);
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req2'), trace2);

			// Downstream emits to correct traces
			tracer.findTraceByCorrelation('requestId', 'req1')?.mark('trace1/willInvokeAgent');
			tracer.findTraceByCorrelation('requestId', 'req2')?.mark('trace2/willInvokeAgent');

			// trace1 completes
			trace1.mark('trace1/didCompleteRequest');
			trace1.done();

			// trace1 is no longer findable, trace2 still is
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), undefined);
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req2'), trace2);

			// Next start() clears trace1's marks but not trace2's
			tracer.start();

			const remaining = marksFor(p);
			// trace2's marks should survive
			assert.ok(remaining.length >= 2);
			const remainingNames = markNames(p);
			assert.ok(remainingNames.some(n => n.includes('trace2/')));
			// trace1's marks should be gone
			assert.ok(!remainingNames.some(n => n.includes('trace1/')));
		});
	});

	suite('dispose()', () => {
		test('dispose() clears all marks with the prefix', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.mark('a');
			trace.mark('b');

			tracer.dispose();
			assert.strictEqual(marksFor(p).length, 0);
		});

		test('dispose() prevents further start() calls', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			tracer.dispose();

			assert.throws(() => tracer.start());
		});

		test('findTraceByCorrelation() returns undefined after dispose', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');

			tracer.dispose();
			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), undefined);
		});

		test('PerfTrace.dispose() is equivalent to done()', () => {
			const p = uniquePrefix();
			const tracer = createPerfTracer(p);
			const trace = tracer.start();
			trace.registerCorrelation('requestId', 'req1');
			trace.dispose();

			assert.strictEqual(tracer.findTraceByCorrelation('requestId', 'req1'), undefined);
		});
	});
});

suite('clearMarks', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let prefix: string;

	setup(() => {
		prefix = uniquePrefix();
	});

	test('clears all marks with matching prefix when no details filter', () => {
		mark(`${prefix}a`);
		mark(`${prefix}b`);
		mark(`${prefix}c`);

		clearMarks(prefix);
		assert.strictEqual(marksFor(prefix).length, 0);
	});

	test('clears only marks matching details filter', () => {
		mark(`${prefix}a`, { detail: { id: '1' } });
		mark(`${prefix}b`, { detail: { id: '2' } });
		mark(`${prefix}c`, { detail: { id: '3' } });

		clearMarks(prefix, [{ id: '1' }, { id: '3' }]);

		const remaining = marksFor(prefix);
		assert.strictEqual(remaining.length, 1);
		assert.strictEqual(detailOf(remaining[0]).id, '2');
	});

	test('clears marks with no detail when details filter is provided (fallback)', () => {
		mark(`${prefix}noDetail`);
		mark(`${prefix}withDetail`, { detail: { id: '1' } });

		clearMarks(prefix, [{ id: '1' }]);

		assert.strictEqual(marksFor(prefix).length, 0);
	});

	test('does not clear marks whose detail does not match any filter', () => {
		mark(`${prefix}a`, { detail: { id: '1' } });
		mark(`${prefix}b`, { detail: { id: '2' } });

		clearMarks(prefix, [{ id: '999' }]);

		assert.strictEqual(marksFor(prefix).length, 2);
	});

	test('detail filter matches on multiple keys', () => {
		mark(`${prefix}a`, { detail: { type: 'request', id: '1' } });
		mark(`${prefix}b`, { detail: { type: 'request', id: '2' } });
		mark(`${prefix}c`, { detail: { type: 'response', id: '1' } });

		clearMarks(prefix, [{ type: 'request', id: '1' }]);

		const remaining = marksFor(prefix);
		assert.strictEqual(remaining.length, 2);
		const names = remaining.map(m => m.name);
		assert.ok(names.includes(`${prefix}b`));
		assert.ok(names.includes(`${prefix}c`));
	});
});
