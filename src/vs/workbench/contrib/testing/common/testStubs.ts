/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestItem, TestRunState } from 'vs/workbench/api/common/extHostTypes';

export const stubTest = (label: string): TestItem => ({
	label,
	location: undefined,
	debuggable: true,
	runnable: true,
	description: ''
});

export const testStubs = {
	test: stubTest,
	nested: () => ({
		...stubTest('root'),
		children: [
			{ ...stubTest('a'), children: [stubTest('aa'), stubTest('ab')] },
			stubTest('b'),
		],
	}),
};

export const ReExportedTestRunState = TestRunState;
