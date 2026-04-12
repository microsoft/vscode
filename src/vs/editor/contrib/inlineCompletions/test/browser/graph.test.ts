/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DirectedGraph } from '../../browser/model/graph.js';

suite('DirectedGraph', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('from - creates empty graph', () => {
		const graph = DirectedGraph.from<string>([], () => []);
		assert.deepStrictEqual(graph.getOutgoing('a'), []);
	});

	test('from - creates graph with single node', () => {
		const graph = DirectedGraph.from(['a'], () => []);
		assert.deepStrictEqual(graph.getOutgoing('a'), []);
	});

	test('from - creates graph with nodes and edges', () => {
		const nodes = ['a', 'b', 'c'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['b', 'c'];
				case 'b':
					return ['c'];
				case 'c':
					return [];
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);

		assert.deepStrictEqual([...graph.getOutgoing('a')].sort(), ['b', 'c']);
		assert.deepStrictEqual(graph.getOutgoing('b'), ['c']);
		assert.deepStrictEqual(graph.getOutgoing('c'), []);
	});

	test('from - handles duplicate edges', () => {
		const nodes = ['a', 'b'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['b', 'b']; // Duplicate edge
				case 'b':
					return [];
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);

		assert.deepStrictEqual(graph.getOutgoing('a'), ['b']);
		assert.deepStrictEqual(graph.getOutgoing('b'), []);
	});

	test('removeCycles - no cycles', () => {
		const nodes = ['a', 'b', 'c'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['b'];
				case 'b':
					return ['c'];
				case 'c':
					return [];
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);
		const result = graph.removeCycles();

		assert.deepStrictEqual(result.foundCycles, []);
		assert.deepStrictEqual(graph.getOutgoing('a'), ['b']);
		assert.deepStrictEqual(graph.getOutgoing('b'), ['c']);
		assert.deepStrictEqual(graph.getOutgoing('c'), []);
	});

	test('removeCycles - simple cycle', () => {
		const nodes = ['a', 'b'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['b'];
				case 'b':
					return ['a']; // Creates cycle
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);
		const result = graph.removeCycles();

		assert.strictEqual(result.foundCycles.length, 1);
		assert.ok(
			result.foundCycles.includes('a') || result.foundCycles.includes('b')
		);

		// After removing cycles, one of the edges should be removed
		const aOutgoing = graph.getOutgoing('a');
		const bOutgoing = graph.getOutgoing('b');
		assert.ok(
			(aOutgoing.length === 0 && bOutgoing.length === 1) ||
			(aOutgoing.length === 1 && bOutgoing.length === 0)
		);
	});

	test('removeCycles - self loop', () => {
		const nodes = ['a'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['a']; // Self loop
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);
		const result = graph.removeCycles();

		assert.deepStrictEqual(result.foundCycles, ['a']);
		assert.deepStrictEqual(graph.getOutgoing('a'), []);
	});

	test('removeCycles - complex cycle', () => {
		const nodes = ['a', 'b', 'c', 'd'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['b'];
				case 'b':
					return ['c'];
				case 'c':
					return ['d', 'a']; // Creates cycle back to 'a'
				case 'd':
					return [];
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);
		const result = graph.removeCycles();

		assert.ok(result.foundCycles.length >= 1);

		// After removing cycles, there should be no path back to 'a' from 'c'
		const cOutgoing = graph.getOutgoing('c');
		assert.ok(!cOutgoing.includes('a'));
	});

	test('removeCycles - multiple disconnected cycles', () => {
		const nodes = ['a', 'b', 'c', 'd'];
		const getOutgoing = (node: string) => {
			switch (node) {
				case 'a':
					return ['b'];
				case 'b':
					return ['a']; // Cycle 1: a <-> b
				case 'c':
					return ['d'];
				case 'd':
					return ['c']; // Cycle 2: c <-> d
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);
		const result = graph.removeCycles();

		assert.ok(result.foundCycles.length >= 2);

		// After removing cycles, each pair should have only one direction
		const aOutgoing = graph.getOutgoing('a');
		const bOutgoing = graph.getOutgoing('b');
		const cOutgoing = graph.getOutgoing('c');
		const dOutgoing = graph.getOutgoing('d');

		assert.ok(
			(aOutgoing.length === 0 && bOutgoing.length === 1) ||
			(aOutgoing.length === 1 && bOutgoing.length === 0)
		);
		assert.ok(
			(cOutgoing.length === 0 && dOutgoing.length === 1) ||
			(cOutgoing.length === 1 && dOutgoing.length === 0)
		);
	});

	test('getOutgoing - non-existent node', () => {
		const graph = DirectedGraph.from(['a'], () => []);
		assert.deepStrictEqual(graph.getOutgoing('b'), []);
	});

	test('with number nodes', () => {
		const nodes = [1, 2, 3];
		const getOutgoing = (node: number) => {
			switch (node) {
				case 1:
					return [2, 3];
				case 2:
					return [3];
				case 3:
					return [];
				default:
					return [];
			}
		};

		const graph = DirectedGraph.from(nodes, getOutgoing);

		assert.deepStrictEqual([...graph.getOutgoing(1)].sort(), [2, 3]);
		assert.deepStrictEqual(graph.getOutgoing(2), [3]);
		assert.deepStrictEqual(graph.getOutgoing(3), []);
	});
});
