/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import decoder = require('vs/base/node/decoder');

suite('Decoder', () => {

	test('decoding', function() {
		var lineDecoder = new decoder.LineDecoder();
		var res = lineDecoder.write(new Buffer('hello'));
		assert.equal(res.length, 0);

		res = lineDecoder.write(new Buffer('\nworld'));
		assert.equal(res[0], 'hello');
		assert.equal(res.length, 1);

		assert.equal(lineDecoder.end(), 'world');
	});
});