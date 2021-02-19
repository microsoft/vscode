/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OwnedTestCollection, SingleUseTestCollection } from 'vs/workbench/contrib/testing/common/ownedTestCollection';
import { TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { MainThreadTestCollection } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { testStubs } from 'vs/workbench/contrib/testing/common/testStubs';

export class TestSingleUseCollection extends SingleUseTestCollection {
	private idCounter = 0;

	public get itemToInternal() {
		return this.testItemToInternal;
	}

	public get currentDiff() {
		return this.diff;
	}

	protected getId() {
		return String(this.idCounter++);
	}

	public setDiff(diff: TestsDiff) {
		this.diff = diff;
	}
}

export class TestOwnedTestCollection extends OwnedTestCollection {
	public get idToInternal() {
		return this.testIdToInternal;
	}

	public createForHierarchy(publishDiff: (diff: TestsDiff) => void = () => undefined) {
		return new TestSingleUseCollection(this.testIdToInternal, publishDiff);
	}
}

/**
 * Gets a main thread test collection initialized with the given set of
 * roots/stubs.
 */
export const getInitializedMainTestCollection = (root = testStubs.nested()) => {
	const c = new MainThreadTestCollection(0);
	const singleUse = new TestSingleUseCollection(new Map(), () => undefined);
	singleUse.addRoot(root, 'provider');
	c.apply(singleUse.collectDiff());
	return c;
};
