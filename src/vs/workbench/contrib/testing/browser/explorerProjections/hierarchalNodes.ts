/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { maxPriority, statePriority } from 'vs/workbench/contrib/testing/browser/testExplorerTree';
import { InternalTestItem, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * Test tree element element that groups be hierarchy.
 */
export class HierarchicalElement implements ITestTreeElement {
	public readonly children = new Set<HierarchicalElement>();
	public computedState: TestRunState | undefined;
	public readonly depth: number = this.parentItem.depth + 1;

	public get treeId() {
		return `test:${this.test.id}`;
	}

	public get label() {
		return this.test.item.label;
	}

	public get state() {
		return this.test.item.state.runState;
	}

	public get location() {
		return this.test.item.location;
	}

	public get runnable(): Iterable<TestIdWithProvider> {
		return this.test.item.runnable
			? [{ providerId: this.test.providerId, testId: this.test.id }]
			: Iterable.empty();
	}

	public get debuggable() {
		return this.test.item.debuggable
			? [{ providerId: this.test.providerId, testId: this.test.id }]
			: Iterable.empty();
	}

	constructor(public readonly test: InternalTestItem, public readonly parentItem: HierarchicalFolder | HierarchicalElement) {
		this.test = { ...test, item: { ...test.item } }; // clone since we Object.assign updatese
	}

	public getChildren() {
		return this.children;
	}

	public update(actual: InternalTestItem, addUpdated: (n: ITestTreeElement) => void) {
		const stateChange = actual.item.state.runState !== this.state;
		Object.assign(this.test, actual);
		if (stateChange) {
			refreshComputedState(this, addUpdated);
		}
	}
}

/**
 * Workspace folder in the hierarcha view.
 */
export class HierarchicalFolder implements ITestTreeElement {
	public readonly children = new Set<HierarchicalElement>();
	public readonly parentItem = null;
	public readonly depth = 0;
	public computedState: TestRunState | undefined;

	public get treeId() {
		return `folder:${this.folder.index}`;
	}

	public get runnable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.runnable));
	}

	public get debuggable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.debuggable));
	}

	constructor(private readonly folder: IWorkspaceFolder) { }

	public get label() {
		return this.folder.name;
	}

	public getChildren() {
		return this.children;
	}
}

/**
 * Gets the computed state for the node.
 */
export const getComputedState = (node: ITestTreeElement) => {
	if (node.computedState === undefined) {
		node.computedState = node.state ?? TestRunState.Unset;
		for (const child of node.getChildren()) {
			node.computedState = maxPriority(node.computedState, getComputedState(child));
		}
	}

	return node.computedState;
};

/**
 * Refreshes the computed state for the node and its parents. Any changes
 * elements cause `addUpdated` to be called.
 */
export const refreshComputedState = (node: ITestTreeElement, addUpdated: (n: ITestTreeElement) => void) => {
	if (node.computedState === undefined) {
		return;
	}

	const oldPriority = statePriority[node.computedState];
	node.computedState = undefined;
	const newState = getComputedState(node);
	const newPriority = statePriority[getComputedState(node)];
	if (newPriority === oldPriority) {
		return;
	}

	addUpdated(node);
	if (newPriority > oldPriority) {
		// Update all parents to ensure they're at least this priority.
		for (let parent = node.parentItem; parent; parent = parent.parentItem) {
			const prev = parent.computedState;
			if (prev !== undefined && statePriority[prev] >= newPriority) {
				break;
			}

			parent.computedState = newState;
			addUpdated(parent);
		}
	} else if (newPriority < oldPriority) {
		// Re-render all parents of this node whose computed priority might have come from this node
		for (let parent = node.parentItem; parent; parent = parent.parentItem) {
			const prev = parent.computedState;
			if (prev === undefined || statePriority[prev] > oldPriority) {
				break;
			}

			parent.computedState = undefined;
			parent.computedState = getComputedState(parent);
			addUpdated(parent);
		}
	}
};
