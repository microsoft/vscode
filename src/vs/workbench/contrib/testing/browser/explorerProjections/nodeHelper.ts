/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';

export const testIdentityProvider: IIdentityProvider<ITestTreeElement> = {
	getId(element) {
		return element.treeId;
	}
};

/**
 * Removes nodes from the set whose parents don't exist in the tree. This is
 * useful to remove nodes that are queued to be updated or rendered, who will
 * be rendered by a call to setChildren.
 */
export const pruneNodesWithParentsNotInTree = <T extends ITestTreeElement>(nodes: Set<T | null>, tree: ObjectTree<ITestTreeElement, any>) => {
	for (const node of nodes) {
		if (node && node.parentItem && !tree.hasElement(node.parentItem)) {
			nodes.delete(node);
		}
	}
};

/**
 * Returns whether there are any children for other nodes besides this one
 * in the tree.
 *
 * This is used for omitting test provider nodes if there's only a single
 * test provider in the workspace (the common case)
 */
export const peersHaveChildren = (node: ITestTreeElement, roots: () => Iterable<ITestTreeElement>) => {
	for (const child of node.parentItem ? node.parentItem.children : roots()) {
		if (child !== node && child.children.size) {
			return true;
		}
	}

	return false;
};

export const enum NodeRenderDirective {
	/** Omit node and all its children */
	Omit,
	/** Concat children with parent */
	Concat,
}

export type NodeRenderFn<T> = (n: T, recurse: (items: Iterable<T>) => Iterable<ITestTreeElement>) => ITestTreeElement | NodeRenderDirective;

/**
 * Helper to gather and bulk-apply tree updates.
 */
export class NodeChangeList<T extends ITestTreeElement & { children: Iterable<T>; parentItem: T | null; }> {
	private changedParents = new Set<T | null>();
	private updatedNodes = new Set<T>();
	private isFirstApply = true;

	public updated(node: T) {
		this.updatedNodes.add(node);
	}

	public removed(node: T) {
		this.added(node);
	}

	public added(node: T) {
		this.changedParents.add(node.parentItem);
	}

	public didRenderChildrenFor(node: T) {
		this.changedParents.delete(node);
	}

	public applyTo(tree: AsyncDataTree<null, ITestTreeElement, any>) {
		const todo: Promise<void>[] = [];
		const diffDepth = this.isFirstApply ? Infinity : 0;
		this.isFirstApply = false;

		for (let parent of this.changedParents) {
			while (parent && !tree.hasNode(parent)) {
				parent = parent.parentItem;
			}

			if (tree.hasNode(parent) && !tree.getNode(parent).collapsed) {
				todo.push(tree.updateChildren(
					parent || undefined,
					false,
					false,
					{ diffIdentityProvider: testIdentityProvider, diffDepth },
				));
			}
		}

		for (const node of this.updatedNodes) {
			try {
				tree.rerender(node);
			} catch {
				// ignore if the node is not in the tree, can happen for new children
			}
		}

		this.changedParents.clear();
		this.updatedNodes.clear();
		return Promise.all(todo);
	}
}
