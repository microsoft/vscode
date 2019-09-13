/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

export const enum NodeType {
	Branch,
	Leaf
}

export interface LeafNode<T> {
	readonly type: NodeType.Leaf;
	readonly element: T;
}

export interface BranchNode<T> {
	readonly type: NodeType.Branch;
	readonly children: Map<string, Node<T>>;
}

export type Node<T> = BranchNode<T> | LeafNode<T>;

export class ResourceTree<T extends NonNullable<any>> {

	readonly root: BranchNode<T> = { type: NodeType.Branch, children: new Map() };

	constructor() { }

	add(uri: URI, element: T): void {
		const parts = uri.fsPath.split(/[\\\/]/).filter(p => !!p);
		let node = this.root;

		for (let i = 0; i < parts.length; i++) {
			const name = parts[i];
			let child = node.children.get(name);

			if (!child) {
				if (i < parts.length - 1) {
					child = { type: NodeType.Branch, children: new Map() };
					node.children.set(name, child);
				} else {
					child = { type: NodeType.Leaf, element };
					node.children.set(name, child);
					return;
				}
			}

			if (child.type === NodeType.Leaf) {
				if (i < parts.length - 1) {
					throw new Error('Inconsistent tree: can\'t override leaf with branch.');
				}

				// replace
				node.children.set(name, { type: NodeType.Leaf, element });
				return;
			} else if (i === parts.length - 1) {
				throw new Error('Inconsistent tree: can\'t override branch with leaf.');
			}

			node = child;
		}
	}

	delete(uri: URI): T | undefined {
		const parts = uri.fsPath.split(/[\\\/]/).filter(p => !!p);
		return this._delete(this.root, parts, 0);
	}

	private _delete(node: BranchNode<T>, parts: string[], index: number): T | undefined {
		const name = parts[index];
		const child = node.children.get(name);

		if (!child) {
			return undefined;
		}

		// not at end
		if (index < parts.length - 1) {
			if (child.type === NodeType.Leaf) {
				throw new Error('Inconsistent tree: Expected a branch, found a leaf instead.');
			} else {
				const result = this._delete(child, parts, index + 1);

				if (typeof result !== 'undefined' && child.children.size === 0) {
					node.children.delete(name);
				}

				return result;
			}
		}

		//at end
		if (child.type === NodeType.Branch) {
			// TODO: maybe we can allow this
			throw new Error('Inconsistent tree: Expected a leaf, found a branch instead.');
		}

		node.children.delete(name);
		return child.element;
	}
}
