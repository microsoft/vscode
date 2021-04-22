/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestItemTreeElement, TestTreeWorkspaceFolder } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { applyTestItemUpdate, InternalTestItem, ITestItemUpdate } from 'vs/workbench/contrib/testing/common/testCollection';

/**
 * Test tree element element that groups be hierarchy.
 */
export class ByLocationTestItemElement extends TestItemTreeElement {
	constructor(test: InternalTestItem, public readonly parent: ByLocationFolderElement | ByLocationTestItemElement) {
		super({ ...test, item: { ...test.item } }, parent);
	}

	public update(patch: ITestItemUpdate) {
		applyTestItemUpdate(this.test, patch);
	}
}

/**
 * Workspace folder in the location view.
 */
export class ByLocationFolderElement extends TestTreeWorkspaceFolder {
	public readonly children = new Set<ByLocationTestItemElement>();
}
