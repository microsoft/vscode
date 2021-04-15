/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { TestItemImpl, TestItemStatus, TestResultState } from 'vs/workbench/api/common/extHostTypes';

export const stubTest = (label: string, idPrefix = 'id-', children: TestItemImpl[] = []): TestItemImpl => {
	const item = new TestItemImpl(idPrefix + label, label, URI.file('/'), undefined);
	if (children.length) {
		item.status = TestItemStatus.Pending;
		item.resolveHandler = () => {
			for (const child of children) {
				item.addChild(child);
			}

			item.status = TestItemStatus.Resolved;
		};
	}

	return item;
};

export const testStubs = {
	test: stubTest,
	nested: (idPrefix = 'id-') => stubTest('root', idPrefix, [
		stubTest('a', idPrefix, [stubTest('aa', idPrefix), stubTest('ab', idPrefix)]),
		stubTest('b', idPrefix),
	]),
};

export const ReExportedTestRunState = TestResultState;
