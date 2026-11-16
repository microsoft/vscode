/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { checkPackageManager, getPnpmCommand } from '../pnpm.ts';

suite('getPnpmCommand', () => {

	const files: Record<string, string> = {
		// npm and pnpm install pnpm's bin as a symlink to bin/pnpm.mjs
		'/usr/local/bin/pnpm': '/usr/local/lib/node_modules/pnpm/bin/pnpm.mjs',
		// pnpm 12's npm package replaces its bins with the native executable on install
		'/opt/pnpm12/bin/pnpm': '/opt/pnpm12/lib/node_modules/pnpm/pnpm',
		// Corepack runs pnpm 12's native executable, which it downloads as pnpm-native
		'/home/u/.cache/node/corepack/v1/pnpm/12.16.0/pnpm-native': '/home/u/.cache/node/corepack/v1/pnpm/12.16.0/pnpm-native',
		'C:\\Users\\u\\AppData\\Local\\node\\corepack\\v1\\pnpm\\12.16.0\\pnpm-native.exe': 'C:\\Users\\u\\AppData\\Local\\node\\corepack\\v1\\pnpm\\12.16.0\\pnpm-native.exe',
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
			select('/opt/pnpm12/bin/pnpm', 'linux'),
			select('/home/u/.cache/node/corepack/v1/pnpm/12.16.0/pnpm-native', 'darwin'),
			select('C:\\Users\\u\\AppData\\Local\\node\\corepack\\v1\\pnpm\\12.16.0\\pnpm-native.exe', 'win32'),
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
			{ command: '/opt/pnpm12/lib/node_modules/pnpm/pnpm', args: [], shell: false },
			{ command: '/home/u/.cache/node/corepack/v1/pnpm/12.16.0/pnpm-native', args: [], shell: false },
			{ command: 'C:\\Users\\u\\AppData\\Local\\node\\corepack\\v1\\pnpm\\12.16.0\\pnpm-native.exe', args: [], shell: false },
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

suite('checkPackageManager', () => {

	const agent = (version: string) => `pnpm/${version} npm/? node/v24.15.0 darwin arm64`;

	test('accepts the pinned pnpm and newer releases of its major version, and explains why another pnpm did not switch', () => {
		assert.deepStrictEqual([
			checkPackageManager(undefined, '12.17.0'),
			checkPackageManager(agent('12.17.0'), '12.17.0'),
			checkPackageManager(agent('12.18.0'), '12.17.0', 'ignore'),
			checkPackageManager('npm/11.6.0 node/v24.15.0 darwin arm64 workspaces/false', '12.17.0'),
			checkPackageManager(agent('12.16.0'), '12.17.0', 'warn'),
			checkPackageManager(agent('9.15.9'), '12.17.0', 'download'),
			checkPackageManager(agent('13.0.0'), '12.17.0'),
		], [
			undefined,
			undefined,
			undefined,
			'This repository uses pnpm. Run `pnpm install`.',
			'This repository uses pnpm 12.17.0 (`packageManager` in package.json), but pnpm 12.16.0 didn\'t switch to it: pnpm_config_pm_on_fail is set to warn.\n' +
			'Unset pnpm_config_pm_on_fail, or install pnpm 12.17.0 with `pnpm self-update 12.17.0` (`npm install -g pnpm@12.17.0` if you installed pnpm with npm).',
			'This repository uses pnpm 12.17.0 (`packageManager` in package.json), but pnpm 9.15.9 didn\'t switch to it: switching is turned off with `--pm-on-fail`, or this pnpm is too old to switch.\n' +
			'Run pnpm without `--pm-on-fail`, or install pnpm 12.17.0 with `pnpm self-update 12.17.0` (`npm install -g pnpm@12.17.0` if you installed pnpm with npm).',
			'This repository uses pnpm 12.17.0 (`packageManager` in package.json), but pnpm 13.0.0 didn\'t switch to it: switching is turned off with `--pm-on-fail`, or this pnpm is too old to switch.\n' +
			'Run pnpm without `--pm-on-fail`, or install pnpm 12.17.0 with `pnpm self-update 12.17.0` (`npm install -g pnpm@12.17.0` if you installed pnpm with npm).',
		]);
	});
});
