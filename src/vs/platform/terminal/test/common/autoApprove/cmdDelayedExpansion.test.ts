/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { containsCmdDelayedExpansion } from '../../../common/autoApprove/cmdDelayedExpansion.js';

suite('containsCmdDelayedExpansion', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects balanced delayed environment-variable expansion', () => {
		assert.deepStrictEqual([
			containsCmdDelayedExpansion('!APPDATA!\\file.txt'),
			containsCmdDelayedExpansion('!TARGET!'),
			containsCmdDelayedExpansion('!VAR:~0,1!\\file.txt'),
			containsCmdDelayedExpansion('!ROOT!\\!NAME!'),
		], [true, true, true, true]);
	});

	test('ignores literal or unmatched exclamation marks', () => {
		assert.deepStrictEqual([
			containsCmdDelayedExpansion('file.txt'),
			containsCmdDelayedExpansion('important!.txt'),
			containsCmdDelayedExpansion('!APPDATA'),
			containsCmdDelayedExpansion('APPDATA!'),
			containsCmdDelayedExpansion('!!'),
		], [false, false, false, false, false]);
	});
});
