/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TODO: @legomushroom
 */
export type TTree<TTreenNode> = { children?: readonly TTree<TTreenNode>[] } & TTreenNode;

/**
 * TODO: @legomushroom
 */
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
export const forEach = <TTreeNode>(
	node: TTree<TTreeNode>,
	callback: (node: TTreeNode) => boolean,
): ReturnType<typeof callback> => {
	const shouldStop = callback(node);

	if (shouldStop === true) {
		return true;
	}

	for (const child of node.children ?? []) {
		const shouldStop = forEach(child, callback);

		if (shouldStop === true) {
			return true;
		}
	}

	return false;
};
