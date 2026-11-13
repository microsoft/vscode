/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isLinux } from '../../../../base/common/platform.js';
import { extUri } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWorkingDirectoryScopeId, isMultiRootSession } from '../../common/agentHostWorkingDirectories.js';

suite('agentHostWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('scope identity supports case-preserving comparison without changing the default', () => {
		const upper = 'file:///workspace/App';
		const lower = 'file:///workspace/app';
		const other = 'file:///workspace/other';
		assert.deepStrictEqual({
			defaultCaseEqual: getWorkingDirectoryScopeId([upper]) === getWorkingDirectoryScopeId([lower]),
			explicitCaseEqual: getWorkingDirectoryScopeId([upper], extUri) === getWorkingDirectoryScopeId([lower], extUri),
			defaultSetEqual: getWorkingDirectoryScopeId([upper, other]) === getWorkingDirectoryScopeId([other, upper, upper]),
			explicitSetEqual: getWorkingDirectoryScopeId([upper, other], extUri) === getWorkingDirectoryScopeId([other, upper, upper], extUri),
		}, { defaultCaseEqual: !isLinux, explicitCaseEqual: false, defaultSetEqual: true, explicitSetEqual: true });
	});

	suite('isMultiRootSession', () => {
		test('is false for undefined, empty, and single-root sessions', () => {
			assert.deepStrictEqual([
				isMultiRootSession(undefined),
				isMultiRootSession([]),
				isMultiRootSession(['file:///workspace/primary']),
			], [false, false, false]);
		});

		test('is true for two or more working directories', () => {
			assert.deepStrictEqual([
				isMultiRootSession(['file:///workspace/a', 'file:///workspace/b']),
				isMultiRootSession(['file:///workspace/a', 'file:///workspace/b', 'file:///workspace/c']),
			], [true, true]);
		});
	});
});
