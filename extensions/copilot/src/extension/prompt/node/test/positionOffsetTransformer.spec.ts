/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { beforeEach, suite, test } from 'vitest';
import { PositionOffsetTransformer } from '../../../../platform/editing/common/positionOffsetTransformer';
import { Position, Range, TextEdit } from '../../../../vscodeTypes';

suite('PositionOffsetTransformer', () => {
	const sampleText = `line1\nline2\nline3`;

	let transformer: PositionOffsetTransformer;

	beforeEach(() => {
		transformer = new PositionOffsetTransformer(sampleText);
	});

	test('should initialize correctly', () => {
		assert.equal(transformer.getLineCount(), 3);
	});

	test('should get correct offset for a position', () => {
		const position = new Position(1, 2);
		const offset = transformer.getOffset(position);
		assert.equal(offset, 8); // 6 (line1\n) + 2 (line2)
	});

	test('should get correct position for an offset', () => {
		const offset = 8;
		const position = transformer.getPosition(offset);
		assert.equal(position.line, 1);
		assert.equal(position.character, 2);
	});

	test('should convert range to offset range and back', () => {
		const range = new Range(new Position(0, 1), new Position(1, 2));
		const offsetRange = transformer.toOffsetRange(range);
		assert.equal(offsetRange.start, 1);
		assert.equal(offsetRange.endExclusive, 8);

		const newRange = transformer.toRange(offsetRange);
		assert.equal(newRange.start.line, 0);
		assert.equal(newRange.start.character, 1);
		assert.equal(newRange.end.line, 1);
		assert.equal(newRange.end.character, 2);
	});

	test('should apply offset edits correctly', () => {
		const edits = [
			new TextEdit(new Range(new Position(0, 0), new Position(0, 5)), 'Hello'),
			new TextEdit(new Range(new Position(1, 0), new Position(1, 5)), 'World')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer.getText();
		assert.equal(newText, 'Hello\nWorld\nline3');
	});

	test('should validate position correctly', () => {
		const invalidPosition = new Position(10, 10);
		const validPosition = transformer.validatePosition(invalidPosition);
		assert.equal(validPosition.line, 2);
		assert.equal(validPosition.character, 5);
	});

	test('should validate range correctly', () => {
		const invalidRange = new Range(new Position(10, 10), new Position(20, 20));
		const validRange = transformer.validateRange(invalidRange);
		assert.equal(validRange.start.line, 2);
		assert.equal(validRange.start.character, 5);
		assert.equal(validRange.end.line, 2);
		assert.equal(validRange.end.character, 5);
	});

	test('should apply offset edits with insertion correctly', () => {
		const edits = [
			new TextEdit(new Range(new Position(0, 5), new Position(0, 5)), 'Hello '),
			new TextEdit(new Range(new Position(1, 5), new Position(1, 5)), ' World')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer.getText();
		assert.equal(newText, 'line1Hello \nline2 World\nline3');

		// Additional assertions
		assert.equal(transformer.getPosition(11).line, 0);
		assert.equal(transformer.getPosition(11).character, 11);
		assert.equal(transformer.getPosition(12).line, 1);
		assert.equal(transformer.getPosition(12).character, 0);
		assert.equal(transformer.getOffset(new Position(1, 0)), 12);
		assert.equal(transformer.getOffset(new Position(0, 11)), 11);
	});

	test('should apply offset edits with deletion correctly', () => {
		const edits = [
			new TextEdit(new Range(new Position(0, 0), new Position(0, 5)), ''),
			new TextEdit(new Range(new Position(1, 0), new Position(1, 5)), '')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer.getText();
		assert.equal(newText, '\n\nline3');

		// Additional assertions
		assert.equal(transformer.getPosition(0).line, 0);
		assert.equal(transformer.getPosition(0).character, 0);
		assert.equal(transformer.getPosition(1).line, 1);
		assert.equal(transformer.getPosition(1).character, 0);
		assert.equal(transformer.getOffset(new Position(0, 0)), 0);
		assert.equal(transformer.getOffset(new Position(1, 0)), 1);
		assert.equal(transformer.getOffset(new Position(2, 0)), 2);
	});

	test('should apply offset edits with mixed edits correctly', () => {
		const edits = [
			new TextEdit(new Range(new Position(0, 0), new Position(0, 5)), 'Hello'),
			new TextEdit(new Range(new Position(1, 0), new Position(1, 5)), 'World'),
			new TextEdit(new Range(new Position(2, 0), new Position(2, 5)), 'Test')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer.getText();
		assert.equal(newText, 'Hello\nWorld\nTest');

		// Additional assertions
		assert.equal(transformer.getPosition(5).line, 0);
		assert.equal(transformer.getPosition(5).character, 5);
		assert.equal(transformer.getPosition(6).line, 1);
		assert.equal(transformer.getPosition(6).character, 0);
		assert.equal(transformer.getOffset(new Position(1, 0)), 6);
	});

	test('should apply offset edits with multi-line insertion correctly', () => {
		const edits = [
			new TextEdit(new Range(new Position(0, 5), new Position(0, 5)), '\nInserted\nText\n')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer.getText();
		assert.equal(newText, 'line1\nInserted\nText\n\nline2\nline3');

		// Additional assertions
		assert.equal(transformer.getPosition(6).line, 1);
		assert.equal(transformer.getPosition(6).character, 0);
		assert.equal(transformer.getPosition(14).line, 1);
		assert.equal(transformer.getPosition(14).character, 8);
		assert.equal(transformer.getPosition(15).line, 2);
		assert.equal(transformer.getPosition(15).character, 0);
		assert.equal(transformer.getOffset(new Position(1, 0)), 6);
		assert.equal(transformer.getOffset(new Position(1, 8)), 14);
		assert.equal(transformer.getOffset(new Position(2, 0)), 15);
	});

	test('should apply offset edits with multi-line insertion correctly with CRLF', () => {
		const sampleTextWithCRLF = `line1\r\nline2\r\nline3`;
		transformer = new PositionOffsetTransformer(sampleTextWithCRLF);

		const edits = [
			new TextEdit(new Range(new Position(0, 5), new Position(0, 5)), '\r\nInserted\r\nText\r\n')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer.getText();
		assert.equal(newText, 'line1\r\nInserted\r\nText\r\n\r\nline2\r\nline3');

		// Additional assertions
		assert.equal(transformer.getPosition(7).line, 1);
		assert.equal(transformer.getPosition(7).character, 0);
		assert.equal(transformer.getPosition(15).line, 1);
		assert.equal(transformer.getPosition(15).character, 8);
		assert.equal(transformer.getPosition(17).line, 2);
		assert.equal(transformer.getPosition(17).character, 0);
		assert.equal(transformer.getOffset(new Position(1, 0)), 7);
		assert.equal(transformer.getOffset(new Position(1, 8)), 15);
		assert.equal(transformer.getOffset(new Position(2, 0)), 17);
	});
});
