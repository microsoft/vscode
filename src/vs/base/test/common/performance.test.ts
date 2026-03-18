/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { clearMarks, getMarks, mark, PerformanceMark, PerfTracer } from '../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

function getChatMarks(prefix: string): PerformanceMark[] {
	return getMarks().filter(m => m.name.startsWith(prefix));
}

suite('PerfTracer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const prefix = 'test/perfTracer/';

	teardown(() => {
		// Clean up any marks left by tests
		clearMarks(prefix);
	});

	test('start() creates a trace that emits marks with prefix and traceId', () => {
		const tracer = new PerfTracer(prefix);
		const trace = tracer.start();
		trace.mark('willDo');
		trace.mark('didDo');

		const marks = getChatMarks(prefix);
		assert.strictEqual(marks.length, 2);
		assert.strictEqual(marks[0].name, `${prefix}willDo`);
		assert.strictEqual(marks[1].name, `${prefix}didDo`);

		// Both marks should have the same traceId
		const traceId0 = (marks[0].detail as Record<string, unknown>).traceId;
		const traceId1 = (marks[1].detail as Record<string, unknown>).traceId;
		assert.ok(traceId0 !== undefined);
		assert.strictEqual(traceId0, traceId1);
	});

	test('start() passes initial detail to all marks', () => {
		const tracer = new PerfTracer(prefix);
		const trace = tracer.start({ sessionResource: 'mySession' });
		trace.mark('willDo');

		const marks = getChatMarks(prefix);
		assert.strictEqual(marks.length, 1);
		const detail = marks[0].detail as Record<string, unknown>;
		assert.strictEqual(detail.sessionResource, 'mySession');
		assert.ok(detail.traceId !== undefined);
	});

	test('mark() merges per-mark detail with initial detail', () => {
		const tracer = new PerfTracer(prefix);
		const trace = tracer.start({ session: 'A' });
		trace.mark('step', { requestId: 'req1' });

		const marks = getChatMarks(prefix);
		assert.strictEqual(marks.length, 1);
		const detail = marks[0].detail as Record<string, unknown>;
		assert.strictEqual(detail.session, 'A');
		assert.strictEqual(detail.requestId, 'req1');
		assert.ok(detail.traceId !== undefined);
	});

	test('done() then start() clears completed trace marks', () => {
		const tracer = new PerfTracer(prefix);
		const trace1 = tracer.start();
		trace1.mark('step1');
		trace1.mark('step2');
		trace1.done();

		// Marks still present before next start()
		assert.strictEqual(getChatMarks(prefix).length, 2);

		// Starting a new trace clears the done trace marks
		const trace2 = tracer.start();
		trace2.mark('step3');

		const marks = getChatMarks(prefix);
		assert.strictEqual(marks.length, 1);
		assert.strictEqual(marks[0].name, `${prefix}step3`);
	});

	test('start() does not clear marks from in-flight traces', () => {
		const tracer = new PerfTracer(prefix);

		// Start trace 1 (in-flight, not done)
		const trace1 = tracer.start();
		trace1.mark('fromTrace1');

		// Start trace 2 — trace 1 is not done, so its marks should survive
		const trace2 = tracer.start();
		trace2.mark('fromTrace2');

		const marks = getChatMarks(prefix);
		const names = marks.map(m => m.name);
		assert.ok(names.includes(`${prefix}fromTrace1`));
		assert.ok(names.includes(`${prefix}fromTrace2`));
	});

	test('each start() assigns a unique traceId', () => {
		const tracer = new PerfTracer(prefix);
		const trace1 = tracer.start();
		trace1.mark('a');
		trace1.done();

		tracer.start(); // clears trace1
		const trace3 = tracer.start();
		trace3.mark('b');

		const marks = getChatMarks(prefix);
		assert.strictEqual(marks.length, 1);
		const traceId = (marks[0].detail as Record<string, unknown>).traceId;
		assert.strictEqual(traceId, '2'); // 0, 1, 2
	});

	test('multiple done traces are all cleaned up on next start()', () => {
		const tracer = new PerfTracer(prefix);

		const trace1 = tracer.start();
		trace1.mark('t1');
		trace1.done();

		const trace2 = tracer.start(); // clears trace1
		trace2.mark('t2');
		trace2.done();

		const trace3 = tracer.start(); // clears trace2 (trace1 already cleared)
		trace3.mark('t3');

		const marks = getChatMarks(prefix);
		assert.strictEqual(marks.length, 1);
		assert.strictEqual(marks[0].name, `${prefix}t3`);
	});

	test('different PerfTracer instances do not interfere', () => {
		const tracerA = new PerfTracer(`${prefix}A/`);
		const tracerB = new PerfTracer(`${prefix}B/`);

		const traceA = tracerA.start();
		traceA.mark('step');
		traceA.done();

		const traceB = tracerB.start();
		traceB.mark('step');

		// Starting new trace on A should not clear B's marks
		tracerA.start().mark('newStep');

		const marksA = getChatMarks(`${prefix}A/`);
		const marksB = getChatMarks(`${prefix}B/`);

		assert.strictEqual(marksA.length, 1);
		assert.strictEqual(marksA[0].name, `${prefix}A/newStep`);
		assert.strictEqual(marksB.length, 1);
		assert.strictEqual(marksB[0].name, `${prefix}B/step`);
	});

	test('done() is idempotent', () => {
		const tracer = new PerfTracer(prefix);
		const trace = tracer.start();
		trace.mark('step');
		trace.done();
		trace.done(); // second call should be harmless

		tracer.start(); // should clear once
		assert.strictEqual(getChatMarks(prefix).length, 0);
	});

	test('marks without detail are cleared when prefix matches', () => {
		// Manually create a mark without detail under the prefix
		mark(`${prefix}noDetail`);

		const tracer = new PerfTracer(prefix);
		const trace = tracer.start();
		trace.mark('withDetail');
		trace.done();

		tracer.start(); // clears done trace — noDetail mark should also be cleared since it has no traceId

		const marks = getChatMarks(prefix);
		// Only the noDetail mark should remain (it has no traceId to match against)
		// Actually, _detailMatchesAny returns true for null/undefined detail, so it IS cleared
		const noDetailMarks = marks.filter(m => m.name === `${prefix}noDetail`);
		assert.strictEqual(noDetailMarks.length, 0);
	});

	test('marks from other prefixes are never touched', () => {
		const otherPrefix = 'test/other/';
		mark(`${otherPrefix}untouched`);

		const tracer = new PerfTracer(prefix);
		const trace = tracer.start();
		trace.mark('step');
		trace.done();

		tracer.start(); // clears prefix marks

		const otherMarks = getMarks().filter(m => m.name === `${otherPrefix}untouched`);
		assert.strictEqual(otherMarks.length, 1);

		// Clean up
		clearMarks(otherPrefix);
	});
});

