/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeElement } from 'vs/base/browser/ui/tree/tree';
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
	Concat
}

export type NodeRenderFn<T> = (n: T, recurse: (items: Iterable<T>) => Iterable<ITreeElement<ITestTreeElement>>) =>
	ITreeElement<ITestTreeElement> | NodeRenderDirective;

const pruneNodesNotInTree = <T extends ITestTreeElement>(nodes: Set<T | null>, tree: ObjectTree<ITestTreeElement, any>) => {
	for (const node of nodes) {
		if (node && !tree.hasElement(node)) {
			nodes.delete(node);
		}
	}
};

/**
 * Helper to gather and bulk-apply tree updates.
 */
export class NodeChangeList<T extends ITestTreeElement & { children: Iterable<T>; parentItem: T | null; }> {
	private changedParents = new Set<T | null>();
	private updatedNodes = new Set<T>();
	private omittedNodes = new WeakSet<T>();
	private isFirstApply = true;

	public updated(node: T) {
		this.updatedNodes.add(node);
	}

	public addedOrRemoved(node: T) {
		this.changedParents.add(this.getNearestNotOmittedParent(node));
	}

	public applyTo(
		tree: ObjectTree<ITestTreeElement, any>,
		renderNode: NodeRenderFn<T>,
		roots: () => Iterable<T>,
	) {
		pruneNodesNotInTree(this.changedParents, tree);
		pruneNodesNotInTree(this.updatedNodes, tree);

		const diffDepth = this.isFirstApply ? Infinity : 0;
		this.isFirstApply = false;

		for (let parent of this.changedParents) {
			while (parent && typeof renderNode(parent, () => []) !== 'object') {
				parent = parent.parentItem;
			}

			if (parent === null || tree.hasElement(parent)) {
				tree.setChildren(
					parent,
					this.renderNodeList(renderNode, parent === null ? roots() : parent.children),
					{ diffIdentityProvider: testIdentityProvider, diffDepth },
				);
			}
		}

		for (const node of this.updatedNodes) {
			if (tree.hasElement(node)) {
				tree.rerender(node);
			}
		}

		this.changedParents.clear();
		this.updatedNodes.clear();
	}

	private getNearestNotOmittedParent(node: T | null) {
		let parent = node && node.parentItem;
		while (parent && this.omittedNodes.has(parent)) {
			parent = parent.parentItem;
		}

		return parent;
	}

	private *renderNodeList(renderNode: NodeRenderFn<T>, nodes: Iterable<T>): Iterable<ICompressedTreeElement<ITestTreeElement>> {
		for (const node of nodes) {
			const rendered = renderNode(node, this.renderNodeList.bind(this, renderNode));
			if (rendered === NodeRenderDirective.Omit) {
				this.omittedNodes.add(node);
			} else if (rendered === NodeRenderDirective.Concat) {
				this.omittedNodes.add(node);
				for (const nested of this.renderNodeList(renderNode, node.children)) {
					yield nested;
				}
			} else {
				this.omittedNodes.delete(node);
				yield rendered;
			}
		}
	}
}
