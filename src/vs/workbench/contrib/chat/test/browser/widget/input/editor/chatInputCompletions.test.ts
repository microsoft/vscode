/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { CompletionItem, CompletionItemKind, CompletionTriggerKind } from '../../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../../editor/common/model.js';
import { LanguageFeaturesService } from '../../../../../../../../editor/common/services/languageFeaturesService.js';
import { createTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { AgentHostInputCompletionsBase } from '../../../../../browser/widget/input/editor/agentHostInputCompletionsBase.js';
import { attachedContextCompletionSortText, computeCompletionRanges, escapeForCharClass, getAttachedContextCompletionFilterText, isAtTriggerCharacterToken } from '../../../../../browser/widget/input/editor/chatInputCompletionUtils.js';
import { IChatInputCompletionItem, IChatInputCompletionsParams, IChatInputCompletionsResult } from '../../../../../common/chatSessionsService.js';
import { chatAgentLeader, chatVariableLeader } from '../../../../../common/requestParser/chatParserTypes.js';
import { MockChatSessionsService } from '../../../../common/mockChatSessionsService.js';

class TestChatSessionsService extends MockChatSessionsService {
	override async provideChatInputCompletions(_sessionResource: URI, _params: IChatInputCompletionsParams, _token: CancellationToken): Promise<IChatInputCompletionsResult> {
		return {
			items: [{
				insertText: '#roadmap.md',
				attachment: {
					kind: 'resource',
					uri: URI.file('/workspace/roadmap.md'),
				},
			}],
		};
	}
}

class TestAgentHostInputCompletions extends AgentHostInputCompletionsBase<void> {
	register(): IDisposable {
		return this._registerProvider({ scheme: 'test' }, 'testAgentHostInputCompletions', ['#'], undefined);
	}

	protected override _resolveContext(_model: ITextModel): { sessionResource: URI; context: void } {
		return { sessionResource: URI.parse('test:session'), context: undefined };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem {
		return {
			label: item.insertText,
			insertText: item.insertText,
			range: Range.fromPositions(position),
			kind: CompletionItemKind.File,
		};
	}
}

suite('AgentHostInputCompletionsBase', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks results incomplete so the host is queried as the token changes', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService()));
		store.add(completions.register());
		const model = store.add(createTextModel('#', null, undefined, URI.parse('test:input')));
		const provider = languageFeaturesService.completionProvider.ordered(model)[0];

		const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '#' }, CancellationToken.None);

		assert.deepStrictEqual(result, {
			suggestions: [{
				label: '#roadmap.md',
				insertText: '#roadmap.md',
				range: new Range(1, 2, 1, 2),
				kind: CompletionItemKind.File,
			}],
			incomplete: true,
		});
	});
});

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

suite('attached context completion ranking', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts before other chat input completions', () => {
		assert.ok(attachedContextCompletionSortText < ' ');
	});

	test('matches bare and partial leaders from the start of filter text', () => {
		assert.deepStrictEqual({
			at: getAttachedContextCompletionFilterText('@', 'Screen Recording.mov', 'file'),
			hash: getAttachedContextCompletionFilterText('#', 'Screen Recording.mov', 'file'),
		}, {
			at: '@Screen Recording.mov @attachment:Screen Recording.mov Screen Recording.mov file',
			hash: '#Screen Recording.mov #attachment:Screen Recording.mov Screen Recording.mov file',
		});
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

suite('isAtTriggerCharacterToken', () => {

	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	const triggerChars = ['@', '#'];

	function check(text: string, column: number, expected: boolean): void {
		const model = store.add(createTextModel(text, null, undefined, URI.parse('test:input')));
		assert.strictEqual(
			isAtTriggerCharacterToken(model, new Position(1, column), triggerChars),
			expected,
			`text=${JSON.stringify(text)} column=${column}`,
		);
	}

	test('cursor right after a trigger character at start of line', () => {
		check('@', 2, true);
	});

	test('cursor inside a trigger-led token at start of line', () => {
		check('@file', 4, true);
	});

	test('cursor at end of a trigger-led token at start of line', () => {
		check('@file', 6, true);
	});

	test('cursor inside a trigger-led token mid-line', () => {
		check('hello @file', 10, true);
	});

	test('cursor inside a # trigger-led token', () => {
		check('hello #file', 10, true);
	});

	test('cursor inside a non-trigger-led word at start of line', () => {
		check('hello', 4, false);
	});

	test('cursor inside a non-trigger-led word mid-line', () => {
		check('say hello', 8, false);
	});

	test('cursor at start of empty line', () => {
		check('', 1, false);
	});

	test('cursor right after whitespace, no token yet', () => {
		check('hello ', 7, false);
	});

	test('cursor after a trigger-led token followed by space', () => {
		// Cursor sits in the empty token after the space, not in the @file token.
		check('@file ', 7, false);
	});

	test('cursor in token whose first char is not a trigger char', () => {
		check('abc@def', 8, false); // first char of token is 'a', not '@'
	});

	test('returns false when no trigger characters are configured', () => {
		const model = store.add(createTextModel('@file', null, undefined, URI.parse('test:input')));
		assert.strictEqual(isAtTriggerCharacterToken(model, new Position(1, 4), []), false);
	});
});
