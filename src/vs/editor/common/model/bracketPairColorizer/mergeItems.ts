/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AstNode, ListAstNode } from './ast';

/**
 * Merges a list of (2,3) AstNode's into a single (2,3) AstNode.
 * This mutates the items of the input array!
*/
export function merge23Trees(items: AstNode[]): AstNode | null {
	if (items.length === 0) {
		return null;
	}
	if (items.length === 1) {
		return items[0];
	}

	const firstHeight = items[0].listHeight;

	let allItemsHaveSameHeight = true;
	for (const item of items) {
		if (item.listHeight !== firstHeight) {
			allItemsHaveSameHeight = false;
			break;
		}
	}

	if (allItemsHaveSameHeight) {
		return mergeFast(items);
	}

	return mergeSlow(items);
}

function mergeFast(items: AstNode[]): AstNode | null {
	let length = items.length;
	// All trees have same height, just create parent nodes.
	while (length > 1) {
		const newLength = length >> 1;
		const newItems = new Array<AstNode>(newLength);
		for (let i = 0; i < newLength; i++) {
			const j = i << 1;
			newItems[i] = ListAstNode.create(items.slice(j, (j + 3 === length) ? length : j + 2));
		}
		length = newLength;
		items = newItems;
	}
	return items[0];
}

function heightDiff(node1: AstNode, node2: AstNode): number {
	return Math.abs(node1.listHeight - node2.listHeight);
}

function mergeSlow(items: AstNode[]): AstNode | null {
	let first = items[0];
	let second = items[1];

	for (let i = 2; i < items.length; i++) {
		const item = items[i];
		// Prefer concatenating smaller trees.
		if (heightDiff(first, second) <= heightDiff(second, item)) {
			first = concat(first, second);
			second = item;
		} else {
			second = concat(second, item);
		}
	}

	const result = concat(first, second);
	return result;
}

function concat(node1: AstNode, node2: AstNode): AstNode {
	if (node1.listHeight === node2.listHeight) {
		return ListAstNode.create([node1, node2]);
	}
	else if (node1.listHeight > node2.listHeight) {
		// node1 is the tree we want to insert into
		return (node1 as ListAstNode).append(node2);
	} else {
		return (node2 as ListAstNode).prepend(node1);
	}
}
