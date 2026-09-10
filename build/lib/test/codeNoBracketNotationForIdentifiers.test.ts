/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESLint, Linter, RuleTester } from 'eslint';
import { before, suite, test } from 'node:test';
import path from 'path';
import tseslint from 'typescript-eslint';
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
		...[
			'process.env["ProgramW6432"] || process.env["PROGRAMFILES"] || process.env["https_proxy"];',
			'process.env["PATH"] = "value"; delete process.env["PATH"];',
			'process.env["_"] = "value";',
			'process.env.PATH;',
			'process?.env?.["PATH"];',
			'(process?.env)?.["PATH"];',
			'process /* comment */ . env["PATH"];',
		].map(code => ({ code, options: [{ allow: ['process.env'] }] })),
		...[
			'(process.env as NodeJS.ProcessEnv)["PATH"];',
			'(<NodeJS.ProcessEnv>process.env)["PATH"];',
			'process.env!["PATH"];',
			'(process.env satisfies NodeJS.ProcessEnv)["PATH"];',
		].map(code => ({
			code,
			options: [{ allow: ['process.env'] }],
			languageOptions: { parser: tseslint.parser },
		})),
		{
			code: 'opts["f"] || opts["g"] || opts["help"];',
			options: [{ allow: ['opts'] }],
		},
		{
			code: 'env["PATH"]; safeProcess.env["PATH"]; configuration?.userEnv?.["PATH"]; this.args["help"];',
			options: [{ allow: ['env', 'safeProcess.env', 'configuration.userEnv', 'this.args'] }],
		},
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
		{
			name: 'environment receivers are not implicitly exempt',
			code: 'process.env["PATH"];',
			output: 'process.env.PATH;',
			errors: [{ messageId: 'noBracketNotation', data: { property: 'PATH' } }],
		},
		{
			name: 'an empty allow list preserves enforcement',
			code: 'process.env["PATH"];',
			output: 'process.env.PATH;',
			options: [{ allow: [] }],
			errors: [{ messageId: 'noBracketNotation', data: { property: 'PATH' } }],
		},
		{
			name: 'computed receiver segments do not exempt their own access',
			code: 'process["env"]["PATH"];',
			output: 'process.env["PATH"];',
			options: [{ allow: ['process.env'] }],
			errors: [{ messageId: 'noBracketNotation', data: { property: 'env' } }],
		},
		...[
			{ code: 'object["_private"];', output: 'object._private;', property: '_private' },
			{ code: 'object["PATH"];', output: 'object.PATH;', property: 'PATH' },
			{ code: 'point["x"];', output: 'point.x;', property: 'x' },
			{ code: 'opts["f"];', output: 'opts.f;', property: 'f' },
			{ code: 'env["PATH"];', output: 'env.PATH;', property: 'PATH' },
			{ code: 'other.env["PATH"];', output: 'other.env.PATH;', property: 'PATH' },
			{ code: 'process.other["PATH"];', output: 'process.other.PATH;', property: 'PATH' },
			{ code: 'process.env.nested["PATH"];', output: 'process.env.nested.PATH;', property: 'PATH' },
			{ code: 'other.process.env["PATH"];', output: 'other.process.env.PATH;', property: 'PATH' },
			{ code: 'process.envs["PATH"];', output: 'process.envs.PATH;', property: 'PATH' },
			{ code: 'process[key]["PATH"];', output: 'process[key].PATH;', property: 'PATH' },
			{ code: 'getEnv()["PATH"];', output: 'getEnv().PATH;', property: 'PATH' },
			{ code: '(condition ? process.env : other)["PATH"];', output: '(condition ? process.env : other).PATH;', property: 'PATH' },
			{ code: 'const env = process.env; env["PATH"];', output: 'const env = process.env; env.PATH;', property: 'PATH' },
			{ code: 'const env = { ...process.env }; env["PATH"];', output: 'const env = { ...process.env }; env.PATH;', property: 'PATH' },
		].map(({ code, output, property }) => ({
			code,
			output,
			options: [{ allow: ['process.env'] }],
			errors: [{ messageId: 'noBracketNotation', data: { property } }],
		})),
		{
			name: 'a literal containing dots is not a receiver path',
			code: 'object["process.env"]["PATH"];',
			output: 'object["process.env"].PATH;',
			options: [{ allow: ['object.process.env'] }],
			errors: [{ messageId: 'noBracketNotation', data: { property: 'PATH' } }],
		},
		{
			name: 'TypeScript private members remain checked with exceptions enabled',
			code: 'class Service { private value = 1; } new Service()["value"];',
			output: 'class Service { private value = 1; } new Service().value;',
			options: [{ allow: ['process.env'] }],
			languageOptions: { parser: tseslint.parser },
			errors: [{ messageId: 'noBracketNotation', data: { property: 'value' } }],
		},
	],
});

suite('bracket notation receiver configuration', () => {
	const ruleId = 'local/code-no-bracket-notation-for-identifiers';
	let eslint: ESLint;

	before(async () => {
		const { default: configuration }: { default: Linter.Config[] } = await import(new URL('../../../eslint.config.js', import.meta.url).href);
		eslint = new ESLint({
			cwd: path.resolve(import.meta.dirname, '../../..'),
			overrideConfigFile: true,
			// Exercise receiver scoping independently of the temporary migration allowlist.
			overrideConfig: configuration.map(config => config.rules?.[ruleId] ? { ...config, ignores: [] } : config),
		});
	});

	for (const { filePath, code, properties } of [
		{
			filePath: 'src/bootstrap-cli.ts',
			code: 'process.env["PATH"]; env["PATH"]; opts["f"]; service["_private"];',
			properties: ['PATH', 'f', '_private'],
		},
		{
			filePath: 'src/vs/code/electron-browser/workbench/workbench.ts',
			code: 'safeProcess.env["PATH"]; service["_private"];',
			properties: ['_private'],
		},
		{
			filePath: 'src/vs/platform/shell/node/shellEnv.ts',
			code: 'process.env["PATH"]; env["PATH"]; opts["f"]; service["_private"];',
			properties: ['f', '_private'],
		},
		{
			filePath: 'src/vs/platform/windows/electron-main/windowsMainService.ts',
			code: 'configuration?.userEnv?.["PATH"]; openConfig.userEnv["PATH"]; other.userEnv["PATH"]; service["_private"];',
			properties: ['PATH', '_private'],
		},
		{
			filePath: 'test/smoke/test/index.js',
			code: 'process.env["PATH"]; opts["f"] || opts["g"] || opts["help"]; options["grep"]; service["_private"];',
			properties: ['grep', '_private'],
		},
		{
			filePath: 'src/vs/base/browser/dom.ts',
			code: 'object["property"];',
			properties: ['property'],
		},
	]) {
		test(filePath, async () => {
			const [result] = await eslint.lintText(code, { filePath });
			assert.deepStrictEqual(
				result.messages.filter(message => message.fatal || message.ruleId === ruleId).map(message => message.message),
				properties.map(property => `Use dot notation instead of bracket notation for property '${property}'.`)
			);
		});
	}
});