suite('clearMarks', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const prefix = 'test/clearMarks/';

	teardown(() => {
		clearMarks(prefix);
	});

	test('clears all marks with matching prefix when no details filter', () => {
		mark(`${prefix}a`);
		mark(`${prefix}b`);
		mark(`${prefix}c`);

		clearMarks(prefix);
		assert.strictEqual(getMarks().filter(m => m.name.startsWith(prefix)).length, 0);
	});

	test('clears only marks matching details filter', () => {
		mark(`${prefix}a`, { detail: { id: '1' } });
		mark(`${prefix}b`, { detail: { id: '2' } });
		mark(`${prefix}c`, { detail: { id: '3' } });

		clearMarks(prefix, [{ id: '1' }, { id: '3' }]);

		const remaining = getMarks().filter(m => m.name.startsWith(prefix));
		assert.strictEqual(remaining.length, 1);
		assert.strictEqual((remaining[0].detail as Record<string, unknown>).id, '2');
	});

	test('clears marks with no detail when details filter is provided', () => {
		mark(`${prefix}noDetail`);
		mark(`${prefix}withDetail`, { detail: { id: '1' } });

		clearMarks(prefix, [{ id: '1' }]);

		const remaining = getMarks().filter(m => m.name.startsWith(prefix));
		// noDetail should be cleared (fallback: no detail = always match)
		// withDetail with id=1 should be cleared
		assert.strictEqual(remaining.length, 0);
	});

	test('does not clear marks whose detail does not match any filter', () => {
		mark(`${prefix}a`, { detail: { id: '1' } });
		mark(`${prefix}b`, { detail: { id: '2' } });

		clearMarks(prefix, [{ id: '999' }]);

		const remaining = getMarks().filter(m => m.name.startsWith(prefix));
		assert.strictEqual(remaining.length, 2);
	});

	test('detail filter matches on multiple keys', () => {
		mark(`${prefix}a`, { detail: { type: 'request', id: '1' } });
		mark(`${prefix}b`, { detail: { type: 'request', id: '2' } });
		mark(`${prefix}c`, { detail: { type: 'response', id: '1' } });

		clearMarks(prefix, [{ type: 'request', id: '1' }]);

		const remaining = getMarks().filter(m => m.name.startsWith(prefix));
		assert.strictEqual(remaining.length, 2);
		const names = remaining.map(m => m.name);
		assert.ok(names.includes(`${prefix}b`));
		assert.ok(names.includes(`${prefix}c`));
	});
});
