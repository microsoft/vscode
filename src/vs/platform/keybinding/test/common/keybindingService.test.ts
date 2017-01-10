/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { BinaryKeybindings, KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { IOSupport, KeybindingResolver, NormalizedKeybindingItem } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingItem } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyAndExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

suite('Keybinding Service', () => {

	test('resolve key', function () {
		let keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		let contextRules = ContextKeyExpr.equals('bar', 'baz');
		let keybindingItem: IKeybindingItem = {
			command: 'yes',
			when: contextRules,
			keybinding: keybinding,
			weight1: 0,
			weight2: 0
		};

		assert.equal(KeybindingResolver.contextMatchesRules({ bar: 'baz' }, contextRules), true);
		assert.equal(KeybindingResolver.contextMatchesRules({ bar: 'bz' }, contextRules), false);

		let resolver = new KeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, 0, keybinding).commandId, 'yes');
		assert.equal(resolver.resolve({ bar: 'bz' }, 0, keybinding), null);
	});

	test('resolve key with arguments', function () {
		let commandArgs = { text: 'no' };
		let keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		let contextRules = ContextKeyExpr.equals('bar', 'baz');
		let keybindingItem: IKeybindingItem = {
			command: 'yes',
			commandArgs: commandArgs,
			when: contextRules,
			keybinding: keybinding,
			weight1: 0,
			weight2: 0
		};

		let resolver = new KeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, 0, keybinding).commandArgs, commandArgs);
	});

	test('KbAndExpression.equals', function () {
		let a = ContextKeyExpr.and(
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
		let b = ContextKeyExpr.and(
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
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false),
		]);
	});

	test('KeybindingResolver.combine simple 2', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: 'yes3',
			when: ContextKeyExpr.equals('3', 'c'),
			keybinding: KeyCode.KEY_C,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
			new NormalizedKeybindingItem(KeyCode.KEY_C, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false),
		]);
	});

	test('KeybindingResolver.combine removal with not matching when', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: ContextKeyExpr.equals('1', 'b'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with not matching keybinding', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_A, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with matching keybinding and when', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified keybinding', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: 0,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified when', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: null,
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('KeybindingResolver.combine removal with unspecified when and unspecified keybinding', function () {
		let defaults: IKeybindingItem[] = [{
			command: 'yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: null,
			keybinding: 0,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
		]);
	});

	test('issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^', function () {
		let defaults: IKeybindingItem[] = [{
			command: '^yes1',
			when: ContextKeyExpr.equals('1', 'a'),
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}, {
			command: 'yes2',
			when: ContextKeyExpr.equals('2', 'b'),
			keybinding: KeyCode.KEY_B,
			weight1: 0,
			weight2: 0
		}];
		let overrides: IKeybindingItem[] = [{
			command: '-yes1',
			when: null,
			keybinding: KeyCode.KEY_A,
			weight1: 0,
			weight2: 0
		}];
		let actual = KeybindingResolver.combine(defaults, overrides);
		assert.deepEqual(actual, [
			new NormalizedKeybindingItem(KeyCode.KEY_B, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
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

		let items: IKeybindingItem[] = [
			// This one will never match because its "when" is always overwritten by another one
			{
				keybinding: KeyCode.KEY_X,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('key1', true),
					ContextKeyExpr.notEquals('key2', false)
				),
				command: 'first',
				weight1: 1,
				weight2: 0
			},
			// This one always overwrites first
			{
				keybinding: KeyCode.KEY_X,
				when: ContextKeyExpr.equals('key2', true),
				command: 'second',
				weight1: 2,
				weight2: 0
			},
			// This one is a secondary mapping for `second`
			{
				keybinding: KeyCode.KEY_Z,
				when: null,
				command: 'second',
				weight1: 2.5,
				weight2: 0
			},
			// This one sometimes overwrites first
			{
				keybinding: KeyCode.KEY_X,
				when: ContextKeyExpr.equals('key3', true),
				command: 'third',
				weight1: 3,
				weight2: 0
			},
			// This one is always overwritten by another one
			{
				keybinding: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				when: ContextKeyExpr.equals('key4', true),
				command: 'fourth',
				weight1: 4,
				weight2: 0
			},
			// This one overwrites with a chord the previous one
			{
				keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z),
				when: null,
				command: 'fifth',
				weight1: 5,
				weight2: 0
			},
			// This one has no keybinding
			{
				keybinding: 0,
				when: null,
				command: 'sixth',
				weight1: 6,
				weight2: 0
			},
			{
				keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U),
				when: null,
				command: 'seventh',
				weight1: 6.5,
				weight2: 0
			},
			{
				keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K),
				when: null,
				command: 'seventh',
				weight1: 6.5,
				weight2: 0
			},
			{
				keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U),
				when: null,
				command: 'uncomment lines',
				weight1: 7,
				weight2: 0
			},
			{
				keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C),
				when: null,
				command: 'comment lines',
				weight1: 8,
				weight2: 0
			},
			{
				keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_G, KeyMod.CtrlCmd | KeyCode.KEY_C),
				when: null,
				command: 'unreachablechord',
				weight1: 10,
				weight2: 0
			},
			{
				keybinding: KeyMod.CtrlCmd | KeyCode.KEY_G,
				when: null,
				command: 'eleven',
				weight1: 11,
				weight2: 0
			}
		];

		let resolver = new KeybindingResolver(items, [], false);

		let testKey = (commandId: string, expectedKeys: number[]) => {
			// Test lookup
			let lookupResult = resolver.lookupKeybinding(commandId);
			assert.equal(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId + '; GOT: ' + JSON.stringify(lookupResult, null, '\t'));
			for (let i = 0, len = lookupResult.length; i < len; i++) {
				assert.equal(lookupResult[i].value, expectedKeys[i], 'value mismatch @ commandId ' + commandId);
			}
		};

		let testResolve = (ctx: any, expectedKey: number, commandId: string) => {

			if (BinaryKeybindings.hasChord(expectedKey)) {
				let firstPart = BinaryKeybindings.extractFirstPart(expectedKey);
				let chordPart = BinaryKeybindings.extractChordPart(expectedKey);

				let result = resolver.resolve(ctx, 0, firstPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, null, 'Enters chord for ' + commandId);
				assert.equal(result.enterChord, firstPart, 'Enters chord for ' + commandId);

				result = resolver.resolve(ctx, firstPart, chordPart);
				assert.ok(result !== null, 'Enters chord for ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds chorded command ' + commandId);
				assert.equal(result.enterChord, 0, 'Finds chorded command ' + commandId);
			} else {
				let result = resolver.resolve(ctx, 0, expectedKey);
				assert.ok(result !== null, 'Finds command ' + commandId);
				assert.equal(result.commandId, commandId, 'Finds command ' + commandId);
				assert.equal(result.enterChord, 0, 'Finds command ' + commandId);
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
			let rules = IOSupport.readKeybindingWhen(expr);
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
