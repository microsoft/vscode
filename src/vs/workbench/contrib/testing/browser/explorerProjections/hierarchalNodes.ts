/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestExplorerTreeElement, TestItemTreeElement, TestTreeErrorMessage } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { applyTestItemUpdate, InternalTestItem, ITestItemUpdate } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * Test tree element element that groups be hierarchy.
 */
export class ByLocationTestItemElement extends TestItemTreeElement {
	private errorChild?: TestTreeErrorMessage;


	constructor(
		test: InternalTestItem,
		parent: null | ByLocationTestItemElement,
		protected readonly addedOrRemoved: (n: TestExplorerTreeElement) => void,
	) {
		super({ ...test, item: { ...test.item } }, parent);
		this.updateErrorVisiblity();
	}

	public update(patch: ITestItemUpdate) {
		applyTestItemUpdate(this.test, patch);
		this.updateErrorVisiblity();
	}

	private updateErrorVisiblity() {
		if (this.errorChild && !this.test.item.error) {
			this.addedOrRemoved(this.errorChild);
			this.children.delete(this.errorChild);
			this.errorChild = undefined;
		} else if (this.test.item.error && !this.errorChild) {
			this.errorChild = new TestTreeErrorMessage(this.test.item.error, this);
			this.children.add(this.errorChild);
			this.addedOrRemoved(this.errorChild);
		}
	}
}
