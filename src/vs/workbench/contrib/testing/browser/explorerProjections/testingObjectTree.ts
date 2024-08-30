/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { TestExplorerTreeElement, TestItemTreeElement } from './index.js';
import { ISerializedTestTreeCollapseState } from './testingViewState.js';
import { TestId } from '../../common/testId.js';


export class TestingObjectTree<TFilterData = void> extends WorkbenchObjectTree<TestExplorerTreeElement, TFilterData> {

	/**
	 * Gets a serialized view state for the tree, optimized for storage.
	 *
	 * @param updatePreviousState Optional previous state to mutate and update
	 * instead of creating a new one.
	 */
	public getOptimizedViewState(updatePreviousState?: ISerializedTestTreeCollapseState): ISerializedTestTreeCollapseState {
		const root: ISerializedTestTreeCollapseState = updatePreviousState || {};

		/**
		 * Recursive builder function. Returns whether the subtree has any non-default
		 * value. Adds itself to the parent children if it does.
		 */
		const build = (node: ITreeNode<TestExplorerTreeElement | null, unknown>, parent: ISerializedTestTreeCollapseState): boolean => {
			if (!(node.element instanceof TestItemTreeElement)) {
				return false;
			}

			const localId = TestId.localId(node.element.test.item.extId);
			const inTree = parent.children?.[localId] || {};
			// only saved collapsed state if it's not the default (not collapsed, or a root depth)
			inTree.collapsed = node.depth === 0 || !node.collapsed ? node.collapsed : undefined;

			let hasAnyNonDefaultValue = inTree.collapsed !== undefined;
			if (node.children.length) {
				for (const child of node.children) {
					hasAnyNonDefaultValue = build(child, inTree) || hasAnyNonDefaultValue;
				}
			}

			if (hasAnyNonDefaultValue) {
				parent.children ??= {};
				parent.children[localId] = inTree;
			} else if (parent.children?.hasOwnProperty(localId)) {
				delete parent.children[localId];
			}

			return hasAnyNonDefaultValue;
		};

		root.children ??= {};

		// Controller IDs are hidden if there's only a single test controller, but
		// make sure they're added when the tree is built if this is the case, so
		// that the later ID lookup works.
		for (const node of this.getNode().children) {
			if (node.element instanceof TestItemTreeElement) {
				if (node.element.test.controllerId === node.element.test.item.extId) {
					build(node, root);
				} else {
					const ctrlNode = root.children[node.element.test.controllerId] ??= { children: {} };
					build(node, ctrlNode);
				}
			}
		}

		return root;
	}
}
