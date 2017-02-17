/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { ModelLine, ILineEdit, LineMarker, MarkersTracker } from 'vs/editor/common/model/modelLine';
import { MetadataConsts } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { ViewLineToken, ViewLineTokenFactory } from 'vs/editor/common/core/viewLineToken';

function assertLineTokens(_actual: LineTokens, _expected: TestToken[]): void {
	let expected = ViewLineTokenFactory.inflateArr(TestToken.toTokens(_expected), _actual.getLineLength());
	let actual = _actual.inflate();
	let decode = (token: ViewLineToken) => {
		return {
			endIndex: token.endIndex,
			type: token.getType()
		};
	};
	assert.deepEqual(actual.map(decode), expected.map(decode));
}

const NO_TAB_SIZE = 0;

suite('ModelLine - getIndentLevel', () => {
	function assertIndentLevel(text: string, expected: number, tabSize: number = 4): void {
		let modelLine = new ModelLine(1, text, tabSize);
		let actual = modelLine.getIndentLevel();
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
		var line = new ModelLine(1, initial, NO_TAB_SIZE);
		line.applyEdits(new MarkersTracker(), edits, NO_TAB_SIZE);
		assert.equal(line.text, expected);
	}

	function editOp(startColumn: number, endColumn: number, text: string): ILineEdit {
		return {
			startColumn: startColumn,
			endColumn: endColumn,
			text: text,
			forceMoveMarkers: false
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
		var line = new ModelLine(1, initial, NO_TAB_SIZE);
		var newLine = line.split(new MarkersTracker(), splitColumn, false, NO_TAB_SIZE);
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
		var line1 = new ModelLine(1, a, NO_TAB_SIZE);
		var line2 = new ModelLine(2, b, NO_TAB_SIZE);
		line1.append(new MarkersTracker(), line2, NO_TAB_SIZE);
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
		let line = new ModelLine(1, initialText, NO_TAB_SIZE);
		line.setTokens(0, TestToken.toTokens(initialTokens));

		line.applyEdits(new MarkersTracker(), edits, NO_TAB_SIZE);

		assert.equal(line.text, expectedText);
		assertLineTokens(line.getTokens(0), expectedTokens);
	}

	test('insertion on empty line', () => {
		let line = new ModelLine(1, 'some text', NO_TAB_SIZE);
		line.setTokens(0, TestToken.toTokens([new TestToken(0, 1)]));

		line.applyEdits(new MarkersTracker(), [{ startColumn: 1, endColumn: 10, text: '', forceMoveMarkers: false }], NO_TAB_SIZE);
		line.setTokens(0, new Uint32Array(0));

		line.applyEdits(new MarkersTracker(), [{ startColumn: 1, endColumn: 1, text: 'a', forceMoveMarkers: false }], NO_TAB_SIZE);
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
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
				forceMoveMarkers: false
			}, {
				startColumn: 8,
				endColumn: 12,
				text: 'my friends',
				forceMoveMarkers: false
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
		let line = new ModelLine(1, initialText, NO_TAB_SIZE);
		line.setTokens(0, TestToken.toTokens(initialTokens));

		let other = line.split(new MarkersTracker(), splitColumn, false, NO_TAB_SIZE);

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
		let a = new ModelLine(1, aText, NO_TAB_SIZE);
		a.setTokens(0, TestToken.toTokens(aTokens));

		let b = new ModelLine(2, bText, NO_TAB_SIZE);
		b.setTokens(0, TestToken.toTokens(bTokens));

		a.append(new MarkersTracker(), b, NO_TAB_SIZE);

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

interface ILightWeightMarker {
	id: string;
	lineNumber: number;
	column: number;
	stickToPreviousCharacter: boolean;
}

suite('Editor Model - modelLine.applyEdits text & markers', () => {

	function marker(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), id, new Position(0, column), stickToPreviousCharacter);
	}

	function toLightWeightMarker(marker: LineMarker): ILightWeightMarker {
		return {
			id: marker.id,
			lineNumber: marker.position.lineNumber,
			column: marker.position.column,
			stickToPreviousCharacter: marker.stickToPreviousCharacter
		};
	}

	function testLineEditMarkers(initialText: string, initialMarkers: LineMarker[], edits: ILineEdit[], expectedText: string, expectedChangedMarkers: number[], _expectedMarkers: LineMarker[]): void {
		let line = new ModelLine(1, initialText, NO_TAB_SIZE);
		line.addMarkers(initialMarkers);

		let changedMarkers = new MarkersTracker();
		line.applyEdits(changedMarkers, edits, NO_TAB_SIZE);

		assert.equal(line.text, expectedText, 'text');

		let actualMarkers = line.getMarkers().map(toLightWeightMarker);
		let expectedMarkers = _expectedMarkers.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers, expectedMarkers, 'markers');

		let actualChangedMarkers = changedMarkers.getDecorationIds();
		actualChangedMarkers.sort();
		assert.deepEqual(actualChangedMarkers, expectedChangedMarkers, 'changed markers');
	}

	test('insertion: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'abcabcd efgh',
			[2, 3, 4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 4, false),
				marker(3, 5, true),
				marker(4, 5, false),
				marker(5, 8, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 2', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'aabcbcd efgh',
			[4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 5, false),
				marker(5, 8, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 3', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'ababccd efgh',
			[5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 8, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 4', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 5,
				endColumn: 5,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'abcdabc efgh',
			[6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 5', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 10,
				endColumn: 10,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'abcd efghabc',
			[8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion bis: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[2, 3, 4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 2, false),
				marker(3, 3, true),
				marker(4, 3, false),
				marker(5, 6, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 2', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 3, false),
				marker(5, 6, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 3', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'a',
				forceMoveMarkers: false
			}],
			'abacd efgh',
			[5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 6, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 4', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 5,
				endColumn: 5,
				text: 'a',
				forceMoveMarkers: false
			}],
			'abcda efgh',
			[6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 5', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 10,
				endColumn: 10,
				text: 'a',
				forceMoveMarkers: false
			}],
			'abcd efgha',
			[8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion: does not move marker at column 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[marker(1, 1, true)],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[],
			[marker(1, 1, true)]
		);
	});

	test('insertion: does move marker at column 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[marker(1, 1, false)],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[1],
			[marker(1, 2, false)]
		);
	});

	test('insertion: two markers at column 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[2],
			[
				marker(1, 1, true),
				marker(2, 2, false)
			]
		);
	});

	test('insertion: two markers at column 1 unsorted', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(2, 1, false),
				marker(1, 1, true),
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[2],
			[
				marker(1, 1, true),
				marker(2, 2, false)
			]
		);
	});

	test('deletion: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 2,
				text: '',
				forceMoveMarkers: false
			}],
			'bcd efgh',
			[3, 4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 1, true),
				marker(4, 1, false),
				marker(5, 4, true),
				marker(6, 4, false),
				marker(7, 9, true),
				marker(8, 9, false)
			]
		);
	});

	test('deletion: updates markers 2', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 4,
				text: '',
				forceMoveMarkers: false
			}],
			'd efgh',
			[3, 4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 1, true),
				marker(4, 1, false),
				marker(5, 2, true),
				marker(6, 2, false),
				marker(7, 7, true),
				marker(8, 7, false)
			]
		);
	});

	test('deletion: updates markers 3', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 5,
				endColumn: 6,
				text: '',
				forceMoveMarkers: false
			}],
			'abcdefgh',
			[7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 9, true),
				marker(8, 9, false)
			]
		);
	});

	test('replace: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}, {
				startColumn: 2,
				endColumn: 3,
				text: '',
				forceMoveMarkers: false
			}],
			'aacd efgh',
			[2, 3, 4],
			[
				marker(1, 1, true),
				marker(2, 2, false),
				marker(3, 3, true),
				marker(4, 3, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('delete near markers', () => {
		testLineEditMarkers(
			'abcd',
			[
				marker(1, 3, true),
				marker(2, 3, false)
			],
			[{
				startColumn: 3,
				endColumn: 4,
				text: '',
				forceMoveMarkers: false
			}],
			'abd',
			[],
			[
				marker(1, 3, true),
				marker(2, 3, false)
			]
		);
	});

	test('replace: updates markers 2', () => {
		testLineEditMarkers(
			'Hello world, how are you',
			[
				marker(1, 1, false),
				marker(2, 6, true),
				marker(3, 14, false),
				marker(4, 21, true)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: ' - ',
				forceMoveMarkers: false
			}, {
				startColumn: 6,
				endColumn: 12,
				text: '',
				forceMoveMarkers: false
			}, {
				startColumn: 22,
				endColumn: 25,
				text: 'things',
				forceMoveMarkers: false
			}],
			' - Hello, how are things',
			[1, 2, 3, 4],
			[
				marker(1, 4, false),
				marker(2, 9, true),
				marker(3, 11, false),
				marker(4, 18, true)
			]
		);
	});

	test('sorts markers', () => {
		testLineEditMarkers(
			'Hello world, how are you',
			[
				marker(4, 21, true),
				marker(2, 6, true),
				marker(1, 1, false),
				marker(3, 14, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: ' - ',
				forceMoveMarkers: false
			}, {
				startColumn: 6,
				endColumn: 12,
				text: '',
				forceMoveMarkers: false
			}, {
				startColumn: 22,
				endColumn: 25,
				text: 'things',
				forceMoveMarkers: false
			}],
			' - Hello, how are things',
			[1, 2, 3, 4],
			[
				marker(1, 4, false),
				marker(2, 9, true),
				marker(3, 11, false),
				marker(4, 18, true)
			]
		);
	});

	test('change text inside markers', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 6, false),
				marker(4, 10, true)
			],
			[{
				startColumn: 6,
				endColumn: 10,
				text: '1234567',
				forceMoveMarkers: false
			}],
			'abcd 1234567',
			[],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 6, false),
				marker(4, 10, true)
			]
		);
	});

	test('inserting is different than replacing for markers part 1', () => {
		testLineEditMarkers(
			'abcd',
			[
				marker(1, 2, false)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'INSERT',
				forceMoveMarkers: false
			}],
			'aINSERTbcd',
			[1],
			[
				marker(1, 8, false)
			]
		);
	});

	test('inserting is different than replacing for markers part 2', () => {
		testLineEditMarkers(
			'abcd',
			[
				marker(1, 2, false)
			],
			[{
				startColumn: 2,
				endColumn: 3,
				text: 'REPLACED',
				forceMoveMarkers: false
			}],
			'aREPLACEDcd',
			[],
			[
				marker(1, 2, false)
			]
		);
	});

	test('replacing the entire line with more text', () => {
		testLineEditMarkers(
			'this is a short text',
			[
				marker(1, 1, false),
				marker(2, 16, true),
			],
			[{
				startColumn: 1,
				endColumn: 21,
				text: 'Some new text here',
				forceMoveMarkers: false
			}],
			'Some new text here',
			[],
			[
				marker(1, 1, false),
				marker(2, 16, true),
			]
		);
	});

	test('replacing the entire line with less text', () => {
		testLineEditMarkers(
			'this is a short text',
			[
				marker(1, 1, false),
				marker(2, 16, true),
			],
			[{
				startColumn: 1,
				endColumn: 21,
				text: 'ttt',
				forceMoveMarkers: false
			}],
			'ttt',
			[2],
			[
				marker(1, 1, false),
				marker(2, 4, true),
			]
		);
	});

	test('replace selection', () => {
		testLineEditMarkers(
			'first',
			[
				marker(1, 1, true),
				marker(2, 6, false),
			],
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'something',
				forceMoveMarkers: false
			}],
			'something',
			[2],
			[
				marker(1, 1, true),
				marker(2, 10, false),
			]
		);
	});
});

