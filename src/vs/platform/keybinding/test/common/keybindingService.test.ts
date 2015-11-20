/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {CommonKeybindingResolver} from 'vs/platform/keybinding/common/commonKeybindingResolver';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import Platform = require('vs/base/common/platform');
import {IKeybindingContextRule, IKeybindingItem} from 'vs/platform/keybinding/common/keybindingService';
import {KeyMod, KeyCode, BinaryKeybindings} from 'vs/base/common/keyCodes';

suite('Keybinding Service', () => {

	test('resolve key', function() {
		var keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z;
		var contextRules = [{
			key: 'bar',
			operator: 'equal',
			operand: 'baz'
		}]
		var keybindingItem: IKeybindingItem = {
			command: 'yes',
			context: contextRules,
			keybinding: keybinding,
			weight1: 0,
			weight2: 0
		};

		assert.equal(CommonKeybindingResolver.contextMatchesRules({ bar: 'baz' }, contextRules), true);
		assert.equal(CommonKeybindingResolver.contextMatchesRules({ bar: 'bz' }, contextRules), false);

		var resolver = new CommonKeybindingResolver([keybindingItem], []);
		assert.equal(resolver.resolve({ bar: 'baz' }, 0, keybinding).commandId, 'yes');
		assert.equal(resolver.resolve({ bar: 'bz' }, 0, keybinding), null);
	});

	function createEqualContextRule(key: string, operand: any): IKeybindingContextRule {
		return {
			key: key,
			operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL,
			operand: operand
		};
	}

	function createNotEqualContextRule(key: string, operand: any): IKeybindingContextRule {
		return {
			key: key,
			operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL,
			operand: operand
		};
	}

	test('normalizeRule', function () {
		var key1IsTrue = createEqualContextRule('key1', true);
		var key1IsNotFalse = createNotEqualContextRule('key1', false);
		var key1IsFalse = createEqualContextRule('key1', false);
		var key1IsNotTrue = createNotEqualContextRule('key1', true);

		assert.deepEqual(CommonKeybindingResolver.normalizeRule(key1IsTrue), key1IsTrue);
		assert.deepEqual(CommonKeybindingResolver.normalizeRule(key1IsNotFalse), key1IsTrue);
		assert.deepEqual(CommonKeybindingResolver.normalizeRule(key1IsFalse), key1IsFalse);
		assert.deepEqual(CommonKeybindingResolver.normalizeRule(key1IsNotTrue), key1IsFalse);
	});

	test('contextIsEntirelyIncluded', function () {
		var assertIsIncluded = (a: IKeybindingContextRule[], b: IKeybindingContextRule[]) => {
			assert.equal(CommonKeybindingResolver.contextIsEntirelyIncluded(false, a, b), true);
		};
		var assertIsNotIncluded = (a: IKeybindingContextRule[], b: IKeybindingContextRule[]) => {
			assert.equal(CommonKeybindingResolver.contextIsEntirelyIncluded(false, a, b), false);
		};
		var key1IsTrue = createEqualContextRule('key1', true);
		var key1IsNotFalse = createNotEqualContextRule('key1', false);
		var key1IsFalse = createEqualContextRule('key1', false);
		var key1IsNotTrue = createNotEqualContextRule('key1', true);
		var key2IsTrue = createEqualContextRule('key2', true);
		var key2IsNotFalse = createNotEqualContextRule('key2', false);
		var key3IsTrue = createEqualContextRule('key3', true);
		var key4IsTrue = createEqualContextRule('key4', true);

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

		var items: IKeybindingItem[] = [
			// This one will never match because its context is always overwritten by another one
			{
				keybinding: KeyCode.KEY_X,
				context: [{
					key: 'key1',
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL,
					operand: true
				}, {
					key: 'key2',
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL,
					operand: false
				}],
				command: 'first',
				weight1: 1,
				weight2: 0
			},
			// This one always overwrites first
			{
				keybinding: KeyCode.KEY_X,
				context: [{
					key: 'key2',
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL,
					operand: true
				}],
				command: 'second',
				weight1: 2,
				weight2: 0
			},
			// This one is a secondary mapping for `second`
			{
				keybinding: KeyCode.KEY_Z,
				context: [],
				command: 'second',
				weight1: 2.5,
				weight2: 0
			},
			// This one sometimes overwrites first
			{
				keybinding: KeyCode.KEY_X,
				context: [{
					key: 'key3',
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL,
					operand: true
				}],
				command: 'third',
				weight1: 3,
				weight2: 0
			},
			// This one is always overwritten by another one
			{
				keybinding: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				context: [{
					key: 'key4',
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL,
					operand: true
				}],
				command: 'fourth',
				weight1: 4,
				weight2: 0
			},
			// This one overwrites with a chord the previous one
			{
				keybinding: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z),
				context: [],
				command: 'fifth',
				weight1: 5,
				weight2: 0
			},
			// This one has no keybinding
			{
				keybinding: 0,
				context: [],
				command: 'sixth',
				weight1: 6,
				weight2: 0
			},
			{
				keybinding: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U),
				context: [],
				command: 'seventh',
				weight1: 6.5,
				weight2: 0
			},
			{
				keybinding: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K),
				context: [],
				command: 'seventh',
				weight1: 6.5,
				weight2: 0
			},
			{
				keybinding: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U),
				context: [],
				command: 'uncomment lines',
				weight1: 7,
				weight2: 0
			},
			{
				keybinding: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C),
				context: [],
				command: 'comment lines',
				weight1: 8,
				weight2: 0
			},
			{
				keybinding: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_G, KeyMod.CtrlCmd | KeyCode.KEY_C),
				context: [],
				command: 'unreachablechord',
				weight1: 10,
				weight2: 0
			},
			{
				keybinding: KeyMod.CtrlCmd | KeyCode.KEY_G,
				context: [],
				command: 'eleven',
				weight1: 11,
				weight2: 0
			}
		];

		var resolver = new CommonKeybindingResolver(items, [], false);



		var testKey = (commandId: string, expectedKeys: number[]) => {
			// Test lookup
			var lookupResult = resolver.lookupKeybinding(commandId);
			assert.equal(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId + '; GOT: ' + JSON.stringify(lookupResult, null, '\t'));
			for (let i = 0, len = lookupResult.length; i < len; i++) {
				assert.equal(lookupResult[i].value, expectedKeys[i]);
			}
		};

		var testResolve = (ctx:any, expectedKey:number, commandId:string) => {

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
		}

		testKey('first', []);

		testKey('second', [KeyCode.KEY_Z, KeyCode.KEY_X]);
		testResolve({key2: true}, KeyCode.KEY_X, 'second');
		testResolve({}, KeyCode.KEY_Z, 'second');

		testKey('third', [KeyCode.KEY_X]);
		testResolve({key3:true}, KeyCode.KEY_X, 'third');

		testKey('fourth', []);

		testKey('fifth', [KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)]);
		testResolve({}, KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z), 'fifth');

		testKey('seventh', [KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)]);
		testResolve({}, KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K), 'seventh');

		testKey('uncomment lines', [KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U)]);
		testResolve({}, KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U), 'uncomment lines');

		testKey('comment lines', [KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C)]);
		testResolve({}, KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C), 'comment lines');

		testKey('unreachablechord', []);

		testKey('eleven', [KeyMod.CtrlCmd | KeyCode.KEY_G]);
		testResolve({}, KeyMod.CtrlCmd | KeyCode.KEY_G, 'eleven');

		testKey('sixth', []);


	});
});
