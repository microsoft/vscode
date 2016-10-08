/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import * as assert from 'assert';
import {LineStream} from 'vs/editor/common/modes/lineStream';

suite('Editor Modes - LineStream', () => {

	test('corner cases', () => {
		let noTokens = (lineStream) => {
			assert.equal(lineStream.pos(), 0);
			assert.ok(lineStream.eos());
		};

		noTokens(new LineStream(''));
	});

	test('advanceToEOS', () => {
		var lineStream = new LineStream('  var foo =bar("foo"); //x   ');

		assert.equal(lineStream.pos(), 0);
		lineStream.advanceToEOS();

		assert.ok(lineStream.eos(), 'Stream finished');
	});

	test('peek', () => {
		var lineStream = new LineStream('albert, bart, charlie, damon, erich');

		assert.equal(lineStream.peek(), 'a');
		lineStream.advance(1);

		assert.equal(lineStream.peek(), 'l');

		lineStream.advanceToEOS();
		assert.throws(() => { lineStream.peek(); });
	});

});
