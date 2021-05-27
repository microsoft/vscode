/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OwnedTestCollection, SingleUseTestCollection } from 'vs/workbench/contrib/testing/common/ownedTestCollection';
import { TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';

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
