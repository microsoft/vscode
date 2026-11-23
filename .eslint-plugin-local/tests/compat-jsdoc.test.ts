/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import plugin from '../compat/jsdoc.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const ruleTester = new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } });

ruleTester.run('no-types', plugin.rules['no-types'], {
	valid: [
		'/**\n * @param a The a.\n * @returns The result.\n */\nfunction f(a: string): number { return 1; }',
		'/** @param {string} a The a. */\ninterface I { a: string }',
		'/** @type {string} */\nconst a = "";',
		'/** @returns {string} */\nconst f = 1;',
	],
	invalid: [
		{
			code: '/**\n * @param {string} a The a.\n * @returns {number} The result.\n */\nfunction f(a: string): number { return 1; }',
			errors: [
				{ message: 'Types are not permitted on @param.', line: 2, column: 0 },
				{ message: 'Types are not permitted on @returns.', line: 3, column: 0 },
			],
			// Each fix rewrites the whole block, so one pass applies only the first.
			output: '/**\n * @param a The a.\n * @returns {number} The result.\n */\nfunction f(a: string): number { return 1; }',
		},
		{
			code: '/** @arg {string} a */\nexport const f = (a: string) => a;',
			errors: [{ message: 'Types are not permitted on @arg.', line: 1, column: 0 }],
			output: '/** @arg a */\nexport const f = (a: string) => a;',
		},
		{
			code: 'declare module "m" {\n\t/** @param {{\n\t *   a: string }} options The options. */\n\texport function f(options: { a: string }): void;\n}',
			errors: [{ message: 'Types are not permitted on @param.', line: 2, column: 0 }],
			output: 'declare module "m" {\n\t/** @param\n\t *  options The options. */\n\texport function f(options: { a: string }): void;\n}',
		},
		{
			code: 'interface I {\n\t/** @return {void} */\n\tm(): void;\n}',
			errors: [{ message: 'Types are not permitted on @return.', line: 2, column: 0 }],
			output: 'interface I {\n\t/** @return */\n\tm(): void;\n}',
		},
		{
			code: 'class C {\n\t/** @param {string} a */\n\tm(a: string) { }\n}',
			errors: [{ message: 'Types are not permitted on @param.', line: 2, column: 0 }],
			output: 'class C {\n\t/** @param a */\n\tm(a: string) { }\n}',
		},
		{
			code: '/**\n * @property {string} p The p.\n * @prop q The q.\n */\nclass C { }',
			errors: [{ message: 'Types are not permitted on @property in the supplied context.', line: 2, column: 0 }],
			output: '/**\n * @property p The p.\n * @prop q The q.\n */\nclass C { }',
		},
	],
});

ruleTester.run('no-multi-asterisks', plugin.rules['no-multi-asterisks'], {
	valid: [
		{ code: '/**\n * *bold* text\n */\nconst a = 1;', options: [{ allowWhitespace: true }] },
		{ code: '/** Text. */\nconst a = 1;', options: [{ allowWhitespace: true }] },
		{ code: '/**\n * Text.\n *\n */\nconst a = 1;', options: [{ allowWhitespace: true }] },
		{ code: '/*\n ** Not JSDoc.\n */\nconst a = 1;', options: [{ allowWhitespace: true }] },
	],
	invalid: [
		{
			code: '/**\n ** Text.\n */\nconst a = 1;',
			options: [{ allowWhitespace: true }],
			errors: [{ message: 'Should be no multiple asterisks on middle lines.', line: 2, column: 0 }],
			output: '/**\n * Text.\n */\nconst a = 1;',
		},
		{
			code: '/**\n * Text.\n **/\nconst a = 1;',
			options: [{ allowWhitespace: true }],
			errors: [{ message: 'Should be no multiple asterisks on end lines.', line: 3, column: 0 }],
			output: '/**\n * Text.\n */\nconst a = 1;',
		},
		{
			code: '/** Text. **/\nconst a = 1;',
			options: [{ allowWhitespace: true }],
			errors: [{ message: 'Should be no multiple asterisks on end lines.', line: 1, column: 0 }],
			output: '/** Text. */\nconst a = 1;',
		},
		{
			code: '/**\n * Text.\n * More. */\nconst a = 1;',
			options: [{ allowWhitespace: true }],
			errors: [{ message: 'Should be no multiple asterisks on end lines.', line: 3, column: 0 }],
			output: '/**\n * Text.\n  More. */\nconst a = 1;',
		},
		{
			code: '/**\n * Text.\n *\t* Not bold.\n */\nconst a = 1;',
			errors: [{ message: 'Should be no multiple asterisks on middle lines.', line: 3, column: 0 }],
			output: '/**\n * Text.\n *\tNot bold.\n */\nconst a = 1;',
		},
	],
});

