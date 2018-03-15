/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import uuid = require('vs/base/common/uuid');

suite('UUID', () => {
	test('generation', () => {
		var asHex = uuid.v4().asHex();
		assert.equal(asHex.length, 36);
		assert.equal(asHex[14], '4');
		assert.ok(asHex[19] === '8' || asHex[19] === '9' || asHex[19] === 'a' || asHex[19] === 'b');
	});

	test('parse', () => {
		var id = uuid.v4();
		var asHext = id.asHex();
		var id2 = uuid.parse(asHext);
		assert.equal(id.asHex(), id2.asHex());
	});
});
