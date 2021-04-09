/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { generateUuid } from 'vs/base/common/uuid';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { TestResultState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { applyTestItemUpdate, InternalTestItem, ITestItemUpdate, TestIdWithSrc, TestItemExpandState } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * Test tree element element that groups be hierarchy.
 */
export class HierarchicalElement implements ITestTreeElement {
	public readonly children = new Set<HierarchicalElement>();
	public readonly depth: number = this.parentItem.depth + 1;

	public get treeId() {
		return generateUuid();
	}

	public get label() {
		return this.test.item.label;
	}

	public get uri() {
		return this.test.item.uri;
	}

	public get range() {
		return this.test.item.range;
	}

	public get runnable(): Iterable<TestIdWithSrc> {
		return this.test.item.runnable
			? [{ src: this.test.src, testId: this.test.item.extId }]
			: Iterable.empty();
	}

	public get debuggable() {
		return this.test.item.debuggable
			? [{ src: this.test.src, testId: this.test.item.extId }]
			: Iterable.empty();
	}

	public get expandable() {
		return this.test.expand;
	}

	public get folder(): IWorkspaceFolder {
		return this.parentItem.folder;
	}

	public state = TestResultState.Unset;
	public retired = false;
	public ownState = TestResultState.Unset;

	constructor(public readonly test: InternalTestItem, public readonly parentItem: HierarchicalFolder | HierarchicalElement) {
		this.test = { ...test, item: { ...test.item } }; // clone since we Object.assign updatese
	}

	public update(patch: ITestItemUpdate) {
		applyTestItemUpdate(this.test, patch);
	}
}

/**
 * Workspace folder in the hierarcha view.
 */
export class HierarchicalFolder implements ITestTreeElement {
	public readonly children = new Set<HierarchicalElement>();
	public readonly parentItem = null;
	public readonly depth = 0;
	public computedState: TestResultState | undefined;

	public get treeId() {
		return generateUuid();
	}

	public get runnable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.runnable));
	}

	public get uri() {
		return this.folder.uri;
	}

	public get debuggable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.debuggable));
	}

	public get expandable() {
		return TestItemExpandState.Expanded;
	}

	public retired = false;
	public state = TestResultState.Unset;
	public ownState = TestResultState.Unset;

	constructor(public readonly folder: IWorkspaceFolder) { }

	public get label() {
		return this.folder.name;
	}
}
