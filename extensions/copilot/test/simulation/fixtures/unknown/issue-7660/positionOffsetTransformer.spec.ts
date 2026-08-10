/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { Position, Range, TextEdit } from '../../../../vscodeTypes';
import { PositionOffsetTransformer } from '../positionOffsetTransformer';

describe('PositionOffsetTransformer', () => {
	const sampleText = `line1
line2
line3`;

	let transformer: PositionOffsetTransformer;

	beforeEach(() => {
		transformer = new PositionOffsetTransformer(sampleText);
	});

	it('should initialize correctly', () => {
		expect(transformer.getLineCount()).to.equal(3);
	});

	it('should get correct offset for a position', () => {
		const position = new Position(1, 2);
		const offset = transformer.getOffset(position);
		expect(offset).to.equal(8); // 6 (line1\n) + 2 (line2)
	});

	it('should get correct position for an offset', () => {
		const offset = 8;
		const position = transformer.getPosition(offset);
		expect(position.line).to.equal(1);
		expect(position.character).to.equal(2);
	});

	it('should convert range to offset range and back', () => {
		const range = new Range(new Position(0, 1), new Position(1, 2));
		const offsetRange = transformer.toOffsetRange(range);
		expect(offsetRange.start).to.equal(1);
		expect(offsetRange.endExclusive).to.equal(8);

		const newRange = transformer.toRange(offsetRange);
		expect(newRange.start.line).to.equal(0);
		expect(newRange.start.character).to.equal(1);
		expect(newRange.end.line).to.equal(1);
		expect(newRange.end.character).to.equal(2);
	});

	it('should apply offset edits correctly', () => {
		const edits = [
			new TextEdit(new Range(new Position(0, 0), new Position(0, 5)), 'Hello'),
			new TextEdit(new Range(new Position(1, 0), new Position(1, 5)), 'World')
		];
		const offsetEdit = transformer.toOffsetEdit(edits);
		transformer.applyOffsetEdits(offsetEdit);

		const newText = transformer['_lines'].join('\n');
		expect(newText).to.equal('Hello\nWorld\nline3');
	});

	it('should validate position correctly', () => {
		const invalidPosition = new Position(10, 10);
		const validPosition = transformer.validatePosition(invalidPosition);
		expect(validPosition.line).to.equal(2);
		expect(validPosition.character).to.equal(5);
	});

	it('should validate range correctly', () => {
		const invalidRange = new Range(new Position(10, 10), new Position(20, 20));
		const validRange = transformer.validateRange(invalidRange);
		expect(validRange.start.line).to.equal(2);
		expect(validRange.start.character).to.equal(5);
		expect(validRange.end.line).to.equal(2);
		expect(validRange.end.character).to.equal(5);
	});
});
