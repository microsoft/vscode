/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { fromNow } from 'vs/base/common/date';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Date', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('fromNow', () => {
		test('appendAgoLabel', () => {
			strictEqual(fromNow(Date.now() - 35000), '35 secs');
			strictEqual(fromNow(Date.now() - 35000, false), '35 secs');
			strictEqual(fromNow(Date.now() - 35000, true), '35 secs ago');
		});
		test('useFullTimeWords', () => {
			strictEqual(fromNow(Date.now() - 35000), '35 secs');
			strictEqual(fromNow(Date.now() - 35000, undefined, false), '35 secs');
			strictEqual(fromNow(Date.now() - 35000, undefined, true), '35 seconds');
		});
		test('disallowNow', () => {
			strictEqual(fromNow(Date.now() - 5000), 'now');
			strictEqual(fromNow(Date.now() - 5000, undefined, undefined, false), 'now');
			strictEqual(fromNow(Date.now() - 5000, undefined, undefined, true), '5 secs');
		});
	});
});