suite('Editor Model - modelLine.split text & markers', () => {

	function marker(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), id, new Position(0, column), stickToPreviousCharacter);
	}

	function toLightWeightMarker(marker: LineMarker): ILightWeightMarker {
		return {
			id: marker.id,
			lineNumber: marker.position.lineNumber,
			column: marker.position.column,
			stickToPreviousCharacter: marker.stickToPreviousCharacter
		};
	}

	function testLineSplitMarkers(initialText: string, initialMarkers: LineMarker[], splitColumn: number, forceMoveMarkers: boolean, expectedText1: string, expectedText2: string, expectedChangedMarkers: number[], _expectedMarkers1: LineMarker[], _expectedMarkers2: LineMarker[]): void {
		let line = new ModelLine(1, initialText, NO_TAB_SIZE);
		line.addMarkers(initialMarkers);

		let changedMarkers = new MarkersTracker();
		let otherLine = line.split(changedMarkers, splitColumn, forceMoveMarkers, NO_TAB_SIZE);

		assert.equal(line.text, expectedText1, 'text');
		assert.equal(otherLine.text, expectedText2, 'text');

		let actualMarkers1 = line.getMarkers().map(toLightWeightMarker);
		let expectedMarkers1 = _expectedMarkers1.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers1, expectedMarkers1, 'markers');

		let actualMarkers2 = otherLine.getMarkers().map(toLightWeightMarker);
		let expectedMarkers2 = _expectedMarkers2.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers2, expectedMarkers2, 'markers');

		let actualChangedMarkers = changedMarkers.getDecorationIds();
		actualChangedMarkers.sort();
		assert.deepEqual(actualChangedMarkers, expectedChangedMarkers, 'changed markers');
	}

	test('split at the beginning', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			1,
			false,
			'',
			'abcd efgh',
			[],
			[
				marker(1, 1, true)
			],
			[
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('split at the beginning 2', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			1,
			true,
			'',
			'abcd efgh',
			[],
			[],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('split at the end', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			10,
			false,
			'abcd efgh',
			'',
			[8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
			],
			[
				marker(8, 1, false)
			]
		);
	});

	test('split it the middle 1', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			2,
			false,
			'a',
			'bcd efgh',
			[4, 5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
			],
			[
				marker(4, 1, false),
				marker(5, 4, true),
				marker(6, 4, false),
				marker(7, 9, true),
				marker(8, 9, false)
			]
		);
	});

	test('split it the middle 2', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			3,
			false,
			'ab',
			'cd efgh',
			[5, 6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
			],
			[
				marker(5, 3, true),
				marker(6, 3, false),
				marker(7, 8, true),
				marker(8, 8, false)
			]
		);
	});

	test('split it the middle 3', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			5,
			false,
			'abcd',
			' efgh',
			[6, 7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
			],
			[
				marker(6, 1, false),
				marker(7, 6, true),
				marker(8, 6, false)
			]
		);
	});

	test('split it the middle 4', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			6,
			false,
			'abcd ',
			'efgh',
			[7, 8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
			],
			[
				marker(7, 5, true),
				marker(8, 5, false)
			]
		);
	});
});

