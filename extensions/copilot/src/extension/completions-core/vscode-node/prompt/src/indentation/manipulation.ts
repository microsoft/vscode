/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IndentationSubTree, IndentationTree, TopNode, isTop, isVirtual, topNode } from './classes';

/**
 * Clear all labels (and their types) from the tree.
 * This will modify the tree in place, or return a retyped tree.
 */
export function clearLabels<L>(tree: IndentationTree<L>): IndentationTree<never> {
	visitTree(
		tree,
		(tree: IndentationTree<L>) => {
			tree.label = undefined;
		},
		'bottomUp'
	);
	return tree as IndentationTree<never>;
}

/** clear labels if condition is true */
export function clearLabelsIf<L, S>(
	tree: IndentationTree<L | S>,
	condition: (arg: L | S) => arg is S
): IndentationTree<L> {
	visitTree(
		tree,
		(tree: IndentationTree<L | S>) => {
			tree.label = tree.label ? (condition(tree.label) ? undefined : tree.label) : undefined;
		},
		'bottomUp'
	);
	return tree as IndentationTree<L>;
}

export function mapLabels<L1, L2>(
	tree: IndentationSubTree<L1>,
	map: (arg: L1) => L2 | undefined
): IndentationSubTree<L2>;
export function mapLabels<L1, L2>(tree: TopNode<L1>, map: (arg: L1) => L2 | undefined): TopNode<L2>;
export function mapLabels<L1, L2>(tree: IndentationTree<L1>, map: (arg: L1) => L2 | undefined): IndentationTree<L2>;
/**
 * Apply a type changing function to all labels.
 * This will return a new, retyped tree.
 * (For applying a type keeping function to a tree
 * that modifies it in place, use `visitTree`.)
 */
export function mapLabels<L1, L2>(tree: IndentationTree<L1>, map: (arg: L1) => L2 | undefined): IndentationTree<L2> {
	switch (tree.type) {
		case 'line':
		case 'virtual': {
			const newSubs = tree.subs.map(sub => mapLabels(sub, map));
			return { ...tree, subs: newSubs, label: tree.label ? map(tree.label) : undefined };
		}
		case 'blank':
			return { ...tree, label: tree.label ? map(tree.label) : undefined };
		case 'top':
			return {
				...tree,
				subs: tree.subs.map(sub => mapLabels(sub, map)),
				label: tree.label ? map(tree.label) : undefined,
			};
	}
}

/**
 * Renumber the line numbers of the tree contiguously from 0 and up.
 */
export function resetLineNumbers<L>(tree: IndentationTree<L>): void {
	let lineNumber = 0;
	function visitor(tree: IndentationTree<L>) {
		if (!isVirtual(tree) && !isTop(tree)) {
			tree.lineNumber = lineNumber;
			lineNumber++;
		}
	}
	visitTree(tree, visitor, 'topDown');
}

/**
 * Visit the tree with a function that is called on each node.
 *
 * If direction is topDown, then parents are visited before their children.
 * If direction is bottomUp, children are visited in order before their parents,
 * so that leaf nodes are visited first.
 */
export function visitTree<L>(
	tree: IndentationTree<L>,
	visitor: (tree: IndentationTree<L>) => void,
	direction: 'topDown' | 'bottomUp'
): void {
	function _visit(tree: IndentationTree<L>) {
		if (direction === 'topDown') {
			visitor(tree);
		}
		tree.subs.forEach(subtree => {
			_visit(subtree);
		});
		if (direction === 'bottomUp') {
			visitor(tree);
		}
	}
	_visit(tree);
}

/**
 * Visit the tree with a function that is called on each node --
 * if it returns false, children are not visited (in case of topDown),
 * or the parent is not visited anymore (in case of bottomUp).
 *
 * If direction is topDown, then parents are visited before their children.
 * If direction is bottomUp, children are visited in order before their parents,
 * so that leaf nodes are visited first.
 */
export function visitTreeConditionally<L>(
	tree: IndentationTree<L>,
	visitor: (tree: IndentationTree<L>) => boolean,
	direction: 'topDown' | 'bottomUp'
): void {
	// IDEA: rewrite visitTree to reuse this code
	function _visit(tree: IndentationTree<L>): boolean {
		if (direction === 'topDown') {
			if (!visitor(tree)) {
				return false;
			}
		}
		let shouldContinue = true;
		tree.subs.forEach(subtree => {
			shouldContinue = shouldContinue && _visit(subtree);
		});
		if (direction === 'bottomUp') {
			shouldContinue = shouldContinue && visitor(tree);
		}
		return shouldContinue;
	}
	_visit(tree);
}

/**
 * Fold an accumulator function over the tree.
 *
 * If direction is topDown, then parents are visited before their children.
 * If direction is bottomUp, children are visited in order before their parents,
 * so that leaf nodes are visited first.
 */
export function foldTree<T, L>(
	tree: IndentationTree<L>,
	init: T,
	accumulator: (tree: IndentationTree<L>, acc: T) => T,
	direction: 'topDown' | 'bottomUp'
): T {
	let acc = init;
	function visitor(tree: IndentationTree<L>) {
		acc = accumulator(tree, acc);
	}
	visitTree(tree, visitor, direction);
	return acc;
}

export type Rebuilder<L> = (tree: IndentationTree<L>) => IndentationTree<L> | undefined;
/**
 * Rebuild the tree from the bottom up by applying a function to each node.
 * The visitor function takes a node whose children have already been rebuilt,
 * and returns a new node to replace it (or undefined if it should be deleted).
 * Optionally, a function can be provided to skip nodes that should just be kept
 * without visiting them or their sub-nodes.
 */
export function rebuildTree<L>(
	tree: IndentationTree<L>,
	visitor: Rebuilder<L>,
	skip?: (tree: IndentationTree<L>) => boolean
): IndentationTree<L> {
	const rebuild: Rebuilder<L> = (tree: IndentationTree<L>) => {
		if (skip !== undefined && skip(tree)) {
			return tree;
		} else {
			const newSubs = tree.subs.map(rebuild).filter(sub => sub !== undefined) as IndentationSubTree<L>[];
			tree.subs = newSubs;
			return visitor(tree);
		}
	};
	const rebuilt = rebuild(tree);
	if (rebuilt !== undefined) {
		return rebuilt;
	} else {
		return topNode();
	}
}
