/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createKeybinding, createSimpleKeybinding, SimpleKeybinding } from 'vs/base/common/keybindings';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { OS } from 'vs/base/common/platform';
import { ContextKeyExpr, ContextKeyExpression, IContext } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';

function createContext(ctx: any) {
	return {
		getValue: (key: string) => {
			return ctx[key];
		}
	};
}

suite('KeybindingResolver', () => {

	function kbItem(keybinding: number, command: string, commandArgs: any, when: ContextKeyExpression | undefined, isDefault: boolean): ResolvedKeybindingItem {
		const resolvedKeybinding = (keybinding !== 0 ? new USLayoutResolvedKeybinding(createKeybinding(keybinding, OS)!, OS) : undefined);
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

	function getDispatchStr(runtimeKb: SimpleKeybinding): string {
		return USLayoutResolvedKeybinding.getDispatchStr(runtimeKb)!;
	}

	test('resolve key', () => {
		const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
		const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
		const contextRules = ContextKeyExpr.equals('bar', 'baz');
		const keybindingItem = kbItem(keybinding, 'yes', null, contextRules, true);

		assert.strictEqual(contextRules.evaluate(createContext({ bar: 'baz' })), true);
		assert.strictEqual(contextRules.evaluate(createContext({ bar: 'bz' })), false);

		const resolver = new KeybindingResolver([keybindingItem], [], () => { });
		assert.strictEqual(resolver.resolve(createContext({ bar: 'baz' }), null, getDispatchStr(runtimeKeybinding))!.commandId, 'yes');
		assert.strictEqual(resolver.resolve(createContext({ bar: 'bz' }), null, getDispatchStr(runtimeKeybinding)), null);
	});

	test('resolve key with arguments', () => {
		const commandArgs = { text: 'no' };
		const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
		const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
		const contextRules = ContextKeyExpr.equals('bar', 'baz');
		const keybindingItem = kbItem(keybinding, 'yes', commandArgs, contextRules, true);

		const resolver = new KeybindingResolver([keybindingItem], [], () => { });
		assert.strictEqual(resolver.resolve(createContext({ bar: 'baz' }), null, getDispatchStr(runtimeKeybinding))!.commandArgs, commandArgs);
	});

	test('KeybindingResolver.handleRemovals simple 1', () => {
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

	test('KeybindingResolver.handleRemovals simple 2', () => {
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

	test('KeybindingResolver.handleRemovals removal with not matching when', () => {
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

	test('KeybindingResolver.handleRemovals removal with not matching keybinding', () => {
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

	test('KeybindingResolver.handleRemovals removal with matching keybinding and when', () => {
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

	test('KeybindingResolver.handleRemovals removal with unspecified keybinding', () => {
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

	test('KeybindingResolver.handleRemovals removal with unspecified when', () => {
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

	test('KeybindingResolver.handleRemovals removal with unspecified when and unspecified keybinding', () => {
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

	test('issue #138997 KeybindingResolver.handleRemovals removal in default list', () => {
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

	test('resolve command', () => {

		function _kbItem(keybinding: number, command: string, when: ContextKeyExpression | undefined): ResolvedKeybindingItem {
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
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
				'comment lines',
				undefined
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KeyG, KeyMod.CtrlCmd | KeyCode.KeyC),
				'unreachablechord',
				undefined
			),
			_kbItem(
				KeyMod.CtrlCmd | KeyCode.KeyG,
				'eleven',
				undefined
			)
		];

		const resolver = new KeybindingResolver(items, [], () => { });

		const testKey = (commandId: string, expectedKeys: number[]) => {
			// Test lookup
			const lookupResult = resolver.lookupKeybindings(commandId);
			assert.strictEqual(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId);
			for (let i = 0, len = lookupResult.length; i < len; i++) {
				const expected = new USLayoutResolvedKeybinding(createKeybinding(expectedKeys[i], OS)!, OS);

				assert.strictEqual(lookupResult[i].resolvedKeybinding!.getUserSettingsLabel(), expected.getUserSettingsLabel(), 'value mismatch @ commandId ' + commandId);
			}
		};

		const testResolve = (ctx: IContext, _expectedKey: number, commandId: string) => {
			const expectedKey = createKeybinding(_expectedKey, OS)!;

			let previousPart: (string | null) = null;
			for (let i = 0, len = expectedKey.parts.length; i < len; i++) {
				const part = getDispatchStr(expectedKey.parts[i]);
				const result = resolver.resolve(ctx, previousPart, part);
				if (i === len - 1) {
					// if it's the final part, then we should find a valid command,
					// and there should not be a chord.
					assert.ok(result !== null, `Enters chord for ${commandId} at part ${i}`);
					assert.strictEqual(result!.commandId, commandId, `Enters chord for ${commandId} at part ${i}`);
					assert.strictEqual(result!.enterChord, false, `Enters chord for ${commandId} at part ${i}`);
				} else {
					// if it's not the final part, then we should not find a valid command,
					// and there should be a chord.
					assert.ok(result !== null, `Enters chord for ${commandId} at part ${i}`);
					assert.strictEqual(result!.commandId, null, `Enters chord for ${commandId} at part ${i}`);
					assert.strictEqual(result!.enterChord, true, `Enters chord for ${commandId} at part ${i}`);
				}
				previousPart = part;
			}
		};

		testKey('first', []);

		testKey('second', [KeyCode.KeyZ, KeyCode.KeyX]);
		testResolve(createContext({ key2: true }), KeyCode.KeyX, 'second');
		testResolve(createContext({}), KeyCode.KeyZ, 'second');

		testKey('third', [KeyCode.KeyX]);
		testResolve(createContext({ key3: true }), KeyCode.KeyX, 'third');

		testKey('fourth', []);

		testKey('fifth', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ), 'fifth');

		testKey('seventh', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK), 'seventh');

		testKey('uncomment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU), 'uncomment lines');

		testKey('comment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC), 'comment lines');

		testKey('unreachablechord', []);

		testKey('eleven', [KeyMod.CtrlCmd | KeyCode.KeyG]);
		testResolve(createContext({}), KeyMod.CtrlCmd | KeyCode.KeyG, 'eleven');

		testKey('sixth', []);
	});
});
