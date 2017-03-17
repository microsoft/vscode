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
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import { Model } from 'vs/editor/common/model/model';
import { toUint32Array } from 'vs/editor/common/core/uint';
import * as modes from 'vs/editor/common/modes';
import { NULL_STATE } from 'vs/editor/common/modes/nullMode';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { ViewLineData, ViewEventsCollector } from 'vs/editor/common/viewModel/viewModel';
import { Range } from 'vs/editor/common/core/range';

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
		let config = new TestConfiguration({});

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
			linesCollection.setHiddenAreas(new ViewEventsCollector(), [{
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 3,
				endColumn: 1
			}, {
				startLineNumber: 5,
				startColumn: 1,
				endLineNumber: 6,
				endColumn: 1
			}]);

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

suite('SplitLinesCollection', () => {

	const _text = [
		'class Nice {',
		'	function hi() {',
		'		console.log("Hello world");',
		'	}',
		'	function hello() {',
		'		console.log("Hello world, this is a somewhat longer line");',
		'	}',
		'}',
	];

	const _tokens = [
		[
			{ startIndex: 0, value: 1 },
			{ startIndex: 5, value: 2 },
			{ startIndex: 6, value: 3 },
			{ startIndex: 10, value: 4 },
		],
		[
			{ startIndex: 0, value: 5 },
			{ startIndex: 1, value: 6 },
			{ startIndex: 9, value: 7 },
			{ startIndex: 10, value: 8 },
			{ startIndex: 12, value: 9 },
		],
		[
			{ startIndex: 0, value: 10 },
			{ startIndex: 2, value: 11 },
			{ startIndex: 9, value: 12 },
			{ startIndex: 10, value: 13 },
			{ startIndex: 13, value: 14 },
			{ startIndex: 14, value: 15 },
			{ startIndex: 27, value: 16 },
		],
		[
			{ startIndex: 0, value: 17 },
		],
		[
			{ startIndex: 0, value: 18 },
			{ startIndex: 1, value: 19 },
			{ startIndex: 9, value: 20 },
			{ startIndex: 10, value: 21 },
			{ startIndex: 15, value: 22 },
		],
		[
			{ startIndex: 0, value: 23 },
			{ startIndex: 2, value: 24 },
			{ startIndex: 9, value: 25 },
			{ startIndex: 10, value: 26 },
			{ startIndex: 13, value: 27 },
			{ startIndex: 14, value: 28 },
			{ startIndex: 59, value: 29 },
		],
		[
			{ startIndex: 0, value: 30 },
		],
		[
			{ startIndex: 0, value: 31 },
		]
	];

	let model: Model = null;
	let languageRegistration: IDisposable = null;

	setup(() => {
		let _lineIndex = 0;
		const tokenizationSupport: modes.ITokenizationSupport = {
			getInitialState: () => NULL_STATE,
			tokenize: undefined,
			tokenize2: (line: string, state: modes.IState): TokenizationResult2 => {
				let tokens = _tokens[_lineIndex++];

				let result = new Uint32Array(2 * tokens.length);
				for (let i = 0; i < tokens.length; i++) {
					result[2 * i] = tokens[i].startIndex;
					result[2 * i + 1] = (
						tokens[i].value << modes.MetadataConsts.FOREGROUND_OFFSET
					);
				}
				return new TokenizationResult2(result, state);
			}
		};
		const LANGUAGE_ID = 'modelModeTest1';
		languageRegistration = modes.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		model = Model.createFromString(_text.join('\n'), undefined, new modes.LanguageIdentifier(LANGUAGE_ID, 0));
		// force tokenization
		model.forceTokenization(model.getLineCount());
	});

	teardown(() => {
		model.dispose();
		model = null;
		languageRegistration.dispose();
		languageRegistration = null;
	});


	interface ITestViewLineToken {
		endIndex: number;
		value: number;
	}

	function assertViewLineTokens(actual: ViewLineToken[], expected: ITestViewLineToken[]): void {
		let _actual = actual.map((token) => {
			return {
				endIndex: token.endIndex,
				value: token.getForeground()
			};
		});
		assert.deepEqual(_actual, expected);
	}

	interface ITestMinimapLineRenderingData {
		content: string;
		minColumn: number;
		maxColumn: number;
		tokens: ITestViewLineToken[];
	}

	function assertMinimapLineRenderingData(actual: ViewLineData, expected: ITestMinimapLineRenderingData): void {
		if (actual === null && expected === null) {
			assert.ok(true);
			return;
		}
		assert.equal(actual.content, expected.content);
		assert.equal(actual.minColumn, expected.minColumn);
		assert.equal(actual.maxColumn, expected.maxColumn);
		assertViewLineTokens(actual.tokens, expected.tokens);
	}

	function assertMinimapLinesRenderingData(actual: ViewLineData[], expected: ITestMinimapLineRenderingData[]): void {
		assert.equal(actual.length, expected.length);
		for (let i = 0; i < expected.length; i++) {
			assertMinimapLineRenderingData(actual[i], expected[i]);
		}
	}

	function assertAllMinimapLinesRenderingData(splitLinesCollection: SplitLinesCollection, all: ITestMinimapLineRenderingData[]): void {
		let lineCount = all.length;
		for (let start = 1; start <= lineCount; start++) {
			for (let end = start; end <= lineCount; end++) {
				let count = end - start + 1;
				for (let desired = Math.pow(2, count) - 1; desired >= 0; desired--) {
					let needed: boolean[] = [];
					let expected: ITestMinimapLineRenderingData[] = [];
					for (let i = 0; i < count; i++) {
						needed[i] = (desired & (1 << i)) ? true : false;
						expected[i] = (needed[i] ? all[start - 1 + i] : null);
					}
					let actual = splitLinesCollection.getViewLinesData(start, end, needed);
					assertMinimapLinesRenderingData(actual, expected);
					// Comment out next line to test all possible combinations
					break;
				}
			}
		}
	}

	test('getViewLinesData - no wrapping', () => {
		withSplitLinesCollection(model, 'off', 0, (splitLinesCollection) => {
			assert.equal(splitLinesCollection.getViewLineCount(), 8);
			assert.equal(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(2, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(3, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(4, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(8, 1), true);

			let _expected: ITestMinimapLineRenderingData[] = [
				{
					content: 'class Nice {',
					minColumn: 1,
					maxColumn: 13,
					tokens: [
						{ endIndex: 5, value: 1 },
						{ endIndex: 6, value: 2 },
						{ endIndex: 10, value: 3 },
						{ endIndex: 12, value: 4 },
					]
				},
				{
					content: '	function hi() {',
					minColumn: 1,
					maxColumn: 17,
					tokens: [
						{ endIndex: 1, value: 5 },
						{ endIndex: 9, value: 6 },
						{ endIndex: 10, value: 7 },
						{ endIndex: 12, value: 8 },
						{ endIndex: 16, value: 9 },
					]
				},
				{
					content: '		console.log("Hello world");',
					minColumn: 1,
					maxColumn: 30,
					tokens: [
						{ endIndex: 2, value: 10 },
						{ endIndex: 9, value: 11 },
						{ endIndex: 10, value: 12 },
						{ endIndex: 13, value: 13 },
						{ endIndex: 14, value: 14 },
						{ endIndex: 27, value: 15 },
						{ endIndex: 29, value: 16 },
					]
				},
				{
					content: '	}',
					minColumn: 1,
					maxColumn: 3,
					tokens: [
						{ endIndex: 2, value: 17 },
					]
				},
				{
					content: '	function hello() {',
					minColumn: 1,
					maxColumn: 20,
					tokens: [
						{ endIndex: 1, value: 18 },
						{ endIndex: 9, value: 19 },
						{ endIndex: 10, value: 20 },
						{ endIndex: 15, value: 21 },
						{ endIndex: 19, value: 22 },
					]
				},
				{
					content: '		console.log("Hello world, this is a somewhat longer line");',
					minColumn: 1,
					maxColumn: 62,
					tokens: [
						{ endIndex: 2, value: 23 },
						{ endIndex: 9, value: 24 },
						{ endIndex: 10, value: 25 },
						{ endIndex: 13, value: 26 },
						{ endIndex: 14, value: 27 },
						{ endIndex: 59, value: 28 },
						{ endIndex: 61, value: 29 },
					]
				},
				{
					minColumn: 1,
					maxColumn: 3,
					content: '	}',
					tokens: [
						{ endIndex: 2, value: 30 },
					]
				},
				{
					minColumn: 1,
					maxColumn: 2,
					content: '}',
					tokens: [
						{ endIndex: 1, value: 31 },
					]
				}
			];

			assertAllMinimapLinesRenderingData(splitLinesCollection, [
				_expected[0],
				_expected[1],
				_expected[2],
				_expected[3],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
			]);

			splitLinesCollection.setHiddenAreas(new ViewEventsCollector(), [new Range(2, 1, 4, 1)]);
			assert.equal(splitLinesCollection.getViewLineCount(), 5);
			assert.equal(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(2, 1), false);
			assert.equal(splitLinesCollection.modelPositionIsVisible(3, 1), false);
			assert.equal(splitLinesCollection.modelPositionIsVisible(4, 1), false);
			assert.equal(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(8, 1), true);

			assertAllMinimapLinesRenderingData(splitLinesCollection, [
				_expected[0],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
			]);
		});
	});

	test('getViewLinesData - with wrapping', () => {
		withSplitLinesCollection(model, 'wordWrapColumn', 30, (splitLinesCollection) => {
			assert.equal(splitLinesCollection.getViewLineCount(), 12);
			assert.equal(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(2, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(3, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(4, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(8, 1), true);

			let _expected: ITestMinimapLineRenderingData[] = [
				{
					content: 'class Nice {',
					minColumn: 1,
					maxColumn: 13,
					tokens: [
						{ endIndex: 5, value: 1 },
						{ endIndex: 6, value: 2 },
						{ endIndex: 10, value: 3 },
						{ endIndex: 12, value: 4 },
					]
				},
				{
					content: '	function hi() {',
					minColumn: 1,
					maxColumn: 17,
					tokens: [
						{ endIndex: 1, value: 5 },
						{ endIndex: 9, value: 6 },
						{ endIndex: 10, value: 7 },
						{ endIndex: 12, value: 8 },
						{ endIndex: 16, value: 9 },
					]
				},
				{
					content: '		console.log("Hello ',
					minColumn: 1,
					maxColumn: 22,
					tokens: [
						{ endIndex: 2, value: 10 },
						{ endIndex: 9, value: 11 },
						{ endIndex: 10, value: 12 },
						{ endIndex: 13, value: 13 },
						{ endIndex: 14, value: 14 },
						{ endIndex: 21, value: 15 },
					]
				},
				{
					content: '			world");',
					minColumn: 4,
					maxColumn: 12,
					tokens: [
						{ endIndex: 9, value: 15 },
						{ endIndex: 11, value: 16 },
					]
				},
				{
					content: '	}',
					minColumn: 1,
					maxColumn: 3,
					tokens: [
						{ endIndex: 2, value: 17 },
					]
				},
				{
					content: '	function hello() {',
					minColumn: 1,
					maxColumn: 20,
					tokens: [
						{ endIndex: 1, value: 18 },
						{ endIndex: 9, value: 19 },
						{ endIndex: 10, value: 20 },
						{ endIndex: 15, value: 21 },
						{ endIndex: 19, value: 22 },
					]
				},
				{
					content: '		console.log("Hello ',
					minColumn: 1,
					maxColumn: 22,
					tokens: [
						{ endIndex: 2, value: 23 },
						{ endIndex: 9, value: 24 },
						{ endIndex: 10, value: 25 },
						{ endIndex: 13, value: 26 },
						{ endIndex: 14, value: 27 },
						{ endIndex: 21, value: 28 },
					]
				},
				{
					content: '			world, this is a ',
					minColumn: 4,
					maxColumn: 21,
					tokens: [
						{ endIndex: 20, value: 28 },
					]
				},
				{
					content: '			somewhat longer ',
					minColumn: 4,
					maxColumn: 20,
					tokens: [
						{ endIndex: 19, value: 28 },
					]
				},
				{
					content: '			line");',
					minColumn: 4,
					maxColumn: 11,
					tokens: [
						{ endIndex: 8, value: 28 },
						{ endIndex: 10, value: 29 },
					]
				},
				{
					content: '	}',
					minColumn: 1,
					maxColumn: 3,
					tokens: [
						{ endIndex: 2, value: 30 },
					]
				},
				{
					content: '}',
					minColumn: 1,
					maxColumn: 2,
					tokens: [
						{ endIndex: 1, value: 31 },
					]
				}
			];

			assertAllMinimapLinesRenderingData(splitLinesCollection, [
				_expected[0],
				_expected[1],
				_expected[2],
				_expected[3],
				_expected[4],
				_expected[5],
				_expected[6],
				_expected[7],
				_expected[8],
				_expected[9],
				_expected[10],
				_expected[11],
			]);

			splitLinesCollection.setHiddenAreas(new ViewEventsCollector(), [new Range(2, 1, 4, 1)]);
			assert.equal(splitLinesCollection.getViewLineCount(), 8);
			assert.equal(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(2, 1), false);
			assert.equal(splitLinesCollection.modelPositionIsVisible(3, 1), false);
			assert.equal(splitLinesCollection.modelPositionIsVisible(4, 1), false);
			assert.equal(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.equal(splitLinesCollection.modelPositionIsVisible(8, 1), true);

			assertAllMinimapLinesRenderingData(splitLinesCollection, [
				_expected[0],
				_expected[5],
				_expected[6],
				_expected[7],
				_expected[8],
				_expected[9],
				_expected[10],
				_expected[11],
			]);
		});
	});

	function withSplitLinesCollection(model: Model, wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded', wordWrapColumn: number, callback: (splitLinesCollection: SplitLinesCollection) => void): void {
		let configuration = new TestConfiguration({
			wordWrap: wordWrap,
			wordWrapColumn: wordWrapColumn,
			wrappingIndent: 'indent'
		});

		let factory = new CharacterHardWrappingLineMapperFactory(
			configuration.editor.wrappingInfo.wordWrapBreakBeforeCharacters,
			configuration.editor.wrappingInfo.wordWrapBreakAfterCharacters,
			configuration.editor.wrappingInfo.wordWrapBreakObtrusiveCharacters
		);

		let linesCollection = new SplitLinesCollection(
			model,
			factory,
			model.getOptions().tabSize,
			configuration.editor.wrappingInfo.wrappingColumn,
			configuration.editor.fontInfo.typicalFullwidthCharacterWidth / configuration.editor.fontInfo.typicalHalfwidthCharacterWidth,
			configuration.editor.wrappingInfo.wrappingIndent
		);

		callback(linesCollection);

		configuration.dispose();
	}
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
		getLineTokens: (lineNumber: number) => {
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