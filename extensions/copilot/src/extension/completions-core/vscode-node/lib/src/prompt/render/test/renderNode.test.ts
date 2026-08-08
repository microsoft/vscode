/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createRenderNode, rectifiedValue, rectifyWeights, render } from '../renderNode';
import { DEFAULT_ELISION_MARKER } from '../utils';

suite('RenderNode', function () {
	test('constructs node without children', function () {
		const node = createRenderNode({ text: ['a'], cost: 0, weight: 5 });
		assert.deepEqual(node.text, ['a']);
		assert.deepEqual(node.children, []);
		assert.deepStrictEqual(node.cost, 0);
		assert.deepStrictEqual(node.weight, 5);
		assert.deepStrictEqual(node.elisionMarker, DEFAULT_ELISION_MARKER);
	});

	test('constructs node with children', function () {
		const child = createRenderNode({ text: ['c'], cost: 1, weight: 3 });
		const node = createRenderNode({ text: ['a', 'b'], children: [child], cost: 2, weight: 5 });
		assert.deepEqual(node.children.length, 1);
	});

	test('should check that text is children + 1', function () {
		assert.throws(() => createRenderNode({ text: ['a', 'b'], children: [], cost: 2, weight: 5 }));
	});

	test('renders all nodes without budget', function () {
		const child = createRenderNode({ text: ['b'], cost: 1, weight: 2 });
		const node = createRenderNode({ text: ['a', 'c'], children: [child], cost: 2, weight: 5 });
		const result = render(node);
		assert.deepStrictEqual(result.text, 'abc');
		assert.deepStrictEqual(result.cost, 3);
	});

	test('renders with budget, elides child if over budget', function () {
		const child = createRenderNode({ text: ['bb'], cost: 2, weight: 2 });
		const node = createRenderNode({ text: ['aa', 'cc'], children: [child], cost: 4, weight: 5 });
		// Budget only enough for parent
		const result = render(node, { budget: 5 });
		assert.deepStrictEqual(result.text, `aa${child.elisionMarker}cc`);
		assert.deepStrictEqual(result.cost, 4);
	});

	test('renders with exclude', function () {
		const child = createRenderNode({ text: ['bb'], cost: 2, weight: 2 });
		const node = createRenderNode({ text: ['aa', 'cc'], children: [child], cost: 4, weight: 5 });
		assert.deepStrictEqual(render(node, { mask: node.id }).text, node.elisionMarker);
		assert.deepStrictEqual(render(node, { mask: child.id }).text, `aa${child.elisionMarker}cc`);
	});

	test('canMerge merges adjacent elided children into a single elision marker', function () {
		// Create child nodes, some of which will be excluded (elided)
		const child1 = createRenderNode({ text: ['A'], cost: 1, weight: 1 });
		const child2 = createRenderNode({ text: ['B'], cost: 1, weight: 1 });
		const child2Merge = createRenderNode({ text: ['B'], cost: 1, weight: 1, canMerge: true });
		const child3 = createRenderNode({ text: ['C'], cost: 1, weight: 1 });

		const nodeWithoutMerge = createRenderNode({
			text: ['(', ',', ',', ')'],
			children: [child1, child2, child3],
			cost: 1,
			weight: 1,
		});
		const nodeWithMerge = createRenderNode({
			text: ['(', ',', ',', ')'],
			children: [child1, child2Merge, child3],
			cost: 1,
			weight: 1,
		});

		assert.deepStrictEqual(render(nodeWithoutMerge, { mask: [child1.id, child2.id] }).text, '([...],[...],C)');
		assert.deepStrictEqual(render(nodeWithMerge, { mask: [child1.id, child2Merge.id] }).text, '([...],C)');
	});

	test('renders with multiple children, one over budget', function () {
		const child1 = createRenderNode({ text: ['bb'], cost: 2, weight: 3 });
		const child2 = createRenderNode({ text: ['dd'], cost: 2, weight: 2 });
		const node = createRenderNode({ text: ['aa', 'cc', 'ee'], children: [child1, child2], cost: 6, weight: 6 });
		// Budget only enough for parent and one child
		assert.deepStrictEqual(render(node, { budget: 8 }).text, `aabbcc${child2.elisionMarker}ee`);
	});

	test('renders with custom costFunction', function () {
		// Use a custom elision marker since it's now counted in the cost
		const child1 = createRenderNode({ text: ['bb'], cost: 2, weight: 2, elisionMarker: '.' });
		const child2 = createRenderNode({ text: ['dd'], cost: 2, weight: 3, elisionMarker: '.' });
		const node = createRenderNode({
			text: ['aa', 'cc', 'ee'],
			children: [child1, child2],
			cost: 6,
			weight: 6,
			elisionMarker: '.',
		});
		// The second child doesn't fit anymore, since now the cost is based on length
		// and so the markers also have a cost.
		assert.deepStrictEqual(render(node, { budget: 8, costFunction: t => t.length }).text, 'aa.cc.ee');
	});

	test('infeasible budget returns elision marker', function () {
		const node = createRenderNode({ text: ['aa'], cost: 2, weight: 5 });
		const result = render(node, { budget: 1 });
		assert.deepStrictEqual(result.text, node.elisionMarker);
		assert.deepStrictEqual(result.cost, 5);
	});

	test('redistributes weights (default weighter)', function () {
		const child1 = createRenderNode({ text: ['d'], cost: 1, weight: 5 });
		const child2 = createRenderNode({ text: ['e'], cost: 1, weight: 5 });
		const root = createRenderNode({ text: ['a', 'b', 'c'], children: [child1, child2], cost: 3, weight: 2 });

		rectifyWeights(root);
		assert.ok(root.children.every(child => rectifiedValue(child) <= rectifiedValue(root)));
	});

	test('requireRenderedChild after redestributing weight', function () {
		const child1 = createRenderNode({ text: ['d'], cost: 1, weight: 5 });
		const child2 = createRenderNode({ text: ['e'], cost: 1, weight: 5 });
		const root = createRenderNode({ text: ['a', 'b', 'c'], children: [child1, child2], cost: 3, weight: 2 });

		assert.deepStrictEqual(render(root, { budget: 3 }).text, 'a[...]b[...]c');
		rectifyWeights(root);
		assert.deepStrictEqual(render(root, { budget: 3 }).text, '[...]');
	});
});
