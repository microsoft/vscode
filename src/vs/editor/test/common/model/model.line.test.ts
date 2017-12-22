/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { ILineEdit, computeIndentLevel } from 'vs/editor/common/model/modelLine';
import { LanguageIdentifier, MetadataConsts } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { ViewLineToken, ViewLineTokenFactory } from 'vs/editor/test/common/core/viewLineToken';
import { EditableTextModel } from 'vs/editor/common/model/editableTextModel';
import { TextModel } from 'vs/editor/common/model/textModel';
import { RawTextSource } from 'vs/editor/common/model/textSource';
import { applyLineEdits, splitLine } from 'vs/editor/common/model/textBuffer';

function assertLineTokens(__actual: LineTokens, _expected: TestToken[]): void {
	let tmp = TestToken.toTokens(_expected);
	LineTokens.convertToEndOffset(tmp, __actual.getLineContent().length);
	let expected = ViewLineTokenFactory.inflateArr(tmp);
	let _actual = __actual.inflate();
	interface ITestToken {
		endIndex: number;
		type: string;
	}
	let actual: ITestToken[] = [];
	for (let i = 0, len = _actual.getCount(); i < len; i++) {
		actual[i] = {
			endIndex: _actual.getEndOffset(i),
			type: _actual.getClassName(i)
		};
	}
	let decode = (token: ViewLineToken) => {
		return {
			endIndex: token.endIndex,
			type: token.getType()
		};
	};
	assert.deepEqual(actual, expected.map(decode));
}

suite('ModelLine - getIndentLevel', () => {
	function assertIndentLevel(text: string, expected: number, tabSize: number = 4): void {
		let actual = computeIndentLevel(text, tabSize);
		assert.equal(actual, expected, text);
	}

	test('getIndentLevel', () => {
		assertIndentLevel('', -1);
		assertIndentLevel(' ', -1);
		assertIndentLevel('   \t', -1);
		assertIndentLevel('Hello', 0);
		assertIndentLevel(' Hello', 1);
		assertIndentLevel('   Hello', 3);
		assertIndentLevel('\tHello', 4);
		assertIndentLevel(' \tHello', 4);
		assertIndentLevel('  \tHello', 4);
		assertIndentLevel('   \tHello', 4);
		assertIndentLevel('    \tHello', 8);
		assertIndentLevel('     \tHello', 8);
		assertIndentLevel('\t Hello', 5);
		assertIndentLevel('\t \tHello', 8);
	});
});

suite('Editor Model - modelLine.applyEdits text', () => {

	function testEdits(initial: string, edits: ILineEdit[], expected: string): void {
		const actual = applyLineEdits(initial, edits);
		assert.equal(actual, expected);
	}

	function editOp(startColumn: number, endColumn: number, text: string): ILineEdit {
		return {
			startColumn: startColumn,
			endColumn: endColumn,
			text: text
		};
	}

	test('single insert 1', () => {
		testEdits(
			'',
			[
				editOp(1, 1, 'Hello world')
			],
			'Hello world'
		);
	});

	test('single insert 2', () => {
		testEdits(
			'Hworld',
			[
				editOp(2, 2, 'ello ')
			],
			'Hello world'
		);
	});

	test('multiple inserts 1', () => {
		testEdits(
			'Hw',
			[
				editOp(2, 2, 'ello '),
				editOp(3, 3, 'orld')
			],
			'Hello world'
		);
	});

	test('multiple inserts 2', () => {
		testEdits(
			'Hw,',
			[
				editOp(2, 2, 'ello '),
				editOp(3, 3, 'orld'),
				editOp(4, 4, ' this is H.A.L.')
			],
			'Hello world, this is H.A.L.'
		);
	});

	test('single delete 1', () => {
		testEdits(
			'Hello world',
			[
				editOp(1, 12, '')
			],
			''
		);
	});

	test('single delete 2', () => {
		testEdits(
			'Hello world',
			[
				editOp(2, 7, '')
			],
			'Hworld'
		);
	});

	test('multiple deletes 1', () => {
		testEdits(
			'Hello world',
			[
				editOp(2, 7, ''),
				editOp(8, 12, '')
			],
			'Hw'
		);
	});

	test('multiple deletes 2', () => {
		testEdits(
			'Hello world, this is H.A.L.',
			[
				editOp(2, 7, ''),
				editOp(8, 12, ''),
				editOp(13, 28, '')
			],
			'Hw,'
		);
	});

	test('single replace 1', () => {
		testEdits(
			'',
			[
				editOp(1, 1, 'Hello world')
			],
			'Hello world'
		);
	});

	test('single replace 2', () => {
		testEdits(
			'H1234world',
			[
				editOp(2, 6, 'ello ')
			],
			'Hello world'
		);
	});

	test('multiple replace 1', () => {
		testEdits(
			'H123w321',
			[
				editOp(2, 5, 'ello '),
				editOp(6, 9, 'orld')
			],
			'Hello world'
		);
	});

	test('multiple replace 2', () => {
		testEdits(
			'H1w12,123',
			[
				editOp(2, 3, 'ello '),
				editOp(4, 6, 'orld'),
				editOp(7, 10, ' this is H.A.L.')
			],
			'Hello world, this is H.A.L.'
		);
	});
});

