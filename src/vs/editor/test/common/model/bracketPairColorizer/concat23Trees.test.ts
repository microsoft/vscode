/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { AstNode, AstNodeKind, ListAstNode, TextAstNode } from 'vs/editor/common/model/bracketPairColorizer/ast';
import { toLength } from 'vs/editor/common/model/bracketPairColorizer/length';
import { concat23Trees } from 'vs/editor/common/model/bracketPairColorizer/concat23Trees';

suite('Bracket Pair Colorizer - mergeItems', () => {
	test('Clone', () => {
		const tree = ListAstNode.create([
			new TextAstNode(toLength(1, 1)),
			new TextAstNode(toLength(1, 1)),
		]);

		assert.ok(equals(tree, tree.clone()));
	});

	function equals(node1: AstNode, node2: AstNode): boolean {
		if (node1.length !== node2.length) {
			return false;
		}

		if (node1.children.length !== node2.children.length) {
			return false;
		}

		for (let i = 0; i < node1.children.length; i++) {
			if (!equals(node1.children[i], node2.children[i])) {
				return false;
			}
		}

		if (!node1.unopenedBrackets.equals(node2.unopenedBrackets)) {
			return false;
		}

		if (node1.kind === AstNodeKind.Pair && node2.kind === AstNodeKind.Pair) {
			return node1.category === node2.category;
		} else if (node1.kind === node2.kind) {
			return true;
		}

		return false;
	}

	function testMerge(lists: AstNode[]) {
		const node = (concat23Trees(lists.map(l => l.clone())) || ListAstNode.create([])).flattenLists();
		// This trivial merge does not maintain the (2,3) tree invariant.
		const referenceNode = ListAstNode.create(lists).flattenLists();

		assert.ok(equals(node, referenceNode), 'merge23Trees failed');
	}

	test('Empty List', () => {
		testMerge([]);
	});

	test('Same Height Lists', () => {
		const textNode = new TextAstNode(toLength(1, 1));
		const tree = ListAstNode.create([textNode.clone(), textNode.clone()]);
		testMerge([tree.clone(), tree.clone(), tree.clone(), tree.clone(), tree.clone()]);
	});

	test('Different Height Lists 1', () => {
		const textNode = new TextAstNode(toLength(1, 1));
		const tree1 = ListAstNode.create([textNode.clone(), textNode.clone()]);
		const tree2 = ListAstNode.create([tree1.clone(), tree1.clone()]);

		testMerge([tree1, tree2]);
	});

	test('Different Height Lists 2', () => {
		const textNode = new TextAstNode(toLength(1, 1));
		const tree1 = ListAstNode.create([textNode.clone(), textNode.clone()]);
		const tree2 = ListAstNode.create([tree1.clone(), tree1.clone()]);

		testMerge([tree2, tree1]);
	});

	test('Different Height Lists 3', () => {
		const textNode = new TextAstNode(toLength(1, 1));
		const tree1 = ListAstNode.create([textNode.clone(), textNode.clone()]);
		const tree2 = ListAstNode.create([tree1.clone(), tree1.clone()]);

		testMerge([tree2, tree1, tree1, tree2, tree2]);
	});
});
