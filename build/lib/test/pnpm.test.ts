/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { getPnpmCommand } from '../pnpm.ts';

suite('getPnpmCommand', () => {

	const files: Record<string, string> = {
		// npm and pnpm install pnpm's bin as a symlink to bin/pnpm.mjs
		'/usr/local/bin/pnpm': '/usr/local/lib/node_modules/pnpm/bin/pnpm.mjs',
		'/home/u/.cache/node/corepack/v1/pnpm/11.28.8/bin/pnpm.cjs': '/home/u/.cache/node/corepack/v1/pnpm/11.28.8/bin/pnpm.cjs',
		'/home/u/.local/share/pnpm/pnpm': '/home/u/.local/share/pnpm/pnpm',
		'/usr/lib/node_modules/npm/bin/npm-cli.js': '/usr/lib/node_modules/npm/bin/npm-cli.js',
		'C:\\Program Files\\pnpm\\pnpm.exe': 'C:\\Program Files\\pnpm\\pnpm.exe',
		'C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs': 'C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs',
	};
	const realpath = (file: string) => {
		const target = files[file];
		if (!target) {
			throw new Error(`ENOENT: ${file}`);
		}
		return target;
	};
	const select = (npmExecpath: string | undefined, platform: NodeJS.Platform) => getPnpmCommand(npmExecpath === undefined ? {} : { npm_execpath: npmExecpath }, platform, platform === 'win32' ? 'C:\\node\\node.exe' : '/usr/bin/node', realpath);

	test('runs the pnpm of the current script, otherwise pnpm from PATH', () => {
		assert.deepStrictEqual([
			select('/usr/local/bin/pnpm', 'linux'),
			select('/home/u/.cache/node/corepack/v1/pnpm/11.28.8/bin/pnpm.cjs', 'darwin'),
			select('/home/u/.local/share/pnpm/pnpm', 'linux'),
			select('C:\\Program Files\\pnpm\\pnpm.exe', 'win32'),
			select('C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs', 'win32'),
			select('/usr/lib/node_modules/npm/bin/npm-cli.js', 'linux'),
			select('/missing/pnpm.cjs', 'linux'),
			select(undefined, 'darwin'),
			select(undefined, 'win32'),
		], [
			{ command: '/usr/bin/node', args: ['/usr/local/lib/node_modules/pnpm/bin/pnpm.mjs'], shell: false },
			{ command: '/usr/bin/node', args: ['/home/u/.cache/node/corepack/v1/pnpm/11.28.8/bin/pnpm.cjs'], shell: false },
			{ command: '/home/u/.local/share/pnpm/pnpm', args: [], shell: false },
			{ command: 'C:\\Program Files\\pnpm\\pnpm.exe', args: [], shell: false },
			{ command: 'C:\\node\\node.exe', args: ['C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs'], shell: false },
			{ command: 'pnpm', args: [], shell: false },
			{ command: 'pnpm', args: [], shell: false },
			{ command: 'pnpm', args: [], shell: false },
			{ command: 'pnpm.cmd', args: [], shell: true },
		]);
	});
});
