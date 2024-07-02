/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { decodeAuthority } from 'vs/workbench/contrib/webview/common/webview';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('WebView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('decodeAuthority', () => {
		const encodedAuthority = 'https%3A%2F%2Fexample.com';
		const expectedDecodedAuthority = 'https://example.com';

		const actualDecodedAuthority = decodeAuthority(encodedAuthority);

		assert.strictEqual(actualDecodedAuthority, expectedDecodedAuthority);
	});

	test('decodeAuthority should throw an error for invalid input', () => {
		assert.rejects(async () => await decodeAuthority('not a valid input'));
	});
});
