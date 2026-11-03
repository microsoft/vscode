/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { shouldDownloadElectron } from './electronVersion.ts';

suite('Electron runtime reuse', () => {
	for (const platform of ['darwin', 'linux', 'win32'] as const) {
		test(`checks the version and executable on ${platform}`, async () => {
			const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-electron-reuse-'));
			try {
				await fs.writeFile(path.join(repoRoot, '.npmrc'), 'target="42.9.3"\nms_build_id="test"\n');
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
			await fs.writeFile(path.join(repoRoot, '.npmrc'), 'target="42.9.3"\nms_build_id="test"\n');
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
