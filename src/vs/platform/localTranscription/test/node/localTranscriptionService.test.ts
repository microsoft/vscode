/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TranscriptAccumulator } from '../../node/localTranscriptionService.js';

suite('TranscriptAccumulator', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('joins finalized segments without adding punctuation', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('hello there', 0, 1);
		accumulator.addFinal('how are you', 2, 3);
		assert.strictEqual(accumulator.getText(), 'hello there how are you');
	});

	test('strips filler words and their lengthened variants', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('um so uh i was umm thinking err about it', 0, 2);
		assert.strictEqual(accumulator.getText(), 'so i was thinking about it');
	});

	test('keeps surrounding punctuation when removing filler words', () => {
		const transcripts = ['um, hello', 'hello um.', 'um.', 'hello, um, there'].map(value => {
			const accumulator = new TranscriptAccumulator();
			accumulator.addFinal(value, 0, 1);
			return accumulator.getText();
		});
		assert.deepStrictEqual(transcripts, ['hello', 'hello.', '', 'hello, there']);
	});

	test('drops a segment that is only filler', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('lets go', 0, 1);
		accumulator.addFinal('um', 1.1, 1.4);
		accumulator.addFinal('to the store', 1.5, 2);
		assert.strictEqual(accumulator.getText(), 'lets go to the store');
	});

	test('strips filler words from the interim tail', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('hello', 0, 1);
		assert.strictEqual(accumulator.getText(' um, there uh.'), 'hello there');
	});

	test('keeps real words that merely contain filler letters', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('the summon duh huh number', 0, 1);
		assert.strictEqual(accumulator.getText(), 'the summon duh huh number');
	});
});