suite('Editor Model - modelLine.split text', () => {

	function testLineSplit(initial: string, splitColumn: number, expected1: string, expected2: string): void {
		const [actual1, actual2] = splitLine(initial, splitColumn);
		assert.equal(actual1, expected1);
		assert.equal(actual2, expected2);
	}

	test('split at the beginning', () => {
		testLineSplit(
			'qwerty',
			1,
			'',
			'qwerty'
		);
	});

	test('split at the end', () => {
		testLineSplit(
			'qwerty',
			7,
			'qwerty',
			''
		);
	});

	test('split in the middle', () => {
		testLineSplit(
			'qwerty',
			3,
			'qw',
			'erty'
		);
	});
});

class TestToken {
	public readonly startOffset: number;
	public readonly color: number;

	constructor(startOffset: number, color: number) {
		this.startOffset = startOffset;
		this.color = color;
	}

	public static toTokens(tokens: TestToken[]): Uint32Array {
		if (tokens === null) {
			return null;
		}
		let tokensLen = tokens.length;
		let result = new Uint32Array((tokensLen << 1));
		for (let i = 0; i < tokensLen; i++) {
			let token = tokens[i];
			result[(i << 1)] = token.startOffset;
			result[(i << 1) + 1] = (
				token.color << MetadataConsts.FOREGROUND_OFFSET
			) >>> 0;
		}
		return result;
	}
}

