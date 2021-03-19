/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestItem, TestResult } from 'vs/workbench/api/common/extHostTypes';

export const stubTest = (label: string, idPrefix = 'id-', children: TestItem[] = []): TestItem => {
	const t = new TestItem(idPrefix + label, label);
	t.children = children;
	return t;
};

export const testStubs = {
	test: stubTest,
	nested: (idPrefix = 'id-') => stubTest('root', idPrefix, [
		stubTest('a', idPrefix, [stubTest('aa', idPrefix), stubTest('ab', idPrefix)]),
		stubTest('b', idPrefix),
	]),
};

export const ReExportedTestRunState = TestResult;
