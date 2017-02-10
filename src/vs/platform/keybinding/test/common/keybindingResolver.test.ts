/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { createKeybinding, KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { KeybindingResolver, NormalizedKeybindingItem } from 'vs/platform/keybinding/common/keybindingResolver';
import { ContextKeyAndExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { keybindingToKeyPress, SimpleKeyPress } from 'vs/platform/keybinding/common/keyPress';

suite('Keybinding Service', () => {

	function kbItem(kb: number, command: string, commandArgs: any, when: ContextKeyExpr, isDefault: boolean): NormalizedKeybindingItem {
		let keybinding = (kb !== 0 ? createKeybinding(kb) : null);
		let keyPress = (keybinding !== null ? keybindingToKeyPress(keybinding) : null);
		return new NormalizedKeybindingItem(keybinding, keyPress, command, commandArgs, when, isDefault);
	}

	test('resolve key', function () {
		const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		const contextRules = ContextKeyExpr.equals('bar', 'baz');

		assert.equal(KeybindingResolver.contextMatchesRules({ bar: 'baz' }, contextRules), true);
		assert.equal(KeybindingResolver.contextMatchesRules({ bar: 'bz' }, contextRules), false);

		const resolver = new KeybindingResolver([kbItem(keybinding, 'yes', null, contextRules, true)], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, null, <SimpleKeyPress>keybindingToKeyPress(createKeybinding(keybinding))).commandId, 'yes');
		assert.equal(resolver.resolve({ bar: 'bz' }, null, <SimpleKeyPress>keybindingToKeyPress(createKeybinding(keybinding))), null);
	});

	test('resolve key with arguments', function () {
		const commandArgs = { text: 'no' };
		const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		const contextRules = ContextKeyExpr.equals('bar', 'baz');
		const resolver = new KeybindingResolver([kbItem(keybinding, 'yes', commandArgs, contextRules, true)], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, null, <SimpleKeyPress>keybindingToKeyPress(createKeybinding(keybinding))).commandArgs, commandArgs);
	});

	test('KbAndExpression.equals', function () {
		const a = ContextKeyExpr.and(
			ContextKeyExpr.has('a1'),
			ContextKeyExpr.and(ContextKeyExpr.has('and.a')),
			ContextKeyExpr.has('a2'),
			ContextKeyExpr.equals('b1', 'bb1'),
			ContextKeyExpr.equals('b2', 'bb2'),
			ContextKeyExpr.notEquals('c1', 'cc1'),
			ContextKeyExpr.notEquals('c2', 'cc2'),
			ContextKeyExpr.not('d1'),
			ContextKeyExpr.not('d2')
		);
		const b = ContextKeyExpr.and(
			ContextKeyExpr.equals('b2', 'bb2'),
			ContextKeyExpr.notEquals('c1', 'cc1'),
			ContextKeyExpr.not('d1'),
			ContextKeyExpr.notEquals('c2', 'cc2'),
			ContextKeyExpr.has('a2'),
			ContextKeyExpr.equals('b1', 'bb1'),
			ContextKeyExpr.has('a1'),
			ContextKeyExpr.and(ContextKeyExpr.equals('and.a', true)),
			ContextKeyExpr.not('d2')
		);
		assert(a.equals(b), 'expressions should be equal');
	});

	test('KeybindingResolver.combine simple 1', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true)
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false)
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false),
		]);
	});

	test('KeybindingResolver.combine simple 2', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_C, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
			kbItem(KeyCode.KEY_C, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false),
		]);
	});

	test('KeybindingResolver.combine removal with not matching when', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, '-yes1', null, ContextKeyExpr.equals('1', 'b'), false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with not matching keybinding', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_B, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with matching keybinding and when', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified keybinding', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(0, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified when', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, '-yes1', null, null, false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified when and unspecified keybinding', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(0, '-yes1', null, null, false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^', function () {
		let defaults: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, '^yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
		];
		let overrides: NormalizedKeybindingItem[] = [
			kbItem(KeyCode.KEY_A, '-yes1', null, null, false),
		];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			kbItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('normalizeRule', function () {
		let key1IsTrue = ContextKeyExpr.equals('key1', true);
		let key1IsNotFalse = ContextKeyExpr.notEquals('key1', false);
		let key1IsFalse = ContextKeyExpr.equals('key1', false);
		let key1IsNotTrue = ContextKeyExpr.notEquals('key1', true);

		assert.ok(key1IsTrue.normalize().equals(ContextKeyExpr.has('key1')));
		assert.ok(key1IsNotFalse.normalize().equals(ContextKeyExpr.has('key1')));
		assert.ok(key1IsFalse.normalize().equals(ContextKeyExpr.not('key1')));
		assert.ok(key1IsNotTrue.normalize().equals(ContextKeyExpr.not('key1')));
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
		let items: NormalizedKeybindingItem[] = [
			// This one will never match because its "when" is always overwritten by another one
			kbItem(KeyCode.KEY_X, 'first', null, ContextKeyExpr.and(ContextKeyExpr.equals('key1', true), ContextKeyExpr.notEquals('key2', false)), true),

			// This one always overwrites first
			kbItem(KeyCode.KEY_X, 'second', null, ContextKeyExpr.equals('key2', true), true),

			// This one is a secondary mapping for `second`
			kbItem(KeyCode.KEY_Z, 'second', null, null, true),

			// This one sometimes overwrites first
			kbItem(KeyCode.KEY_X, 'third', null, ContextKeyExpr.equals('key3', true), true),

			// This one is always overwritten by another one
			kbItem(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'fourth', null, ContextKeyExpr.equals('key4', true), true),

			// This one overwrites with a chord the previous one
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z), 'fifth', null, null, true),

			// This one has no keybinding
			kbItem(0, 'sixth', null, null, true),

			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U), 'seventh', null, null, true),

			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K), 'seventh', null, null, true),

			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U), 'uncomment lines', null, null, true),

			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C), 'comment lines', null, null, true),

			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_G, KeyMod.CtrlCmd | KeyCode.KEY_C), 'unreachablechord', null, null, true),

			kbItem(KeyMod.CtrlCmd | KeyCode.KEY_G, 'eleven', null, null, true),

		];

		let resolver = new KeybindingResolver(items, [], false);

		let testKey = (commandId: string, expectedKeys: number[]) => {
			// Test lookup
			let lookupResult = resolver.lookupKeybindings(commandId);
			assert.equal(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId + '; GOT: ' + JSON.stringify(lookupResult, null, '\t'));
			for (let i = 0, len = lookupResult.length; i < len; i++) {
				let expectedKey = expectedKeys[i];
				let expectedKeyPress = keybindingToKeyPress(createKeybinding(expectedKey));
				assert.equal(lookupResult[i].source.value, expectedKey, 'value mismatch @ commandId ' + commandId);
				assert.equal(lookupResult[i].keyPress.value, expectedKeyPress.value, 'value mismatch @ commandId ' + commandId);
			}
		};

		let testResolve = (ctx: any, _expectedKey: number, commandId: string) => {
			let expectedKey = keybindingToKeyPress(createKeybinding(_expectedKey));

			if (expectedKey.isChord()) {
				let firstPart = expectedKey.extractFirstPart();
				let chordPart = expectedKey.extractChordPart();

				let result = resolver.resolve(ctx, null, firstPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, null, 'Enters chord for ' + commandId);
				assert.equal(result.enterChord, firstPart, 'Enters chord for ' + commandId);

				result = resolver.resolve(ctx, firstPart, chordPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds chorded command ' + commandId);
				assert.equal(result.enterChord, null, 'Finds chorded command ' + commandId);
			} else {
				let result = resolver.resolve(ctx, null, expectedKey);
				assert.ok(result !== null, 'Finds command ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds command ' + commandId);
				assert.equal(result.enterChord, null, 'Finds command ' + commandId);
			}
		};

		testKey('first', []);

		testKey('second', [KeyCode.KEY_Z, KeyCode.KEY_X]);
		testResolve({ key2: true }, KeyCode.KEY_X, 'second');
		testResolve({}, KeyCode.KEY_Z, 'second');

		testKey('third', [KeyCode.KEY_X]);
		testResolve({ key3: true }, KeyCode.KEY_X, 'third');

		testKey('fourth', []);

		testKey('fifth', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)]);
		testResolve({}, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z), 'fifth');

		testKey('seventh', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)]);
		testResolve({}, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K), 'seventh');

		testKey('uncomment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U)]);
		testResolve({}, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U), 'uncomment lines');

		testKey('comment lines', [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C)]);
		testResolve({}, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C), 'comment lines');

		testKey('unreachablechord', []);

		testKey('eleven', [KeyMod.CtrlCmd | KeyCode.KEY_G]);
		testResolve({}, KeyMod.CtrlCmd | KeyCode.KEY_G, 'eleven');

		testKey('sixth', []);
	});

	test('contextMatchesRules', function () {
		/* tslint:disable:triple-equals */
		let context = {
			'a': true,
			'b': false,
			'c': '5'
		};
		function testExpression(expr: string, expected: boolean): void {
			let rules = ContextKeyExpr.deserialize(expr);
			assert.equal(KeybindingResolver.contextMatchesRules(context, rules), expected, expr);
		}
		function testBatch(expr: string, value: any): void {
			testExpression(expr, !!value);
			testExpression(expr + ' == true', !!value);
			testExpression(expr + ' != true', !value);
			testExpression(expr + ' == false', !value);
			testExpression(expr + ' != false', !!value);
			testExpression(expr + ' == 5', value == <any>'5');
			testExpression(expr + ' != 5', value != <any>'5');
			testExpression('!' + expr, !value);
		}

		testExpression('', true);

		testBatch('a', true);
		testBatch('b', false);
		testBatch('c', '5');
		testBatch('z', undefined);

		testExpression('a && !b', true && !false);
		testExpression('a && b', true && false);
		testExpression('a && !b && c == 5', true && !false && '5' == '5');
		/* tslint:enable:triple-equals */
	});
});