suite('ModelLinesTokens', () => {

	interface IBufferLineState {
		text: string;
		tokens: TestToken[];
	}

	interface IEdit {
		range: Range;
		text: string;
	}

	function testApplyEdits(initial: IBufferLineState[], edits: IEdit[], expected: IBufferLineState[]): void {
		const initialText = initial.map(el => el.text).join('\n');
		const model = new EditableTextModel(RawTextSource.fromString(initialText), TextModel.DEFAULT_CREATION_OPTIONS, new LanguageIdentifier('test', 0));
		for (let lineIndex = 0; lineIndex < initial.length; lineIndex++) {
			const lineTokens = initial[lineIndex].tokens;
			const lineTextLength = model.getLineMaxColumn(lineIndex + 1) - 1;
			model._tokens._setTokens(0, lineIndex, lineTextLength, TestToken.toTokens(lineTokens));
		}

		model.applyEdits(edits.map((ed) => ({
			identifier: null,
			range: ed.range,
			text: ed.text,
			forceMoveMarkers: false
		})));

		for (let lineIndex = 0; lineIndex < expected.length; lineIndex++) {
			const actualLine = model.getLineContent(lineIndex + 1);
			const actualTokens = model.getLineTokens(lineIndex + 1);
			assert.equal(actualLine, expected[lineIndex].text);
			assertLineTokens(actualTokens, expected[lineIndex].tokens);
		}
	}

	test('single delete 1', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 1, 1, 2), text: '' }],
			[{
				text: 'ello world',
				tokens: [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]
			}]
		);
	});

	test('single delete 2', () => {
		testApplyEdits(
			[{
				text: 'helloworld',
				tokens: [new TestToken(0, 1), new TestToken(5, 2)]
			}],
			[{ range: new Range(1, 3, 1, 8), text: '' }],
			[{
				text: 'herld',
				tokens: [new TestToken(0, 1), new TestToken(2, 2)]
			}]
		);
	});

	test('single delete 3', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 1, 1, 6), text: '' }],
			[{
				text: ' world',
				tokens: [new TestToken(0, 2), new TestToken(1, 3)]
			}]
		);
	});

	test('single delete 4', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 2, 1, 7), text: '' }],
			[{
				text: 'hworld',
				tokens: [new TestToken(0, 1), new TestToken(1, 3)]
			}]
		);
	});

	test('single delete 5', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 1, 1, 12), text: '' }],
			[{
				text: '',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('multi delete 6', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ range: new Range(1, 6, 3, 6), text: '' }],
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 8), new TestToken(6, 9)]
			}]
		);
	});

	test('multi delete 7', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ range: new Range(1, 12, 3, 12), text: '' }],
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}]
		);
	});

	test('multi delete 8', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ range: new Range(1, 1, 3, 1), text: '' }],
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}]
		);
	});

	test('multi delete 9', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
			}],
			[{ range: new Range(1, 12, 3, 1), text: '' }],
			[{
				text: 'hello worldhello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3), new TestToken(11, 7), new TestToken(16, 8), new TestToken(17, 9)]
			}]
		);
	});

	test('single insert 1', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 1, 1, 1), text: 'xx' }],
			[{
				text: 'xxhello world',
				tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('single insert 2', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 2, 1, 2), text: 'xx' }],
			[{
				text: 'hxxello world',
				tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('single insert 3', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 6, 1, 6), text: 'xx' }],
			[{
				text: 'helloxx world',
				tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('single insert 4', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 7, 1, 7), text: 'xx' }],
			[{
				text: 'hello xxworld',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(8, 3)]
			}]
		);
	});

	test('single insert 5', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 12, 1, 12), text: 'xx' }],
			[{
				text: 'hello worldxx',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}]
		);
	});

	test('multi insert 6', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 1, 1, 1), text: '\n' }],
			[{
				text: '',
				tokens: [new TestToken(0, 1)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('multi insert 7', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 12, 1, 12), text: '\n' }],
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: '',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('multi insert 8', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}],
			[{ range: new Range(1, 7, 1, 7), text: '\n' }],
			[{
				text: 'hello ',
				tokens: [new TestToken(0, 1), new TestToken(5, 2)]
			}, {
				text: 'world',
				tokens: [new TestToken(0, 1)]
			}]
		);
	});

	test('multi insert 9', () => {
		testApplyEdits(
			[{
				text: 'hello world',
				tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}],
			[{ range: new Range(1, 7, 1, 7), text: 'xx\nyy' }],
			[{
				text: 'hello xx',
				tokens: [new TestToken(0, 1), new TestToken(5, 2)]
			}, {
				text: 'yyworld',
				tokens: [new TestToken(0, 1)]
			}, {
				text: 'hello world',
				tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
			}]
		);
	});

	function testLineEditTokens(initialText: string, initialTokens: TestToken[], edits: ILineEdit[], expectedText: string, expectedTokens: TestToken[]): void {
		testApplyEdits(
			[{
				text: initialText,
				tokens: initialTokens
			}],
			edits.map((ed) => ({
				range: new Range(1, ed.startColumn, 1, ed.endColumn),
				text: ed.text
			})),
			[{
				text: expectedText,
				tokens: expectedTokens
			}]
		);
	}

	test('insertion on empty line', () => {
		const model = new EditableTextModel(RawTextSource.fromString('some text'), TextModel.DEFAULT_CREATION_OPTIONS, new LanguageIdentifier('test', 0));
		model._tokens._setTokens(0, 0, model.getLineMaxColumn(1) - 1, TestToken.toTokens([new TestToken(0, 1)]));

		model.applyEdits([{
			identifier: null,
			range: new Range(1, 1, 1, 10),
			text: '',
			forceMoveMarkers: false
		}]);

		model._tokens._setTokens(0, 0, model.getLineMaxColumn(1) - 1, new Uint32Array(0));

		model.applyEdits([{
			identifier: null,
			range: new Range(1, 1, 1, 1),
			text: 'a',
			forceMoveMarkers: false
		}]);

		const actualTokens = model.getLineTokens(1);
		assertLineTokens(actualTokens, [new TestToken(0, 1)]);
	});

	test('updates tokens on insertion 1', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(5, 2),
				new TestToken(6, 3)
			]
		);
	});

	test('updates tokens on insertion 2', () => {
		testLineEditTokens(
			'aabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(5, 2),
				new TestToken(6, 3)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'x',
			}],
			'axabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(6, 2),
				new TestToken(7, 3)
			]
		);
	});

	test('updates tokens on insertion 3', () => {
		testLineEditTokens(
			'axabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(6, 2),
				new TestToken(7, 3)
			],
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'stu',
			}],
			'axstuabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(9, 2),
				new TestToken(10, 3)
			]
		);
	});

	test('updates tokens on insertion 4', () => {
		testLineEditTokens(
			'axstuabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(9, 2),
				new TestToken(10, 3)
			],
			[{
				startColumn: 10,
				endColumn: 10,
				text: '\t',
			}],
			'axstuabcd\t efgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(11, 3)
			]
		);
	});

	test('updates tokens on insertion 5', () => {
		testLineEditTokens(
			'axstuabcd\t efgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(11, 3)
			],
			[{
				startColumn: 12,
				endColumn: 12,
				text: 'dd',
			}],
			'axstuabcd\t ddefgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			]
		);
	});

	test('updates tokens on insertion 6', () => {
		testLineEditTokens(
			'axstuabcd\t ddefgh',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			],
			[{
				startColumn: 18,
				endColumn: 18,
				text: 'xyz',
			}],
			'axstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			]
		);
	});

	test('updates tokens on insertion 7', () => {
		testLineEditTokens(
			'axstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(10, 2),
				new TestToken(13, 3)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'x',
			}],
			'xaxstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			]
		);
	});

	test('updates tokens on insertion 8', () => {
		testLineEditTokens(
			'xaxstuabcd\t ddefghxyz',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			],
			[{
				startColumn: 22,
				endColumn: 22,
				text: 'x',
			}],
			'xaxstuabcd\t ddefghxyzx',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			]
		);
	});

	test('updates tokens on insertion 9', () => {
		testLineEditTokens(
			'xaxstuabcd\t ddefghxyzx',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: '',
			}],
			'xaxstuabcd\t ddefghxyzx',
			[
				new TestToken(0, 1),
				new TestToken(11, 2),
				new TestToken(14, 3)
			]
		);
	});

	test('updates tokens on insertion 10', () => {
		testLineEditTokens(
			'',
			null,
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'a',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('delete second token 2', () => {
		testLineEditTokens(
			'abcdefghij',
			[
				new TestToken(0, 1),
				new TestToken(3, 2),
				new TestToken(6, 3)
			],
			[{
				startColumn: 4,
				endColumn: 7,
				text: '',
			}],
			'abcghij',
			[
				new TestToken(0, 1),
				new TestToken(3, 3)
			]
		);
	});

	test('insert right before second token', () => {
		testLineEditTokens(
			'abcdefghij',
			[
				new TestToken(0, 1),
				new TestToken(3, 2),
				new TestToken(6, 3)
			],
			[{
				startColumn: 4,
				endColumn: 4,
				text: 'hello',
			}],
			'abchellodefghij',
			[
				new TestToken(0, 1),
				new TestToken(8, 2),
				new TestToken(11, 3)
			]
		);
	});

	test('delete first char', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 1,
				endColumn: 2,
				text: '',
			}],
			'bcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(3, 2),
				new TestToken(4, 3)
			]
		);
	});

	test('delete 2nd and 3rd chars', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 2,
				endColumn: 4,
				text: '',
			}],
			'ad efgh',
			[
				new TestToken(0, 1),
				new TestToken(2, 2),
				new TestToken(3, 3)
			]
		);
	});

	test('delete first token', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 1,
				endColumn: 5,
				text: '',
			}],
			' efgh',
			[
				new TestToken(0, 2),
				new TestToken(1, 3)
			]
		);
	});

	test('delete second token', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 5,
				endColumn: 6,
				text: '',
			}],
			'abcdefgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 3)
			]
		);
	});

	test('delete second token + a bit of the third one', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 5,
				endColumn: 7,
				text: '',
			}],
			'abcdfgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 3)
			]
		);
	});

	test('delete second and third token', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 5,
				endColumn: 10,
				text: '',
			}],
			'abcd',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('delete everything', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 1,
				endColumn: 10,
				text: '',
			}],
			'',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('noop', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: '',
			}],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('equivalent to deleting first two chars', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 1,
				endColumn: 3,
				text: '',
			}],
			'cd efgh',
			[
				new TestToken(0, 1),
				new TestToken(2, 2),
				new TestToken(3, 3)
			]
		);
	});

	test('equivalent to deleting from 5 to the end', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			[{
				startColumn: 5,
				endColumn: 10,
				text: '',
			}],
			'abcd',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('updates tokens on replace 1', () => {
		testLineEditTokens(
			'Hello world, ciao',
			[
				new TestToken(0, 1),
				new TestToken(5, 0),
				new TestToken(6, 2),
				new TestToken(11, 0),
				new TestToken(13, 0)
			],
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'Hi',
			}],
			'Hi world, ciao',
			[
				new TestToken(0, 0),
				new TestToken(3, 2),
				new TestToken(8, 0),
				new TestToken(10, 0),
			]
		);
	});

	test('updates tokens on replace 2', () => {
		testLineEditTokens(
			'Hello world, ciao',
			[
				new TestToken(0, 1),
				new TestToken(5, 0),
				new TestToken(6, 2),
				new TestToken(11, 0),
				new TestToken(13, 0),
			],
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'Hi',
			}, {
				startColumn: 8,
				endColumn: 12,
				text: 'my friends',
			}],
			'Hi wmy friends, ciao',
			[
				new TestToken(0, 0),
				new TestToken(3, 2),
				new TestToken(14, 0),
				new TestToken(16, 0),
			]
		);
	});

	function testLineSplitTokens(initialText: string, initialTokens: TestToken[], splitColumn: number, expectedText1: string, expectedText2: string, expectedTokens: TestToken[]): void {
		testApplyEdits(
			[{
				text: initialText,
				tokens: initialTokens
			}],
			[{
				range: new Range(1, splitColumn, 1, splitColumn),
				text: '\n'
			}],
			[{
				text: expectedText1,
				tokens: expectedTokens
			}, {
				text: expectedText2,
				tokens: [new TestToken(0, 1)]
			}]
		);
	}

	test('split at the beginning', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			1,
			'',
			'abcd efgh',
			[
				new TestToken(0, 1),
			]
		);
	});

	test('split at the end', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			10,
			'abcd efgh',
			'',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('split inthe middle 1', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			5,
			'abcd',
			' efgh',
			[
				new TestToken(0, 1)
			]
		);
	});

	test('split inthe middle 2', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			6,
			'abcd ',
			'efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2)
			]
		);
	});

	function testLineAppendTokens(aText: string, aTokens: TestToken[], bText: string, bTokens: TestToken[], expectedText: string, expectedTokens: TestToken[]): void {
		testApplyEdits(
			[{
				text: aText,
				tokens: aTokens
			}, {
				text: bText,
				tokens: bTokens
			}],
			[{
				range: new Range(1, aText.length + 1, 2, 1),
				text: ''
			}],
			[{
				text: expectedText,
				tokens: expectedTokens
			}]
		);
	}

	test('append empty 1', () => {
		testLineAppendTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			'',
			[],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('append empty 2', () => {
		testLineAppendTokens(
			'',
			[],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('append 1', () => {
		testLineAppendTokens(
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 4),
				new TestToken(4, 5),
				new TestToken(5, 6)
			],
			'abcd efghabcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3),
				new TestToken(9, 4),
				new TestToken(13, 5),
				new TestToken(14, 6)
			]
		);
	});

	test('append 2', () => {
		testLineAppendTokens(
			'abcd ',
			[
				new TestToken(0, 1),
				new TestToken(4, 2)
			],
			'efgh',
			[
				new TestToken(0, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});

	test('append 3', () => {
		testLineAppendTokens(
			'abcd',
			[
				new TestToken(0, 1),
			],
			' efgh',
			[
				new TestToken(0, 2),
				new TestToken(1, 3)
			],
			'abcd efgh',
			[
				new TestToken(0, 1),
				new TestToken(4, 2),
				new TestToken(5, 3)
			]
		);
	});
});

suite('Editor Model - modelLine.applyEdits', () => {

	function testLineEdit(initialText: string, edits: ILineEdit[], expectedText: string): void {
		const actual = applyLineEdits(initialText, edits);
		assert.equal(actual, expectedText, 'text');
	}

	test('insertion: updates markers 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'abc',
			}],
			'abcabcd efgh',
		);
	});

	test('insertion: updates markers 2', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'abc',
			}],
			'aabcbcd efgh',
		);
	});

	test('insertion: updates markers 3', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'abc',
			}],
			'ababccd efgh',
		);
	});

	test('insertion: updates markers 4', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 5,
				endColumn: 5,
				text: 'abc',
			}],
			'abcdabc efgh',
		);
	});

	test('insertion: updates markers 5', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 10,
				endColumn: 10,
				text: 'abc',
			}],
			'abcd efghabc',
		);
	});

	test('insertion bis: updates markers 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
		);
	});

	test('insertion bis: updates markers 2', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'a',
			}],
			'aabcd efgh',
		);
	});

	test('insertion bis: updates markers 3', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'a',
			}],
			'abacd efgh',
		);
	});

	test('insertion bis: updates markers 4', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 5,
				endColumn: 5,
				text: 'a',
			}],
			'abcda efgh',
		);
	});

	test('insertion bis: updates markers 5', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 10,
				endColumn: 10,
				text: 'a',
			}],
			'abcd efgha',
		);
	});

	test('insertion: does not move marker at column 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
		);
	});

	test('insertion: does move marker at column 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
		);
	});

	test('insertion: two markers at column 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
		);
	});

	test('insertion: two markers at column 1 unsorted', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}],
			'aabcd efgh',
		);
	});

	test('deletion: updates markers 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 2,
				text: '',
			}],
			'bcd efgh',
		);
	});

	test('deletion: updates markers 2', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 4,
				text: '',
			}],
			'd efgh',
		);
	});

	test('deletion: updates markers 3', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 5,
				endColumn: 6,
				text: '',
			}],
			'abcdefgh',
		);
	});

	test('replace: updates markers 1', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
			}, {
				startColumn: 2,
				endColumn: 3,
				text: '',
			}],
			'aacd efgh',
		);
	});

	test('delete near markers', () => {
		testLineEdit(
			'abcd',
			[{
				startColumn: 3,
				endColumn: 4,
				text: '',
			}],
			'abd',
		);
	});

	test('replace: updates markers 2', () => {
		testLineEdit(
			'Hello world, how are you',
			[{
				startColumn: 1,
				endColumn: 1,
				text: ' - ',
			}, {
				startColumn: 6,
				endColumn: 12,
				text: '',
			}, {
				startColumn: 22,
				endColumn: 25,
				text: 'things',
			}],
			' - Hello, how are things',
		);
	});

	test('sorts markers', () => {
		testLineEdit(
			'Hello world, how are you',
			[{
				startColumn: 1,
				endColumn: 1,
				text: ' - ',
			}, {
				startColumn: 6,
				endColumn: 12,
				text: '',
			}, {
				startColumn: 22,
				endColumn: 25,
				text: 'things',
			}],
			' - Hello, how are things',
		);
	});

	test('change text inside markers', () => {
		testLineEdit(
			'abcd efgh',
			[{
				startColumn: 6,
				endColumn: 10,
				text: '1234567',
			}],
			'abcd 1234567',
		);
	});

	test('inserting is different than replacing for markers part 1', () => {
		testLineEdit(
			'abcd',
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'INSERT',
			}],
			'aINSERTbcd',
		);
	});

	test('inserting is different than replacing for markers part 2', () => {
		testLineEdit(
			'abcd',
			[{
				startColumn: 2,
				endColumn: 3,
				text: 'REPLACED',
			}],
			'aREPLACEDcd',
		);
	});

	test('replacing the entire line with more text', () => {
		testLineEdit(
			'this is a short text',
			[{
				startColumn: 1,
				endColumn: 21,
				text: 'Some new text here',
			}],
			'Some new text here',
		);
	});

	test('replacing the entire line with less text', () => {
		testLineEdit(
			'this is a short text',
			[{
				startColumn: 1,
				endColumn: 21,
				text: 'ttt',
			}],
			'ttt',
		);
	});

	test('replace selection', () => {
		testLineEdit(
			'first',
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'something',
			}],
			'something',
		);
	});
});

