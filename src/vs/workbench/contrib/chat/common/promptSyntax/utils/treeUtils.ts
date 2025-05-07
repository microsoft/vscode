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
		const childShouldStop = forEach(callback, child);

		if (childShouldStop === true) {
			return true;
		}
	}

	return false;
};

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
export const map = <
	TTreeNode extends object,
	TNewTreeNode extends object,
>(
	callback: (
		originalNode: Readonly<TTree<TTreeNode>>,
		newChildren: Readonly<TNewTreeNode>[] | undefined,
	) => TTree<TNewTreeNode>,
	treeRoot: TTree<TTreeNode>,
): TTree<TNewTreeNode> => {
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
};

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
export const curry = <T, K>(
	callback: (arg1: T, ...args: any[]) => K,
	arg1: T,
): TCurriedFunction<typeof callback> => {
	return (...args) => {
		return callback(arg1, ...args);
	};
};
