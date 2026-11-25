/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import plugin from '../compat/typescriptEslintJs.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const ruleTester = new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } });

// The options of the terminal folders in eslint.config.js.
const namingOptions = [
	{ selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
	{ selector: 'variable', filter: '^I.+Service$', format: ['PascalCase'], prefix: ['I'] },
	{ selector: 'memberLike', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'require' },
	{ selector: 'memberLike', modifiers: ['protected'], format: ['camelCase'], leadingUnderscore: 'require' },
	{ selector: 'enumMember', format: ['PascalCase'] },
	{ selector: 'method', modifiers: ['public'], format: ['camelCase', 'UPPER_CASE'] },
	{ selector: 'typeLike', format: ['PascalCase'] },
	{ selector: 'interface', format: ['PascalCase'] },
];

const formatError = (type: string, name: string, formats: string) => ({ message: `${type} name \`${name}\` must match one of the following formats: ${formats}` });
const trimmedError = (type: string, name: string, trimmed: string, formats: string) => ({ message: `${type} name \`${name}\` trimmed as \`${trimmed}\` must match one of the following formats: ${formats}` });
const underscoreError = (type: string, name: string) => ({ message: `${type} name \`${name}\` must have one leading underscore(s).` });

ruleTester.run('naming-convention', plugin.rules['naming-convention'], {
	valid: [
		{
			name: 'conforming names',
			code: [
				'const camel = 1, UPPER_X = 2, Pascal = 3, IFooService = 4;',
				'class Foo<T> { private _a = 1; protected _b() { } public c() { } D_E() { } #f_g = 1; static h_i = 1; constructor(private _p: number, public Q_r: number) { } }',
				'interface IBar { m(): void; p_q: number; }',
				'enum E { A, Bc }',
				'const o = { a_b: 1, get C_d() { return 1; } };',
				'function f_g(p_q: number) { }',
			].join('\n'),
			options: namingOptions,
		},
	],
	invalid: [
		{
			name: 'variables',
			code: 'let snake_case = 1, _lead = 2; const { a_b, c: D_e } = o; const IfooService = 3;',
			options: namingOptions,
			errors: [
				{ ...formatError('Variable', 'snake_case', 'camelCase, UPPER_CASE, PascalCase'), column: 4 },
				{ ...formatError('Variable', '_lead', 'camelCase, UPPER_CASE, PascalCase'), column: 20 },
				{ ...formatError('Variable', 'a_b', 'camelCase, UPPER_CASE, PascalCase'), column: 39 },
				{ ...formatError('Variable', 'D_e', 'camelCase, UPPER_CASE, PascalCase'), column: 47 },
				{ ...trimmedError('Variable', 'IfooService', 'fooService', 'PascalCase'), column: 64 },
			],
		},
		{
			name: 'class members',
			code: [
				'class Foo {',
				'	private a = 1;',
				'	protected _b_c() { }',
				'	public _d() { }',
				'	private get e() { return 1; }',
				'	private \'f-g\' = 1;',
				'	constructor(private h: number) { }',
				'}',
			].join('\n'),
			options: namingOptions,
			errors: [
				{ ...underscoreError('Class Property', 'a'), line: 2, column: 9 },
				{ ...trimmedError('Class Method', '_b_c', 'b_c', 'camelCase'), line: 3, column: 11 },
				{ ...formatError('Class Method', '_d', 'camelCase, UPPER_CASE'), line: 4, column: 8 },
				{ ...underscoreError('Classic Accessor', 'e'), line: 5, column: 13 },
				{ ...underscoreError('Class Property', 'f-g'), line: 6, column: 9 },
				{ ...underscoreError('Parameter Property', 'h'), line: 7, column: 21 },
			],
		},
		{
			name: 'types and object literals',
			code: [
				'interface bar_x { _m(): void; f_n: () => void; \'q-r\'(): void; }',
				'type t_y = { m_n(): void };',
				'enum e_z { lower_case, \'quoted-m\' }',
				'class Gen<t_p> { }',
				'const o = { A_b() { } };',
			].join('\n'),
			options: namingOptions,
			errors: [
				{ ...formatError('Interface', 'bar_x', 'PascalCase'), line: 1, column: 10 },
				{ ...formatError('Type Method', '_m', 'camelCase, UPPER_CASE'), line: 1, column: 18 },
				{ ...formatError('Type Method', 'f_n', 'camelCase, UPPER_CASE'), line: 1, column: 30 },
				{ ...formatError('Type Method', 'q-r', 'camelCase, UPPER_CASE'), line: 1, column: 47 },
				{ ...formatError('Type Alias', 't_y', 'PascalCase'), line: 2, column: 5 },
				{ ...formatError('Type Method', 'm_n', 'camelCase, UPPER_CASE'), line: 2, column: 13 },
				{ ...formatError('Enum', 'e_z', 'PascalCase'), line: 3, column: 5 },
				{ ...formatError('Enum Member', 'lower_case', 'PascalCase'), line: 3, column: 11 },
				{ ...formatError('Enum Member', 'quoted-m', 'PascalCase'), line: 3, column: 23 },
				{ ...formatError('Type Parameter', 't_p', 'PascalCase'), line: 4, column: 10 },
				{ ...formatError('Object Literal Method', 'A_b', 'camelCase, UPPER_CASE'), line: 5, column: 12 },
			],
		},
	],
});

// The options of the extensions/git folder in eslint.config.js.
const gitMessage = 'Use \'import type\' for types from git.d.ts and import runtime const enum values from git.constants instead';
const importOptions = [{ patterns: [{ group: ['*/api/git'], allowTypeImports: true, message: gitMessage }] }];
const importError = (importSource: string, column = 0) => ({ message: `'${importSource}' import is restricted from being used by a pattern. ${gitMessage}`, column });

ruleTester.run('no-restricted-imports', plugin.rules['no-restricted-imports'], {
	valid: [
		{
			name: 'type-only imports and exports, dynamic imports and other modules',
			code: [
				'import type { API } from \'../api/git\';',
				'import { type Branch } from \'../api/git\';',
				'import type D from \'../api/git\';',
				'export type { Ref } from \'../api/git\';',
				'export { type A, type B } from \'../api/git\';',
				'export type * from \'../api/git\';',
				'import type z = require(\'../api/git\');',
				'const x = import(\'../api/git\');',
				'import { A } from \'../../api/git\';',
				'import { B } from \'api/git\';',
				'import { C } from \'x/api/gitx\';',
				'import { E } from \'./git.constants\';',
			].join('\n'),
			options: importOptions,
		},
	],
	invalid: [
		{ name: 'named import', code: 'import { Repository } from \'../api/git\';', options: importOptions, errors: [importError('../api/git')] },
		{ name: 'namespace import', code: 'import * as all from \'../api/git\';', options: importOptions, errors: [importError('../api/git')] },
		{ name: 'side-effect import', code: 'import \'../api/git\';', options: importOptions, errors: [importError('../api/git')] },
		{ name: 'value and type specifiers', code: 'import D, { type A } from \'../api/git\';', options: importOptions, errors: [importError('../api/git')] },
		{ name: 're-export', code: 'export { Remote, type Ref } from \'../api/git\';', options: importOptions, errors: [importError('../api/git')] },
		{ name: 'export all', code: 'export * as ns from \'../api/git\';', options: importOptions, errors: [importError('../api/git')] },
		{ name: 'import require', code: 'import y = require(\'../api/git\');', options: importOptions, errors: [importError('../api/git')] },
		{
			name: 'matching paths',
			code: 'import { A } from \'./api/git\';\nimport { B } from \'../api/git/x\';\nimport { C } from \' ../API/Git \';',
			options: importOptions,
			errors: [importError('./api/git'), importError('../api/git/x'), importError('../API/Git')],
		},
		{
			name: 'gitignore-style groups without a message',
			code: 'import \'a/b\';\nimport \'a/c\';\nimport \'x/node_modules/y\';\nimport \'Foo.js\';',
			options: [{ patterns: ['a/*', '!a/b', 'node_modules/', '*.JS'] }],
			errors: [
				{ message: '\'a/c\' import is restricted from being used by a pattern.', line: 2 },
				{ message: '\'x/node_modules/y\' import is restricted from being used by a pattern.', line: 3 },
				{ message: '\'Foo.js\' import is restricted from being used by a pattern.', line: 4 },
			],
		},
	],
});
