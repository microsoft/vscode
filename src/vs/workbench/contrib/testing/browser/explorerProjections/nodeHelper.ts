/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { CompressibleObjectTree, ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { Iterable } from 'vs/base/common/iterator';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';

export const isRunningState = (s: TestRunState) => s === TestRunState.Queued || s === TestRunState.Running;

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
 * Helper to gather and bulk-apply tree updates.
 */
export class NodeChangeList<T extends ITestTreeElement & { children: Iterable<T>; parentItem: T | null; }> {
	private changedParents = new Set<T | null>();
	private updatedNodes = new Set<T>();

	public updated(node: T) {
		this.updatedNodes.add(node);
	}

	public removed(node: T) {
		this.changedParents.add(node.parentItem);
	}

	public added(node: T) {
		this.changedParents.add(node.parentItem);
	}

	public applyTo(
		tree: CompressibleObjectTree<ITestTreeElement, any>,
		renderNode: (n: T) => ICompressedTreeElement<ITestTreeElement>,
		roots: () => Iterable<T>,
	) {
		pruneNodesWithParentsNotInTree(this.changedParents, tree);
		pruneNodesWithParentsNotInTree(this.updatedNodes, tree);

		for (const parent of this.changedParents) {
			if (parent === null || tree.hasElement(parent)) {
				const pchildren: Iterable<T> = parent ? parent.children : roots();
				tree.setChildren(parent, Iterable.map(pchildren, renderNode));
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
}
