/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as regex from 'vs/base/common/regex';

suite('Regex', () => {
	test('findAll', () => {
		assert.throws(() => regex.findAll(/a/, 'aaaa'));
		assert.deepEqual(regex.findAll(/a/g, 'aaaa'), ['a', 'a', 'a', 'a']);
		assert.deepEqual(regex.findAll(/a/g, 'abab'), ['a', 'a']);
	});
});