suite('Editor Model - modelLine.append text & markers', () => {

	function markerOnFirstLine(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), id, new Position(1, column), stickToPreviousCharacter);
	}

	function markerOnSecondLine(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), id, new Position(2, column), stickToPreviousCharacter);
	}

	function toLightWeightMarker(marker: LineMarker): ILightWeightMarker {
		return {
			id: marker.id,
			lineNumber: marker.position.lineNumber,
			column: marker.position.column,
			stickToPreviousCharacter: marker.stickToPreviousCharacter
		};
	}

	function testLinePrependMarkers(aText: string, aMarkers: LineMarker[], bText: string, bMarkers: LineMarker[], expectedText: string, expectedChangedMarkers: number[], _expectedMarkers: LineMarker[]): void {
		let a = new ModelLine(1, aText, NO_TAB_SIZE);
		a.addMarkers(aMarkers);

		let b = new ModelLine(2, bText, NO_TAB_SIZE);
		b.addMarkers(bMarkers);

		let changedMarkers = new MarkersTracker();
		a.append(changedMarkers, b, NO_TAB_SIZE);

		assert.equal(a.text, expectedText, 'text');

		let actualMarkers = a.getMarkers().map(toLightWeightMarker);
		let expectedMarkers = _expectedMarkers.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers, expectedMarkers, 'markers');

		let actualChangedMarkers = changedMarkers.getDecorationIds();
		actualChangedMarkers.sort();
		assert.deepEqual(actualChangedMarkers, expectedChangedMarkers, 'changed markers');
	}

	test('append to an empty', () => {
		testLinePrependMarkers(
			'abcd efgh',
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false),
				markerOnFirstLine(5, 5, true),
				markerOnFirstLine(6, 5, false),
				markerOnFirstLine(7, 10, true),
				markerOnFirstLine(8, 10, false),
			],
			'',
			[
			],
			'abcd efgh',
			[],
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false),
				markerOnFirstLine(5, 5, true),
				markerOnFirstLine(6, 5, false),
				markerOnFirstLine(7, 10, true),
				markerOnFirstLine(8, 10, false)
			]
		);
	});

	test('append an empty', () => {
		testLinePrependMarkers(
			'',
			[
			],
			'abcd efgh',
			[
				markerOnSecondLine(1, 1, true),
				markerOnSecondLine(2, 1, false),
				markerOnSecondLine(3, 2, true),
				markerOnSecondLine(4, 2, false),
				markerOnSecondLine(5, 5, true),
				markerOnSecondLine(6, 5, false),
				markerOnSecondLine(7, 10, true),
				markerOnSecondLine(8, 10, false),
			],
			'abcd efgh',
			[1, 2, 3, 4, 5, 6, 7, 8],
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false),
				markerOnFirstLine(5, 5, true),
				markerOnFirstLine(6, 5, false),
				markerOnFirstLine(7, 10, true),
				markerOnFirstLine(8, 10, false)
			]
		);
	});

	test('append 1', () => {
		testLinePrependMarkers(
			'abcd',
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false)
			],
			' efgh',
			[
				markerOnSecondLine(5, 1, true),
				markerOnSecondLine(6, 1, false),
				markerOnSecondLine(7, 6, true),
				markerOnSecondLine(8, 6, false),
			],
			'abcd efgh',
			[5, 6, 7, 8],
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false),
				markerOnFirstLine(5, 5, true),
				markerOnFirstLine(6, 5, false),
				markerOnFirstLine(7, 10, true),
				markerOnFirstLine(8, 10, false)
			]
		);
	});

	test('append 2', () => {
		testLinePrependMarkers(
			'abcd e',
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false),
				markerOnFirstLine(5, 5, true),
				markerOnFirstLine(6, 5, false)
			],
			'fgh',
			[
				markerOnSecondLine(7, 4, true),
				markerOnSecondLine(8, 4, false),
			],
			'abcd efgh',
			[7, 8],
			[
				markerOnFirstLine(1, 1, true),
				markerOnFirstLine(2, 1, false),
				markerOnFirstLine(3, 2, true),
				markerOnFirstLine(4, 2, false),
				markerOnFirstLine(5, 5, true),
				markerOnFirstLine(6, 5, false),
				markerOnFirstLine(7, 10, true),
				markerOnFirstLine(8, 10, false)
			]
		);
	});
});

