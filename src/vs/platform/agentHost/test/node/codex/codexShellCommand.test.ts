/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractCodexShellPatch, unwrapShellInvocation } from '../../../node/codex/codexShellCommand.js';

suite('unwrapShellInvocation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('unwraps Bash and PowerShell command wrappers', () => {
		assert.deepStrictEqual([
			unwrapShellInvocation('/bin/bash -lc \'printf test\''),
			unwrapShellInvocation('/bin/zsh -c "printf \\"$HOME\\""'),
			unwrapShellInvocation('pwsh -NoProfile -Command "Write-Output \'test\'"'),
			unwrapShellInvocation('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Write-Output \'test\'"'),
			unwrapShellInvocation('cmd.exe /d /s /c echo test'),
		], [
			'printf test',
			'printf "$HOME"',
			'Write-Output \'test\'',
			'Write-Output \'test\'',
			'cmd.exe /d /s /c echo test',
		]);
	});

	test('extracts standalone intercepted shell patches and optional directory changes', () => {
		const patch = '*** Begin Patch\n*** Add File: note.txt\n+hello\n*** End Patch';
		assert.deepStrictEqual([
			extractCodexShellPatch(`apply_patch <<'PATCH'\n${patch}\nPATCH`),
			extractCodexShellPatch(`cd '/repo with spaces' && apply_patch <<"END"\n${patch}\nEND\n`),
			extractCodexShellPatch(`applypatch '${patch}'`),
			extractCodexShellPatch(`apply_patch <<-EOF\n${patch.split('\n').map(line => `\t${line}`).join('\n')}\n\tEOF`),
		], [
			{ patch, directory: undefined },
			{ patch, directory: '/repo with spaces' },
			{ patch, directory: undefined },
			{ patch, directory: undefined },
		]);
	});

	test('does not mistake ordinary shell commands or compound scripts for intercepted patches', () => {
		const patch = '*** Begin Patch\n*** Add File: note.txt\n+hello\n*** End Patch';
		assert.deepStrictEqual([
			extractCodexShellPatch('cat note.txt'),
			extractCodexShellPatch(`echo "${patch}"`),
			extractCodexShellPatch(`apply_patch <<'PATCH'\n${patch}\nWRONG`),
			extractCodexShellPatch(`apply_patch <<'PATCH'\n${patch}\nPATCH\nrm note.txt`),
		], [undefined, undefined, undefined, undefined]);
	});
});
