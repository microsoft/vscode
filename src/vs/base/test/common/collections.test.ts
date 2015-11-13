/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import collections = require('vs/base/common/collections');

suite('Collections', () => {
	test('contains', () => {
		assert(!collections.contains({}, 'toString'));
		assert(collections.contains({ toString: 123 }, 'toString'));
		assert(!collections.contains(Object.create(null), 'toString'));

		var dict = Object.create(null);
		dict['toString'] = 123;
		assert(collections.contains(dict, 'toString'));
	});

	test('forEach', () => {
		collections.forEach({}, () => assert(false));
		collections.forEach(Object.create(null), () => assert(false));

		var count = 0;
		collections.forEach({ toString: 123 }, () => count++);
		assert.equal(count, 1);

		count = 0;
		var dict = Object.create(null);
		dict['toString'] = 123;
		collections.forEach(dict, () => count++);
		assert.equal(count, 1);
	});

	test('remove', () => {
		assert(collections.remove({ 'far': 1 }, 'far'));
		assert(!collections.remove({ 'far': 1 }, 'boo'));
	});
});
