/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type for a generic tree node.
 */
export type TTree<TTreenNode> = { children?: readonly TTree<TTreenNode>[] } & TTreenNode;

/**
 * Flatter a tree structure into a single flat array.
 */
export const flatten = <TTreeNode>(
	treeRoot: TTree<TTreeNode>,
): Omit<TTreeNode, 'children'>[] => {
	const result: Omit<TTreeNode, 'children'>[] = [];

	result.push(treeRoot);

	for (const child of treeRoot.children ?? []) {
		result.push(...flatten(child));
	}

	return result;
};

/**
 * Traverse a tree structure and execute a callback for each node.
 */
export const forEach = <TTreeNode>(
	callback: (node: TTreeNode) => boolean,
	treeRoot: TTree<TTreeNode>,
): ReturnType<typeof callback> => {
	const shouldStop = callback(treeRoot);

	if (shouldStop === true) {
		return true;
	}

	for (const child of treeRoot.children ?? []) {
		const shouldStop = forEach(callback, child);

		if (shouldStop === true) {
			return true;
		}
	}

	return false;
};

/**
 * Map nodes of a tree to a new type preserving the original tree structure.
 *
 * @param callback Function to map each of the nodes in the tree. The callback receives
 *                 the original tree node without the `children` property and must return
 *                 a new tree node without the `children` property. The only allowed
 *                 value for `children` is `undefined`, which is treated as an explicit
 *                 signal to avoid traversing the children of the node at all. These
 *                 restrictions are designed to force the uniform callback logic that
 *                 should map every tree node (including children) to a new type
 *                 without being traverse modify the children tree directly.
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
 * const newTree = map((node) => {
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
export const map = <
	TTreeNode extends object,
	TNewTreeNode extends object,
>(
	callback: (node: TWithoutChildren<TTreeNode>) => TWithUndefinedChildren<TNewTreeNode>,
	treeRoot: TTree<TTreeNode>,
): TTree<TNewTreeNode> => {
	const newNode = callback(treeRoot);

	// when callback explicitly sets `undefined` for `children`
	// we treat it as the signal to not traverse its children
	const isExplicitUndefined = (newNode.children === undefined) && ('children' in newNode);

	// if the original node has no children, or user explicitly
	// signalled to not traverse them, we are done here
	if ((treeRoot.children === undefined) || isExplicitUndefined) {
		if (isExplicitUndefined) {
			// delete the explicit undefined value to make it
			// consistent with the other nodes in the tree
			delete newNode.children;
		}

		return newNode;
	}

	// process all the children recursively next updating
	// the new node object itself therefore preserving
	// the original object reference
	(<TTree<TNewTreeNode>>newNode).children = treeRoot.children
		.map(curry(map, callback));

	return newNode;
};

/**
 * Type for an object without the `children` property.
 */
type TWithoutChildren<T extends object> = Omit<T, 'children'>;

/**
 * Type for an object without the `children` property either
 * not defined at all or explicitly set to `undefined`.
 */
type TWithUndefinedChildren<T extends object> = T & { children?: undefined };

/**
 * Type for a rest parameters of function, excluding
 * the first argument.
 */
type TRestParameters<T extends (...args: any[]) => any> =
	T extends (first: any, ...rest: infer R) => any ? R : never;

/**
 * Type for a curried function.
 * See {@link curry} for more info.
 */
type TCurriedFunction<T extends (...args: any[]) => any> = ((...args: TRestParameters<T>) => ReturnType<T>);

/**
 * Curry a provided function with the first argument.
 */
export const curry = <T, K>(
	callback: (arg1: T, ...args: any[]) => K,
	arg1: T,
): TCurriedFunction<typeof callback> => {
	return (...args) => {
		return callback(arg1, ...args);
	};
};
