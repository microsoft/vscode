/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import plugin from '../compat/eslintJs.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const ruleTester = new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } });

const multiWindowMessage = 'Use DOM.isMouseEvent() to support multi-window scenarios.';
const multiWindowOptions = [
	{ selector: 'BinaryExpression[operator=\'instanceof\'][right.name=\'MouseEvent\']', message: multiWindowMessage },
	{ selector: 'BinaryExpression[operator=\'instanceof\'][right.name=/^HTML\\w+/]', message: 'Use DOM.isHTMLElement().' },
	{ selector: ':matches(PropertyDefinition, TSParameterProperty, MethodDefinition[key.name!="constructor"])[accessibility="private"]', message: 'Use #private instead' },
];

ruleTester.run('no-restricted-syntax', plugin.rules['no-restricted-syntax'], {
	valid: [
		{ name: 'no options', code: 'const x = a instanceof MouseEvent;' },
		{ name: 'not matching', code: 'const x = a instanceof KeyboardEvent; class A { constructor(public x: number) { } }', options: multiWindowOptions },
		{ name: 'private constructor', code: 'class A { private constructor() { } }', options: multiWindowOptions },
	],
	invalid: [
		{
			name: 'configured messages',
			code: 'const x = a instanceof MouseEvent || b instanceof HTMLDivElement;\nclass A { private y = 1; constructor(private z: number) { } }',
			options: multiWindowOptions,
			errors: [
				{ message: multiWindowMessage, line: 1, column: 10 },
				{ message: 'Use DOM.isHTMLElement().', line: 1, column: 37 },
				{ message: 'Use #private instead', line: 2, column: 10 },
				{ message: 'Use #private instead', line: 2, column: 37 },
			],
		},
		{
			name: 'selector strings and objects without a message',
			code: 'const x = require(name); const y = import(name);',
			options: ['CallExpression[callee.name=\'require\'][arguments.0.type!=\'Literal\']', { selector: 'ImportExpression[source.type!=\'Literal\']' }],
			errors: [
				{ message: 'Using \'CallExpression[callee.name=\'require\'][arguments.0.type!=\'Literal\']\' is not allowed.', column: 10 },
				{ message: 'Using \'ImportExpression[source.type!=\'Literal\']\' is not allowed.', column: 35 },
			],
		},
		{
			name: 'the last message of a repeated selector',
			code: 'let x: (string | number)[];',
			options: [{ selector: 'TSArrayType > TSUnionType', message: 'first' }, { selector: 'TSArrayType > TSUnionType', message: 'Use Array<...> for arrays of union types.' }],
			errors: [{ message: 'Use Array<...> for arrays of union types.', column: 8 }],
		},
	],
});

ruleTester.run('no-buffer-constructor', plugin.rules['no-buffer-constructor'], {
	valid: [
		{ name: 'factory methods', code: 'Buffer.from(\'x\'); Buffer.alloc(1); Buffer.allocUnsafe(1);' },
		{ name: 'other callees', code: 'new foo.Buffer(1); globalThis.Buffer(1); new Buffers(1);' },
	],
	invalid: [
		{
			name: 'calls with and without new',
			code: 'new Buffer(1); Buffer(2);',
			errors: [
				{ message: 'new Buffer() is deprecated. Use Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe() instead.', column: 0 },
				{ message: 'Buffer() is deprecated. Use Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe() instead.', column: 15 },
			],
		},
	],
});
