/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptSnapshotNode } from '../../components/components';
import { SnapshotWalker } from '../../components/walker';
import * as assert from 'assert';

suite('Snapshot Walker', function () {
	test('walks snapshot recursively', function () {
		const snapshot = createTestSnapshot(1, 1);
		const walker = new SnapshotWalker(snapshot);
		const visitedValues: string[] = [];

		walker.walkSnapshot((node, parent, context) => {
			visitedValues.push(node.path ?? 'undefined');
			return true;
		});

		assert.deepStrictEqual(visitedValues, ['0', '0.0']);
	});

	test('stops walking after visitor returns false', function () {
		const snapshot = createTestSnapshot(2, 2);
		const walker = new SnapshotWalker(snapshot);
		const visitedPaths: string[] = [];

		walker.walkSnapshot((node, parent, context) => {
			visitedPaths.push(node.path);
			return false;
		});

		assert.deepStrictEqual(visitedPaths, ['0']);
	});

	test('walks deeper nested snapshot', function () {
		const snapshot = createTestSnapshot(3, 2);
		const walker = new SnapshotWalker(snapshot);
		const paths: string[] = [];

		walker.walkSnapshot((node, parent, context) => {
			paths.push(node.path);
			return true;
		});

		assert.deepStrictEqual(paths, [
			'0',
			'0.0',
			'0.0.0',
			'0.0.0.0',
			'0.0.0.1',
			'0.0.1',
			'0.0.1.0',
			'0.0.1.1',
			'0.1',
			'0.1.0',
			'0.1.0.0',
			'0.1.0.1',
			'0.1.1',
			'0.1.1.0',
			'0.1.1.1',
		]);
	});

	test('carries weight relative to parent weight', function () {
		const snapshot: PromptSnapshotNode = {
			name: 'root',
			path: '0',
			value: '0',
			props: { weight: 0.5 },
			children: [
				{
					name: 'child',
					path: '0.0',
					value: '1',
					props: { weight: 0.5 },
					statistics: {},
				},
			],
			statistics: {},
		};

		const walker = new SnapshotWalker(snapshot);
		const weights: number[] = [];

		walker.walkSnapshot((node, parent, context) => {
			weights.push(context.weight as number);
			return true;
		});

		assert.deepStrictEqual(weights, [0.5, 0.25]); // root: 0.5, child: 0.5 * 0.5
	});

	test('propagates chunks to children', function () {
		const snapshot: PromptSnapshotNode = {
			name: 'Chunk',
			path: '0',
			value: 'chunk1',
			statistics: {},
			children: [
				{
					name: 'child',
					path: '0.0',
					value: 'child1',
					statistics: {},
				},
			],
		};

		const walker = new SnapshotWalker(snapshot);
		const chunks: Set<string>[] = [];

		walker.walkSnapshot((node, parent, context) => {
			chunks.push(context.chunks as Set<string>);
			return true;
		});

		assert.deepStrictEqual(chunks.length, 2);

		const chunk = new Set<string>(['0']);
		assert.deepStrictEqual(chunks[0], chunk);
		assert.deepStrictEqual(chunks[1], chunk);
	});

	test('propagates nested chunks', function () {
		const snapshot: PromptSnapshotNode = {
			name: 'Chunk',
			path: '0',
			value: 'chunk1',
			statistics: {},
			children: [
				{
					name: 'child',
					path: '0.0',
					value: 'child1',
					statistics: {},
				},
				{
					name: 'Chunk',
					path: '0.1',
					value: 'chunk2',
					statistics: {},
					children: [
						{
							name: 'child',
							path: '0.1.0',
							value: 'child2',
							statistics: {},
						},
					],
				},
			],
		};

		const walker = new SnapshotWalker(snapshot);
		const chunks: Set<string>[] = [];

		walker.walkSnapshot((node, parent, context) => {
			chunks.push(context.chunks as Set<string>);
			return true;
		});

		assert.deepStrictEqual(chunks.length, 4);

		const chunk = new Set<string>(['0']);
		const nestedChunk = new Set<string>(['0', '0.1']);
		assert.deepStrictEqual(chunks[0], chunk);
		assert.deepStrictEqual(chunks[1], chunk);
		assert.deepStrictEqual(chunks[2], nestedChunk);
		assert.deepStrictEqual(chunks[3], nestedChunk);
	});

	test('propagates source to children', function () {
		const snapshot: PromptSnapshotNode = {
			name: 'root',
			path: '0',
			value: 'root',
			props: { source: 'source1' },
			statistics: {},
			children: [
				{
					name: 'child',
					path: '0.0',
					value: 'child',
					statistics: {},
				},
			],
		};

		const walker = new SnapshotWalker(snapshot);
		const sources: unknown[] = [];

		walker.walkSnapshot((node, parent, context) => {
			sources.push(context.source);
			return true;
		});

		assert.deepStrictEqual(sources, ['source1', 'source1']);
	});

	function createTestSnapshot(
		depth: number,
		childrenCount: number = 3,
		currentPath: string = ''
	): PromptSnapshotNode {
		if (depth <= 0) {
			return {
				name: 'leaf',
				path: currentPath || '0',
				value: currentPath || '0',
				statistics: {},
			};
		}

		const children: PromptSnapshotNode[] = [];
		const nodeIndex = currentPath || '0';

		// Create configurable number of children at each level
		for (let i = 0; i < childrenCount; i++) {
			const childPath = `${nodeIndex}.${i}`;
			children.push(createTestSnapshot(depth - 1, childrenCount, childPath));
		}

		return {
			name: `node-${nodeIndex}`,
			path: nodeIndex,
			value: nodeIndex,
			children,
			statistics: {},
		};
	}
});
