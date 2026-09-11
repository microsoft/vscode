/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import rule from '../../../.eslint-plugin-local/code-no-bracket-notation-for-identifiers.ts';

RuleTester.describe = suite;
RuleTester.it = test;

new RuleTester().run('code-no-bracket-notation-for-identifiers', rule, {
	valid: [
		'object.property;',
		'object[computedProperty];',
		'object[42];',
		'object["property-with-dashes"];',
		'object["property with spaces"];',
		'object[`property`];',
		String.raw`object["\u0061"];`,
		String.raw`object["a\x62"];`,
		'process.env["ProgramW6432"];',
		'process.env["PROGRAMFILES"];',
		'process.env["https_proxy"];',
		'process.env["PATH"] = "value";',
		'delete process.env["PATH"];',
		'process.env.PATH;',
		'process.env?.["PATH"];',
		'process?.env?.["PATH"];',
		'(process.env)["PATH"];',
	],
	invalid: [
		{
			name: 'normal property',
			code: 'object["property"];',
			output: 'object.property;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'property' } }],
		},
		{
			name: 'private property',
			code: 'object["_privateProperty"];',
			output: 'object._privateProperty;',
			errors: [{ messageId: 'noBracketNotation', data: { property: '_privateProperty' } }],
		},
		{
			name: 'keyword property',
			code: 'object["default"];',
			output: 'object.default;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'default' } }],
		},
		{
			name: 'Unicode property',
			code: 'object["π"];',
			output: 'object.π;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'π' } }],
		},
		{
			name: 'optional property access',
			code: 'object?.["property"];',
			output: 'object?.property;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'property' } }],
		},
		{
			name: 'integer literal property access',
			code: '1["toString"];',
			output: '(1).toString;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'toString' } }],
		},
		{
			name: 'decimal literal property access',
			code: '1.5["toString"];',
			output: '(1.5).toString;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'toString' } }],
		},
		{
			name: 'comment before property',
			code: 'object[/* comment */"property"];',
			output: null,
			errors: [{ messageId: 'noBracketNotation', data: { property: 'property' } }],
		},
		{
			name: 'comment after property',
			code: 'object["property"/* comment */];',
			output: null,
			errors: [{ messageId: 'noBracketNotation', data: { property: 'property' } }],
		},
		...[
			{ code: 'opts["f"];', output: 'opts.f;', property: 'f' },
			{ code: 'env["PATH"];', output: 'env.PATH;', property: 'PATH' },
			{ code: 'safeProcess.env["PATH"];', output: 'safeProcess.env.PATH;', property: 'PATH' },
			{ code: 'process.versions["node"];', output: 'process.versions.node;', property: 'node' },
			{ code: 'process.env.nested["PATH"];', output: 'process.env.nested.PATH;', property: 'PATH' },
			{ code: 'other.process.env["PATH"];', output: 'other.process.env.PATH;', property: 'PATH' },
			{ code: 'process[key]["PATH"];', output: 'process[key].PATH;', property: 'PATH' },
			{ code: 'const env = process.env; env["PATH"];', output: 'const env = process.env; env.PATH;', property: 'PATH' },
		].map(({ code, output, property }) => ({
			code,
			output,
			errors: [{ messageId: 'noBracketNotation', data: { property } }],
		})),
	],
});
