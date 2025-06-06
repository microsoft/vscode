/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomInt } from '../../../../../../../base/common/numbers.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../../../../common/promptSyntax/codecs/base/baseToken.js';
import { CompositeToken } from '../../../../common/promptSyntax/codecs/base/compositeToken.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { curry, difference, flatten, forEach, map, TTree } from '../../../../common/promptSyntax/utils/treeUtils.js';
import { ExclamationMark, Space, Tab, VerticalTab, Word } from '../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';

suite('tree utilities', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('flatten', () => {
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

	suite('forEach', () => {
		test('iterates though all nodes', () => {
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

		test('can be stopped prematurely', () => {
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

	suite('map', () => {
		test('maps a tree', () => {
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

		test('callback can control resulting children', () => {
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

	test('curry', () => {
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

	suite('difference', () => {
		class TestCompositeToken extends CompositeToken<TTree<BaseToken[]>> {
			public override toString(): string {
				return `CompositeToken:\n${BaseToken.render(this.children, '\n')})`;
			}
		}


		test('tree roots differ (no children)', () => {
			const tree1 = new Word(new Range(1, 1, 1, 1 + 5), 'hello');
			const tree2 = new Word(new Range(1, 1, 1, 1 + 5), 'halou');

			assert.deepStrictEqual(
				difference(tree1, tree2),
				{
					index: 0,
					object1: tree1,
					object2: tree2,
				},
				'Unexpected difference between token trees.',
			);
		});

		test('returns tree difference (single children level)', () => {
			const tree1 = asTreeNode<TTree<BaseToken>>(
				new Word(new Range(1, 1, 1, 1 + 5), 'hello'),
				[
					new Space(new Range(1, 6, 1, 7)),
					new Word(new Range(1, 7, 1, 7 + 5), 'world'),
				],
			);

			const tree2 = asTreeNode<TTree<BaseToken>>(
				new Word(new Range(1, 1, 1, 1 + 5), 'hello'),
				[
					new Space(new Range(1, 6, 1, 7)),
					new Word(new Range(1, 7, 1, 7 + 6), 'world!'),
				],
			);

			assert.deepStrictEqual(
				difference(tree1, tree2),
				{
					index: 0,
					object1: tree1,
					object2: tree2,
					children: [
						{
							index: 1,
							object1: new Word(
								new Range(1, 7, 1, 7 + 5),
								'world',
							),
							object2: new Word(
								new Range(1, 7, 1, 7 + 6),
								'world!',
							),
						}
					],
				},
				'Unexpected difference between token trees.',
			);
		});

		test('returns tree difference (multiple children levels)', () => {
			const compositeToken1 = new TestCompositeToken([
				new VerticalTab(new Range(1, 13, 1, 14)),
				new Space(new Range(1, 14, 1, 15)),
				new Word(new Range(1, 15, 1, 15 + 5), 'again'),
				new ExclamationMark(new Range(1, 20, 1, 21)),
			]);
			const tree1: TTree<BaseToken> = asTreeNode<TTree<BaseToken>>(
				new Word(new Range(1, 1, 1, 1 + 5), 'hello'),
				[
					new Space(new Range(1, 6, 1, 7)),
					new Word(new Range(1, 7, 1, 7 + 5), 'world'),
					compositeToken1,
				],
			);

			const compositeToken2 = new TestCompositeToken([
				new VerticalTab(new Range(1, 13, 1, 14)),
				new Space(new Range(1, 14, 1, 15)),
				new Word(new Range(1, 15, 1, 15 + 5), 'again'),
				new Tab(new Range(1, 20, 1, 21)),
				new ExclamationMark(new Range(1, 21, 1, 22)),
			]);
			const tree2: TTree<BaseToken> = asTreeNode<TTree<BaseToken>>(
				new Word(new Range(1, 1, 1, 1 + 5), 'hello'),
				[
					new Space(new Range(1, 6, 1, 7)),
					new Word(new Range(1, 7, 1, 7 + 5), 'world'),
					compositeToken2,
				],
			);

			assert.deepStrictEqual(
				difference(tree1, tree2),
				{
					index: 0,
					object1: tree1,
					object2: tree2,
					children: [
						{
							index: 2,
							object1: compositeToken1,
							object2: compositeToken2,
							children: [
								{
									index: 3,
									object1: compositeToken1.children[3],
									object2: compositeToken2.children[3],
								},
								{
									index: 4,
									object1: null,
									object2: compositeToken2.children[4],
								},
							],
						}
					],
				},
				'Unexpected difference between token trees.',
			);
		});

		test('returns null for equal trees', () => {
			const tree1 = new TestCompositeToken([
				asTreeNode(new Word(
					new Range(1, 1, 1, 1 + 5),
					'hello',
				), []),
				asTreeNode(new Space(new Range(1, 6, 1, 7)), []),
				asTreeNode(new Word(
					new Range(1, 7, 1, 7 + 6),
					'world!',
				), []),
			]);

			const tree2 = new TestCompositeToken([
				asTreeNode(new Word(
					new Range(1, 1, 1, 1 + 5),
					'hello',
				), []),
				asTreeNode(new Space(new Range(1, 6, 1, 7)), []),
				asTreeNode(new Word(
					new Range(1, 7, 1, 7 + 6),
					'world!',
				), []),
			]);

			assert.strictEqual(
				difference(tree1, tree2),
				null,
				'Unexpected difference between token trees.',
			);

			assert.strictEqual(
				difference(tree1, tree1),
				null,
				'Must be a null difference when compared with itself.',
			);
		});
	});
});

/**
 * Add provided 'children' list to a given object hence
 * allowing the object to be used as a general tree node.
 */
function asTreeNode<T extends object>(
	item: T,
	children: readonly TTree<T>[],
): TTree<T> {
	return new Proxy(item, {
		get(target, prop, _receiver) {
			if (prop === 'children') {
				return children;
			}

			// tokens equality uses the 'constructor' property for
			// comparison, hence we need to return the original one
			if (prop === 'constructor') {
				return target.constructor;
			}

			const result = Reflect.get(target, prop);
			if (typeof result === 'function') {
				return result.bind(target);
			}

			return result;
		},
	});
}
