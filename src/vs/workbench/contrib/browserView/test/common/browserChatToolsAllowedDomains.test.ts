/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isAllowedDomain } from '../../common/browserChatToolsAllowedDomains.js';

suite('browserChatToolsAllowedDomains', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty allowlist does not restrict', () => {
		assert.strictEqual(isAllowedDomain('https://example.com', []), true);
	});

	test('non-empty allowlist requires a host match', () => {
		assert.strictEqual(isAllowedDomain('https://example.com', ['localhost']), false);
		assert.strictEqual(isAllowedDomain('https://localhost/foo', ['localhost']), true);
	});

	test('file URLs always pass when allowlist is non-empty', () => {
		assert.strictEqual(isAllowedDomain('file:///tmp/x', ['localhost']), true);
	});

	test('wildcard patterns match apex and subdomains', () => {
		const allowed = ['*.example.com'];
		assert.strictEqual(isAllowedDomain('https://example.com/', allowed), true);
		assert.strictEqual(isAllowedDomain('https://app.example.com/', allowed), true);
		assert.strictEqual(isAllowedDomain('https://notexample.com/', allowed), false);
	});
});
