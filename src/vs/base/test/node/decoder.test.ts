/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { LineDecoder } from 'vs/base/node/decoder';

suite('Decoder', () => {

	test('decoding', () => {
		const lineDecoder = new LineDecoder();
		let res = lineDecoder.write(Buffer.from('hello'));
		assert.strictEqual(res.length, 0);

		res = lineDecoder.write(Buffer.from('\nworld'));
		assert.strictEqual(res[0], 'hello');
		assert.strictEqual(res.length, 1);

		assert.strictEqual(lineDecoder.end(), 'world');
	});
});
