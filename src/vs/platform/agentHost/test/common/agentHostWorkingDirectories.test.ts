/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isMultiRootSession } from '../../common/agentHostWorkingDirectories.js';

suite('agentHostWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
