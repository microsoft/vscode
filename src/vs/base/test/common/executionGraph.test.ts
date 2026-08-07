/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import {
	ExecutionEvent,
	ExecutionHistory,
	ExecutionRoot,
	renderLaneGraph,
	renderSwimlanes,
} from './executionGraph.js';

/**
 * Fluent builder for hand-crafting `ExecutionHistory` literals in tests.
 * Keeps call sites short: `h.root('A')`, `h.fire(0, 'setTimeout', rootA)`,
 * `h.fire(16, 'rAF', parentEvent)`.
 */
class HistoryBuilder {
	readonly roots: ExecutionRoot[] = [];
	readonly events: ExecutionEvent[] = [];

	root(label: string): ExecutionRoot {
		const r: ExecutionRoot = { label };
		this.roots.push(r);
		return r;
	}

	fire(time: number, label: string, parent: ExecutionRoot | ExecutionEvent): ExecutionEvent {
		const isRoot = this.roots.includes(parent as ExecutionRoot);
		const root = isRoot ? (parent as ExecutionRoot) : (parent as ExecutionEvent).root;
		const parentEvent = isRoot ? undefined : (parent as ExecutionEvent);
		const event: ExecutionEvent = { time, label, root, parent: parentEvent };
		this.events.push(event);
		return event;
	}

	build(): ExecutionHistory {
		return { roots: this.roots, events: this.events };
	}
}

suite('executionGraph', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renderSwimlanes: empty history', () => {
		assert.strictEqual(renderSwimlanes({ roots: [], events: [] }), '(empty history)');
	});

	test('renderSwimlanes: single root, linear chain', () => {
		const h = new HistoryBuilder();
		const A = h.root('A');
		const t0 = h.fire(0, 'setTimeout', A);
		const t1 = h.fire(16, 'rAF', t0);
		h.fire(32, 'rAF', t1);

		// Slot-based indentation: all events are last-children, so all
		// share slot 0. No visual indentation for the tree structure.
		assert.strictEqual(renderSwimlanes(h.build()), [
			'            A',
			' +0ms ├─ setTimeout',
			'+16ms    └─ rAF',
			'+32ms       └─ rAF',
		].join('\n'));
	});

	test('renderSwimlanes: forest with forks across two roots', () => {
		const h = new HistoryBuilder();
		const A = h.root('A');
		const B = h.root('B');

		// A: setTimeout(+0) spawns rAF(+16) and setTimeout(+50)
		//    rAF(+16) -> rAF(+32)
		const aT0 = h.fire(0, 'setTimeout', A);
		const bT10 = h.fire(10, 'setTimeout', B);
		const aRaf16 = h.fire(16, 'requestAnimationFrame', aT0);
		const bRaf26 = h.fire(26, 'requestAnimationFrame', bT10);
		h.fire(32, 'requestAnimationFrame', aRaf16);
		h.fire(46, 'setTimeout', bRaf26);
		h.fire(50, 'setTimeout', aT0);

		const out = renderSwimlanes(h.build());
		// Slot-based indentation: last-children share their parent's slot.
		// B lane: bT10 at slot 0, bRaf26 (last-child) at slot 0, bT46 (last-child) at slot 0.
		assert.strictEqual(out, [
			'                     A                             B',
			' +0ms ├─ setTimeout',
			'+10ms │  |                            ├─ setTimeout',
			'+16ms │  ├─ requestAnimationFrame     │',
			'+26ms │  │                               └─ requestAnimationFrame',
			'+32ms │     └─ requestAnimationFrame     │',
			'+46ms │                                     └─ setTimeout',
			'+50ms    └─ setTimeout',
		].join('\n'));
	});

	test('renderSwimlanes: degenerate linked-list tree (5 nodes)', () => {
		const h = new HistoryBuilder();
		const A = h.root('A');
		const e1 = h.fire(0, 'n1', A);
		const e2 = h.fire(10, 'n2', e1);
		const e3 = h.fire(20, 'n3', e2);
		h.fire(30, 'n4', e3);

		assert.strictEqual(renderSwimlanes(h.build()), [
			'             A',
			' +0ms ├─ n1',
			'+10ms    └─ n2',
			'+20ms       └─ n3',
			'+30ms          └─ n4',
		].join('\n'));
	});

	test('renderLaneGraph: degenerate linked-list tree (5 nodes)', () => {
		const h = new HistoryBuilder();
		const A = h.root('A');
		const e1 = h.fire(0, 'n1', A);
		const e2 = h.fire(10, 'n2', e1);
		const e3 = h.fire(20, 'n3', e2);
		h.fire(30, 'n4', e3);

		assert.strictEqual(renderLaneGraph(h.build()), [
			'+A',
			'└─╷─    [   +0ms] n1',
			'  └─╷─  [  +10ms] n2',
			'    └─╷─[  +20ms] n3',
			'      └─[  +30ms] n4',
		].join('\n'));
	});

	test('renderLaneGraph: forest with forks across two roots', () => {
		const h = new HistoryBuilder();
		const A = h.root('A');
		const B = h.root('B');

		const aT0 = h.fire(0, 'setTimeout', A);
		const bT10 = h.fire(10, 'setTimeout', B);
		const aRaf16 = h.fire(16, 'requestAnimationFrame', aT0);
		const bRaf26 = h.fire(26, 'requestAnimationFrame', bT10);
		h.fire(32, 'requestAnimationFrame', aRaf16);
		h.fire(46, 'setTimeout', bRaf26);
		h.fire(50, 'setTimeout', aT0);

		assert.strictEqual(renderLaneGraph(h.build()), [
			'+A',
			'└─╷─        [   +0ms] setTimeout',
			'  │ +B',
			'  │ └─╷─    [  +10ms] setTimeout',
			'  ├───┼─╷─  [  +16ms] requestAnimationFrame',
			'  │   └─┼─╷─[  +26ms] requestAnimationFrame',
			'  │     └─┼─[  +32ms] requestAnimationFrame',
			'  │       └─[  +46ms] setTimeout',
			'  └─────────[  +50ms] setTimeout',
		].join('\n'));
	});
});
