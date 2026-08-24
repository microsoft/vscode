/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type IndentationTree<L> = TopNode<L> | VirtualNode<L> | LineNode<L> | BlankNode<L>;
export type IndentationSubTree<L> = Exclude<IndentationTree<L>, TopNode<L>>;

interface NodeBase<L> {
	label?: L;
	subs: IndentationSubTree<L>[];
}

/**
 * Virtual nodes represent groupings are not directly visible in indentation.
 **/
export interface VirtualNode<L> extends NodeBase<L> {
	type: 'virtual';
	indentation: number;
}

export interface TopNode<L> extends NodeBase<L> {
	type: 'top';
	indentation: -1;
}

/**
 * A line of source code and its sub-nodes
 * */
export interface LineNode<L> extends NodeBase<L> {
	type: 'line';
	indentation: number;
	lineNumber: number;
	sourceLine: string;
}

/**
 * A blank line
 */
interface BlankNode<L> extends NodeBase<L> {
	type: 'blank';
	lineNumber: number;
	subs: never[]; // Type trick to make it easier to code
}

/** Construct a virtual node */
export function virtualNode<L>(indentation: number, subs: IndentationSubTree<L>[], label?: L): VirtualNode<L> {
	return { type: 'virtual', indentation, subs, label };
}

/** Construct a line node */
export function lineNode<L>(
	indentation: number,
	lineNumber: number,
	sourceLine: string,
	subs: IndentationSubTree<L>[],
	label?: L
): LineNode<L> {
	if (sourceLine === '') {
		throw new Error('Cannot create a line node with an empty source line');
	}
	return { type: 'line', indentation, lineNumber, sourceLine, subs, label };
}

/** Return a blank node */
export function blankNode(line: number): BlankNode<never> {
	return { type: 'blank', lineNumber: line, subs: [] };
}

/** Return a node representing the top node */
export function topNode<L>(subs?: IndentationSubTree<L>[]): TopNode<L> {
	return {
		type: 'top',
		indentation: -1,
		subs: subs ?? [],
	};
}

export function isBlank<L>(tree: IndentationTree<L>): tree is BlankNode<L> {
	return tree.type === 'blank';
}

export function isLine<L>(tree: IndentationTree<L>): tree is LineNode<L> {
	return tree.type === 'line';
}

export function isVirtual<L>(tree: IndentationTree<L>): tree is VirtualNode<L> {
	return tree.type === 'virtual';
}

export function isTop<L>(tree: IndentationTree<L>): tree is TopNode<L> {
	return tree.type === 'top';
}

/**
 * Return the tree which consists of everything up to the line node with the
 * given number. All later siblings of that line node, recursively, are removed.
 *
 * This function does not assume the line numbers appear contiguously, but will
 * return anything before the numbered line, whether its line number is greater
 * or not.
 *
 * This is destructive and modifies the tree.
 */
export function cutTreeAfterLine(tree: IndentationTree<unknown>, lineNumber: number) {
	function cut(tree: IndentationTree<unknown>): boolean {
		if (!isVirtual(tree) && !isTop(tree) && tree.lineNumber === lineNumber) {
			tree.subs = [];
			return true;
		}
		for (let i = 0; i < tree.subs.length; i++) {
			if (cut(tree.subs[i])) {
				tree.subs = tree.subs.slice(0, i + 1);
				return true;
			}
		}
		return false;
	}
	cut(tree);
}

/**
 * A type expressing that JSON.parse(JSON.stringify(x)) === x.
 */
export type JsonStable = string | number | JsonStable[] | { [key: string]: JsonStable };

/**
 * Return a deep duplicate of the tree -- this will only work if the labels can be stringified to parseable JSON.
 */
export function duplicateTree<L extends JsonStable>(tree: IndentationTree<L>): IndentationTree<L> {
	return <IndentationTree<L>>JSON.parse(JSON.stringify(tree));
}
