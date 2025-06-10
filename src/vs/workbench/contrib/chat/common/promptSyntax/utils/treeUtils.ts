/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../base/common/assert.js';

/**
 * Type for a generic tree node.
 */
export type TTree<TTreenNode> = { children?: readonly TTree<TTreenNode>[] } & TTreenNode;

/**
 * Flatter a tree structure into a single flat array.
 */
export function flatten<TTreeNode>(treeRoot: TTree<TTreeNode>): TTreeNode[] {
	const result: TTreeNode[] = [];

	result.push(treeRoot);

	for (const child of treeRoot.children ?? []) {
		result.push(...flatten(child));
	}

	return result;
}

/**
 * Traverse a tree structure and execute a callback for each node.
 */
export function forEach<TTreeNode>(callback: (node: TTreeNode) => boolean, treeRoot: TTree<TTreeNode>): ReturnType<typeof callback> {
	const shouldStop = callback(treeRoot);

	if (shouldStop === true) {
		return true;
	}

	for (const child of treeRoot.children ?? []) {
		const childShouldStop = forEach(callback, child);

		if (childShouldStop === true) {
			return true;
		}
	}

	return false;
}

/**
 * Maps nodes of a tree to a new type preserving the original tree structure by invoking
 * the provided callback function for each node.
 *
 * @param callback Function to map each of the nodes in the tree. The callback receives the original
 *                 readonly tree node and a list of its already-mapped readonly children and expected
 *                 to return a new tree node object. If the new object does not have an explicit
 *                 `children` property set (e.g., set to `undefined` or an array), the utility will
 *                 automatically set the `children` property to the `new mapped children` for you,
 *                 otherwise the set `children` property is preserved. Likewise, if the callback
 *                 modifies the `newChildren` array directly, but doesn't explicitly set the `children`
 *                 property on the returned object, the modification to the `newChildren` array are
 *                 preserved in the resulting object.
 *
 * @param treeRoot The root node of the tree to be mapped.
 *
 * ### Examples
 *
 * ```typescript
 * const tree = {
 *   id: '1',
 *   children: [
 *     { id: '1.1' },
 *     { id: '1.2' },
 * };
 *
 * const newTree = map((node, _newChildren) => {
 *   return {
 *     name: `name-of-${node.id}`,
 *   };
 * }, tree);
 *
 * assert.deepStrictEqual(newTree, {
 *   name: 'name-of-1',
 *   children: [
 *     { name: 'name-of-1.1' },
 *     { name: 'name-of-1.2' },
 * });
 * ```
 */
export function map<
	TTreeNode extends object,
	TNewTreeNode extends object
>(
	callback: (
		originalNode: Readonly<TTree<TTreeNode>>,
		newChildren: Readonly<TNewTreeNode>[] | undefined,
	) => TTree<TNewTreeNode>,
	treeRoot: TTree<TTreeNode>,
): TTree<TNewTreeNode> {
	// if the node does not have children, just call the callback
	if (treeRoot.children === undefined) {
		return callback(treeRoot, undefined);
	}

	// otherwise process all the children recursively first
	const newChildren = treeRoot.children
		.map(curry(map, callback));

	// then run the callback with the new children
	const newNode = callback(treeRoot, newChildren);

	// if user explicitly set the children, preserve the value
	if ('children' in newNode) {
		return newNode;
	}

	// otherwise if no children is explicitly set,
	// use the new children array instead
	newNode.children = newChildren;

	return newNode;
}

/**
 * Type for a generic comparable object - the one that implements
 * the `equals` method that allows to compare it with similar objects.
 */
type TComparable<T> = T & { equals: (other: T) => boolean };

/**
 * Type for a diff object that represents a difference between
 * a pair of objects. See {@link difference} utility and related
 * {@link TDifference} for more info.
 */