const requireJsdocOptions = [{
	enableFixer: false,
	contexts: ['TSInterfaceDeclaration', 'TSPropertySignature', 'TSMethodSignature', 'TSDeclareFunction', 'ClassDeclaration', 'MethodDefinition', 'PropertyDeclaration', 'TSEnumDeclaration', 'TSEnumMember', 'ExportNamedDeclaration'],
}];

ruleTester.run('require-jsdoc', plugin.rules['require-jsdoc'], {
	valid: [
		{
			code: [
				'declare module "m" {',
				'\t/** The interface. */',
				'\texport interface I {',
				'\t\t/** A property. */',
				'\t\treadonly p: string;',
				'\t\t// A line comment.',
				'\t\t/** A method. */',
				'\t\t// Another line comment.',
				'\t\tm(a: string): void;',
				'\t}',
				'\t/** A function. */',
				'\texport function f(a: string): void;',
				'\texport function f(a: string, b: string): void;',
				'\t/** A class. */',
				'\texport class C {',
				'\t\t/** A constructor. */',
				'\t\tconstructor(a: string);',
				'\t\tconstructor();',
				'\t\t/** A method. */',
				'\t\tstatic m(): void;',
				'\t\tp: number;',
				'\t}',
				'\t/** An enum. */',
				'\texport enum E {',
				'\t\t/** A member. */ A,',
				'\t}',
				'}',
			].join('\n'),
			options: requireJsdocOptions,
		},
		{ code: 'const f = () => 1;', options: requireJsdocOptions },
	],
	invalid: [
		{
			code: 'declare module "m" {\n\texport interface I {\n\t\tp: string;\n\t\tm(): void;\n\t}\n}',
			options: requireJsdocOptions,
			errors: [
				{ messageId: 'missingJsDoc', line: 2, column: 1, endLine: 3, endColumn: 0 },
				{ messageId: 'missingJsDoc', line: 2, column: 8, endLine: 3, endColumn: 0 },
				{ messageId: 'missingJsDoc', line: 3, column: 2, endLine: 4, endColumn: 0 },
				{ messageId: 'missingJsDoc', line: 4, column: 2, endLine: 5, endColumn: 0 },
			],
		},
		{
			code: '/** Documented. */\n\nexport function f(a: string): void;\nexport function f(): void;',
			options: requireJsdocOptions,
			errors: [
				{ messageId: 'missingJsDoc', line: 3, column: 0 },
				{ messageId: 'missingJsDoc', line: 3, column: 7 },
				{ messageId: 'missingJsDoc', line: 4, column: 0 },
				{ messageId: 'missingJsDoc', line: 4, column: 7 },
			],
		},
		{
			code: '/** A class. */\nexport declare class C {\n\tconstructor();\n\tm(): void;\n\tm(a: string): void;\n}',
			options: requireJsdocOptions,
			errors: [
				{ messageId: 'missingJsDoc', line: 3, column: 12 },
				{ messageId: 'missingJsDoc', line: 4, column: 2 },
				{ messageId: 'missingJsDoc', line: 5, column: 2 },
			],
		},
		{
			code: '/* Not JSDoc. */\nexport enum E { A }\n/** A type. */\nexport type T = string;\nexport namespace N { }',
			options: requireJsdocOptions,
			errors: [
				{ messageId: 'missingJsDoc', line: 2, column: 0 },
				{ messageId: 'missingJsDoc', line: 2, column: 7 },
				{ messageId: 'missingJsDoc', line: 2, column: 16 },
				{ messageId: 'missingJsDoc', line: 5, column: 0 },
			],
		},
		{
			code: 'function f() { }',
			options: requireJsdocOptions,
			errors: [{ messageId: 'missingJsDoc', line: 1, column: 0 }],
		},
		{
			code: 'function f() { }',
			errors: [{ messageId: 'missingJsDoc', line: 1, column: 0 }],
			output: '/**\n *\n */\nfunction f() { }',
		},
		{
			code: 'interface I {\n\t/** Documented. */\n\tm(): void;\n\tn(): void;\n}\nclass C implements I {\n\tm() { }\n\tn() { }\n}',
			options: [{ enableFixer: false, require: { MethodDefinition: true } }],
			errors: [{ messageId: 'missingJsDoc', line: 8, column: 2 }],
		},
	],
});

const checkParamNamesOptions = [{ enableFixer: false, checkDestructured: false }];

