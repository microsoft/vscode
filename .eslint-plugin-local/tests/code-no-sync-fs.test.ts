/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESLint, RuleTester } from 'eslint';
import * as fs from 'fs';
import { suite, test } from 'node:test';
import { resolve } from 'path';
import tseslint from 'typescript-eslint';
import rule from '../code-no-sync-fs.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const modules = ['fs', 'node:fs', 'original-fs', '../../base/node/pfs.js', 'vs/base/node/pfs'];
const productionFile = resolve(import.meta.dirname, '../../src/vs/workbench/node/example.ts');
const errors = (name: string) => [{ messageId: 'syncFs', data: { name } }];

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-no-sync-fs', rule, {
	valid: [
		`import { readFile } from 'fs/promises'; await readFile('file');`,
		`import fs from 'fs'; await fs.promises.stat('file');`,
		`import fs from 'fs'; fs.readFile('file', () => {});`,
		`import { statSync } from './other.js'; statSync('file');`,
		`import fs from 'fs'; function f(fs: { statSync(): void }) { fs.statSync(); }`,
		`import { statSync } from 'fs'; function f(statSync: () => void) { statSync(); }`,
		`import type { statSync } from 'fs'; type Stat = typeof statSync;`,
		`const fs = { readFileSync() {} }; fs.readFileSync();`,
		`const require = () => ({ statSync() {} }); require('fs').statSync();`,
		`import * as pfs from './pfs.js'; await pfs.Promises.writeFile('file', 'data');`,
		`let a = b; let b = a; a();`,
		`import * as pfs from './other/pfs.js'; pfs.computeSync();`,
		`import { readFileSync } from 'unrelated/pfs'; readFileSync();`,
	],
	invalid: [
		...Object.entries(fs).filter(([name, value]) => name.endsWith('Sync') && typeof value === 'function').map(([name]) => ({
			code: `import * as fs from 'fs'; fs.${name}('file');`,
			errors: errors(name),
		})),
		...modules.flatMap(source => [
			{ filename: productionFile, code: `import { statSync as stat } from '${source}'; stat('file');`, errors: errors('statSync') },
			{ filename: productionFile, code: `import * as filesystem from '${source}'; filesystem.readFileSync('file');`, errors: errors('readFileSync') },
			{ filename: productionFile, code: `import filesystem from '${source}'; filesystem['existsSync']('file');`, errors: errors('existsSync') },
			{ filename: productionFile, code: `const { writeFileSync: write } = require('${source}'); write('file', 'data');`, errors: errors('writeFileSync') },
			{ filename: productionFile, code: `const filesystem = await import('${source}'); filesystem.rmSync('file');`, errors: errors('rmSync') },
		]),
		{ code: `import fs from 'fs'; const read = fs.readFileSync; const alias = read; alias('file');`, errors: errors('readFileSync') },
		{ code: `import fs from 'fs'; const { readFileSync: read } = fs; read('file');`, errors: errors('readFileSync') },
		{ code: `import fs from 'fs'; fs.realpathSync.native('file');`, errors: errors('realpathSync') },
		{ code: `import fs from 'fs'; fs.readFileSync?.('file');`, errors: errors('readFileSync') },
		{ code: `import fs from 'fs'; fs.readFileSync.call(fs, 'file');`, errors: errors('readFileSync') },
		{ code: `import fs = require('fs'); fs.readdirSync('directory');`, errors: errors('readdirSync') },
		{ code: `require('node:fs').unlinkSync('file');`, errors: errors('unlinkSync') },
		{ code: `(await import('fs')).default.statSync('file');`, errors: errors('statSync') },
		{ code: `import { createRequire } from 'module'; const load = createRequire(import.meta.url); const fs = load('fs'); fs.statSync('file');`, errors: errors('statSync') },
		{ code: `import * as module from 'node:module'; const load = module.createRequire(import.meta.url); load('fs').accessSync('file');`, errors: errors('accessSync') },
		{ code: `const module = (await import(\`\${'module'}\`)).default; const load = module.createRequire(import.meta.url); const fs = load('fs'); fs.readFileSync('file');`, errors: errors('readFileSync') },
		{ code: `let fs; fs = require('fs'); fs.statSync('file');`, errors: errors('statSync') },
		{ code: `import fs from 'fs'; let read; read = fs.readFileSync; read('file');`, errors: errors('readFileSync') },
	],
});

suite('code-no-sync-fs production configuration', () => {
	const eslint = new ESLint({ overrideConfig: [{ rules: { 'copilot-local/no-funny-filename': 'off' } }] });
	const root = resolve(import.meta.dirname, '../..');

	test('enforces core and built-in extension production code', async () => {
		const files = ['src/vs/platform/agentHost/node/example.ts', 'src/mainImpl.ts', 'extensions/git/src/example.ts', 'extensions/copilot/src/platform/example.ts'];
		assert.deepStrictEqual(await Promise.all(files.map(async file => {
			const results = await eslint.lintText(`import { statSync } from 'fs'; statSync('file');`, { filePath: resolve(root, file) });
			return results.flatMap(result => result.messages.filter(message => message.ruleId === 'local/code-no-sync-fs').map(message => message.severity));
		})), files.map(() => [2]));
	});

	test('allows tests and development scripts', async () => {
		const files = ['src/vs/base/test/node/example.test.ts', 'extensions/git/src/test/example.ts', 'extensions/copilot/src/platform/example.spec.ts', 'extensions/copilot/src/platform/example.spec.tsx', 'extensions/copilot/script/example.ts', 'scripts/example.ts', 'build/example.ts', 'src/vs/code/node/cli.ts', 'src/vs/server/node/server.cli.ts'];
		assert.deepStrictEqual(await Promise.all(files.map(async file => {
			const results = await eslint.lintText(`import { statSync } from 'fs'; statSync('file');`, { filePath: resolve(root, file) });
			return results.flatMap(result => result.messages.filter(message => message.ruleId === 'local/code-no-sync-fs'));
		})), files.map(() => []));
	});

	test('allows a documented call-site exception without exempting later calls', async () => {
		const results = await eslint.lintText(`import { statSync } from 'fs';\n// eslint-disable-next-line local/code-no-sync-fs -- Synchronous startup initialization.\nstatSync('startup');\nstatSync('runtime');`, { filePath: resolve(root, 'src/vs/base/node/example.ts') });
		assert.deepStrictEqual(results.flatMap(result => result.messages.filter(message => message.ruleId === 'local/code-no-sync-fs').map(message => message.line)), [4]);
	});
});
