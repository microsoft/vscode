/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { getElectronVersion, shouldDownloadElectron } from './electronVersion.ts';
import { getServerNodeVersion } from './node.ts';

async function writeNativeBuild(repoRoot: string): Promise<void> {
	await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
		nativeBuild: { runtime: 'electron', target: '42.9.3', disturl: 'https://electronjs.org/headers', msBuildId: 'test' },
	}));
}

suite('Electron runtime reuse', () => {
	for (const platform of ['darwin', 'linux', 'win32'] as const) {
		test(`checks the version and executable on ${platform}`, async () => {
			const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-electron-reuse-'));
			try {
				await writeNativeBuild(repoRoot);
				await fs.writeFile(path.join(repoRoot, 'product.json'), JSON.stringify({
					nameLong: 'Code - OSS',
					nameShort: 'Code - OSS',
					applicationName: 'code-oss',
				}));
				const electronDir = path.join(repoRoot, '.build', 'electron');
				const executable = platform === 'darwin'
					? path.join(electronDir, 'Code - OSS.app', 'Contents', 'MacOS', 'Code - OSS')
					: path.join(electronDir, platform === 'win32' ? 'Code - OSS.exe' : 'code-oss');
				const results = [shouldDownloadElectron(repoRoot, {}, platform)];
				await fs.mkdir(path.dirname(executable), { recursive: true });
				await fs.writeFile(path.join(electronDir, 'version'), 'v42.9.3\n');
				results.push(shouldDownloadElectron(repoRoot, {}, platform));
				await fs.writeFile(executable, 'runtime');
				await fs.chmod(executable, 0o755);
				results.push(shouldDownloadElectron(repoRoot, {}, platform));
				results.push(shouldDownloadElectron(repoRoot, { VSCODE_FORCE_PRELAUNCH: '1' }, platform));
				results.push(shouldDownloadElectron(repoRoot, { VSCODE_SKIP_PRELAUNCH: '1', VSCODE_FORCE_PRELAUNCH: '1' }, platform));
				await fs.writeFile(path.join(electronDir, 'version'), '42.9.2');
				results.push(shouldDownloadElectron(repoRoot, {}, platform));
				await fs.writeFile(path.join(electronDir, 'version'), '42.9.3');
				await fs.rm(executable);
				await fs.mkdir(executable);
				results.push(shouldDownloadElectron(repoRoot, {}, platform));
				await fs.rm(path.join(electronDir, 'version'));
				await fs.mkdir(path.join(electronDir, 'version'));
				results.push(shouldDownloadElectron(repoRoot, {}, platform));

				assert.deepStrictEqual(results, [true, true, false, true, false, true, true, true]);
			} finally {
				await fs.rm(repoRoot, { recursive: true, force: true });
			}
		});
	}

	test('refreshes a non-executable POSIX runtime', { skip: process.platform === 'win32' }, async () => {
		const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-electron-reuse-'));
		try {
			await writeNativeBuild(repoRoot);
			await fs.writeFile(path.join(repoRoot, 'product.json'), JSON.stringify({ applicationName: 'code-oss' }));
			const electronDir = path.join(repoRoot, '.build', 'electron');
			await fs.mkdir(electronDir, { recursive: true });
			await fs.writeFile(path.join(electronDir, 'version'), '42.9.3');
			await fs.writeFile(path.join(electronDir, 'code-oss'), 'runtime', { mode: 0o644 });
			assert.strictEqual(shouldDownloadElectron(repoRoot, {}, 'linux'), true);
		} finally {
			await fs.rm(repoRoot, { recursive: true, force: true });
		}
	});

	test('honors explicit skip without requiring installation metadata', () => {
		assert.strictEqual(shouldDownloadElectron('/unused', { VSCODE_SKIP_PRELAUNCH: '1' }), false);
	});

	test('does not silently reuse a runtime when repository configuration cannot be read', () => {
		assert.throws(() => shouldDownloadElectron('/unused', {}), { code: 'ENOENT' });
	});
});

suite('Runtime versions', () => {
	test('reads the Electron and server Node.js versions from the nativeBuild field', async () => {
		const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-runtime-versions-'));
		try {
			await writeNativeBuild(repoRoot);
			await fs.mkdir(path.join(repoRoot, 'remote'));
			await fs.writeFile(path.join(repoRoot, 'remote', 'package.json'), JSON.stringify({
				nativeBuild: { runtime: 'node', target: '24.22.1', disturl: 'https://nodejs.org/dist', msBuildId: '488038' },
			}));
			assert.deepStrictEqual([getElectronVersion(repoRoot), getServerNodeVersion(repoRoot)], [
				{ electronVersion: '42.9.3', msBuildId: 'test' },
				{ nodeVersion: '24.22.1', internalNodeVersion: '488038' },
			]);
		} finally {
			await fs.rm(repoRoot, { recursive: true, force: true });
		}
	});

	test('rejects a missing or invalid nativeBuild field', async () => {
		const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-runtime-versions-'));
		try {
			const messages: string[] = [];
			for (const nativeBuild of [undefined, { runtime: 'node', target: '24.22.1', disturl: 'https://nodejs.org/dist', msBuildId: '1' }, { runtime: 'electron', target: 43, disturl: 'x' }, { runtime: 'electron', disturl: 'x', ms_build_id: '1' }]) {
				await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({ nativeBuild }));
				assert.throws(() => getElectronVersion(repoRoot), (error: Error) => { messages.push(error.message.replace(repoRoot, '<root>')); return true; });
			}
			assert.deepStrictEqual(messages, [
				`The nativeBuild field of ${path.join('<root>', 'package.json')} must have the runtime "electron", a target and an msBuildId.`,
				`The nativeBuild field of ${path.join('<root>', 'package.json')} must have the runtime "electron", a target and an msBuildId.`,
				`Invalid nativeBuild field in ${path.join('<root>', 'package.json')}: "target" must be a string. See NativeBuildConfig in build/npm/pnpm/nativeBuildEnv.ts.`,
				`Invalid nativeBuild field in ${path.join('<root>', 'package.json')}: unknown property "ms_build_id". See NativeBuildConfig in build/npm/pnpm/nativeBuildEnv.ts.`,
			]);
		} finally {
			await fs.rm(repoRoot, { recursive: true, force: true });
		}
	});
});
