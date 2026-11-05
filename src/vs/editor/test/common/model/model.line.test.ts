/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, IState, ITokenizationSupport, TokenizationRegistry, TokenizationResult } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { computeIndentLevel } from '../../../common/model/utils.js';
import { ContiguousMultilineTokensBuilder } from '../../../common/tokens/contiguousMultilineTokensBuilder.js';
import { LineTokens } from '../../../common/tokens/lineTokens.js';
import { TestLineToken, TestLineTokenFactory } from '../core/testLineToken.js';
import { createTextModel } from '../testTextModel.js';

interface ILineEdit {
	startColumn: number;
	endColumn: number;
	text: string;
}

function assertLineTokens(__actual: LineTokens, _expected: TestToken[]): void {
	const tmp = TestToken.toTokens(_expected);
	LineTokens.convertToEndOffset(tmp, __actual.getLineContent().length);
	const expected = TestLineTokenFactory.inflateArr(tmp);
	const _actual = __actual.inflate();
	interface ITestToken {
		endIndex: number;
		type: string;
	}
	const actual: ITestToken[] = [];
	for (let i = 0, len = _actual.getCount(); i < len; i++) {
		actual[i] = {
			endIndex: _actual.getEndOffset(i),
			type: _actual.getClassName(i)
		};
	}
	const decode = (token: TestLineToken) => {
		return {
			endIndex: token.endIndex,
			type: token.getType()
		};
	};
	assert.deepStrictEqual(actual, expected.map(decode));
}

