/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { describeTree, IndentationTree, isLine, VirtualNode } from '../indentation';
import * as assert from 'assert';

/**
 * Asserts that two trees are isomorphic.
 * @param actual The tree to test.
 * @param expected The tree expected to be equal (source lines can be abbreviated with '...').
 * @param strictness Should the tree be deeply equal (including indentation and line numbers),
 * or is in enough for the children and types of each node match?
 * @param treeParent The tree's parent for context (optional)
 * @param parentIndex The index for the tree in its parent's subs (optional)
 */

export function compareTreeWithSpec<T>(
	actual: IndentationTree<T>,
	expected: IndentationTree<T>,
	strictness: 'strict' | 'structure' = 'strict',
	treeParent?: IndentationTree<T>,
	parentIndex?: number
) {
	if (actual.type !== expected.type) {
		failCompare(
			actual,
			expected,
			`type of tree doesn't match, ${actual.type} ${expected.type}`,
			treeParent,
			parentIndex
		);
	}
	if (actual.subs.length !== expected.subs.length) {
		failCompare(actual, expected, 'number of children do not match', treeParent, parentIndex);
	}

	if (strictness === 'strict' && isLine(actual)) {
		if (actual.indentation !== (expected as VirtualNode<T>).indentation) {
			failCompare(actual, expected, `virtual node indentation doesn't match`, treeParent, parentIndex);
		}
	}

	for (let i = 0; i < actual.subs.length; ++i) {
		compareTreeWithSpec(actual.subs[i], expected.subs[i], strictness, actual, i);
	}
}

function failCompare<T>(
	tree: IndentationTree<T>,
	expected: IndentationTree<T>,
	reason: string,
	treeParent?: IndentationTree<T>,
	parentIndex?: number
) {
	assert.fail(`Reason: ${reason}
	Tree: ${describeTree(tree)}
	Expected: ${describeTree(expected)}`);
}
