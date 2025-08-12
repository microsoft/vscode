/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { splitCommandLineForAutoApproval } from '../../browser/subCommandsForAutoApproval.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('splitCommandLineForAutoApproval', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('bash/sh shell', () => {
		test('should identify output redirection targets', () => {
			const commandLine = 'echo "hello world" > file.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'echo "hello world"');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'file.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'output');
		});

		test('should identify append redirection targets', () => {
			const commandLine = 'echo "test" >> output.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'echo "test"');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'output.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'output');
		});

		test('should identify error redirection targets', () => {
			const commandLine = 'command 2> error.log';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'command');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'error.log');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'error');
		});

		test('should identify input redirection targets', () => {
			const commandLine = 'cat < input.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'cat');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'input.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'input');
		});

		test('should handle multiple redirections', () => {
			const commandLine = 'command < input.txt > output.txt 2> error.log';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 4);
			strictEqual(result[0].command, 'command');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'input.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'input');
			strictEqual(result[2].command, 'output.txt');
			strictEqual(result[2].isRedirectionTarget, true);
			strictEqual(result[2].redirectionType, 'output');
			strictEqual(result[3].command, 'error.log');
			strictEqual(result[3].isRedirectionTarget, true);
			strictEqual(result[3].redirectionType, 'error');
		});

		test('should handle commands with logical operators and redirection', () => {
			const commandLine = 'echo test > file.txt && cat file.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 3);
			strictEqual(result[0].command, 'echo test');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'file.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'output');
			strictEqual(result[2].command, 'cat file.txt');
			strictEqual(result[2].isRedirectionTarget, false);
		});

		test('should not mark regular command arguments as redirection targets', () => {
			const commandLine = 'ls -la | grep test';
			const result = splitCommandLineForAutoApproval(commandLine, 'bash', OperatingSystem.Linux);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'ls -la');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'grep test');
			strictEqual(result[1].isRedirectionTarget, false);
		});
	});

	suite('PowerShell', () => {
		test('should identify PowerShell output redirection targets', () => {
			const commandLine = 'Get-Content file.txt > output.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'pwsh', OperatingSystem.Windows);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'Get-Content file.txt');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'output.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'output');
		});

		test('should identify PowerShell numbered stream redirection', () => {
			const commandLine = 'command 2> error.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'pwsh', OperatingSystem.Windows);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'command');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'error.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'error');
		});

		test('should identify PowerShell all streams redirection', () => {
			const commandLine = 'command *> all_output.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'pwsh', OperatingSystem.Windows);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'command');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'all_output.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'all');
		});
	});

	suite('zsh shell', () => {
		test('should identify zsh-specific redirection operators', () => {
			const commandLine = 'echo "force" >! existing_file.txt';
			const result = splitCommandLineForAutoApproval(commandLine, 'zsh', OperatingSystem.Linux);
			
			strictEqual(result.length, 2);
			strictEqual(result[0].command, 'echo "force"');
			strictEqual(result[0].isRedirectionTarget, false);
			strictEqual(result[1].command, 'existing_file.txt');
			strictEqual(result[1].isRedirectionTarget, true);
			strictEqual(result[1].redirectionType, 'output');
		});
	});
});