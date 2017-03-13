/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { createKeybinding, SimpleKeybinding, KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ContextKeyAndExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { NormalizedKeybindingItem } from 'vs/platform/keybinding/common/normalizedKeybindingItem';

suite('KeybindingResolver', () => {

	function kbItem(keybinding: number, command: string, commandArgs: any, when: ContextKeyExpr, isDefault: boolean): NormalizedKeybindingItem {
		return NormalizedKeybindingItem.fromKeybindingItem({
			keybinding: keybinding,
			command: command,
			commandArgs: commandArgs,
			when: when,
			weight1: 0,
			weight2: 0
		}, isDefault);
	}

	test('resolve key', function () {
		let keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		let contextRules = ContextKeyExpr.equals('bar', 'baz');
		let keybindingItem = kbItem(keybinding, 'yes', null, contextRules, true);

		assert.equal(KeybindingResolver.contextMatchesRules({ bar: 'baz' }, contextRules), true);
		assert.equal(KeybindingResolver.contextMatchesRules({ bar: 'bz' }, contextRules), false);

		let resolver = new KeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, null, new SimpleKeybinding(keybinding).value.toString()).commandId, 'yes');
		assert.equal(resolver.resolve({ bar: 'bz' }, null, new SimpleKeybinding(keybinding).value.toString()), null);
	});

	test('resolve key with arguments', function () {
		let commandArgs = { text: 'no' };
		let keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		let contextRules = ContextKeyExpr.equals('bar', 'baz');
		let keybindingItem = kbItem(keybinding, 'yes', commandArgs, contextRules, true);

		let resolver = new KeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, null, new SimpleKeybinding(keybinding).value.toString()).commandArgs, commandArgs);
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

		function _kbItem(keybinding: number, command: string, when: ContextKeyExpr): NormalizedKeybindingItem {
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
				assert.equal(lookupResult[i].keybinding.value, expectedKeys[i], 'value mismatch @ commandId ' + commandId);
			}
		};

		let testResolve = (ctx: any, _expectedKey: number, commandId: string) => {
			let expectedKey = createKeybinding(_expectedKey);

			if (expectedKey.isChord()) {
				let firstPart = expectedKey.extractFirstPart().value.toString();
				let chordPart = expectedKey.extractChordPart().value.toString();

				let result = resolver.resolve(ctx, null, firstPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, null, 'Enters chord for ' + commandId);
				assert.equal(result.enterChord, true, 'Enters chord for ' + commandId);

				result = resolver.resolve(ctx, firstPart, chordPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds chorded command ' + commandId);
				assert.equal(result.enterChord, false, 'Finds chorded command ' + commandId);
			} else {
				let result = resolver.resolve(ctx, null, expectedKey.value.toString());
				assert.ok(result !== null, 'Finds command ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds command ' + commandId);
				assert.equal(result.enterChord, false, 'Finds command ' + commandId);
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
});
