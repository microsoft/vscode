/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Position } from 'vs/editor/common/core/position';
import { CharacterHardWrappingLineMapping, CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ILineMapping, IModel, SplitLine, SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import { MockConfiguration } from 'vs/editor/test/common/mocks/mockConfiguration';
import { Model } from 'vs/editor/common/model/model';
import { toUint32Array } from 'vs/editor/common/core/uint';

suite('Editor ViewModel - SplitLinesCollection', () => {
	test('SplitLine', () => {
		var model1 = createModel('My First LineMy Second LineAnd another one');
		var line1 = createSplitLine([13, 14, 15], '');

		assert.equal(line1.getViewLineCount(), 3);
		assert.equal(line1.getViewLineContent(model1, 1, 0), 'My First Line');
		assert.equal(line1.getViewLineContent(model1, 1, 1), 'My Second Line');
		assert.equal(line1.getViewLineContent(model1, 1, 2), 'And another one');
		assert.equal(line1.getViewLineMaxColumn(model1, 1, 0), 14);
		assert.equal(line1.getViewLineMaxColumn(model1, 1, 1), 15);
		assert.equal(line1.getViewLineMaxColumn(model1, 1, 2), 16);
		for (var col = 1; col <= 14; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(0, col), col, 'getInputColumnOfOutputPosition(0, ' + col + ')');
		}
		for (var col = 1; col <= 15; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(1, col), 13 + col, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (var col = 1; col <= 16; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(2, col), 13 + 14 + col, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (var col = 1; col <= 13; col++) {
			assert.deepEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13; col <= 14 + 13; col++) {
			assert.deepEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, col - 13), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
			assert.deepEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, col - 13 - 14), 'getOutputPositionOfInputPosition(' + col + ')');
		}

		model1 = createModel('My First LineMy Second LineAnd another one');
		line1 = createSplitLine([13, 14, 15], '\t');

		assert.equal(line1.getViewLineCount(), 3);
		assert.equal(line1.getViewLineContent(model1, 1, 0), 'My First Line');
		assert.equal(line1.getViewLineContent(model1, 1, 1), '\tMy Second Line');
		assert.equal(line1.getViewLineContent(model1, 1, 2), '\tAnd another one');
		assert.equal(line1.getViewLineMaxColumn(model1, 1, 0), 14);
		assert.equal(line1.getViewLineMaxColumn(model1, 1, 1), 16);
		assert.equal(line1.getViewLineMaxColumn(model1, 1, 2), 17);
		for (var col = 1; col <= 14; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(0, col), col, 'getInputColumnOfOutputPosition(0, ' + col + ')');
		}
		for (var col = 1; col <= 1; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(1, 1), 13 + col, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (var col = 2; col <= 16; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(1, col), 13 + col - 1, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (var col = 1; col <= 1; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(2, col), 13 + 14 + col, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (var col = 2; col <= 17; col++) {
			assert.equal(line1.getModelColumnOfViewPosition(2, col), 13 + 14 + col - 1, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (var col = 1; col <= 13; col++) {
			assert.deepEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13; col <= 14 + 13; col++) {
			assert.deepEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, 1 + col - 13), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
			assert.deepEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, 1 + col - 13 - 14), 'getOutputPositionOfInputPosition(' + col + ')');
		}
	});

	function withSplitLinesCollection(text: string, callback: (model: Model, linesCollection: SplitLinesCollection) => void): void {
		let config = new MockConfiguration({});

		let hardWrappingLineMapperFactory = new CharacterHardWrappingLineMapperFactory(
			config.editor.wrappingInfo.wordWrapBreakBeforeCharacters,
			config.editor.wrappingInfo.wordWrapBreakAfterCharacters,
			config.editor.wrappingInfo.wordWrapBreakObtrusiveCharacters
		);

		let model = Model.createFromString([
			'int main() {',
			'\tprintf("Hello world!");',
			'}',
			'int main() {',
			'\tprintf("Hello world!");',
			'}',
		].join('\n'));

		let linesCollection = new SplitLinesCollection(
			model,
			hardWrappingLineMapperFactory,
			model.getOptions().tabSize,
			config.editor.wrappingInfo.wrappingColumn,
			config.editor.fontInfo.typicalFullwidthCharacterWidth / config.editor.fontInfo.typicalHalfwidthCharacterWidth,
			config.editor.wrappingInfo.wrappingIndent
		);

		callback(model, linesCollection);

		linesCollection.dispose();
		model.dispose();
		config.dispose();
	}

	test('Invalid line numbers', () => {

		const text = [
			'int main() {',
			'\tprintf("Hello world!");',
			'}',
			'int main() {',
			'\tprintf("Hello world!");',
			'}',
		].join('\n');

		withSplitLinesCollection(text, (model, linesCollection) => {
			assert.equal(linesCollection.getViewLineCount(), 6);

			// getOutputIndentGuide
			assert.equal(linesCollection.getViewLineIndentGuide(-1), 0);
			assert.equal(linesCollection.getViewLineIndentGuide(0), 0);
			assert.equal(linesCollection.getViewLineIndentGuide(1), 0);
			assert.equal(linesCollection.getViewLineIndentGuide(2), 1);
			assert.equal(linesCollection.getViewLineIndentGuide(3), 0);
			assert.equal(linesCollection.getViewLineIndentGuide(4), 0);
			assert.equal(linesCollection.getViewLineIndentGuide(5), 1);
			assert.equal(linesCollection.getViewLineIndentGuide(6), 0);
			assert.equal(linesCollection.getViewLineIndentGuide(7), 0);

			// getOutputLineContent
			assert.equal(linesCollection.getViewLineContent(-1), 'int main() {');
			assert.equal(linesCollection.getViewLineContent(0), 'int main() {');
			assert.equal(linesCollection.getViewLineContent(1), 'int main() {');
			assert.equal(linesCollection.getViewLineContent(2), '\tprintf("Hello world!");');
			assert.equal(linesCollection.getViewLineContent(3), '}');
			assert.equal(linesCollection.getViewLineContent(4), 'int main() {');
			assert.equal(linesCollection.getViewLineContent(5), '\tprintf("Hello world!");');
			assert.equal(linesCollection.getViewLineContent(6), '}');
			assert.equal(linesCollection.getViewLineContent(7), '}');

			// getOutputLineMinColumn
			assert.equal(linesCollection.getViewLineMinColumn(-1), 1);
			assert.equal(linesCollection.getViewLineMinColumn(0), 1);
			assert.equal(linesCollection.getViewLineMinColumn(1), 1);
			assert.equal(linesCollection.getViewLineMinColumn(2), 1);
			assert.equal(linesCollection.getViewLineMinColumn(3), 1);
			assert.equal(linesCollection.getViewLineMinColumn(4), 1);
			assert.equal(linesCollection.getViewLineMinColumn(5), 1);
			assert.equal(linesCollection.getViewLineMinColumn(6), 1);
			assert.equal(linesCollection.getViewLineMinColumn(7), 1);

			// getOutputLineMaxColumn
			assert.equal(linesCollection.getViewLineMaxColumn(-1), 13);
			assert.equal(linesCollection.getViewLineMaxColumn(0), 13);
			assert.equal(linesCollection.getViewLineMaxColumn(1), 13);
			assert.equal(linesCollection.getViewLineMaxColumn(2), 25);
			assert.equal(linesCollection.getViewLineMaxColumn(3), 2);
			assert.equal(linesCollection.getViewLineMaxColumn(4), 13);
			assert.equal(linesCollection.getViewLineMaxColumn(5), 25);
			assert.equal(linesCollection.getViewLineMaxColumn(6), 2);
			assert.equal(linesCollection.getViewLineMaxColumn(7), 2);

			// convertOutputPositionToInputPosition
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(-1, 1), new Position(1, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(0, 1), new Position(1, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(1, 1), new Position(1, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(2, 1), new Position(2, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(3, 1), new Position(3, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(4, 1), new Position(4, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(5, 1), new Position(5, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(6, 1), new Position(6, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(7, 1), new Position(6, 1));
			assert.deepEqual(linesCollection.convertViewPositionToModelPosition(8, 1), new Position(6, 1));
		});
	});

	test('issue #3662', () => {

		const text = [
			'int main() {',
			'\tprintf("Hello world!");',
			'}',
			'int main() {',
			'\tprintf("Hello world!");',
			'}',
		].join('\n');

		withSplitLinesCollection(text, (model, linesCollection) => {
			linesCollection.setHiddenAreas([{
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 3,
				endColumn: 1
			}, {
				startLineNumber: 5,
				startColumn: 1,
				endLineNumber: 6,
				endColumn: 1
			}], (eventType, payload) => {/*no-op*/ });

			let viewLineCount = linesCollection.getViewLineCount();
			assert.equal(viewLineCount, 1, 'getOutputLineCount()');

			let modelLineCount = model.getLineCount();
			for (let lineNumber = 0; lineNumber <= modelLineCount + 1; lineNumber++) {
				let lineMinColumn = (lineNumber >= 1 && lineNumber <= modelLineCount) ? model.getLineMinColumn(lineNumber) : 1;
				let lineMaxColumn = (lineNumber >= 1 && lineNumber <= modelLineCount) ? model.getLineMaxColumn(lineNumber) : 1;
				for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
					let viewPosition = linesCollection.convertModelPositionToViewPosition(lineNumber, column);

					// validate view position
					let viewLineNumber = viewPosition.lineNumber;
					let viewColumn = viewPosition.column;
					if (viewLineNumber < 1) {
						viewLineNumber = 1;
					}
					var lineCount = linesCollection.getViewLineCount();
					if (viewLineNumber > lineCount) {
						viewLineNumber = lineCount;
					}
					var viewMinColumn = linesCollection.getViewLineMinColumn(viewLineNumber);
					var viewMaxColumn = linesCollection.getViewLineMaxColumn(viewLineNumber);
					if (viewColumn < viewMinColumn) {
						viewColumn = viewMinColumn;
					}
					if (viewColumn > viewMaxColumn) {
						viewColumn = viewMaxColumn;
					}
					let validViewPosition = new Position(viewLineNumber, viewColumn);
					assert.equal(viewPosition.toString(), validViewPosition.toString(), 'model->view for ' + lineNumber + ', ' + column);
				}
			}

			for (let lineNumber = 0; lineNumber <= viewLineCount + 1; lineNumber++) {
				let lineMinColumn = linesCollection.getViewLineMinColumn(lineNumber);
				let lineMaxColumn = linesCollection.getViewLineMaxColumn(lineNumber);
				for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
					let modelPosition = linesCollection.convertViewPositionToModelPosition(lineNumber, column);
					let validModelPosition = model.validatePosition(modelPosition);
					assert.equal(modelPosition.toString(), validModelPosition.toString(), 'view->model for ' + lineNumber + ', ' + column);
				}
			}
		});
	});
});


function pos(lineNumber: number, column: number): Position {
	return new Position(lineNumber, column);
}

function createSplitLine(splitLengths: number[], wrappedLinesPrefix: string, isVisible: boolean = true): SplitLine {
	return new SplitLine(createLineMapping(splitLengths, wrappedLinesPrefix), isVisible);
}

function createLineMapping(breakingLengths: number[], wrappedLinesPrefix: string): ILineMapping {
	return new CharacterHardWrappingLineMapping(
		new PrefixSumComputer(toUint32Array(breakingLengths)),
		wrappedLinesPrefix
	);
}

function createModel(text: string): IModel {
	return {
		getLineTokens: (lineNumber: number, inaccurateTokensAcceptable?: boolean) => {
			return null;
		},
		getLineContent: (lineNumber: number) => {
			return text;
		},
		getLineMinColumn: (lineNumber: number) => {
			return 1;
		},
		getLineMaxColumn: (lineNumber: number) => {
			return text.length + 1;
		}
	};
}