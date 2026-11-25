/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import { posix } from 'path';
import rule, { resolveImport } from '../code-no-restricted-path-imports.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const repositoryRoot = posix.normalize(`${import.meta.dirname.replace(/\\/g, '/')}/../..`);
const filename = `${repositoryRoot}/src/vs/workbench/contrib/chat/browser/chatTipCatalog.ts`;
const message = 'contrib/chat must not import from contrib/sessions';
const options = [{ paths: [{ pattern: 'src/vs/workbench/contrib/sessions/**', message }] }];

const importForms = [
	{ name: 'value import', code: (source: string) => `import { X } from '${source}';` },
	{ name: 'side-effect import', code: (source: string) => `import '${source}';` },
	{ name: 'type-only import', code: (source: string) => `import type { X } from '${source}';` },
	{ name: 'named re-export', code: (source: string) => `export { X } from '${source}';` },
	{ name: 'star re-export', code: (source: string) => `export * from '${source}';` },
	{ name: 'dynamic import', code: (source: string) => `const x = import('${source}');` },
	{ name: 'dynamic import of a template literal', code: (source: string) => `const x = import(\`${source}\`);` },
	{ name: 'require', code: (source: string) => `const x = require('${source}');` },
	{ name: 'require of a template literal', code: (source: string) => `const x = require(\`${source}\`);` },
	{ name: 'import type expression', code: (source: string) => `type X = import('${source}').X;` },
	{ name: 'import equals', code: (source: string) => `import X = require('${source}');` },
];

const restrictedSources = [
	'../../sessions/common/sessionCommands.js',
	'./../..//sessions/common/sessionCommands.js',
	'../../chat/../sessions/common/sessionCommands.js',
	'vs/workbench/contrib/sessions/common/sessionCommands.js',
	`${repositoryRoot}/src/vs/workbench/contrib/sessions/common/sessionCommands.js`,
];

const allowedSources = [
	'../../../../sessions/common/sessions.js', // src/vs/sessions
	'../sessions/sessionsModel.js', // a chat-internal 'sessions' folder
	'../../sessionChanges/common/sessionChanges.js',
	'vs/sessions/common/sessions.js',
	`${repositoryRoot}/src/vs/sessions/common/sessions.js`,
	'../common/chatService.js',
	'sessions',
];

new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } }).run('code-no-restricted-path-imports', rule, {
	valid: [
		...allowedSources.flatMap(source => importForms.map(form => ({
			name: `${form.name} of ${source}`,
			filename,
			options,
			code: form.code(source),
		}))),
		{
			name: 'locally declared require',
			filename,
			options,
			code: `const require = (source: string) => source; require('${restrictedSources[0]}');`,
		},
		{
			name: 'require parameter',
			filename,
			options,
			code: `function load(require: (source: string) => unknown) { return require('${restrictedSources[0]}'); }`,
		},
		{
			name: 'computed dynamic import is not resolved statically',
			filename,
			options,
			code: 'const name = \'sessionCommands\'; const x = import(`../../sessions/common/${name}.js`);',
		},
	],
	invalid: restrictedSources.flatMap(source => importForms.map(form => ({
		name: `${form.name} of ${source}`,
		filename,
		options,
		code: form.code(source),
		errors: [{ messageId: 'restricted', data: { message } }],
	}))),
});

suite('code-no-restricted-path-imports resolveImport', () => {
	const target = 'src/vs/workbench/contrib/sessions/common/x.js';
	const resolveAll = (root: string, filename: string, specifiers: string[]) => specifiers.map(specifier => resolveImport(root, filename, specifier));

	test('Windows drive roots compare drive letters case-insensitively', () => {
		assert.deepStrictEqual(resolveAll('C:\\vscode', 'C:\\vscode\\src\\vs\\workbench\\contrib\\chat\\browser\\a.ts', [
			`c:/vscode/${target}`,
			`C:/vscode/${target}`,
			`c:\\vscode\\src\\vs\\workbench\\contrib\\sessions\\common\\x.js`,
			'../../sessions/common/x.js',
			'vs/workbench/contrib/sessions/common/x.js',
			'D:/vscode/src/vs/workbench/contrib/sessions/common/x.js',
			'sessions',
		]), [target, target, target, target, target, 'D:/vscode/src/vs/workbench/contrib/sessions/common/x.js', undefined]);
	});

	test('UNC roots compare host and share case-insensitively', () => {
		assert.deepStrictEqual(resolveAll('//server/share/vscode', '//server/share/vscode/src/vs/workbench/contrib/chat/browser/a.ts', [
			`//SERVER/SHARE/vscode/${target}`,
			`\\\\Server\\Share\\vscode\\src\\vs\\workbench\\contrib\\sessions\\common\\x.js`,
			'../../sessions/common/x.js',
		]), [target, target, target]);
	});

	test('POSIX roots stay case-sensitive', () => {
		assert.deepStrictEqual(resolveAll('/repo', '/repo/src/vs/workbench/contrib/chat/browser/a.ts', [
			`/repo/${target}`,
			`/REPO/${target}`,
			'../../sessions/common/x.js',
		]), [target, `../REPO/${target}`, target]);
	});
});
