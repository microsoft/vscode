/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Browsers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('all', () => {
		assert(!(isWindows && isMacintosh));
	});
});
