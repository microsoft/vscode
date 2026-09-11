/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const shellIntegrationScriptRoot = FileAccess.asFileUri('vs/workbench/contrib/terminal/common/scripts').fsPath;

suite('Shell integration scripts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should append the nonce as a separate escaped CWD report argument', () => {
		const cwdReportLines = [
			['bash', 'shellIntegration-bash.sh', 'Cwd=%s'],
			['zsh', 'shellIntegration-rc.zsh', 'Cwd=%s'],
			['fish', 'shellIntegration.fish', '__vsc_esc P Cwd='],
			['PowerShell', 'shellIntegration.ps1', ']633;P;Cwd='],
		].map(([shell, script, marker]) => {
			const source = readFileSync(join(shellIntegrationScriptRoot, script), 'utf8');
			const line = source.split(/\r?\n/).find(line => line.includes(marker));
			return [shell, line?.trim()];
		});
		deepStrictEqual(cwdReportLines, [
			['bash', 'builtin printf \'\\e]633;P;Cwd=%s;%s\\a\' "$(__vsc_escape_value "$__vsc_cwd")" "$__vsc_nonce"'],
			['zsh', 'builtin printf \'\\e]633;P;Cwd=%s;%s\\a\' "$(__vsc_escape_value "${PWD}")" "$__vsc_nonce"'],
			['fish', '__vsc_esc P Cwd=(__vsc_escape_value "$PWD") $__vsc_nonce'],
			['PowerShell', '$Result += if ($pwd.Provider.Name -eq \'FileSystem\') { "$([char]0x1b)]633;P;Cwd=$(__VSCode-Escape-Value $pwd.ProviderPath);$($Global:__VSCodeState.Nonce)`a" }'],
		]);
	});
});
