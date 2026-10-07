/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';

test('Agent Host E2E startup reuses, repairs, forces and explicitly skips Electron preparation', async () => {
	const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-e2e-startup-'));
	const sourceRoot = path.resolve(import.meta.dirname, '../..');
	try {
		for (const directory of ['scripts', 'build/lib', 'node_modules', '.build/electron']) {
			await fs.mkdir(path.join(repoRoot, directory), { recursive: true });
		}
		for (const file of ['scripts/test-agent-host-e2e.ts', 'scripts/test-agent-host-e2e-child.ps1', 'build/lib/electronVersion.ts']) {
			await fs.copyFile(path.join(sourceRoot, file), path.join(repoRoot, file));
		}
		await fs.writeFile(path.join(repoRoot, 'scripts/package.json'), '{"type":"commonjs"}');
		await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
			type: 'module', scripts: { electron: 'node setup-electron.ts' },
		}));
		await fs.writeFile(path.join(repoRoot, '.npmrc'), 'target="42.9.3"\nms_build_id="test"\n');
		await fs.writeFile(path.join(repoRoot, 'product.json'), JSON.stringify({
			nameLong: 'Code - OSS', nameShort: 'Code - OSS', applicationName: 'code-oss',
		}));
		const executable = process.platform === 'darwin'
			? '.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS'
			: process.platform === 'win32' ? '.build/electron/Code - OSS.exe' : '.build/electron/code-oss';
		await fs.mkdir(path.dirname(path.join(repoRoot, executable)), { recursive: true });
		await fs.writeFile(path.join(repoRoot, executable), 'runtime', { mode: 0o755 });
		await fs.writeFile(path.join(repoRoot, '.build/electron/version'), '42.9.3');
		await fs.writeFile(path.join(repoRoot, 'setup-electron.ts'), `
			import { appendFileSync, writeFileSync } from 'node:fs';
			appendFileSync('.build/preparations', 'prepared\\n');
			writeFileSync(${JSON.stringify(executable)}, 'runtime', { mode: 0o755 });
			writeFileSync('.build/electron/version', '42.9.3');
		`);
		const testScript = process.platform === 'win32' ? 'scripts/test-integration.bat' : 'scripts/test-integration.sh';
		await fs.writeFile(path.join(repoRoot, testScript), process.platform === 'win32'
			? '@echo off\r\necho 1 passing\r\nexit /b 0\r\n'
			: '#!/usr/bin/env bash\necho "1 passing"\n', { mode: 0o755 });
		const environment: NodeJS.ProcessEnv = {
			...process.env,
			AGENT_HOST_REPLAY_RECORD: '',
			AGENT_HOST_UPDATE_AHP_SNAPSHOTS: '',
			AGENT_HOST_UPDATE_SNAPSHOTS: '',
			AGENT_HOST_PROTOCOL_SURFACE_OUT: '',
			VSCODE_SKIP_PRELAUNCH: '',
			VSCODE_FORCE_PRELAUNCH: '',
			ELECTRON_RUN_AS_NODE: '',
		};
		const run = (extra: NodeJS.ProcessEnv = {}) => execFileSync(process.execPath, ['scripts/test-agent-host-e2e.ts', '--jobs', '1'], {
			cwd: repoRoot, env: { ...environment, ...extra }, encoding: 'utf8',
		});
		const firstRun = run();
		let firstPreparationMissing = false;
		try {
			await fs.stat(path.join(repoRoot, '.build/preparations'));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
			firstPreparationMissing = true;
		}
		await fs.rm(path.join(repoRoot, executable));
		run();
		run({ VSCODE_FORCE_PRELAUNCH: '1' });
		run({ VSCODE_SKIP_PRELAUNCH: '1', VSCODE_FORCE_PRELAUNCH: '1' });
		assert.deepStrictEqual({
			reused: firstPreparationMissing,
			suitesPassed: (firstRun.match(/PASS /g) ?? []).length,
			preparations: await fs.readFile(path.join(repoRoot, '.build/preparations'), 'utf8'),
		}, { reused: true, suitesPassed: 6, preparations: 'prepared\nprepared\n' });
	} finally {
		await fs.rm(repoRoot, { recursive: true, force: true });
	}
});
