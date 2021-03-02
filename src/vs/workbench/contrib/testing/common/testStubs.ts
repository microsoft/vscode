/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestItem, TestRunState } from 'vs/workbench/api/common/extHostTypes';

export const stubTest = (label: string, idPrefix = 'id-'): TestItem => ({
	id: idPrefix + label,
	label,
	location: undefined,
	debuggable: true,
	runnable: true,
	description: ''
});

export const testStubs = {
	test: stubTest,
	nested: (idPrefix = 'id-') => ({
		...stubTest('root', idPrefix),
		children: [
			{ ...stubTest('a', idPrefix), children: [stubTest('aa', idPrefix), stubTest('ab', idPrefix)] },
			stubTest('b', idPrefix),
		],
	}),
};

export const ReExportedTestRunState = TestRunState;
