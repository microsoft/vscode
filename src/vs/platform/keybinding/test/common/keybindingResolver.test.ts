/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding, createSimpleKeybinding, KeyCodeChord } from '../../../../base/common/keybindings.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { OS } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextKeyExpr, ContextKeyExpression, IContext } from '../../../contextkey/common/contextkey.js';
import { KeybindingResolver, ResultKind } from '../../common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../common/usLayoutResolvedKeybinding.js';
import { createUSLayoutResolvedKeybinding } from './keybindingsTestUtils.js';

function createContext(ctx: any) {
	return {
		getValue: (key: string) => {
			return ctx[key];
		}
	};
}

suite('KeybindingResolver', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function kbItem(keybinding: number | number[], command: string, commandArgs: any, when: ContextKeyExpression | undefined, isDefault: boolean): ResolvedKeybindingItem {
		const resolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
		return new ResolvedKeybindingItem(
			resolvedKeybinding,
			command,
			commandArgs,
			when,
			isDefault,
			null,
			false
		);
	}

	function getDispatchStr(chord: KeyCodeChord): string {
		return USLayoutResolvedKeybinding.getDispatchStr(chord)!;
	}

	test('resolve key', () => {
		const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
		const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
		const contextRules = ContextKeyExpr.equals('bar', 'baz');
		const keybindingItem = kbItem(keybinding, 'yes', null, contextRules, true);

		assert.strictEqual(contextRules.evaluate(createContext({ bar: 'baz' })), true);
		assert.strictEqual(contextRules.evaluate(createContext({ bar: 'bz' })), false);

		const resolver = new KeybindingResolver([keybindingItem], [], () => { });

		const r1 = resolver.resolve(createContext({ bar: 'baz' }), [], getDispatchStr(runtimeKeybinding));
		assert.ok(r1.kind === ResultKind.KbFound);
		assert.strictEqual(r1.commandId, 'yes');

		const r2 = resolver.resolve(createContext({ bar: 'bz' }), [], getDispatchStr(runtimeKeybinding));
		assert.strictEqual(r2.kind, ResultKind.NoMatchingKb);
	});

	test('resolve key with arguments', () => {
		const commandArgs = { text: 'no' };
		const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
		const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
		const contextRules = ContextKeyExpr.equals('bar', 'baz');
		const keybindingItem = kbItem(keybinding, 'yes', commandArgs, contextRules, true);

		const resolver = new KeybindingResolver([keybindingItem], [], () => { });

		const r = resolver.resolve(createContext({ bar: 'baz' }), [], getDispatchStr(runtimeKeybinding));
		assert.ok(r.kind === ResultKind.KbFound);
		assert.strictEqual(r.commandArgs, commandArgs);
	});

	suite('troubleshooting', () => {
		test('reports all candidates in priority order without changing the selected command', () => {
			const logs: string[] = [];
			const resolver = new KeybindingResolver([
				kbItem(KeyCode.KeyR, 'fallback', undefined, undefined, true),
				kbItem(KeyCode.KeyR, 'enabledCommand', undefined, ContextKeyExpr.has('enabled'), true),
			], [
				kbItem(KeyCode.KeyR, 'guardedCommand', undefined, ContextKeyExpr.deserialize('definition && focus && !readOnly'), false),
			], message => logs.push(message), () => true);

			const result = resolver.resolve(createContext({ definition: true, focus: false, enabled: true }), [], 'R');

			assert.deepStrictEqual({ result, candidates: logs.filter(line => line.startsWith('| Candidate')) }, {
				result: { kind: ResultKind.KbFound, commandId: 'enabledCommand', commandArgs: undefined, isBubble: false },
				candidates: [
					'| Candidate guardedCommand, source: user, when: [true: definition] && [false: focus] && [true: !readOnly]',
					'| Candidate enabledCommand, source: built-in, when: [true: enabled]',
					'| Candidate fallback, source: built-in, when: [true: no when condition]',
				]
			});
		});

		test('reports terms that normal AND and OR evaluation would skip', () => {
			const logs: string[] = [];
			const resolver = new KeybindingResolver([], [
				kbItem(KeyCode.KeyR, 'command', undefined, ContextKeyExpr.deserialize('enabled || focus && !busy'), false),
			], message => logs.push(message), () => true);

			resolver.resolve(createContext({ enabled: true, focus: false }), [], 'R');

			assert.deepStrictEqual(logs.filter(line => line.startsWith('| Candidate')), [
				'| Candidate command, source: user, when: [true: enabled] || [false: focus] && [true: !busy]'
			]);
		});

		for (const { expression, context, expected } of [
			{ expression: 'missing', context: {}, expected: '[false: missing]' },
			{ expression: '!missing', context: {}, expected: '[true: !missing]' },
			{ expression: "language == 'typescript'", context: { language: 'typescript' }, expected: "[true: language == 'typescript']" },
			{ expression: "language != 'typescript'", context: { language: 'typescript' }, expected: "[false: language != 'typescript']" },
			{ expression: 'count >= 2', context: { count: 2 }, expected: '[true: count >= 2]' },
			{ expression: 'count < 2', context: { count: 2 }, expected: '[false: count < 2]' },
			{ expression: 'name =~ /^file/', context: { name: 'file.ts' }, expected: '[true: name =~ /^file/]' },
			{ expression: '!(name =~ /^file/)', context: { name: 'file.ts' }, expected: '[false: !(name =~ /^file/)]' },
			{ expression: "name in 'allowed'", context: { name: 'file.ts', allowed: ['file.ts'] }, expected: "[true: name in 'allowed']" },
			{ expression: "name not in 'allowed'", context: { name: 'file.ts', allowed: ['file.ts'] }, expected: "[false: name not in 'allowed']" },
		]) {
			test(`evaluates ${expression}`, () => {
				const logs: string[] = [];
				const resolver = new KeybindingResolver([], [
					kbItem(KeyCode.KeyR, 'command', undefined, ContextKeyExpr.deserialize(expression), false),
				], message => logs.push(message), () => true);

				resolver.resolve(createContext(context), [], 'R');

				assert.deepStrictEqual(logs.filter(line => line.startsWith('| Candidate')), [
					`| Candidate command, source: user, when: ${expected}`
				]);
			});
		}

		test('escapes condition delimiters and line breaks', () => {
			const logs: string[] = [];
			const value = 'a]\\b\nc';
			const resolver = new KeybindingResolver([], [
				kbItem(KeyCode.KeyR, 'command', undefined, ContextKeyExpr.equals('value', value), false),
			], message => logs.push(message), () => true);

			resolver.resolve(createContext({ value }), [], 'R');

			assert.deepStrictEqual(logs.filter(line => line.startsWith('| Candidate')), [
				String.raw`| Candidate command, source: user, when: [true: value == 'a\]\\b\nc']`
			]);
		});

		test('does not evaluate skipped candidates while troubleshooting is disabled', () => {
			let logging = false;
			let reads = 0;
			const logs: string[] = [];
			const resolver = new KeybindingResolver([
				kbItem(KeyCode.KeyR, 'guarded', undefined, ContextKeyExpr.has('enabled'), true),
				kbItem(KeyCode.KeyR, 'winner', undefined, undefined, true),
			], [], message => logs.push(message), () => logging);
			const context: IContext = { getValue: () => { reads++; return undefined; } };

			resolver.resolve(context, [], 'R');
			const readsBeforeEnabling = reads;
			logging = true;
			resolver.resolve(context, [], 'R');
			logging = false;
			resolver.resolve(context, [], 'R');

			assert.deepStrictEqual({ readsBeforeEnabling, reads, candidates: logs.filter(line => line.startsWith('| Candidate')) }, {
				readsBeforeEnabling: 0,
				reads: 1,
				candidates: [
					'| Candidate winner, source: built-in, when: [true: no when condition]',
					'| Candidate guarded, source: built-in, when: [false: enabled]',
				]
			});
		});

		test('keeps the selected command when a skipped candidate throws during troubleshooting', () => {
			let logging = false;
			const logs: string[] = [];
			const resolver = new KeybindingResolver([
				kbItem(KeyCode.KeyR, 'fallback', undefined, undefined, true),
				kbItem(KeyCode.KeyR, 'invalidComparison', undefined, ContextKeyExpr.greater('items', 0), true),
				kbItem(KeyCode.KeyR, 'winner', undefined, undefined, true),
			], [], message => logs.push(message), () => logging);
			const context = createContext({ items: { toString: 'entry' } });
			const expected = resolver.resolve(context, [], 'R');

			logging = true;
			const result = resolver.resolve(context, [], 'R');

			assert.deepStrictEqual({ result, candidates: logs.filter(line => line.startsWith('| Candidate')) }, {
				result: expected,
				candidates: [
					'| Candidate winner, source: built-in, when: [true: no when condition]',
					'| Candidate invalidComparison, source: built-in, when: [error: items > 0]',
					'| Candidate fallback, source: built-in, when: [true: no when condition]',
				]
			});
		});

		for (const { expression, expected } of [
			{ expression: 'enabled || items > 0 && total > 0', expected: '[true: enabled] || [error: items > 0] && [true: total > 0]' },
			{ expression: 'disabled && items > 0 && total > 0', expected: '[false: disabled] && [error: items > 0] && [true: total > 0]' },
		]) {
			test(`continues troubleshooting after an error in ${expression}`, () => {
				let logging = false;
				const logs: string[] = [];
				const resolver = new KeybindingResolver([
					kbItem(KeyCode.KeyR, 'fallback', undefined, undefined, true),
				], [
					kbItem(KeyCode.KeyR, 'conditional', undefined, ContextKeyExpr.deserialize(expression), false),
				], message => logs.push(message), () => logging);
				const context = createContext({ enabled: true, disabled: false, items: { toString: 'entry' }, total: 1 });
				const expectedResult = resolver.resolve(context, [], 'R');

				logging = true;
				const result = resolver.resolve(context, [], 'R');

				assert.deepStrictEqual({ result, candidates: logs.filter(line => line.startsWith('| Candidate')) }, {
					result: expectedResult,
					candidates: [
						`| Candidate conditional, source: user, when: ${expected}`,
						'| Candidate fallback, source: built-in, when: [true: no when condition]',
					]
				});
			});
		}

		test('only reports candidates matching the current chord sequence', () => {
			const logs: string[] = [];
			const resolver = new KeybindingResolver([
				kbItem(KeyChord(KeyCode.KeyK, KeyCode.KeyR), 'chosenChord', undefined, undefined, true),
				kbItem(KeyChord(KeyCode.KeyK, KeyCode.KeyT), 'otherChord', undefined, undefined, true),
			], [], message => logs.push(message), () => true);

			resolver.resolve(createContext({}), ['K'], 'R');

			assert.deepStrictEqual(logs.filter(line => line.startsWith('| Candidate')), [
				'| Candidate chosenChord, source: built-in, when: [true: no when condition]'
			]);
		});
	});

	suite('handle keybinding removals', () => {

		test('simple 1', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false),
			]);
		});

		test('simple 2', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyC, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
				kbItem(KeyCode.KeyC, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false),
			]);
		});

		test('removal with not matching when', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-yes1', null, ContextKeyExpr.equals('1', 'b'), false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('removal with not matching keybinding', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyB, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('removal with matching keybinding and when', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('removal with unspecified keybinding', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(0, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('removal with unspecified when', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-yes1', null, undefined, false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('removal with unspecified when and unspecified keybinding', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(0, '-yes1', null, undefined, false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('issue #138997 - removal in default list', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'yes1', null, undefined, true),
				kbItem(KeyCode.KeyB, 'yes2', null, undefined, true),
				kbItem(0, '-yes1', null, undefined, false)
			];
			const overrides: ResolvedKeybindingItem[] = [];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyB, 'yes2', null, undefined, true)
			]);
		});

		test('issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, '^yes1', null, ContextKeyExpr.equals('1', 'a'), true),
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-yes1', null, undefined, false)
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyB, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
			]);
		});

		test('issue #140884 Unable to reassign F1 as keybinding for Show All Commands', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'command1', null, undefined, true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-command1', null, undefined, false),
				kbItem(KeyCode.KeyA, 'command1', null, undefined, false),
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'command1', null, undefined, false)
			]);
		});

		test('issue #141638: Keyboard Shortcuts: Change When Expression might actually remove keybinding in Insiders', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'command1', null, undefined, true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, 'command1', null, ContextKeyExpr.equals('a', '1'), false),
				kbItem(KeyCode.KeyA, '-command1', null, undefined, false),
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'command1', null, ContextKeyExpr.equals('a', '1'), false)
			]);
		});

		test('issue #157751: Auto-quoting of context keys prevents removal of keybindings via UI', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'command1', null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != workbench.editor.notebook && editorLangId in julia.supportedLanguageIds`), true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-command1', null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != 'workbench.editor.notebook' && editorLangId in 'julia.supportedLanguageIds'`), false),
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, []);
		});

		test('issue #293802: removal still matches when default when clause becomes more specific', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'command1', null, ContextKeyExpr.and(ContextKeyExpr.has('inChatInput'), ContextKeyExpr.not('withinEditSessionDiff')), true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-command1', null, ContextKeyExpr.has('inChatInput'), false),
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, []);
		});

		test('removal with more specific when clause does not match broader default', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'command1', null, ContextKeyExpr.has('inChatInput'), true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-command1', null, ContextKeyExpr.and(ContextKeyExpr.has('inChatInput'), ContextKeyExpr.not('withinEditSessionDiff')), false),
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, [
				kbItem(KeyCode.KeyA, 'command1', null, ContextKeyExpr.has('inChatInput'), true),
			]);
		});

		test('issue #338834: removing the chat steer or queue Enter keybinding from the Keyboard Shortcuts editor works', () => {
			// The default `when` clauses as chatQueueActions.ts builds them, merged with the action precondition
			const editingQueue = ContextKeyExpr.equals('chatEditingSentRequest', 'q');
			const editingSteer = ContextKeyExpr.equals('chatEditingSentRequest', 'st');
			const editingQueueOrSteer = ContextKeyExpr.or(editingQueue, editingSteer)!;
			const queuingActionsPresent = ContextKeyExpr.and(
				ContextKeyExpr.not('chatTranscriptProgressActive'),
				ContextKeyExpr.or(ContextKeyExpr.has('chatSessionRequestInProgress'), editingQueueOrSteer),
				ContextKeyExpr.notEquals('chatEditingSentRequest', 's'),
			);
			const steerIsDefault = ContextKeyExpr.equals('config.chat.requestQueuing.defaultAction', 'steer');
			const effectiveDefaultIsQueue = ContextKeyExpr.or(ContextKeyExpr.and(steerIsDefault.negate(), editingQueueOrSteer.negate()), editingQueue);
			const effectiveDefaultIsSteer = ContextKeyExpr.or(ContextKeyExpr.and(steerIsDefault, editingQueueOrSteer.negate()), editingSteer);
			const precondition = ContextKeyExpr.and(ContextKeyExpr.has('chatInputHasText'), ContextKeyExpr.not('chatTranscriptProgressActive'), ContextKeyExpr.not('chatInputBlocked'));

			const defaults = [
				kbItem(KeyCode.Enter, 'workbench.action.chat.steerWithMessage', null, ContextKeyExpr.and(precondition, ContextKeyExpr.and(ContextKeyExpr.has('inChatInput'), queuingActionsPresent, effectiveDefaultIsSteer)), true),
				kbItem(KeyCode.Enter, 'workbench.action.chat.queueMessage', null, ContextKeyExpr.and(precondition, ContextKeyExpr.and(ContextKeyExpr.has('inChatInput'), queuingActionsPresent, effectiveDefaultIsQueue)), true),
			];
			// "Remove Keybinding" writes the serialized default `when`, which is parsed when keybindings.json is read
			const overrides = defaults.map(kb => kbItem(KeyCode.Enter, `-${kb.command}`, null, ContextKeyExpr.deserialize(kb.when!.serialize()), false));

			const actual = defaults.map((kb, i) => KeybindingResolver.handleRemovals([kb, overrides[i]]).map(kb => kb.command));
			assert.deepStrictEqual(actual, [[], []]);
		});

		test('issue #160604: Remove keybindings with when clause does not work', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'command1', null, undefined, true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-command1', null, ContextKeyExpr.true(), false),
			];
			const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
			assert.deepStrictEqual(actual, []);
		});

		test('contextIsEntirelyIncluded', () => {
			const toContextKeyExpression = (expr: ContextKeyExpression | string | null) => {
				if (typeof expr === 'string' || !expr) {
					return ContextKeyExpr.deserialize(expr);
				}
				return expr;
			};
			const assertIsIncluded = (a: ContextKeyExpression | string | null, b: ContextKeyExpression | string | null) => {
				assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), true);
			};
			const assertIsNotIncluded = (a: ContextKeyExpression | string | null, b: ContextKeyExpression | string | null) => {
				assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), false);
			};

			assertIsIncluded(null, null);
			assertIsIncluded(null, ContextKeyExpr.true());
			assertIsIncluded(ContextKeyExpr.true(), null);
			assertIsIncluded(ContextKeyExpr.true(), ContextKeyExpr.true());
			assertIsIncluded('key1', null);
			assertIsIncluded('key1', '');
			assertIsIncluded('key1', 'key1');
			assertIsIncluded('key1', ContextKeyExpr.true());
			assertIsIncluded('!key1', '');
			assertIsIncluded('!key1', '!key1');
			assertIsIncluded('key2', '');
			assertIsIncluded('key2', 'key2');
			assertIsIncluded('key1 && key1 && key2 && key2', 'key2');
			assertIsIncluded('key1 && key2', 'key2');
			assertIsIncluded('key1 && key2', 'key1');
			assertIsIncluded('key1 && key2', '');
			assertIsIncluded('key1', 'key1 || key2');
			assertIsIncluded('key1 || !key1', 'key2 || !key2');
			assertIsIncluded('key1', 'key1 || key2 && key3');

			assertIsNotIncluded('key1', '!key1');
			assertIsNotIncluded('!key1', 'key1');
			assertIsNotIncluded('key1 && key2', 'key3');
			assertIsNotIncluded('key1 && key2', 'key4');
			assertIsNotIncluded('key1', 'key2');
			assertIsNotIncluded('key1 || key2', 'key2');
			assertIsNotIncluded('', 'key2');
			assertIsNotIncluded(null, 'key2');
		});
	});

	suite('keybinding aliases', () => {

		const alias = { command: 'sessions', source: 'toggleChat', when: ContextKeyExpr.has('agentsWindow') };
		const toggleChatWhen = ContextKeyExpr.has('chatViewVisible');

		function resolveCommands(defaults: ResolvedKeybindingItem[], overrides: ResolvedKeybindingItem[], keybindings: number[]) {
			const aliased = KeybindingResolver.applyAliases(defaults, overrides, [alias]);
			const resolver = new KeybindingResolver(aliased.defaults, aliased.overrides, () => { });
			const resolve = (context: object) => keybindings.map(keybinding => {
				const result = resolver.resolve(createContext(context), [], getDispatchStr(createSimpleKeybinding(keybinding, OS)));
				return result.kind === ResultKind.KbFound ? result.commandId : null;
			});
			return { agentsWindow: resolve({ agentsWindow: true }), editorWindow: resolve({ chatViewVisible: true }) };
		}

		test('binds the alias to the keybindings of its source, including the user\'s, where the alias applies, outranking the source', () => {
			const defaults = [kbItem(KeyCode.KeyA, 'toggleChat', null, toggleChatWhen, true)];
			const overrides = [kbItem(KeyCode.KeyB, 'toggleChat', null, undefined, false)];

			assert.deepStrictEqual(resolveCommands(defaults, overrides, [KeyCode.KeyA, KeyCode.KeyB]), {
				agentsWindow: ['sessions', 'sessions'],
				editorWindow: ['toggleChat', 'toggleChat'],
			});
		});

		test('removes the keybindings removed from its source, and lets the user remove the keybindings it inherits', () => {
			const defaults = [
				kbItem(KeyCode.KeyA, 'openChat', null, undefined, true),
				kbItem(KeyCode.KeyA, 'sessions', null, alias.when, true),
			];
			const overrides = [
				kbItem(KeyCode.KeyA, '-toggleChat', null, toggleChatWhen, false),
				kbItem(KeyCode.KeyB, 'toggleChat', null, toggleChatWhen, false),
				kbItem(KeyCode.KeyC, 'toggleChat', null, toggleChatWhen, false),
				kbItem(KeyCode.KeyC, '-sessions', null, undefined, false),
			];

			assert.deepStrictEqual(resolveCommands(defaults, overrides, [KeyCode.KeyA, KeyCode.KeyB, KeyCode.KeyC]), {
				agentsWindow: ['openChat', 'sessions', null],
				editorWindow: ['openChat', 'toggleChat', 'toggleChat'],
			});
		});

		test('keeps the keybindings it inherits from the user when the removed keybindings of its source share their key', () => {
			const defaults = [kbItem(KeyCode.KeyA, 'sessions', null, alias.when, true)];
			// Changing only the when clause in the Keyboard Shortcuts editor removes the default at the same key.
			const sameKey = [
				kbItem(KeyCode.KeyA, 'toggleChat', null, ContextKeyExpr.has('other'), false),
				kbItem(KeyCode.KeyA, '-toggleChat', null, toggleChatWhen, false),
			];
			const anyKey = [
				kbItem(KeyCode.KeyB, 'toggleChat', null, undefined, false),
				new ResolvedKeybindingItem(undefined, '-toggleChat', null, undefined, false, null, false),
			];

			assert.deepStrictEqual({
				sameKey: resolveCommands(defaults, sameKey, [KeyCode.KeyA]).agentsWindow,
				anyKey: resolveCommands(defaults, anyKey, [KeyCode.KeyA, KeyCode.KeyB]).agentsWindow,
			}, {
				sameKey: ['sessions'],
				anyKey: [null, 'sessions'],
			});
		});
	});

	suite('resolve command', () => {

		function _kbItem(keybinding: number | number[], command: string, when: ContextKeyExpression | undefined): ResolvedKeybindingItem {
			return kbItem(keybinding, command, null, when, true);
		}

		const items = [
			// This one will never match because its "when" is always overwritten by another one
			_kbItem(
				KeyCode.KeyX,
				'first',
				ContextKeyExpr.and(
					ContextKeyExpr.equals('key1', true),
					ContextKeyExpr.notEquals('key2', false)
				)
			),
			// This one always overwrites first
			_kbItem(
				KeyCode.KeyX,
				'second',
				ContextKeyExpr.equals('key2', true)
			),
			// This one is a secondary mapping for `second`
			_kbItem(
				KeyCode.KeyZ,
				'second',
				undefined
			),
			// This one sometimes overwrites first
			_kbItem(
				KeyCode.KeyX,
				'third',
				ContextKeyExpr.equals('key3', true)
			),
			// This one is always overwritten by another one
			_kbItem(
				KeyMod.CtrlCmd | KeyCode.KeyY,
				'fourth',
				ContextKeyExpr.equals('key4', true)
			),
			// This one overwrites with a chord the previous one
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ),
				'fifth',
				undefined
			),
			// This one has no keybinding
			_kbItem(
				0,
				'sixth',
				undefined
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
				'seventh',
				undefined
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK),
				'seventh',
				undefined
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
				'uncomment lines',
				undefined
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC), // cmd+k cmd+c
				'comment lines',
				undefined
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyG, KeyMod.CtrlCmd | KeyCode.KeyC), // cmd+g cmd+c
				'unreachablechord',
				undefined
			),
			_kbItem(
				KeyMod.CtrlCmd | KeyCode.KeyG, // cmd+g
				'eleven',
				undefined
			),
			_kbItem(
				[KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB], // cmd+k a b
				'long multi chord',
				undefined
			),
			_kbItem(
				[KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC], // cmd+b cmd+c
				'shadowed by long-multi-chord-2',
				undefined
			),
			_kbItem(
				[KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC, KeyCode.KeyI], // cmd+b cmd+c i
				'long-multi-chord-2',
				undefined
			)
		];

		const resolver = new KeybindingResolver(items, [], () => { });

		const testKbLookupByCommand = (commandId: string, expectedKeys: number[] | number[][]) => {
			// Test lookup
			const lookupResult = resolver.lookupKeybindings(commandId);
			assert.strictEqual(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId);
			for (let i = 0, len = lookupResult.length; i < len; i++) {
				const expected = createUSLayoutResolvedKeybinding(expectedKeys[i], OS)!;

				assert.strictEqual(lookupResult[i].resolvedKeybinding!.getUserSettingsLabel(), expected.getUserSettingsLabel(), 'value mismatch @ commandId ' + commandId);
			}
		};

		const testResolve = (ctx: IContext, _expectedKey: number | number[], commandId: string) => {
			const expectedKeybinding = decodeKeybinding(_expectedKey, OS)!;

			const previousChord: string[] = [];

			for (let i = 0, len = expectedKeybinding.chords.length; i < len; i++) {

				const chord = getDispatchStr(<KeyCodeChord>expectedKeybinding.chords[i]);

				const result = resolver.resolve(ctx, previousChord, chord);

				if (i === len - 1) {
					// if it's the final chord, then we should find a valid command,
					// and there should not be a chord.
					assert.ok(result.kind === ResultKind.KbFound, `Enters multi chord for ${commandId} at chord ${i}`);
					assert.strictEqual(result.commandId, commandId, `Enters multi chord for ${commandId} at chord ${i}`);
				} else if (i > 0) {
					// if this is an intermediate chord, we should not find a valid command,
					// and there should be an open chord we continue.
					assert.ok(result.kind === ResultKind.MoreChordsNeeded, `Continues multi chord for ${commandId} at chord ${i}`);
				} else {
					// if it's not the final chord and not an intermediate, then we should not
					// find a valid command, and we should enter a chord.
					assert.ok(result.kind === ResultKind.MoreChordsNeeded, `Enters multi chord for ${commandId} at chord ${i}`);
				}
				previousChord.push(chord);
			}
		};

		test('resolve command - 1', () => {
			testKbLookupByCommand('first', []);
		});

		test('resolve command - 2', () => {
			testKbLookupByCommand('second', [KeyCode.KeyZ, KeyCode.KeyX]);
			testResolve(createContext({ key2: true }), KeyCode.KeyX, 'second');
			testResolve(createContext({}), KeyCode.KeyZ, 'second');
		});

		test('resolve command - 3', () => {
			testKbLookupByCommand('third', [KeyCode.KeyX]);
			testResolve(createContext({ key3: true }), KeyCode.KeyX, 'third');
		});

		test('resolve command - 4', () => {
			testKbLookupByCommand('fourth', []);
		});

		test('resolve command - 5', () => {
			testKbLookupByCommand('fifth', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ)]);
			testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ), 'fifth');
		});

		test('resolve command - 6', () => {
			testKbLookupByCommand('seventh', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)]);
			testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK), 'seventh');
		});

		test('resolve command - 7', () => {
			testKbLookupByCommand('uncomment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU)]);
			testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU), 'uncomment lines');
		});

		test('resolve command - 8', () => {
			testKbLookupByCommand('comment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC)]);
			testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC), 'comment lines');
		});

		test('resolve command - 9', () => {
			testKbLookupByCommand('unreachablechord', []);
		});

		test('resolve command - 10', () => {
			testKbLookupByCommand('eleven', [KeyMod.CtrlCmd | KeyCode.KeyG]);
			testResolve(createContext({}), KeyMod.CtrlCmd | KeyCode.KeyG, 'eleven');
		});

		test('resolve command - 11', () => {
			testKbLookupByCommand('sixth', []);
		});

		test('resolve command - 12', () => {
			testKbLookupByCommand('long multi chord', [[KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB]]);
			testResolve(createContext({}), [KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB], 'long multi chord');
		});

		const emptyContext = createContext({});

		test('KBs having common prefix - the one defined later is returned', () => {
			testResolve(emptyContext, [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC, KeyCode.KeyI], 'long-multi-chord-2');
		});
	});
});
