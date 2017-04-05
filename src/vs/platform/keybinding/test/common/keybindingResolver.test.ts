/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { KeyCode, KeyMod, KeyChord, createKeybinding, KeybindingType, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ContextKeyAndExpr, ContextKeyExpr, IContext } from 'vs/platform/contextkey/common/contextkey';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { OS } from 'vs/base/common/platform';

const createContext = ctx => ({ getValue: key => ctx[key] });

suite('KeybindingResolver', () => {

	function kbItem(keybinding: number, command: string, commandArgs: any, when: ContextKeyExpr, isDefault: boolean): ResolvedKeybindingItem {
		const resolvedKeybinding = (keybinding !== 0 ? new USLayoutResolvedKeybinding(createKeybinding(keybinding, OS), OS) : null);
		return new ResolvedKeybindingItem(
			resolvedKeybinding,
			command,
			commandArgs,
			when,
			isDefault
		);
	}

	function getDispatchStr(runtimeKb: SimpleKeybinding): string {
		return USLayoutResolvedKeybinding.getDispatchStr(runtimeKb);
	}

	test('resolve key', function () {
		let keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		let runtimeKeybinding = createKeybinding(keybinding, OS);
		let contextRules = ContextKeyExpr.equals('bar', 'baz');
		let keybindingItem = kbItem(keybinding, 'yes', null, contextRules, true);

		assert.equal(KeybindingResolver.contextMatchesRules(createContext({ bar: 'baz' }), contextRules), true);
		assert.equal(KeybindingResolver.contextMatchesRules(createContext({ bar: 'bz' }), contextRules), false);

		let resolver = new KeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve(createContext({ bar: 'baz' }), null, getDispatchStr(<SimpleKeybinding>runtimeKeybinding)).commandId, 'yes');
		assert.equal(resolver.resolve(createContext({ bar: 'bz' }), null, getDispatchStr(<SimpleKeybinding>runtimeKeybinding)), null);
	});

	test('resolve key with arguments', function () {
		let commandArgs = { text: 'no' };
		let keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		let runtimeKeybinding = createKeybinding(keybinding, OS);
		let contextRules = ContextKeyExpr.equals('bar', 'baz');
		let keybindingItem = kbItem(keybinding, 'yes', commandArgs, contextRules, true);

		let resolver = new KeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve(createContext({ bar: 'baz' }), null, getDispatchStr(<SimpleKeybinding>runtimeKeybinding)).commandArgs, commandArgs);
	});

	test('KeybindingResolver.combine simple 1', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false),
		]);
	});

	test('KeybindingResolver.combine simple 2', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_C, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
			kbItem(KeyCode.KEY_C, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false),
		]);
	});

	test('KeybindingResolver.combine removal with not matching when', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_A, '-yes1', null, ContextKeyExpr.equals('1', 'b'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with not matching keybinding', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_B, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with matching keybinding and when', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_A, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified keybinding', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(0, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified when', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_A, '-yes1', null, null, false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified when and unspecified keybinding', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(0, '-yes1', null, null, false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^', function () {
		let defaults = [
			kbItem(KeyCode.KEY_A, '^yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		];
		let overrides = [
			kbItem(KeyCode.KEY_A, '-yes1', null, null, false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('contextIsEntirelyIncluded', function () {
		let assertIsIncluded = (a: ContextKeyExpr[], b: ContextKeyExpr[]) => {
			assert.equal(KeybindingResolver.whenIsEntirelyIncluded(false, new ContextKeyAndExpr(a), new ContextKeyAndExpr(b)), true);
		};
		let assertIsNotIncluded = (a: ContextKeyExpr[], b: ContextKeyExpr[]) => {
			assert.equal(KeybindingResolver.whenIsEntirelyIncluded(false, new ContextKeyAndExpr(a), new ContextKeyAndExpr(b)), false);
		};
		let key1IsTrue = ContextKeyExpr.equals('key1', true);
		let key1IsNotFalse = ContextKeyExpr.notEquals('key1', false);
		let key1IsFalse = ContextKeyExpr.equals('key1', false);
		let key1IsNotTrue = ContextKeyExpr.notEquals('key1', true);
		let key2IsTrue = ContextKeyExpr.equals('key2', true);
		let key2IsNotFalse = ContextKeyExpr.notEquals('key2', false);
		let key3IsTrue = ContextKeyExpr.equals('key3', true);
		let key4IsTrue = ContextKeyExpr.equals('key4', true);

		assertIsIncluded([key1IsTrue], null);
		assertIsIncluded([key1IsTrue], []);
		assertIsIncluded([key1IsTrue], [key1IsTrue]);
		assertIsIncluded([key1IsTrue], [key1IsNotFalse]);

		assertIsIncluded([key1IsFalse], []);
		assertIsIncluded([key1IsFalse], [key1IsFalse]);
		assertIsIncluded([key1IsFalse], [key1IsNotTrue]);

		assertIsIncluded([key2IsNotFalse], []);
		assertIsIncluded([key2IsNotFalse], [key2IsNotFalse]);
		assertIsIncluded([key2IsNotFalse], [key2IsTrue]);

		assertIsIncluded([key1IsTrue, key2IsNotFalse], [key2IsTrue]);
		assertIsIncluded([key1IsTrue, key2IsNotFalse], [key2IsNotFalse]);
		assertIsIncluded([key1IsTrue, key2IsNotFalse], [key1IsTrue]);
		assertIsIncluded([key1IsTrue, key2IsNotFalse], [key1IsNotFalse]);
		assertIsIncluded([key1IsTrue, key2IsNotFalse], []);

		assertIsNotIncluded([key1IsTrue], [key1IsFalse]);
		assertIsNotIncluded([key1IsTrue], [key1IsNotTrue]);
		assertIsNotIncluded([key1IsNotFalse], [key1IsFalse]);
		assertIsNotIncluded([key1IsNotFalse], [key1IsNotTrue]);

		assertIsNotIncluded([key1IsFalse], [key1IsTrue]);
		assertIsNotIncluded([key1IsFalse], [key1IsNotFalse]);
		assertIsNotIncluded([key1IsNotTrue], [key1IsTrue]);
		assertIsNotIncluded([key1IsNotTrue], [key1IsNotFalse]);

		assertIsNotIncluded([key1IsTrue, key2IsNotFalse], [key3IsTrue]);
		assertIsNotIncluded([key1IsTrue, key2IsNotFalse], [key4IsTrue]);
		assertIsNotIncluded([key1IsTrue], [key2IsTrue]);
		assertIsNotIncluded([], [key2IsTrue]);
		assertIsNotIncluded(null, [key2IsTrue]);
	});

	test('resolve command', function () {

		function _kbItem(keybinding: number, command: string, when: ContextKeyExpr): ResolvedKeybindingItem {
			return kbItem(keybinding, command, null, when, true);
		}

		let items = [
			// This one will never match because its "when" is always overwritten by another one
			_kbItem(
				KeyCode.KEY_X,
				'first',
				ContextKeyExpr.and(
					ContextKeyExpr.equals('key1', true),
					ContextKeyExpr.notEquals('key2', false)
				)
			),
			// This one always overwrites first
			_kbItem(
				KeyCode.KEY_X,
				'second',
				ContextKeyExpr.equals('key2', true)
			),
			// This one is a secondary mapping for `second`
			_kbItem(
				KeyCode.KEY_Z,
				'second',
				null
			),
			// This one sometimes overwrites first
			_kbItem(
				KeyCode.KEY_X,
				'third',
				ContextKeyExpr.equals('key3', true)
			),
			// This one is always overwritten by another one
			_kbItem(
				KeyMod.CtrlCmd | KeyCode.KEY_Y,
				'fourth',
				ContextKeyExpr.equals('key4', true)
			),
			// This one overwrites with a chord the previous one
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z),
				'fifth',
				null
			),
			// This one has no keybinding
			_kbItem(
				0,
				'sixth',
				null
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U),
				'seventh',
				null
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K),
				'seventh',
				null
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U),
				'uncomment lines',
				null
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C),
				'comment lines',
				null
			),
			_kbItem(
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_G, KeyMod.CtrlCmd | KeyCode.KEY_C),
				'unreachablechord',
				null
			),
			_kbItem(
				KeyMod.CtrlCmd | KeyCode.KEY_G,
				'eleven',
				null
			)
		];

		let resolver = new KeybindingResolver(items, [], false);

		let testKey = (commandId: string, expectedKeys: number[]) => {
			// Test lookup
			let lookupResult = resolver.lookupKeybindings(commandId);
			assert.equal(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId + '; GOT: ' + JSON.stringify(lookupResult, null, '\t'));
			for (let i = 0, len = lookupResult.length; i < len; i++) {
				const expected = new USLayoutResolvedKeybinding(createKeybinding(expectedKeys[i], OS), OS);

				assert.equal(lookupResult[i].resolvedKeybinding.getUserSettingsLabel(), expected.getUserSettingsLabel(), 'value mismatch @ commandId ' + commandId);
			}
		};

		let testResolve = (ctx: IContext, _expectedKey: number, commandId: string) => {
			const expectedKey = createKeybinding(_expectedKey, OS);

			if (expectedKey.type === KeybindingType.Chord) {
				let firstPart = getDispatchStr(expectedKey.firstPart);
				let chordPart = getDispatchStr(expectedKey.chordPart);

				let result = resolver.resolve(ctx, null, firstPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, null, 'Enters chord for ' + commandId);
				assert.equal(result.enterChord, true, 'Enters chord for ' + commandId);

				result = resolver.resolve(ctx, firstPart, chordPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds chorded command ' + commandId);
				assert.equal(result.enterChord, false, 'Finds chorded command ' + commandId);
			} else {
				let result = resolver.resolve(ctx, null, getDispatchStr(expectedKey));
				assert.ok(result !== null, 'Finds command ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds command ' + commandId);
				assert.equal(result.enterChord, false, 'Finds command ' + commandId);
			}
		};

		testKey('first', []);

		testKey('second', [KeyCode.KEY_Z, KeyCode.KEY_X]);
		testResolve(createContext({ key2: true }), KeyCode.KEY_X, 'second');
		testResolve(createContext({}), KeyCode.KEY_Z, 'second');

		testKey('third', [KeyCode.KEY_X]);
		testResolve(createContext({ key3: true }), KeyCode.KEY_X, 'third');

		testKey('fourth', []);

		testKey('fifth', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z), 'fifth');

		testKey('seventh', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K), 'seventh');

		testKey('uncomment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U), 'uncomment lines');

		testKey('comment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C)]);
		testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C), 'comment lines');

		testKey('unreachablechord', []);

		testKey('eleven', [KeyMod.CtrlCmd | KeyCode.KEY_G]);
		testResolve(createContext({}), KeyMod.CtrlCmd | KeyCode.KEY_G, 'eleven');

		testKey('sixth', []);
	});
});
