/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { InternalTestItem, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * Test tree element element that groups be hierarchy.
 */
export class HierarchicalElement implements ITestTreeElement {
	public readonly children = new Set<HierarchicalElement>();
	public readonly depth: number = this.parentItem.depth + 1;

	public get treeId() {
		return `hitest:${this.test.id}`;
	}

	public get label() {
		return this.test.item.label;
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

	public state = TestRunState.Unset;
	public retired = false;
	public ownState = TestRunState.Unset;

	constructor(public readonly test: InternalTestItem, public readonly parentItem: HierarchicalFolder | HierarchicalElement) {
		this.test = { ...test, item: { ...test.item } }; // clone since we Object.assign updatese
	}

	public update(actual: InternalTestItem) {
		Object.assign(this.test, actual);
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
		return `hifolder:${this.folder.index}`;
	}

	public get runnable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.runnable));
	}

	public get debuggable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.debuggable));
	}

	public retired = false;
	public state = TestRunState.Unset;
	public ownState = TestRunState.Unset;

	constructor(private readonly folder: IWorkspaceFolder) { }

	public get label() {
		return this.folder.name;
	}
}
