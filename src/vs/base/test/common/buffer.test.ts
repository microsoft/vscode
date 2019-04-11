/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as assert from 'assert';
import { hasBuffer, VSBuffer } from 'vs/base/common/buffer';

suite('Buffer', () => {

	if (hasBuffer) {
		test('issue #71993 - VSBuffer#toString returns numbers', () => {
			const data = new Uint8Array([1, 2, 3, 'h'.charCodeAt(0), 'i'.charCodeAt(0), 4, 5]).buffer;
			const buffer = VSBuffer.wrap(new Uint8Array(data, 3, 2));
			assert.deepEqual(buffer.toString(), 'hi');
		});
	}

});
