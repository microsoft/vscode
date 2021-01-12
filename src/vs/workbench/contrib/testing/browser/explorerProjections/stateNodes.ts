/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ITestTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { testStateNames } from 'vs/workbench/contrib/testing/common/constants';

/**
 * Base state node element, used in both name and location grouping.
 */
export class StateElement<T extends ITestTreeElement> implements ITestTreeElement {
	public computedState = this.state;

	public get treeId() {
		return `state:${this.state}`;
	}

	public readonly depth = 0;
	public readonly label = testStateNames[this.state];
	public readonly parentItem = null;
	public readonly children = new Set<T>();

	getChildren(): Iterable<T> {
		return this.children;
	}

	public get runnable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.runnable));
	}

	public get debuggable() {
		return Iterable.concatNested(Iterable.map(this.children, c => c.debuggable));
	}

	constructor(public readonly state: TestRunState) { }
}
