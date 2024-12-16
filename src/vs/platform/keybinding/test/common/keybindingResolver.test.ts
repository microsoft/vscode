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
