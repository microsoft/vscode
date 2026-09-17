/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { WorkingCopyOriginalDocument } from '../inline/workingCopies';

suite('WorkingCopyOriginalDocument', () => {

	test('should initialize with correct text and EOL sequence', () => {
		const text = 'Hello\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.transformer.getText(), doc.text);

		assert.strictEqual(doc.text, text);
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});

	test('should initialize with correct EOL sequence for \\r\\n', () => {
		const text = 'Hello\r\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.text, text);
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});

	test('should apply offset edits correctly', () => {
		const text = 'Hello\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.transformer.getText(), doc.text);

		const edits = new StringEdit([new StringReplacement(new OffsetRange(5, 5), ' Beautiful')]);
		doc.applyOffsetEdits(edits);
		assert.strictEqual(doc.text, 'Hello Beautiful\nWorld');
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});

	test('should apply multiple offset edits correctly', () => {
		const text = 'Hello\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.transformer.getText(), doc.text);

		const edits = new StringEdit([
			new StringReplacement(new OffsetRange(5, 5), ' Beautiful'),
			new StringReplacement(new OffsetRange(18, 18), '!')
		]);
		doc.applyOffsetEdits(edits);
		assert.strictEqual(doc.text, 'Hello Beautiful\nWorld!');
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});

	test('should maintain transformer state after applying edits', () => {
		const text = 'Hello\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.transformer.getText(), doc.text);

		const edits = new StringEdit([new StringReplacement(new OffsetRange(5, 5), ' Beautiful')]);
		doc.applyOffsetEdits(edits);
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});

	test('should compose applied edits correctly', () => {
		const text = 'Hello\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.transformer.getText(), doc.text);

		const edits1 = new StringEdit([new StringReplacement(new OffsetRange(5, 5), ' Beautiful')]);
		const edits2 = new StringEdit([new StringReplacement(new OffsetRange(21, 21), '!')]);
		doc.applyOffsetEdits(edits1);
		doc.applyOffsetEdits(edits2);
		assert.strictEqual(doc.text, 'Hello Beautiful\nWorld!');
		assert.strictEqual(doc.appliedEdits.replacements.length, 2);
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});

	test('should normalize EOL sequences in edits', () => {
		const text = 'Hello\r\nWorld';
		const doc = new WorkingCopyOriginalDocument(text);
		assert.strictEqual(doc.transformer.getText(), doc.text);

		const edits = new StringEdit([new StringReplacement(new OffsetRange(5, 5), ' Beautiful\n')]);
		doc.applyOffsetEdits(edits);
		assert.strictEqual(doc.text, 'Hello Beautiful\r\n\r\nWorld');
		assert.strictEqual(doc.transformer.getText(), doc.text);
	});
});
