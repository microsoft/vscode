/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { unwrapShellInvocation } from '../../../node/codex/codexShellCommand.js';

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
});