suite('ModelLine - getIndentLevel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertIndentLevel(text: string, expected: number, tabSize: number = 4): void {
		const actual = computeIndentLevel(text, tabSize);
		assert.strictEqual(actual, expected, text);
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

class TestToken {
	public readonly startOffset: number;
	public readonly color: number;

	constructor(startOffset: number, color: number) {
		this.startOffset = startOffset;
		this.color = color;
	}

	public static toTokens(tokens: TestToken[]): Uint32Array;
	public static toTokens(tokens: TestToken[] | null): Uint32Array | null {
		if (tokens === null) {
			return null;
		}
		const tokensLen = tokens.length;
		const result = new Uint32Array((tokensLen << 1));
		for (let i = 0; i < tokensLen; i++) {
			const token = tokens[i];
			result[(i << 1)] = token.startOffset;
			result[(i << 1) + 1] = (
				token.color << MetadataConsts.FOREGROUND_OFFSET
			) >>> 0;
		}
		return result;
	}
}

class ManualTokenizationSupport implements ITokenizationSupport {
	private readonly tokens = new Map<number, Uint32Array>();
	private readonly stores = new Set<IBackgroundTokenizationStore>();

	public setLineTokens(lineNumber: number, tokens: Uint32Array): void {
		const b = new ContiguousMultilineTokensBuilder();
		b.add(lineNumber, tokens);
		for (const s of this.stores) {
			s.setTokens(b.finalize());
		}
	}

	getInitialState(): IState {
		return new LineState(1);
	}

	tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult {
		throw new Error();
	}

	tokenizeEncoded(line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult {
		const s = state as LineState;
		return new EncodedTokenizationResult(this.tokens.get(s.lineNumber)!, [], new LineState(s.lineNumber + 1));
	}

	/**
	 * Can be/return undefined if default background tokenization should be used.
	 */
	createBackgroundTokenizer?(textModel: ITextModel, store: IBackgroundTokenizationStore): IBackgroundTokenizer | undefined {
		this.stores.add(store);
		return {
			dispose: () => {
				this.stores.delete(store);
			},
			requestTokens(startLineNumber, endLineNumberExclusive) {
			},
		};
	}
}

class LineState implements IState {
	constructor(public readonly lineNumber: number) { }
	clone(): IState {
		return this;
	}
	equals(other: IState): boolean {
		return (other as LineState).lineNumber === this.lineNumber;
	}
}

suite('ModelLinesTokens', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

		const s = new ManualTokenizationSupport();
		const d = TokenizationRegistry.register('test', s);

		const model = createTextModel(initialText, 'test');
		model.onBeforeAttached();
		for (let lineIndex = 0; lineIndex < initial.length; lineIndex++) {
			const lineTokens = initial[lineIndex].tokens;
			const lineTextLength = model.getLineMaxColumn(lineIndex + 1) - 1;
			const tokens = TestToken.toTokens(lineTokens);
			LineTokens.convertToEndOffset(tokens, lineTextLength);
			s.setLineTokens(lineIndex + 1, tokens);
		}

		model.applyEdits(edits.map((ed) => ({
			identifier: null,
			range: ed.range,
			text: ed.text,
			forceMoveMarkers: false
		})));

		for (let lineIndex = 0; lineIndex < expected.length; lineIndex++) {
			const actualLine = model.getLineContent(lineIndex + 1);
			const actualTokens = model.tokenization.getLineTokens(lineIndex + 1);
			assert.strictEqual(actualLine, expected[lineIndex].text);
			assertLineTokens(actualTokens, expected[lineIndex].tokens);
		}

		model.dispose();
		d.dispose();
	}

	const applyEditsCases: [name: string, initial: IBufferLineState[], edits: IEdit[], expected: IBufferLineState[]][] = [
		['single delete 1', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 1, 1, 2), text: '' }], [{ text: 'ello world', tokens: [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)] }]],
		['single delete 2', [{ text: 'helloworld', tokens: [new TestToken(0, 1), new TestToken(5, 2)] }], [{ range: new Range(1, 3, 1, 8), text: '' }], [{ text: 'herld', tokens: [new TestToken(0, 1), new TestToken(2, 2)] }]],
		['single delete 3', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 1, 1, 6), text: '' }], [{ text: ' world', tokens: [new TestToken(0, 2), new TestToken(1, 3)] }]],
		['single delete 4', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 2, 1, 7), text: '' }], [{ text: 'hworld', tokens: [new TestToken(0, 1), new TestToken(1, 3)] }]],
		['single delete 5', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 1, 1, 12), text: '' }], [{ text: '', tokens: [new TestToken(0, 1)] }]],
		['multi delete 6', [
			{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] },
			{ text: 'hello world', tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)] },
			{ text: 'hello world', tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)] }
		], [{ range: new Range(1, 6, 3, 6), text: '' }], [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 8), new TestToken(6, 9)] }]],
		['multi delete 7', [
			{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] },
			{ text: 'hello world', tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)] },
			{ text: 'hello world', tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)] }
		], [{ range: new Range(1, 12, 3, 12), text: '' }], [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }]],
		['multi delete 8', [
			{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] },
			{ text: 'hello world', tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)] },
			{ text: 'hello world', tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)] }
		], [{ range: new Range(1, 1, 3, 1), text: '' }], [{ text: 'hello world', tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)] }]],
		['multi delete 9', [
			{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] },
			{ text: 'hello world', tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)] },
			{ text: 'hello world', tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)] }
		], [{ range: new Range(1, 12, 3, 1), text: '' }], [{ text: 'hello worldhello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3), new TestToken(11, 7), new TestToken(16, 8), new TestToken(17, 9)] }]],
		['single insert 1', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 1, 1, 1), text: 'xx' }], [{ text: 'xxhello world', tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)] }]],
		['single insert 2', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 2, 1, 2), text: 'xx' }], [{ text: 'hxxello world', tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)] }]],
		['single insert 3', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 6, 1, 6), text: 'xx' }], [{ text: 'helloxx world', tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)] }]],
		['single insert 4', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 7, 1, 7), text: 'xx' }], [{ text: 'hello xxworld', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(8, 3)] }]],
		['single insert 5', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 12, 1, 12), text: 'xx' }], [{ text: 'hello worldxx', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }]],
		['multi insert 6', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 1, 1, 1), text: '\n' }], [
			{ text: '', tokens: [new TestToken(0, 1)] },
			{ text: 'hello world', tokens: [new TestToken(0, 1)] }
		]],
		['multi insert 7', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 12, 1, 12), text: '\n' }], [
			{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] },
			{ text: '', tokens: [new TestToken(0, 1)] }
		]],
		['multi insert 8', [{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] }], [{ range: new Range(1, 7, 1, 7), text: '\n' }], [
			{ text: 'hello ', tokens: [new TestToken(0, 1), new TestToken(5, 2)] },
			{ text: 'world', tokens: [new TestToken(0, 1)] }
		]],
		['multi insert 9', [
			{ text: 'hello world', tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)] },
			{ text: 'hello world', tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)] }
		], [{ range: new Range(1, 7, 1, 7), text: 'xx\nyy' }], [
				{ text: 'hello xx', tokens: [new TestToken(0, 1), new TestToken(5, 2)] },
				{ text: 'yyworld', tokens: [new TestToken(0, 1)] },
				{ text: 'hello world', tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)] }
			]],
	];
	for (const [name, initial, edits, expected] of applyEditsCases) {
		test(name, () => {
			testApplyEdits(initial, edits, expected);
		});
	}

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
		const s = new ManualTokenizationSupport();
		const d = TokenizationRegistry.register('test', s);

		const model = createTextModel('some text', 'test');
		const tokens = TestToken.toTokens([new TestToken(0, 1)]);
		LineTokens.convertToEndOffset(tokens, model.getLineMaxColumn(1) - 1);
		s.setLineTokens(1, tokens);

		model.applyEdits([{
			range: new Range(1, 1, 1, 10),
			text: ''
		}]);

		s.setLineTokens(1, new Uint32Array(0));

		model.applyEdits([{
			range: new Range(1, 1, 1, 1),
			text: 'a'
		}]);

		const actualTokens = model.tokenization.getLineTokens(1);
		assertLineTokens(actualTokens, [new TestToken(0, 1)]);

		model.dispose();
		d.dispose();
	});

	const lineEditCases: [name: string, initialText: string, initialTokens: TestToken[], edits: ILineEdit[], expectedText: string, expectedTokens: TestToken[]][] = [
		['updates tokens on insertion 1', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 1, endColumn: 1, text: 'a' }], 'aabcd efgh', [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]],
		['updates tokens on insertion 2', 'aabcd efgh', [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)], [{ startColumn: 2, endColumn: 2, text: 'x' }], 'axabcd efgh', [new TestToken(0, 1), new TestToken(6, 2), new TestToken(7, 3)]],
		['updates tokens on insertion 3', 'axabcd efgh', [new TestToken(0, 1), new TestToken(6, 2), new TestToken(7, 3)], [{ startColumn: 3, endColumn: 3, text: 'stu' }], 'axstuabcd efgh', [new TestToken(0, 1), new TestToken(9, 2), new TestToken(10, 3)]],
		['updates tokens on insertion 4', 'axstuabcd efgh', [new TestToken(0, 1), new TestToken(9, 2), new TestToken(10, 3)], [{ startColumn: 10, endColumn: 10, text: '\t' }], 'axstuabcd\t efgh', [new TestToken(0, 1), new TestToken(10, 2), new TestToken(11, 3)]],
		['updates tokens on insertion 5', 'axstuabcd\t efgh', [new TestToken(0, 1), new TestToken(10, 2), new TestToken(11, 3)], [{ startColumn: 12, endColumn: 12, text: 'dd' }], 'axstuabcd\t ddefgh', [new TestToken(0, 1), new TestToken(10, 2), new TestToken(13, 3)]],
		['updates tokens on insertion 6', 'axstuabcd\t ddefgh', [new TestToken(0, 1), new TestToken(10, 2), new TestToken(13, 3)], [{ startColumn: 18, endColumn: 18, text: 'xyz' }], 'axstuabcd\t ddefghxyz', [new TestToken(0, 1), new TestToken(10, 2), new TestToken(13, 3)]],
		['updates tokens on insertion 7', 'axstuabcd\t ddefghxyz', [new TestToken(0, 1), new TestToken(10, 2), new TestToken(13, 3)], [{ startColumn: 1, endColumn: 1, text: 'x' }], 'xaxstuabcd\t ddefghxyz', [new TestToken(0, 1), new TestToken(11, 2), new TestToken(14, 3)]],
		['updates tokens on insertion 8', 'xaxstuabcd\t ddefghxyz', [new TestToken(0, 1), new TestToken(11, 2), new TestToken(14, 3)], [{ startColumn: 22, endColumn: 22, text: 'x' }], 'xaxstuabcd\t ddefghxyzx', [new TestToken(0, 1), new TestToken(11, 2), new TestToken(14, 3)]],
		['updates tokens on insertion 9', 'xaxstuabcd\t ddefghxyzx', [new TestToken(0, 1), new TestToken(11, 2), new TestToken(14, 3)], [{ startColumn: 2, endColumn: 2, text: '' }], 'xaxstuabcd\t ddefghxyzx', [new TestToken(0, 1), new TestToken(11, 2), new TestToken(14, 3)]],
		['updates tokens on insertion 10', '', [], [{ startColumn: 1, endColumn: 1, text: 'a' }], 'a', [new TestToken(0, 1)]],
		['delete second token 2', 'abcdefghij', [new TestToken(0, 1), new TestToken(3, 2), new TestToken(6, 3)], [{ startColumn: 4, endColumn: 7, text: '' }], 'abcghij', [new TestToken(0, 1), new TestToken(3, 3)]],
		['insert right before second token', 'abcdefghij', [new TestToken(0, 1), new TestToken(3, 2), new TestToken(6, 3)], [{ startColumn: 4, endColumn: 4, text: 'hello' }], 'abchellodefghij', [new TestToken(0, 1), new TestToken(8, 2), new TestToken(11, 3)]],
		['delete first char', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 1, endColumn: 2, text: '' }], 'bcd efgh', [new TestToken(0, 1), new TestToken(3, 2), new TestToken(4, 3)]],
		['delete 2nd and 3rd chars', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 2, endColumn: 4, text: '' }], 'ad efgh', [new TestToken(0, 1), new TestToken(2, 2), new TestToken(3, 3)]],
		['delete first token', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 1, endColumn: 5, text: '' }], ' efgh', [new TestToken(0, 2), new TestToken(1, 3)]],
		['delete second token', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 5, endColumn: 6, text: '' }], 'abcdefgh', [new TestToken(0, 1), new TestToken(4, 3)]],
		['delete second token + a bit of the third one', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 5, endColumn: 7, text: '' }], 'abcdfgh', [new TestToken(0, 1), new TestToken(4, 3)]],
		['delete second and third token', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 5, endColumn: 10, text: '' }], 'abcd', [new TestToken(0, 1)]],
		['delete everything', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 1, endColumn: 10, text: '' }], '', [new TestToken(0, 1)]],
		['noop', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 1, endColumn: 1, text: '' }], 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]],
		['equivalent to deleting first two chars', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 1, endColumn: 3, text: '' }], 'cd efgh', [new TestToken(0, 1), new TestToken(2, 2), new TestToken(3, 3)]],
		['equivalent to deleting from 5 to the end', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], [{ startColumn: 5, endColumn: 10, text: '' }], 'abcd', [new TestToken(0, 1)]],
		['updates tokens on replace 1', 'Hello world, ciao', [new TestToken(0, 1), new TestToken(5, 0), new TestToken(6, 2), new TestToken(11, 0), new TestToken(13, 0)], [{ startColumn: 1, endColumn: 6, text: 'Hi' }], 'Hi world, ciao', [new TestToken(0, 0), new TestToken(3, 2), new TestToken(8, 0), new TestToken(10, 0)]],
		['updates tokens on replace 2', 'Hello world, ciao', [new TestToken(0, 1), new TestToken(5, 0), new TestToken(6, 2), new TestToken(11, 0), new TestToken(13, 0)], [{ startColumn: 1, endColumn: 6, text: 'Hi' }, { startColumn: 8, endColumn: 12, text: 'my friends' }], 'Hi wmy friends, ciao', [new TestToken(0, 0), new TestToken(3, 2), new TestToken(14, 0), new TestToken(16, 0)]],
	];
	for (const [name, initialText, initialTokens, edits, expectedText, expectedTokens] of lineEditCases) {
		test(name, () => {
			testLineEditTokens(initialText, initialTokens, edits, expectedText, expectedTokens);
		});
	}

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

	const lineSplitCases: [name: string, splitColumn: number, expectedText1: string, expectedText2: string, expectedTokens: TestToken[]][] = [
		['split at the beginning', 1, '', 'abcd efgh', [new TestToken(0, 1)]],
		['split at the end', 10, 'abcd efgh', '', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]],
		['split inthe middle 1', 5, 'abcd', ' efgh', [new TestToken(0, 1)]],
		['split inthe middle 2', 6, 'abcd ', 'efgh', [new TestToken(0, 1), new TestToken(4, 2)]],
	];
	for (const [name, splitColumn, expectedText1, expectedText2, expectedTokens] of lineSplitCases) {
		test(name, () => {
			testLineSplitTokens('abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], splitColumn, expectedText1, expectedText2, expectedTokens);
		});
	}

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

	const lineAppendCases: [name: string, aText: string, aTokens: TestToken[], bText: string, bTokens: TestToken[], expectedText: string, expectedTokens: TestToken[]][] = [
		['append empty 1', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], '', [], 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]],
		['append empty 2', '', [], 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]],
		['append 1', 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)], 'abcd efgh', [new TestToken(0, 4), new TestToken(4, 5), new TestToken(5, 6)], 'abcd efghabcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3), new TestToken(9, 4), new TestToken(13, 5), new TestToken(14, 6)]],
		['append 2', 'abcd ', [new TestToken(0, 1), new TestToken(4, 2)], 'efgh', [new TestToken(0, 3)], 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]],
		['append 3', 'abcd', [new TestToken(0, 1)], ' efgh', [new TestToken(0, 2), new TestToken(1, 3)], 'abcd efgh', [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]],
	];
	for (const [name, aText, aTokens, bText, bTokens, expectedText, expectedTokens] of lineAppendCases) {
		test(name, () => {
			testLineAppendTokens(aText, aTokens, bText, bTokens, expectedText, expectedTokens);
		});
	}
});
