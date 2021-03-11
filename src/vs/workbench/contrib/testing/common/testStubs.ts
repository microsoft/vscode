/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestItem, TestResult } from 'vs/workbench/api/common/extHostTypes';

export class StubTestItem extends TestItem {
	children: StubTestItem[] = [];
	parent: StubTestItem | undefined;
}

export const stubTestHierarchyProvider = {
	getChildren: (s: StubTestItem) => s.children,
	getParent: (s: StubTestItem) => s.parent,
};

export const stubTest = (label: string, idPrefix = 'id-', children: StubTestItem[] = []): StubTestItem => {
	const t = new StubTestItem(idPrefix + label, label, children.length > 0);
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
