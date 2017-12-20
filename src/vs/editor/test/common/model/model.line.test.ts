/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { ModelLine, ILineEdit, computeIndentLevel } from 'vs/editor/common/model/modelLine';
import { MetadataConsts } from 'vs/editor/common/modes';
import { ViewLineToken, ViewLineTokenFactory } from 'vs/editor/common/core/viewLineToken';

function assertLineTokens(_actual: LineTokens, _expected: TestToken[]): void {
	let expected = ViewLineTokenFactory.inflateArr(TestToken.toTokens(_expected), _actual.getLineContent().length);
	let actual = _actual.inflate();
	let decode = (token: ViewLineToken) => {
		return {
			endIndex: token.endIndex,
			type: token.getType()
		};
	};
	assert.deepEqual(actual.map(decode), expected.map(decode));
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
		var line = new ModelLine(initial);
		line.applyEdits(edits);
		assert.equal(line.text, expected);
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
		var line = new ModelLine(initial);
		var newLine = line.split(splitColumn);
		assert.equal(line.text, expected1);
		assert.equal(newLine.text, expected2);
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

suite('Editor Model - modelLine.append text', () => {

	function testLineAppend(a: string, b: string, expected: string): void {
		var line1 = new ModelLine(a);
		var line2 = new ModelLine(b);
		line1.append(line2);
		assert.equal(line1.text, expected);
	}

	test('append at the beginning', () => {
		testLineAppend(
			'',
			'qwerty',
			'qwerty'
		);
	});

	test('append at the end', () => {
		testLineAppend(
			'qwerty',
			'',
			'qwerty'
		);
	});

	test('append in the middle', () => {
		testLineAppend(
			'qw',
			'erty',
			'qwerty'
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

suite('Editor Model - modelLine.applyEdits text & tokens', () => {


	function testLineEditTokens(initialText: string, initialTokens: TestToken[], edits: ILineEdit[], expectedText: string, expectedTokens: TestToken[]): void {
		let line = new ModelLine(initialText);
		line.setTokens(0, TestToken.toTokens(initialTokens));

		line.applyEdits(edits);

		assert.equal(line.text, expectedText);
		assertLineTokens(line.getTokens(0), expectedTokens);
	}

	test('insertion on empty line', () => {
		let line = new ModelLine('some text');
		line.setTokens(0, TestToken.toTokens([new TestToken(0, 1)]));

		line.applyEdits([{ startColumn: 1, endColumn: 10, text: '' }]);
		line.setTokens(0, new Uint32Array(0));

		line.applyEdits([{ startColumn: 1, endColumn: 1, text: 'a' }]);
		assertLineTokens(line.getTokens(0), [new TestToken(0, 1)]);
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
				new TestToken(0, 3)
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
				new TestToken(0, 1),
				new TestToken(2, 0),
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
				new TestToken(0, 1),
				new TestToken(2, 0),
				new TestToken(3, 2),
				new TestToken(14, 0),
				new TestToken(16, 0),
			]
		);
	});
});

suite('Editor Model - modelLine.split text & tokens', () => {
	function testLineSplitTokens(initialText: string, initialTokens: TestToken[], splitColumn: number, expectedText1: string, expectedText2: string, expectedTokens: TestToken[]): void {
		let line = new ModelLine(initialText);
		line.setTokens(0, TestToken.toTokens(initialTokens));

		let other = line.split(splitColumn);

		assert.equal(line.text, expectedText1);
		assert.equal(other.text, expectedText2);
		assertLineTokens(line.getTokens(0), expectedTokens);
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
});

suite('Editor Model - modelLine.append text & tokens', () => {
	function testLineAppendTokens(aText: string, aTokens: TestToken[], bText: string, bTokens: TestToken[], expectedText: string, expectedTokens: TestToken[]): void {
		let a = new ModelLine(aText);
		a.setTokens(0, TestToken.toTokens(aTokens));

		let b = new ModelLine(bText);
		b.setTokens(0, TestToken.toTokens(bTokens));

		a.append(b);

		assert.equal(a.text, expectedText);
		assertLineTokens(a.getTokens(0), expectedTokens);
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
		let line = new ModelLine(initialText);

		line.applyEdits(edits);

		assert.equal(line.text, expectedText, 'text');
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
		let line = new ModelLine(initialText);

		let otherLine = line.split(splitColumn);

		assert.equal(line.text, expectedText1, 'text');
		assert.equal(otherLine.text, expectedText2, 'text');
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

suite('Editor Model - modelLine.append', () => {

	function testLinePrependMarkers(aText: string, bText: string, expectedText: string): void {
		let a = new ModelLine(aText);
		let b = new ModelLine(bText);

		a.append(b);

		assert.equal(a.text, expectedText, 'text');
	}

	test('append to an empty', () => {
		testLinePrependMarkers(
			'abcd efgh',
			'',
			'abcd efgh',
		);
	});

	test('append an empty', () => {
		testLinePrependMarkers(
			'',
			'abcd efgh',
			'abcd efgh',
		);
	});

	test('append 1', () => {
		testLinePrependMarkers(
			'abcd',
			' efgh',
			'abcd efgh',
		);
	});

	test('append 2', () => {
		testLinePrependMarkers(
			'abcd e',
			'fgh',
			'abcd efgh',
		);
	});
});
