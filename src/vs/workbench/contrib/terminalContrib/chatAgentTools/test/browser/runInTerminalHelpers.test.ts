/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { isPowerShell } from '../../browser/runInTerminalHelpers.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('isPowerShell', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('PowerShell executables', () => {
		test('should detect powershell.exe', () => {
			ok(isPowerShell('powershell.exe', OperatingSystem.Windows));
			ok(isPowerShell('powershell', OperatingSystem.Linux));
		});

		test('should detect pwsh.exe', () => {
			ok(isPowerShell('pwsh.exe', OperatingSystem.Windows));
			ok(isPowerShell('pwsh', OperatingSystem.Linux));
		});

		test('should detect powershell-preview', () => {
			ok(isPowerShell('powershell-preview.exe', OperatingSystem.Windows));
			ok(isPowerShell('powershell-preview', OperatingSystem.Linux));
		});

		test('should detect pwsh-preview', () => {
			ok(isPowerShell('pwsh-preview.exe', OperatingSystem.Windows));
			ok(isPowerShell('pwsh-preview', OperatingSystem.Linux));
		});
	});

	suite('PowerShell with full paths', () => {
		test('should detect Windows PowerShell with full path', () => {
			ok(isPowerShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', OperatingSystem.Windows));
		});

		test('should detect PowerShell Core with full path', () => {
			ok(isPowerShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe', OperatingSystem.Windows));
		});

		test('should detect PowerShell on Linux/macOS with full path', () => {
			ok(isPowerShell('/usr/bin/pwsh', OperatingSystem.Linux));
		});

		test('should detect PowerShell preview with full path', () => {
			ok(isPowerShell('/opt/microsoft/powershell/7-preview/pwsh-preview', OperatingSystem.Linux));
		});

		test('should detect nested path with powershell', () => {
			ok(isPowerShell('/some/deep/path/to/powershell.exe', OperatingSystem.Windows));
		});
	});

	suite('Case sensitivity', () => {
		test('should detect PowerShell regardless of case', () => {
			ok(isPowerShell('PowerShell.exe', OperatingSystem.Windows));
			ok(isPowerShell('POWERSHELL.EXE', OperatingSystem.Windows));
			ok(isPowerShell('Pwsh.exe', OperatingSystem.Windows));
		});
	});

	suite('Non-PowerShell shells', () => {
		test('should not detect bash', () => {
			ok(!isPowerShell('bash', OperatingSystem.Linux));
		});

		test('should not detect zsh', () => {
			ok(!isPowerShell('zsh', OperatingSystem.Linux));
		});

		test('should not detect sh', () => {
			ok(!isPowerShell('sh', OperatingSystem.Linux));
		});

		test('should not detect fish', () => {
			ok(!isPowerShell('fish', OperatingSystem.Linux));
		});

		test('should not detect cmd.exe', () => {
			ok(!isPowerShell('cmd.exe', OperatingSystem.Windows));
		});

		test('should not detect command.com', () => {
			ok(!isPowerShell('command.com', OperatingSystem.Windows));
		});

		test('should not detect dash', () => {
			ok(!isPowerShell('dash', OperatingSystem.Linux));
		});

		test('should not detect tcsh', () => {
			ok(!isPowerShell('tcsh', OperatingSystem.Linux));
		});

		test('should not detect csh', () => {
			ok(!isPowerShell('csh', OperatingSystem.Linux));
		});
	});

	suite('Non-PowerShell shells with full paths', () => {
		test('should not detect bash with full path', () => {
			ok(!isPowerShell('/bin/bash', OperatingSystem.Linux));
		});

		test('should not detect zsh with full path', () => {
			ok(!isPowerShell('/usr/bin/zsh', OperatingSystem.Linux));
		});

		test('should not detect cmd.exe with full path', () => {
			ok(!isPowerShell('C:\\Windows\\System32\\cmd.exe', OperatingSystem.Windows));
		});

		test('should not detect git bash', () => {
			ok(!isPowerShell('C:\\Program Files\\Git\\bin\\bash.exe', OperatingSystem.Windows));
		});
	});

	suite('Edge cases', () => {
		test('should handle empty string', () => {
			ok(!isPowerShell('', OperatingSystem.Windows));
		});

		test('should handle paths with spaces', () => {
			ok(isPowerShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe', OperatingSystem.Windows));
			ok(!isPowerShell('C:\\Program Files\\Git\\bin\\bash.exe', OperatingSystem.Windows));
		});

		test('should not match partial strings', () => {
			ok(!isPowerShell('notpowershell', OperatingSystem.Linux));
			ok(!isPowerShell('powershellish', OperatingSystem.Linux));
			ok(!isPowerShell('mypwsh', OperatingSystem.Linux));
			ok(!isPowerShell('pwshell', OperatingSystem.Linux));
		});

		test('should handle strings containing powershell but not as basename', () => {
			ok(!isPowerShell('/powershell/bin/bash', OperatingSystem.Linux));
			ok(!isPowerShell('/usr/pwsh/bin/zsh', OperatingSystem.Linux));
			ok(!isPowerShell('C:\\powershell\\cmd.exe', OperatingSystem.Windows));
		});

		test('should handle special characters in path', () => {
			ok(isPowerShell('/path/with-dashes/pwsh.exe', OperatingSystem.Windows));
			ok(isPowerShell('/path/with_underscores/powershell', OperatingSystem.Linux));
			ok(isPowerShell('C:\\path\\with spaces\\pwsh.exe', OperatingSystem.Windows));
		});

		test('should handle relative paths', () => {
			ok(isPowerShell('./powershell.exe', OperatingSystem.Windows));
			ok(isPowerShell('../bin/pwsh', OperatingSystem.Linux));
			ok(isPowerShell('bin/powershell', OperatingSystem.Linux));
		});

		test('should not match similar named tools', () => {
			ok(!isPowerShell('powertool', OperatingSystem.Linux));
			ok(!isPowerShell('shell', OperatingSystem.Linux));
			ok(!isPowerShell('power', OperatingSystem.Linux));
			ok(!isPowerShell('pwshconfig', OperatingSystem.Linux));
		});
	});
});
