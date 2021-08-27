/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AstNode, ListAstNode } from './ast';

/**
 * Concatenates a list of (2,3) AstNode's into a single (2,3) AstNode.
 * This mutates the items of the input array!
 * If all items have the same height, this method has runtime O(items.length).
 * Otherwise, it has runtime O(items.length * max(log(items.length), items.max(i => i.height))).
*/
export function concat23Trees(items: AstNode[]): AstNode | null {
	if (items.length === 0) {
		return null;
	}
	if (items.length === 1) {
		return items[0];
	}

	let i = 0;
	function readNode(): AstNode | null {
		if (i >= items.length) {
			return null;
		}
		const start = i;
		const height = items[start].listHeight;

		i++;
		while (i < items.length && items[i].listHeight === height) {
			i++;
		}

		if (i - start >= 2) {
			return concat23TreesOfSameHeight(start === 0 && i === items.length ? items : items.slice(start, i));
		} else {
			return items[start];
		}
	}

	// The items might not have the same height.
	// We merge all items by using a binary concat operator.
	let first = readNode()!; // There must be a first item
	let second = readNode();
	if (!second) {
		return first;
	}

	for (let item = readNode(); item; item = readNode()) {
		// Prefer concatenating smaller trees, as the runtime of concat depends on the tree height.
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

export function concat23TreesOfSameHeight(items: AstNode[]): AstNode | null {
	if (items.length === 0) {
		return null;
	}
	if (items.length === 1) {
		return items[0];
	}

	let length = items.length;
	// All trees have same height, just create parent nodes.
	while (length > 3) {
		const newLength = length >> 1;
		// Ideally, due to the slice, not a lot of memory is wasted.
		const newItems = new Array<AstNode>(newLength);
		for (let i = 0; i < newLength; i++) {
			const j = i << 1;
			newItems[i] = ListAstNode.create(items.slice(j, (j + 3 === length) ? length : j + 2));
		}
		length = newLength;
		items = newItems;
	}
	return ListAstNode.create(items);
}

function heightDiff(node1: AstNode, node2: AstNode): number {
	return Math.abs(node1.listHeight - node2.listHeight);
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
