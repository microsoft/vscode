/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { createTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { computeCompletionRanges, escapeForCharClass } from '../../../../../browser/widget/input/editor/chatInputCompletionUtils.js';
import { chatAgentLeader, chatVariableLeader } from '../../../../../common/requestParser/chatParserTypes.js';

suite('escapeForCharClass', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes through simple characters unchanged', () => {
		assert.strictEqual(escapeForCharClass('a'), 'a');
		assert.strictEqual(escapeForCharClass('#'), '#');
		assert.strictEqual(escapeForCharClass('@'), '@');
	});

	test('escapes backslash', () => {
		assert.strictEqual(escapeForCharClass('\\'), '\\\\');
	});

	test('escapes closing bracket', () => {
		assert.strictEqual(escapeForCharClass(']'), '\\]');
	});

	test('escapes caret', () => {
		assert.strictEqual(escapeForCharClass('^'), '\\^');
	});

	test('escapes hyphen', () => {
		assert.strictEqual(escapeForCharClass('-'), '\\-');
	});

	test('escapes multiple special chars in one string', () => {
		assert.strictEqual(escapeForCharClass('-^]\\'), '\\-\\^\\]\\\\');
	});

	test('is safe to use for chatVariableLeader and chatAgentLeader', () => {
		// These are the actual values used in the product code
		const escaped = `[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]`;
		const re = new RegExp(escaped);
		assert.ok(re.test('#'));
		assert.ok(re.test('@'));
		assert.ok(!re.test('a'));
		assert.ok(!re.test('/'));
	});
});

suite('computeCompletionRanges', () => {

	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// Helper: builds the same regex patterns used in the product code
	function variableNameDef() {
		return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, 'g');
	}

	function fileWordPattern() {
		return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, 'g');
	}

	function toolVariableNameDef() {
		return new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, 'g');
	}

	// --- VariableNameDef pattern tests ---

	suite('with VariableNameDef regex', () => {

		test('matches #variable at start of line', () => {
			const model = store.add(createTextModel('#file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 1, 1, 6),
				replace: new Range(1, 1, 1, 6),
				varWord: { word: '#file', startColumn: 1, endColumn: 6 },
			});
		});

		test('matches @variable at start of line', () => {
			const model = store.add(createTextModel('@file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 1, 1, 6),
				replace: new Range(1, 1, 1, 6),
				varWord: { word: '@file', startColumn: 1, endColumn: 6 },
			});
		});

		test('matches #variable mid-line after space', () => {
			const model = store.add(createTextModel('hello #file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 7, 1, 12),
				replace: new Range(1, 7, 1, 12),
				varWord: { word: '#file', startColumn: 7, endColumn: 12 },
			});
		});

		test('matches @variable mid-line after space', () => {
			const model = store.add(createTextModel('hello @file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 7, 1, 12),
				replace: new Range(1, 7, 1, 12),
				varWord: { word: '@file', startColumn: 7, endColumn: 12 },
			});
		});

		test('matches # alone (just the leader)', () => {
			const model = store.add(createTextModel('#', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#');
		});

		test('matches @ alone (just the leader)', () => {
			const model = store.add(createTextModel('@', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@');
		});

		test('matches variable with colons and hyphens', () => {
			const model = store.add(createTextModel('#file:test-1', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 13), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file:test-1');
		});

		test('cursor in middle of variable produces partial insert range', () => {
			const model = store.add(createTextModel('@selection', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 5), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 1, 1, 5),
				replace: new Range(1, 1, 1, 11),
				varWord: { word: '@selection', startColumn: 1, endColumn: 11 },
			});
		});
	});

	// --- fileWordPattern tests ---

	suite('with fileWordPattern regex', () => {

		test('matches #file:path/to/file.ts', () => {
			const model = store.add(createTextModel('#file:path/to/file.ts', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file:path/to/file.ts');
		});

		test('matches @file:path/to/file.ts', () => {
			const model = store.add(createTextModel('@file:path/to/file.ts', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@file:path/to/file.ts');
		});

		test('stops at whitespace', () => {
			const model = store.add(createTextModel('#file:test rest', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 11), fileWordPattern());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file:test');
		});
	});

	// --- toolVariableNameDef tests ---

	suite('with toolVariableNameDef regex', () => {

		test('matches #tool at start of line', () => {
			const model = store.add(createTextModel('#tool', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#tool');
		});

		test('matches @tool at start of line', () => {
			const model = store.add(createTextModel('@tool', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@tool');
		});

		test('matches #tool after space', () => {
			const model = store.add(createTextModel('use #fetch', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#fetch');
		});

		test('matches @tool after space', () => {
			const model = store.add(createTextModel('use @fetch', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@fetch');
		});
	});

	// --- Edge cases ---

	suite('edge cases', () => {

		test('returns undefined inside a normal word', () => {
			const model = store.add(createTextModel('hello', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
			assert.strictEqual(result, undefined);
		});

		test('returns undefined when no space before cursor mid-line', () => {
			const model = store.add(createTextModel('ab', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
			assert.strictEqual(result, undefined);
		});

		test('returns empty range at blank position after space', () => {
			const model = store.add(createTextModel('hello ', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 7), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord, null);
			assert.deepStrictEqual(result.insert, Range.fromPositions(new Position(1, 7)));
		});

		test('returns empty range at start of empty line', () => {
			const model = store.add(createTextModel('', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 1), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord, null);
		});

		test('onlyOnWordStart=true rejects variable preceded by a word', () => {
			const model = store.add(createTextModel('abc#file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 9), variableNameDef(), true);
			assert.strictEqual(result, undefined);
		});

		test('onlyOnWordStart=true accepts variable after space', () => {
			const model = store.add(createTextModel('abc #file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file');
		});

		test('onlyOnWordStart=true accepts @variable after space', () => {
			const model = store.add(createTextModel('abc @file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@file');
		});
	});
});
