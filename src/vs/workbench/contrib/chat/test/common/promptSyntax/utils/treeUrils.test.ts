/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomInt } from '../../../../../../../base/common/numbers.js';
import { curry, flatten, forEach, map } from '../../../../common/promptSyntax/utils/treeUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';

suite('tree utilities', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('• flatten', () => {
		const tree = {
			id: '1',
			children: [
				{
					id: '1.1',
				},
				{
					id: '1.2',
					children: [
						{
							id: '1.2.1',
							children: [
								{
									id: '1.2.1.1',
								},
								{
									id: '1.2.1.2',
								},
								{
									id: '1.2.1.3',
								}
							],
						},
						{
							id: '1.2.2',
						},
					]
				},
			],
		};

		assert.deepStrictEqual(flatten(tree), [
			tree,
			tree.children[0],
			tree.children[1],
			tree.children[1].children![0],
			tree.children[1].children![0].children![0],
			tree.children[1].children![0].children![1],
			tree.children[1].children![0].children![2],
			tree.children[1].children![1],
		]);

		assert.deepStrictEqual(flatten({}), [{}]);
	});

	suite('• forEach', () => {
		test('• iterates though all nodes', () => {
			const tree = {
				id: '1',
				children: [
					{
						id: '1.1',
					},
					{
						id: '1.2',
						children: [
							{
								id: '1.2.1',
								children: [
									{
										id: '1.2.1.1',
									},
									{
										id: '1.2.1.2',
									},
									{
										id: '1.2.1.3',
									}
								],
							},
							{
								id: '1.2.2',
							},
						]
					},
				],
			};

			const treeCopy = JSON.parse(JSON.stringify(tree));

			const seenIds: string[] = [];
			forEach((node) => {
				seenIds.push(node.id);
				return false;
			}, tree);

			assert.deepStrictEqual(seenIds, [
				'1',
				'1.1',
				'1.2',
				'1.2.1',
				'1.2.1.1',
				'1.2.1.2',
				'1.2.1.3',
				'1.2.2',
			]);

			assert.deepStrictEqual(
				treeCopy,
				tree,
				'forEach should not modify the tree',
			);
		});

		test('• can be stopped prematurely', () => {
			const tree = {
				id: '1',
				children: [
					{
						id: '1.1',
					},
					{
						id: '1.2',
						children: [
							{
								id: '1.2.1',
								children: [
									{
										id: '1.2.1.1',
									},
									{
										id: '1.2.1.2',
									},
									{
										id: '1.2.1.3',
										children: [
											{
												id: '1.2.1.3.1',
											},
										],
									}
								],
							},
							{
								id: '1.2.2',
							},
						]
					},
				],
			};

			const treeCopy = JSON.parse(JSON.stringify(tree));

			const seenIds: string[] = [];
			forEach((node) => {
				seenIds.push(node.id);

				if (node.id === '1.2.1') {
					return true; // stop traversing
				}

				return false;
			}, tree);

			assert.deepStrictEqual(seenIds, [
				'1',
				'1.1',
				'1.2',
				'1.2.1',
			]);

			assert.deepStrictEqual(
				treeCopy,
				tree,
				'forEach should not modify the tree',
			);
		});
	});

	suite('• map', () => {
		test('• maps a tree', () => {
			interface ITree {
				id: string;
				children?: ITree[];
			}

			const tree: ITree = {
				id: '1',
				children: [
					{
						id: '1.1',
					},
					{
						id: '1.2',
						children: [
							{
								id: '1.2.1',
								children: [
									{
										id: '1.2.1.1',
									},
									{
										id: '1.2.1.2',
									},
									{
										id: '1.2.1.3',
									}
								],
							},
							{
								id: '1.2.2',
							},
						]
					},
				],
			};

			const treeCopy = JSON.parse(JSON.stringify(tree));

			const newRootNode = {
				newId: '__1__',
			};

			const newChildNode = {
				newId: '__1.2.1.3__',
			};

			const newTree = map((node) => {
				if (node.id === '1') {
					return newRootNode;
				}

				if (node.id === '1.2.1.3') {
					return newChildNode;
				}

				return {
					newId: `__${node.id}__`,
				};
			}, tree);

			assert.deepStrictEqual(newTree, {
				newId: '__1__',
				children: [
					{
						newId: '__1.1__',
					},
					{
						newId: '__1.2__',
						children: [
							{
								newId: '__1.2.1__',
								children: [
									{
										newId: '__1.2.1.1__',
									},
									{
										newId: '__1.2.1.2__',
									},
									{
										newId: '__1.2.1.3__',
									},
								],
							},
							{
								newId: '__1.2.2__',
							},
						]
					},
				],
			});

			assert(
				newRootNode === newTree,
				'Map should not replace return node reference (root node).',
			);

			assert(
				newChildNode === newTree.children![1].children![0].children![2],
				'Map should not replace return node reference (child node).',
			);

			assert.deepStrictEqual(
				treeCopy,
				tree,
				'forEach should not modify the tree',
			);
		});

		test('• callback can control resulting children', () => {
			interface ITree {
				id: string;
				children?: ITree[];
			}

			const tree: ITree = {
				id: '1',
				children: [
					{ id: '1.1' },
					{
						id: '1.2',
						children: [
							{
								id: '1.2.1',
								children: [
									{ id: '1.2.1.1' },
									{ id: '1.2.1.2' },
									{
										id: '1.2.1.3',
										children: [
											{
												id: '1.2.1.3.1',
											},
											{
												id: '1.2.1.3.2',
											},
										],
									}
								],
							},
							{
								id: '1.2.2',
								children: [
									{ id: '1.2.2.1' },
									{ id: '1.2.2.2' },
									{ id: '1.2.2.3' },
								],
							},
							{
								id: '1.2.3',
								children: [
									{ id: '1.2.3.1' },
									{ id: '1.2.3.2' },
									{ id: '1.2.3.3' },
									{ id: '1.2.3.4' },
								],
							},
						]
					},
				],
			};

			const treeCopy = JSON.parse(JSON.stringify(tree));

			const newNodeWithoutChildren = {
				newId: '__1.2.1.3__',
				children: undefined,
			};

			const newTree = map((node, newChildren) => {
				// validates that explicitly setting `children` to
				// `undefined` will be preserved on the resulting new node
				if (node.id === '1.2.1.3') {
					return newNodeWithoutChildren;
				}

				// validates that setting `children` to a new array
				// will be preserved on the resulting new node
				if (node.id === '1.2.2') {
					assert.deepStrictEqual(
						newChildren,
						[
							{ newId: '__1.2.2.1__' },
							{ newId: '__1.2.2.2__' },
							{ newId: '__1.2.2.3__' },
						],
						`Node '${node.id}' must have correct new children.`,
					);

					return {
						newId: `__${node.id}__`,
						children: [newChildren[2]],
					};
				}

				// validates that modifying `newChildren` directly
				// will be preserved on the resulting new node
				if (node.id === '1.2.3') {
					assert.deepStrictEqual(
						newChildren,
						[
							{ newId: '__1.2.3.1__' },
							{ newId: '__1.2.3.2__' },
							{ newId: '__1.2.3.3__' },
							{ newId: '__1.2.3.4__' },
						],
						`Node '${node.id}' must have correct new children.`,
					);

					newChildren.length = 2;

					return {
						newId: `__${node.id}__`,
					};
				}

				// convert to a new node in all other cases
				return {
					newId: `__${node.id}__`,
				};
			}, tree);

			assert.deepStrictEqual(newTree, {
				newId: '__1__',
				children: [
					{ newId: '__1.1__' },
					{
						newId: '__1.2__',
						children: [
							{
								newId: '__1.2.1__',
								children: [
									{ newId: '__1.2.1.1__' },
									{ newId: '__1.2.1.2__' },
									{
										newId: '__1.2.1.3__',
										children: undefined,
									},
								],
							},
							{
								newId: '__1.2.2__',
								children: [
									{ newId: '__1.2.2.3__' },
								],
							},
							{
								newId: '__1.2.3__',
								children: [
									{ newId: '__1.2.3.1__' },
									{ newId: '__1.2.3.2__' },
								],
							},
						]
					},
				],
			});

			assert(
				newNodeWithoutChildren === newTree.children![1].children![0].children![2],
				'Map should not replace return node reference (node without children).',
			);

			assert.deepStrictEqual(
				treeCopy,
				tree,
				'forEach should not modify the tree',
			);
		});
	});

	test('• curry', () => {
		const originalFunction = (a: number, b: number, c: number) => {
			return a + b + c;
		};

		const firstArgument = randomInt(100, -100);
		const curriedFunction = curry(originalFunction, firstArgument);

		let iterations = 10;
		while (iterations-- > 0) {
			const secondArgument = randomInt(100, -100);
			const thirdArgument = randomInt(100, -100);

			assert.strictEqual(
				curriedFunction(secondArgument, thirdArgument),
				originalFunction(firstArgument, secondArgument, thirdArgument),
				'Curried and original functions must yield the same result.',
			);

			// a sanity check to ensure we don't compare ambiguous infinities
			assert(
				isFinite(originalFunction(firstArgument, secondArgument, thirdArgument)),
				'Function results must be finite.',
			);
		}
	});
});
