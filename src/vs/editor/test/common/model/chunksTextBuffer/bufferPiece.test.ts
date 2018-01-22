/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { BufferPiece } from 'vs/editor/common/model/chunksTextBuffer/bufferPiece';

suite('BufferPiece', () => {
	test('findLineStartBeforeOffset', () => {
		let piece = new BufferPiece([
			'Line1\r\n',
			'l2\n',
			'another\r',
			'and\r\n',
			'finally\n',
			'last'
		].join(''));

		assert.equal(piece.length(), 35);
		assert.deepEqual(piece.findLineStartBeforeOffset(0), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(1), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(2), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(3), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(4), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(5), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(6), -1);
		assert.deepEqual(piece.findLineStartBeforeOffset(7), 0);
		assert.deepEqual(piece.findLineStartBeforeOffset(8), 0);
		assert.deepEqual(piece.findLineStartBeforeOffset(9), 0);
		assert.deepEqual(piece.findLineStartBeforeOffset(10), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(11), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(12), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(13), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(14), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(15), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(16), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(17), 1);
		assert.deepEqual(piece.findLineStartBeforeOffset(18), 2);
		assert.deepEqual(piece.findLineStartBeforeOffset(19), 2);
		assert.deepEqual(piece.findLineStartBeforeOffset(20), 2);
		assert.deepEqual(piece.findLineStartBeforeOffset(21), 2);
		assert.deepEqual(piece.findLineStartBeforeOffset(22), 2);
		assert.deepEqual(piece.findLineStartBeforeOffset(23), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(24), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(25), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(26), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(27), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(28), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(29), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(30), 3);
		assert.deepEqual(piece.findLineStartBeforeOffset(31), 4);
		assert.deepEqual(piece.findLineStartBeforeOffset(32), 4);
		assert.deepEqual(piece.findLineStartBeforeOffset(33), 4);
		assert.deepEqual(piece.findLineStartBeforeOffset(34), 4);
		assert.deepEqual(piece.findLineStartBeforeOffset(35), 4);
		assert.deepEqual(piece.findLineStartBeforeOffset(36), 4);
	});
});