type TDiff<TObject1, TObject2> = {
	/**
	 * Reference to the first object that was used during
	 * comparison. Equal to an object of the first tree
	 * parameter passed to {@link difference}. When set to
	 * `null`, then the object was missing in the first tree,
	 * was but present in the second tree.
	 */
	readonly object1: TObject1;

	/**
	 * Reference to the second object that was used during
	 * comparison. Equal to an object of the second tree
	 * parameter passed to {@link difference}. When set to
	 * `null`, then the object was missing in the second tree,
	 * was but present in the first tree.
	 */
	readonly object2: TObject2;
};

/**
 * Type for a diff object that represents a difference between
 * a pair of objects of the same type.
 * See {@link difference} utility for more info.
 *
 * The type is on-purpose constrained as only one of the object
 * references can have the `null` reference but never both of
 * them at the same time. This is due to the fact that two `null`
 * values would indicate that both objects were missing during
 * comparison, which does not make sense in this context.
 */
type TDifference<T> = TDiff<T, T | null> | TDiff<T | null, T>;

/**
 * Type for a tree of differences between two trees.
 * See {@link difference} utility for more info.
 */
type TDiffTree<T> = TTree<TDifference<T> & {
	/**
	 * Index inside the parent's tree node 'children' array
	 * reflecting the position of the object pair that was
	 * compared. Always equal to `0` for a difference at
	 * the root node level of a tree.
	 */
	readonly index: number;
}>;

/**
 * Utility to find a difference between two provided trees
 * of the same type. The result is another tree of difference
 * nodes that represent difference between tree node pairs.
 */
export function difference<T extends NonNullable<unknown>>(tree1: TTree<TComparable<T>>, tree2: TTree<TComparable<T>>): TDiffTree<T> | null {
	const tree1Children = tree1.children ?? [];
	const tree2Children = tree2.children ?? [];

	// if there are no children in the both trees left anymore,
	// compare the nodes directly themselves and return the result
	if (tree1Children.length === 0 && tree2Children.length === 0) {
		if (tree1.equals(tree2)) {
			return null;
		}

		return {
			index: 0,
			object1: tree1,
			object2: tree2,
		};
	}

	// with children present, iterate over them to find difference for each pair
	const maxChildren = Math.max(tree1Children.length, tree2Children.length);
	const children: TDiffTree<T>[] = [];
	for (let i = 0; i < maxChildren; i++) {
		const child1 = tree1Children[i];
		const child2 = tree2Children[i];

		// sanity check to ensure that at least one of the children is defined
		// as otherwise this case most likely indicates a logic error or a bug
		assert(
			(child1 !== undefined) || (child2 !== undefined),
			'At least one of the children must be defined.',
		);

		// if one of the children is missing, report it as a difference
		if ((child1 === undefined) || (child2 === undefined)) {
			children.push({
				index: i,
				object1: child1 ?? null,
				object2: child2 ?? null,
			});

			continue;
		}

		const diff = difference(child1, child2);
		if (diff === null) {
			continue;
		}

		children.push({
			...diff,
			index: i,
		});
	}

	// if there some children that are different, report them
	if (children.length !== 0) {
		return {
			index: 0,
			object1: tree1,
			object2: tree2,
			children,
		};
	}

	// there is no children difference, nor differences in the nodes
	// themselves, hence return explicit `null` value to indicate that
	return null;
}

/**
 * Type for a rest parameters of function, excluding
 * the first argument.
 */
type TRestParameters<T extends (...args: any[]) => unknown> =
	T extends (first: Parameters<T>[0], ...rest: infer R) => unknown ? R : never;

/**
 * Type for a curried function.
 * See {@link curry} for more info.
 */
type TCurriedFunction<T extends (...args: any[]) => unknown> = ((...args: TRestParameters<T>) => ReturnType<T>);

/**
 * Curry a provided function with the first argument.
 */
export function curry<T, K>(
	callback: (arg1: T, ...args: any[]) => K,
	arg1: T,
): TCurriedFunction<typeof callback> {
	return (...args) => {
		return callback(arg1, ...args);
	};
}
