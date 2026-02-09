/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import * as languages from '../../../common/languages.js';
import { NullState } from '../../../common/languages/nullTokenize.js';
import { EndOfLinePreference } from '../../../common/model.js';
import { TextModel } from '../../../common/model/textModel.js';
import { ModelLineProjectionData } from '../../../common/modelLineProjectionData.js';
import { IViewLineTokens } from '../../../common/tokens/lineTokens.js';
import { ViewLineData } from '../../../common/viewModel.js';
import { IModelLineProjection, ISimpleModel, createModelLineProjection } from '../../../common/viewModel/modelLineProjection.js';
import { MonospaceLineBreaksComputerFactory } from '../../../common/viewModel/monospaceLineBreaksComputer.js';
import { ViewModelLinesFromProjectedModel } from '../../../common/viewModel/viewModelLines.js';
import { TestConfiguration } from '../config/testConfiguration.js';
import { createTextModel } from '../../common/testTextModel.js';

suite('Editor ViewModel - SplitLinesCollection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('SplitLine', () => {
		let model1 = createModel('My First LineMy Second LineAnd another one');
		let line1 = createSplitLine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 0);

		assert.strictEqual(line1.getViewLineCount(), 3);
		assert.strictEqual(line1.getViewLineContent(model1, 1, 0), 'My First Line');
		assert.strictEqual(line1.getViewLineContent(model1, 1, 1), 'My Second Line');
		assert.strictEqual(line1.getViewLineContent(model1, 1, 2), 'And another one');
		assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 0), 14);
		assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 1), 15);
		assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 2), 16);
		for (let col = 1; col <= 14; col++) {
			assert.strictEqual(line1.getModelColumnOfViewPosition(0, col), col, 'getInputColumnOfOutputPosition(0, ' + col + ')');
		}
		for (let col = 1; col <= 15; col++) {
			assert.strictEqual(line1.getModelColumnOfViewPosition(1, col), 13 + col, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (let col = 1; col <= 16; col++) {
			assert.strictEqual(line1.getModelColumnOfViewPosition(2, col), 13 + 14 + col, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (let col = 1; col <= 13; col++) {
			assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (let col = 1 + 13; col <= 14 + 13; col++) {
			assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, col - 13), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
			assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, col - 13 - 14), 'getOutputPositionOfInputPosition(' + col + ')');
		}

		model1 = createModel('My First LineMy Second LineAnd another one');
		line1 = createSplitLine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 4);

		assert.strictEqual(line1.getViewLineCount(), 3);
		assert.strictEqual(line1.getViewLineContent(model1, 1, 0), 'My First Line');
		assert.strictEqual(line1.getViewLineContent(model1, 1, 1), '    My Second Line');
		assert.strictEqual(line1.getViewLineContent(model1, 1, 2), '    And another one');
		assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 0), 14);
		assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 1), 19);
		assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 2), 20);

		const actualViewColumnMapping: number[][] = [];
		for (let lineIndex = 0; lineIndex < line1.getViewLineCount(); lineIndex++) {
			const actualLineViewColumnMapping: number[] = [];
			for (let col = 1; col <= line1.getViewLineMaxColumn(model1, 1, lineIndex); col++) {
				actualLineViewColumnMapping.push(line1.getModelColumnOfViewPosition(lineIndex, col));
			}
			actualViewColumnMapping.push(actualLineViewColumnMapping);
		}
		assert.deepStrictEqual(actualViewColumnMapping, [
			[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
			[14, 14, 14, 14, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
			[28, 28, 28, 28, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
		]);

		for (let col = 1; col <= 13; col++) {
			assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), '6.getOutputPositionOfInputPosition(' + col + ')');
		}
		for (let col = 1 + 13; col <= 14 + 13; col++) {
			assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, 4 + col - 13), '7.getOutputPositionOfInputPosition(' + col + ')');
		}
		for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
			assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, 4 + col - 13 - 14), '8.getOutputPositionOfInputPosition(' + col + ')');
		}
	});

	function withSplitLinesCollection(text: string, callback: (model: TextModel, linesCollection: ViewModelLinesFromProjectedModel) => void): void {
		const config = new TestConfiguration({});
		const wrappingInfo = config.options.get(EditorOption.wrappingInfo);
		const fontInfo = config.options.get(EditorOption.fontInfo);
		const wordWrapBreakAfterCharacters = config.options.get(EditorOption.wordWrapBreakAfterCharacters);
		const wordWrapBreakBeforeCharacters = config.options.get(EditorOption.wordWrapBreakBeforeCharacters);
		const wrappingIndent = config.options.get(EditorOption.wrappingIndent);
		const wordBreak = config.options.get(EditorOption.wordBreak);
		const wrapOnEscapedLineFeeds = config.options.get(EditorOption.wrapOnEscapedLineFeeds);
		const lineBreaksComputerFactory = new MonospaceLineBreaksComputerFactory(wordWrapBreakBeforeCharacters, wordWrapBreakAfterCharacters);

		const model = createTextModel(text);

		const linesCollection = new ViewModelLinesFromProjectedModel(
			1,
			model,
			lineBreaksComputerFactory,
			lineBreaksComputerFactory,
			fontInfo,
			model.getOptions().tabSize,
			'simple',
			wrappingInfo.wrappingColumn,
			wrappingIndent,
			wordBreak,
			wrapOnEscapedLineFeeds
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
			assert.strictEqual(linesCollection.getViewLineCount(), 6);

			// getOutputIndentGuide
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(-1, -1), [0]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(0, 0), [0]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(1, 1), [0]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(2, 2), [1]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(3, 3), [0]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(4, 4), [0]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(5, 5), [1]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(6, 6), [0]);
			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(7, 7), [0]);

			assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(0, 7), [0, 1, 0, 0, 1, 0]);

			// getOutputLineContent
			assert.strictEqual(linesCollection.getViewLineContent(-1), 'int main() {');
			assert.strictEqual(linesCollection.getViewLineContent(0), 'int main() {');
			assert.strictEqual(linesCollection.getViewLineContent(1), 'int main() {');
			assert.strictEqual(linesCollection.getViewLineContent(2), '\tprintf("Hello world!");');
			assert.strictEqual(linesCollection.getViewLineContent(3), '}');
			assert.strictEqual(linesCollection.getViewLineContent(4), 'int main() {');
			assert.strictEqual(linesCollection.getViewLineContent(5), '\tprintf("Hello world!");');
			assert.strictEqual(linesCollection.getViewLineContent(6), '}');
			assert.strictEqual(linesCollection.getViewLineContent(7), '}');

			// getOutputLineMinColumn
			assert.strictEqual(linesCollection.getViewLineMinColumn(-1), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(0), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(1), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(2), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(3), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(4), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(5), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(6), 1);
			assert.strictEqual(linesCollection.getViewLineMinColumn(7), 1);

			// getOutputLineMaxColumn
			assert.strictEqual(linesCollection.getViewLineMaxColumn(-1), 13);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(0), 13);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(1), 13);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(2), 25);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(3), 2);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(4), 13);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(5), 25);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(6), 2);
			assert.strictEqual(linesCollection.getViewLineMaxColumn(7), 2);

			// convertOutputPositionToInputPosition
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(-1, 1), new Position(1, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(0, 1), new Position(1, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(1, 1), new Position(1, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(2, 1), new Position(2, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(3, 1), new Position(3, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(4, 1), new Position(4, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(5, 1), new Position(5, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(6, 1), new Position(6, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(7, 1), new Position(6, 1));
			assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(8, 1), new Position(6, 1));
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
			linesCollection.setHiddenAreas([
				new Range(1, 1, 3, 1),
				new Range(5, 1, 6, 1)
			]);

			const viewLineCount = linesCollection.getViewLineCount();
			assert.strictEqual(viewLineCount, 1, 'getOutputLineCount()');

			const modelLineCount = model.getLineCount();
			for (let lineNumber = 0; lineNumber <= modelLineCount + 1; lineNumber++) {
				const lineMinColumn = (lineNumber >= 1 && lineNumber <= modelLineCount) ? model.getLineMinColumn(lineNumber) : 1;
				const lineMaxColumn = (lineNumber >= 1 && lineNumber <= modelLineCount) ? model.getLineMaxColumn(lineNumber) : 1;
				for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
					const viewPosition = linesCollection.convertModelPositionToViewPosition(lineNumber, column);

					// validate view position
					let viewLineNumber = viewPosition.lineNumber;
					let viewColumn = viewPosition.column;
					if (viewLineNumber < 1) {
						viewLineNumber = 1;
					}
					const lineCount = linesCollection.getViewLineCount();
					if (viewLineNumber > lineCount) {
						viewLineNumber = lineCount;
					}
					const viewMinColumn = linesCollection.getViewLineMinColumn(viewLineNumber);
					const viewMaxColumn = linesCollection.getViewLineMaxColumn(viewLineNumber);
					if (viewColumn < viewMinColumn) {
						viewColumn = viewMinColumn;
					}
					if (viewColumn > viewMaxColumn) {
						viewColumn = viewMaxColumn;
					}
					const validViewPosition = new Position(viewLineNumber, viewColumn);
					assert.strictEqual(viewPosition.toString(), validViewPosition.toString(), 'model->view for ' + lineNumber + ', ' + column);
				}
			}

			for (let lineNumber = 0; lineNumber <= viewLineCount + 1; lineNumber++) {
				const lineMinColumn = linesCollection.getViewLineMinColumn(lineNumber);
				const lineMaxColumn = linesCollection.getViewLineMaxColumn(lineNumber);
				for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
					const modelPosition = linesCollection.convertViewPositionToModelPosition(lineNumber, column);
					const validModelPosition = model.validatePosition(modelPosition);
					assert.strictEqual(modelPosition.toString(), validModelPosition.toString(), 'view->model for ' + lineNumber + ', ' + column);
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

	let model: TextModel;
	let languageRegistration: IDisposable;

	setup(() => {
		let _lineIndex = 0;
		const tokenizationSupport: languages.ITokenizationSupport = {
			getInitialState: () => NullState,
			tokenize: undefined!,
			tokenizeEncoded: (line: string, hasEOL: boolean, state: languages.IState): languages.EncodedTokenizationResult => {
				const tokens = _tokens[_lineIndex++];

				const result = new Uint32Array(2 * tokens.length);
				for (let i = 0; i < tokens.length; i++) {
					result[2 * i] = tokens[i].startIndex;
					result[2 * i + 1] = (
						tokens[i].value << MetadataConsts.FOREGROUND_OFFSET
					);
				}
				return new languages.EncodedTokenizationResult(result, [], state);
			}
		};
		const LANGUAGE_ID = 'modelModeTest1';
		languageRegistration = languages.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
		model = createTextModel(_text.join('\n'), LANGUAGE_ID);
		// force tokenization
		model.tokenization.forceTokenization(model.getLineCount());
	});

	teardown(() => {
		model.dispose();
		languageRegistration.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestViewLineToken {
		endIndex: number;
		value: number;
	}

	function assertViewLineTokens(_actual: IViewLineTokens, expected: ITestViewLineToken[]): void {
		const actual: ITestViewLineToken[] = [];
		for (let i = 0, len = _actual.getCount(); i < len; i++) {
			actual[i] = {
				endIndex: _actual.getEndOffset(i),
				value: _actual.getForeground(i)
			};
		}
		assert.deepStrictEqual(actual, expected);
	}

	interface ITestMinimapLineRenderingData {
		content: string;
		minColumn: number;
		maxColumn: number;
		tokens: ITestViewLineToken[];
	}

	function assertMinimapLineRenderingData(actual: ViewLineData, expected: ITestMinimapLineRenderingData | null): void {
		if (actual === null && expected === null) {
			assert.ok(true);
			return;
		}
		if (expected === null) {
			assert.ok(false);
		}
		assert.strictEqual(actual.content, expected.content);
		assert.strictEqual(actual.minColumn, expected.minColumn);
		assert.strictEqual(actual.maxColumn, expected.maxColumn);
		assertViewLineTokens(actual.tokens, expected.tokens);
	}

	function assertMinimapLinesRenderingData(actual: ViewLineData[], expected: Array<ITestMinimapLineRenderingData | null>): void {
		assert.strictEqual(actual.length, expected.length);
		for (let i = 0; i < expected.length; i++) {
			assertMinimapLineRenderingData(actual[i], expected[i]);
		}
	}

	function assertAllMinimapLinesRenderingData(splitLinesCollection: ViewModelLinesFromProjectedModel, all: ITestMinimapLineRenderingData[]): void {
		const lineCount = all.length;
		for (let line = 1; line <= lineCount; line++) {
			assert.strictEqual(splitLinesCollection.getViewLineData(line).content, splitLinesCollection.getViewLineContent(line));
		}

		for (let start = 1; start <= lineCount; start++) {
			for (let end = start; end <= lineCount; end++) {
				const count = end - start + 1;
				for (let desired = Math.pow(2, count) - 1; desired >= 0; desired--) {
					const needed: boolean[] = [];
					const expected: Array<ITestMinimapLineRenderingData | null> = [];
					for (let i = 0; i < count; i++) {
						needed[i] = (desired & (1 << i)) ? true : false;
						expected[i] = (needed[i] ? all[start - 1 + i] : null);
					}
					const actual = splitLinesCollection.getViewLinesData(start, end, needed);

					assertMinimapLinesRenderingData(actual, expected);
					// Comment out next line to test all possible combinations
					break;
				}
			}
		}
	}

	test('getViewLinesData - no wrapping', () => {
		withSplitLinesCollection(model, 'off', 0, false, (splitLinesCollection) => {
			assert.strictEqual(splitLinesCollection.getViewLineCount(), 8);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);

			const _expected: ITestMinimapLineRenderingData[] = [
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

			splitLinesCollection.setHiddenAreas([new Range(2, 1, 4, 1)]);
			assert.strictEqual(splitLinesCollection.getViewLineCount(), 5);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), false);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), false);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), false);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);

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
		withSplitLinesCollection(model, 'wordWrapColumn', 30, false, (splitLinesCollection) => {
			assert.strictEqual(splitLinesCollection.getViewLineCount(), 12);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);

			const _expected: ITestMinimapLineRenderingData[] = [
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
					content: '            world");',
					minColumn: 13,
					maxColumn: 21,
					tokens: [
						{ endIndex: 18, value: 15 },
						{ endIndex: 20, value: 16 },
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
					content: '            world, this is a ',
					minColumn: 13,
					maxColumn: 30,
					tokens: [
						{ endIndex: 29, value: 28 },
					]
				},
				{
					content: '            somewhat longer ',
					minColumn: 13,
					maxColumn: 29,
					tokens: [
						{ endIndex: 28, value: 28 },
					]
				},
				{
					content: '            line");',
					minColumn: 13,
					maxColumn: 20,
					tokens: [
						{ endIndex: 17, value: 28 },
						{ endIndex: 19, value: 29 },
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

			splitLinesCollection.setHiddenAreas([new Range(2, 1, 4, 1)]);
			assert.strictEqual(splitLinesCollection.getViewLineCount(), 8);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), false);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), false);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), false);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
			assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);

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

	test('getViewLinesData - with wrapping and injected text', () => {
		model.deltaDecorations([], [{
			range: new Range(1, 9, 1, 9),
			options: {
				description: 'example',
				after: {
					content: 'very very long injected text that causes a line break',
					inlineClassName: 'myClassName'
				},
				showIfCollapsed: true,
			}
		}]);

		withSplitLinesCollection(model, 'wordWrapColumn', 30, false, (splitLinesCollection) => {
			assert.strictEqual(splitLinesCollection.getViewLineCount(), 14);

			assert.strictEqual(splitLinesCollection.getViewLineMaxColumn(1), 24);

			const _expected: ITestMinimapLineRenderingData[] = [
				{
					content: 'class Nivery very long ',
					minColumn: 1,
					maxColumn: 24,
					tokens: [
						{ endIndex: 5, value: 1 },
						{ endIndex: 6, value: 2 },
						{ endIndex: 8, value: 3 },
						{ endIndex: 23, value: 1 },
					]
				},
				{
					content: '    injected text that causes ',
					minColumn: 5,
					maxColumn: 31,
					tokens: [{ endIndex: 30, value: 1 }]
				},
				{
					content: '    a line breakce {',
					minColumn: 5,
					maxColumn: 21,
					tokens: [
						{ endIndex: 16, value: 1 },
						{ endIndex: 18, value: 3 },
						{ endIndex: 20, value: 4 }
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
					content: '            world");',
					minColumn: 13,
					maxColumn: 21,
					tokens: [
						{ endIndex: 18, value: 15 },
						{ endIndex: 20, value: 16 },
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
					content: '            world, this is a ',
					minColumn: 13,
					maxColumn: 30,
					tokens: [
						{ endIndex: 29, value: 28 },
					]
				},
				{
					content: '            somewhat longer ',
					minColumn: 13,
					maxColumn: 29,
					tokens: [
						{ endIndex: 28, value: 28 },
					]
				},
				{
					content: '            line");',
					minColumn: 13,
					maxColumn: 20,
					tokens: [
						{ endIndex: 17, value: 28 },
						{ endIndex: 19, value: 29 },
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

			const data = splitLinesCollection.getViewLinesData(1, 14, new Array(14).fill(true));
			assert.deepStrictEqual(
				data.map((d) => ({
					inlineDecorations: d.inlineDecorations?.map((d) => ({
						startOffset: d.startOffset,
						endOffset: d.endOffset,
					})),
				})),
				[
					{ inlineDecorations: [{ startOffset: 8, endOffset: 23 }] },
					{ inlineDecorations: [{ startOffset: 4, endOffset: 30 }] },
					{ inlineDecorations: [{ startOffset: 4, endOffset: 16 }] },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
					{ inlineDecorations: undefined },
				]
			);
		});
	});

	function withSplitLinesCollection(model: TextModel, wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded', wordWrapColumn: number, wrapOnEscapedLineFeeds: boolean, callback: (splitLinesCollection: ViewModelLinesFromProjectedModel) => void): void {
		const configuration = new TestConfiguration({
			wordWrap: wordWrap,
			wordWrapColumn: wordWrapColumn,
			wrappingIndent: 'indent'
		});
		const wrappingInfo = configuration.options.get(EditorOption.wrappingInfo);
		const fontInfo = configuration.options.get(EditorOption.fontInfo);
		const wordWrapBreakAfterCharacters = configuration.options.get(EditorOption.wordWrapBreakAfterCharacters);
		const wordWrapBreakBeforeCharacters = configuration.options.get(EditorOption.wordWrapBreakBeforeCharacters);
		const wrappingIndent = configuration.options.get(EditorOption.wrappingIndent);
		const wordBreak = configuration.options.get(EditorOption.wordBreak);

		const lineBreaksComputerFactory = new MonospaceLineBreaksComputerFactory(wordWrapBreakBeforeCharacters, wordWrapBreakAfterCharacters);

		const linesCollection = new ViewModelLinesFromProjectedModel(
			1,
			model,
			lineBreaksComputerFactory,
			lineBreaksComputerFactory,
			fontInfo,
			model.getOptions().tabSize,
			'simple',
			wrappingInfo.wrappingColumn,
			wrappingIndent,
			wordBreak,
			wrapOnEscapedLineFeeds
		);

		callback(linesCollection);

		configuration.dispose();
	}
});


function pos(lineNumber: number, column: number): Position {
	return new Position(lineNumber, column);
}

function createSplitLine(splitLengths: number[], breakingOffsetsVisibleColumn: number[], wrappedTextIndentWidth: number, isVisible: boolean = true): IModelLineProjection {
	return createModelLineProjection(createLineBreakData(splitLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth), isVisible);
}

function createLineBreakData(breakingLengths: number[], breakingOffsetsVisibleColumn: number[], wrappedTextIndentWidth: number): ModelLineProjectionData {
	const sums: number[] = [];
	for (let i = 0; i < breakingLengths.length; i++) {
		sums[i] = (i > 0 ? sums[i - 1] : 0) + breakingLengths[i];
	}
	return new ModelLineProjectionData(null, null, sums, breakingOffsetsVisibleColumn, wrappedTextIndentWidth);
}

function createModel(text: string): ISimpleModel {
	return {
		tokenization: {
			getLineTokens: (lineNumber: number) => {
				return null!;
			},
		},
		getLineContent: (lineNumber: number) => {
			return text;
		},
		getLineLength: (lineNumber: number) => {
			return text.length;
		},
		getLineMinColumn: (lineNumber: number) => {
			return 1;
		},
		getLineMaxColumn: (lineNumber: number) => {
			return text.length + 1;
		},
		getValueInRange: (range: IRange, eol?: EndOfLinePreference) => {
			return text.substring(range.startColumn - 1, range.endColumn - 1);
		}
	};
}
