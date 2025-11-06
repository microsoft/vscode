/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('assert');
const { checkNodeVersion, checkCommand } = require('../../scripts/dev/doctor');

suite('doctor utility', function () {
	test('checkNodeVersion returns object with major and ok boolean', function () {
		const r = checkNodeVersion(0);
		assert.strictEqual(typeof r.major, 'number');
		assert.strictEqual(typeof r.ok, 'boolean');
	});

	test('checkCommand returns boolean for known commands', function () {
		// git should exist in most dev environments; if not, test still asserts boolean
		const git = checkCommand('git');
		assert.strictEqual(typeof git, 'boolean');
	});
});
