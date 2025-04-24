/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: @legomushroom - move file to a more appropriate location

/**
 * TODO: @legomushroom
 */
export type TTree<TTreenNode> = { children?: readonly TTree<TTreenNode>[] } & TTreenNode;

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - unit test?
export const flatten = <TTreeNode>(
	node: TTree<TTreeNode>,
): Omit<TTreeNode, 'children'>[] => {
	const result: Omit<TTreeNode, 'children'>[] = [];

	result.push(node);

	for (const child of node.children ?? []) {
		result.push(...flatten(child));
	}

	return result;
};

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - unit test?
export const forEach = <TTreeNode>(
	callback: (node: TTreeNode) => boolean,
	node: TTree<TTreeNode>,
): ReturnType<typeof callback> => {
	const shouldStop = callback(node);

	if (shouldStop === true) {
		return true;
	}

	for (const child of node.children ?? []) {
		const shouldStop = forEach(callback, child);

		if (shouldStop === true) {
			return true;
		}
	}

	return false;
};

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - unit test/remove?
export const map = <TTreeNode, TNewTreeNode>(
	callback: (node: TTreeNode) => TNewTreeNode,
	node: TTree<TTreeNode>,
): TTree<TNewTreeNode> => {
	const newNode: TNewTreeNode = callback(node);

	if (node.children === undefined) {
		return {
			...newNode,
			children: undefined,
		} satisfies TTree<TNewTreeNode>;
	}

	const children = node.children
		.map(curry(map, callback));

	return {
		...newNode,
		children,
	} satisfies TTree<TNewTreeNode>;
};

/**
 * TODO: @legomushroom
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
// TODO: @legomushroom - unit test/remove?
export const curry = <T, K>(
	callback: (arg1: T, ...args: any[]) => K,
	arg1: T,
): TCurriedFunction<typeof callback> => {
	return (...args) => {
		return callback(arg1, ...args);
	};
};
