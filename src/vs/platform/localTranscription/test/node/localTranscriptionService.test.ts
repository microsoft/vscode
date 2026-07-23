/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TranscriptAccumulator } from '../../node/localTranscriptionService.js';

suite('TranscriptAccumulator punctuation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('breaks a run-on into sentences at a long pause and capitalizes', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('hello there', 0, 1);
		accumulator.addFinal('how are you', 2, 3); // 1.0s gap -> sentence break
		assert.strictEqual(accumulator.getText(), 'Hello there. How are you');
	});

	test('keeps a short pause within the same sentence', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('hello there', 0, 1);
		accumulator.addFinal('my friend', 1.2, 2); // 0.2s gap -> same sentence
		assert.strictEqual(accumulator.getText(), 'Hello there my friend');
	});

	test('does not double punctuate an already terminated segment', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('Hello there.', 0, 1);
		accumulator.addFinal('how are you', 2, 3); // long gap, but prior already ends with '.'
		assert.strictEqual(accumulator.getText(), 'Hello there. How are you');
	});

	test('capitalizes the standalone pronoun "i"', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('can i help you', 0, 1);
		assert.strictEqual(accumulator.getText(), 'Can I help you');
	});

	test('falls back to a space join when segment timing is unavailable', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('hello there', null, null);
		accumulator.addFinal('how are you', null, null);
		assert.strictEqual(accumulator.getText(), 'Hello there how are you');
	});

	test('strips filler words and their lengthened variants', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('um so uh i was umm thinking err about it', 0, 2);
		assert.strictEqual(accumulator.getText(), 'So I was thinking about it');
	});

	test('drops a segment that is only filler', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('lets go', 0, 1);
		accumulator.addFinal('um', 1.1, 1.4);
		accumulator.addFinal('to the store', 1.5, 2);
		assert.strictEqual(accumulator.getText(), 'Lets go to the store');
	});

	test('keeps real words that merely contain filler letters', () => {
		const accumulator = new TranscriptAccumulator();
		accumulator.addFinal('the summon duh huh number', 0, 1);
		assert.strictEqual(accumulator.getText(), 'The summon duh huh number');
	});
});
