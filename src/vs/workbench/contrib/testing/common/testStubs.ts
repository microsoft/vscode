/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { TestItemImpl } from 'vs/workbench/api/common/extHostTestingPrivateApi';
import { MainThreadTestCollection } from 'vs/workbench/contrib/testing/common/mainThreadTestCollection';
import { TestSingleUseCollection } from 'vs/workbench/contrib/testing/test/common/ownedTestCollection';

export * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
export { TestItemImpl } from 'vs/workbench/api/common/extHostTestingPrivateApi';

/**
 * Gets a main thread test collection initialized with the given set of
 * roots/stubs.
 */
export const getInitializedMainTestCollection = async (singleUse = testStubs.nested()) => {
	const c = new MainThreadTestCollection(async (t, l) => singleUse.expand(t, l));
	await singleUse.expand(singleUse.root.id, Infinity);
	c.apply(singleUse.collectDiff());
	return c;
};

export const testStubs = {
	nested: (idPrefix = 'id-') => {
		const collection = new TestSingleUseCollection('ctrlId');
		collection.root.label = 'root';
		collection.resolveHandler = item => {
			if (item === undefined) {
				const a = new TestItemImpl('ctrlId', idPrefix + 'a', 'a', URI.file('/'));
				a.canResolveChildren = true;
				const b = new TestItemImpl('ctrlId', idPrefix + 'b', 'b', URI.file('/'));
				collection.root.children.replace([a, b]);
			} else if (item.id === idPrefix + 'a') {
				item.children.replace([
					new TestItemImpl('ctrlId', idPrefix + 'aa', 'aa', URI.file('/')),
					new TestItemImpl('ctrlId', idPrefix + 'ab', 'ab', URI.file('/')),
				]);
			}
		};

		return collection;
	},
};