ruleTester.run('check-param-names', plugin.rules['check-param-names'], {
	valid: [
		{ code: '/**\n * @param a The a.\n * @param b The b.\n */\nexport function f(a: string, b: number): void;', options: checkParamNamesOptions },
		{ code: '/**\n * @param a The a.\n */\nexport function f(this: Window, a: string): void;', options: checkParamNamesOptions },
		{ code: '/**\n * @param options The options.\n * @param options.a The a.\n * @param b The b.\n */\nexport function f({ a }: { a: string }, b: number): void;', options: checkParamNamesOptions },
		{ code: '/**\n * @param anything The options.\n */\nexport function f(options: { a: string }): void;', options: checkParamNamesOptions },
		{ code: 'interface I {\n\t/** @param e The event. */\n\tlistener: (e: string) => void;\n\t/** @param x Not a function. */\n\tvalue: string;\n}', options: checkParamNamesOptions },
		{ code: '/** @returns Nothing. */\nexport function f(a: string): void;', options: checkParamNamesOptions },
	],
	invalid: [
		{
			code: '/**\n * @param a The a.\n * @param c The c.\n */\nexport function f(a: string, b: number): void;',
			options: checkParamNamesOptions,
			errors: [{ message: 'Expected @param names to be "a, b". Got "a, c".', line: 3, column: 0 }],
		},
		{
			code: '/**\n * @param a The a.\n * @param b The b.\n */\nexport function f(a: string): void;',
			options: checkParamNamesOptions,
			errors: [{ message: '@param "b" does not match an existing function parameter.', line: 3, column: 0 }],
		},
		{
			code: '/**\n * @param a The a.\n * @param a Again.\n */\nexport function f(a: string, b: string): void;',
			options: checkParamNamesOptions,
			errors: [{ message: 'Duplicate @param "a"', line: 3, column: 0 }],
		},
		{
			code: 'interface I {\n\t/**\n\t * @param a The a.\n\t * @param args The rest.\n\t */\n\tm(a: string, ...rest: any[]): void;\n}',
			options: checkParamNamesOptions,
			errors: [{ message: 'Expected @param names to be "a, ...rest". Got "a, args".', line: 4, column: 0 }],
		},
		{
			code: '/**\n * @param x The options.\n * @param c The c.\n */\nconst f = ({ a }: { a: string }, b: number) => a;',
			options: checkParamNamesOptions,
			errors: [{ message: 'Expected @param names to be "x, b". Got "x, c".', line: 3, column: 0 }],
		},
	],
});

ruleTester.run('tag-lines', plugin.rules['tag-lines'], {
	valid: [
		'/**\n * Description.\n * @param a The a.\n * @returns The result.\n */\nfunction f(a: string) { }',
		'/**\n * Description.\n *\n * More description.\n */\nfunction f(a: string) { }',
		'/**\n * @param a The a.\n *\n *   More about a.\n */\nfunction f(a: string) { }',
	],
	invalid: [
		{
			code: '/**\n * Description.\n * @param a The a.\n *\n * @returns The result.\n */\nfunction f(a: string) { }',
			errors: [{ message: 'Expected no lines between tags', line: 4, column: 0 }],
			output: '/**\n * Description.\n * @param a The a.\n * @returns The result.\n */\nfunction f(a: string) { }',
		},
		{
			code: '/**\n * Description.\n *\n *\n * @param a The a.\n */\nfunction f(a: string) { }',
			errors: [{ message: 'Expected only 0 lines after block description', line: 2, column: 0 }],
			output: '/**\n * Description.\n * @param a The a.\n */\nfunction f(a: string) { }',
		},
	],
});

ruleTester.run('valid-types', plugin.rules['valid-types'], {
	valid: [
		'/**\n * @param {string} a The a.\n * @returns {Promise<void>} The result.\n */\nfunction f(a) { }',
		'/**\n * @typedef {{ a: string; b?: (x: number) => void }} Foo\n * @template T\n * @see {@link Foo}\n * @memberof Foo#\n * @module foo/bar\n */\nconst a = 1;',
	],
	invalid: [
		{
			code: '/**\n * @param {string|} a The a.\n * @param [b The b.\n * @param {{ a: string? }} c The c.\n */\nfunction f(a, b, c) { }',
			errors: [
				{ message: 'Syntax error in type: string|', line: 2, column: 0 },
				{ message: 'Invalid name: unpaired brackets', line: 3, column: 0 },
				{ message: 'Syntax error in type: JsdocTypeNullable', line: 4, column: 0 },
			],
		},
		{
			code: '/**\n * Text {@link}.\n * @internal name\n * @private {string}\n * @type\n * @memberof\n * @typedef {string} a-b\n * @see {@linkcode }\n */\nconst a = 1;',
			errors: [
				{ message: 'Inline tag "link" missing content', line: 1, column: 0 },
				{ message: '@internal should not have a name.', line: 3, column: 0 },
				{ message: '@private should not have a bracketed type in "typescript" mode.', line: 4, column: 0 },
				{ message: 'Tag @type must have a type.', line: 5, column: 0 },
				{ message: 'Tag @memberof must have either a type or namepath.', line: 6, column: 0 },
				{ message: 'Syntax error in name: a-b', line: 7, column: 0 },
				{ message: 'Inline tag "linkcode" missing content', line: 8, column: 0 },
			],
		},
	],
});