suite('Editor Model - modelLine.split', () => {

	function testLineSplit(initialText: string, splitColumn: number, forceMoveMarkers: boolean, expectedText1: string, expectedText2: string): void {
		const [l1, l2] = splitLine(initialText, splitColumn);

		assert.equal(l1, expectedText1, 'text');
		assert.equal(l2, expectedText2, 'text');
	}

	test('split at the beginning', () => {
		testLineSplit(
			'abcd efgh',
			1,
			false,
			'',
			'abcd efgh',
		);
	});

	test('split at the beginning 2', () => {
		testLineSplit(
			'abcd efgh',
			1,
			true,
			'',
			'abcd efgh',
		);
	});

	test('split at the end', () => {
		testLineSplit(
			'abcd efgh',
			10,
			false,
			'abcd efgh',
			'',
		);
	});

	test('split it the middle 1', () => {
		testLineSplit(
			'abcd efgh',
			2,
			false,
			'a',
			'bcd efgh',
		);
	});

	test('split it the middle 2', () => {
		testLineSplit(
			'abcd efgh',
			3,
			false,
			'ab',
			'cd efgh',
		);
	});

	test('split it the middle 3', () => {
		testLineSplit(
			'abcd efgh',
			5,
			false,
			'abcd',
			' efgh',
		);
	});

	test('split it the middle 4', () => {
		testLineSplit(
			'abcd efgh',
			6,
			false,
			'abcd ',
			'efgh',
		);
	});
});
