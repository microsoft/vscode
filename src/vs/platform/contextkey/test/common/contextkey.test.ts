/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

const createContext = ctx => ({ getValue: key => ctx[key] });

suite('ContextKeyExpr', () => {
	test('ContextKeyExpr.equals', function () {
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

	test('normalize', function () {
		let key1IsTrue = ContextKeyExpr.equals('key1', true);
		let key1IsNotFalse = ContextKeyExpr.notEquals('key1', false);
		let key1IsFalse = ContextKeyExpr.equals('key1', false);
		let key1IsNotTrue = ContextKeyExpr.notEquals('key1', true);

		assert.ok(key1IsTrue.normalize().equals(ContextKeyExpr.has('key1')));
		assert.ok(key1IsNotFalse.normalize().equals(ContextKeyExpr.has('key1')));
		assert.ok(key1IsFalse.normalize().equals(ContextKeyExpr.not('key1')));
		assert.ok(key1IsNotTrue.normalize().equals(ContextKeyExpr.not('key1')));
	});

	test('evaluate', function () {
		/* tslint:disable:triple-equals */
		let context = createContext({
			'a': true,
			'b': false,
			'c': '5'
		});
		function testExpression(expr: string, expected: boolean): void {
			let rules = ContextKeyExpr.deserialize(expr);
			assert.equal(rules.evaluate(context), expected, expr);
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
