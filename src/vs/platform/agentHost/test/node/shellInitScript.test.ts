/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createShellInitScript, isShellInitScriptList } from '../../common/shellInitScript.js';

const execFileAsync = promisify(execFile);

suite('shellInitScript', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('combines bash profile loading before Python activation and ends successfully', () => {
		const { script } = createShellInitScript('bash', ' source /repo/.venv/bin/activate');
		assert.deepStrictEqual({
			profileBeforeActivation: script.indexOf(`source "$HOME/.bashrc"`) < script.indexOf('source /repo/.venv/bin/activate'),
			endsSuccessfully: script.trimEnd().endsWith('builtin true'),
		}, {
			profileBeforeActivation: true,
			endsSuccessfully: true,
		});
	});

	test('combines PowerShell profile loading before Python activation', () => {
		const { script } = createShellInitScript('powershell', `& 'C:\\repo\\.venv\\Scripts\\Activate.ps1'`);
		assert.ok(script.indexOf('$PROFILE.CurrentUserAllHosts') < script.indexOf('Activate.ps1'));
		assert.ok(script.trimEnd().endsWith('$global:LASTEXITCODE = 0'));
	});

	test('PowerShell profiles load under Continue with per-profile isolation', () => {
		const { script } = createShellInitScript('powershell', `& 'C:\\repo\\.venv\\Scripts\\Activate.ps1'`);
		assert.deepStrictEqual({
			// The runtime sources init scripts under 'Stop'; profiles must get
			// their normal preference back or a benign error skips the rest.
			continueBeforeProfiles: script.includes(`$ErrorActionPreference = 'Continue'`)
				&& script.indexOf(`$ErrorActionPreference = 'Continue'`) < script.indexOf('$PROFILE.CurrentUserAllHosts'),
			tryInsideForeach: script.includes('try {') && script.indexOf('foreach ($__vscodeProfile') < script.indexOf('try {'),
			stopOnlyForActivation: script.indexOf(`'Stop'`) > script.lastIndexOf('$__vscodeProfile'),
		}, {
			continueBeforeProfiles: true,
			tryInsideForeach: true,
			stopOnlyForActivation: true,
		});
	});

	test('rejects a PowerShell payload that terminates the here-string', () => {
		assert.throws(() => createShellInitScript('powershell', `conda activate x\n'@\nWrite-Output pwned`), /here-string/);
	});

	test('accepts only an empty list or one valid script', () => {
		assert.deepStrictEqual([
			isShellInitScriptList([]),
			isShellInitScriptList([{ shell: 'bash', script: 'x' }]),
			isShellInitScriptList([{ shell: 'bash', script: 'x' }, { shell: 'bash', script: 'y' }]),
			isShellInitScriptList([{ shell: 'zsh', script: 'x' }]),
			isShellInitScriptList([{ shell: 'bash', script: '' }]),
		], [true, true, false, false, false]);
	});

	(process.platform === 'win32' ? suite.skip : suite)('bash behavior', () => {
		let home: string;

		setup(async () => {
			home = await mkdtemp(join(tmpdir(), 'vscode-shell-init-'));
		});

		teardown(async () => {
			await rm(home, { recursive: true, force: true });
		});

		async function run(rc: string, activation: string | undefined, command: string): Promise<string[]> {
			await writeFile(join(home, '.bashrc'), rc, 'utf8');
			const { script } = createShellInitScript('bash', activation);
			const { stdout } = await execFileAsync('bash', ['--norc', '--noprofile', '-c', `${script}\n${command}`], {
				env: { ...process.env, HOME: home },
			});
			return stdout.trim().split('\n');
		}

		test('sources the rc before the activation command runs', async () => {
			assert.deepStrictEqual(
				await run('export VSCODE_TEST_RC_MARKER=loaded\n', 'builtin echo "activation sees rc=$VSCODE_TEST_RC_MARKER"', 'builtin true'),
				['activation sees rc=loaded'],
			);
		});

		test('reports a failed activation, runs the command, and leaves status zero', async () => {
			assert.deepStrictEqual(
				await run('', 'source /definitely/not/here/activate', 'builtin echo "command-ran status=$?"'),
				[
					'copilot shell init: Python activation failed; continuing without the selected environment.',
					'command-ran status=0',
				],
			);
		});
	});
});
