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
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createShellInitScript, isShellInitScriptList } from '../../common/shellInitScript.js';

const execFileAsync = promisify(execFile);

suite('shellInitScript', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('combines bash profile loading before Python activation and ends successfully', () => {
		const { script } = createShellInitScript('bash', ' source /repo/.venv/bin/activate');
		assert.deepStrictEqual({
			profileBeforeActivation: script.indexOf(`source "$HOME/.bashrc"`) < script.indexOf('source /repo/.venv/bin/activate'),
			doesNotInferFailureFromRcStatus: script.includes(`source "$HOME/.bashrc" || builtin true`),
			doesNotPrintAProfileFailure: !script.includes('loading ~/.bashrc failed'),
			endsSuccessfully: script.trimEnd().endsWith('builtin true'),
		}, {
			profileBeforeActivation: true,
			doesNotInferFailureFromRcStatus: true,
			doesNotPrintAProfileFailure: true,
			endsSuccessfully: true,
		});
	});

	test('combines PowerShell profile loading before Python activation', () => {
		const { script } = createShellInitScript('powershell', `& 'C:\\repo\\.venv\\Scripts\\Activate.ps1'`);
		assert.ok(script.indexOf('$PROFILE.CurrentUserAllHosts') < script.indexOf('FromBase64String'));
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

	test('PowerShell activation uses total UTF-8 base64 encoding', () => {
		const activation = `$value = @'\ncontains the old terminator\n'@\n$env:VSCODE_TEST_ACTIVATION = $value`;
		const { script } = createShellInitScript('powershell', activation);
		const match = /FromBase64String\('(?<encoded>[A-Za-z0-9+/=]+)'\)/.exec(script);
		assert.ok(match?.groups?.encoded);
		assert.deepStrictEqual({
			decoded: decodeBase64(match.groups.encoded).toString(),
			rawPayloadEmbedded: script.includes(activation),
		}, {
			decoded: activation,
			rawPayloadEmbedded: false,
		});
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

		test('does not report a profile failure when the rc ends nonzero', async () => {
			assert.deepStrictEqual(
				await run('export VSCODE_TEST_RC_MARKER=loaded\n[ -f /definitely/not/here ] && export NEVER=1\n', 'builtin echo "activation sees rc=$VSCODE_TEST_RC_MARKER"', 'builtin true'),
				['activation sees rc=loaded'],
			);
		});

		test('continues to activation when a non-interactive rc guard returns early', async () => {
			const guardedRc = [
				'case $- in',
				'\t*i*) ;;',
				'\t*) return;;',
				'esac',
				'export VSCODE_TEST_RC_MARKER=loaded',
				'',
			].join('\n');
			assert.deepStrictEqual(
				await run(guardedRc, 'builtin echo "activation sees rc=${VSCODE_TEST_RC_MARKER:-skipped}"', 'builtin true'),
				['activation sees rc=skipped'],
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

		(process.platform === 'win32' ? suite : suite.skip)('PowerShell behavior', () => {
			test('decodes and executes the activation payload', async () => {
				const { script } = createShellInitScript('powershell', `$env:VSCODE_TEST_ACTIVATION = 'loaded'`);
				const command = [
					`$PROFILE = [pscustomobject]@{ CurrentUserAllHosts = ''; CurrentUserCurrentHost = '' }`,
					script,
					`Write-Output "activation=$env:VSCODE_TEST_ACTIVATION"`,
				].join('\n');
				const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);
				assert.strictEqual(stdout.trim(), 'activation=loaded');
			});
		});
	});
});
