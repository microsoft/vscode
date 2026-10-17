/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import * as Platform from '../../../../../base/common/platform.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';
import { ShellQuoting, IShellConfiguration } from '../../common/tasks.js';

// Test helper to access private method
class TestableTerminalTaskSystem extends TerminalTaskSystem {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	public _buildShellCommandLine(platform: Platform.Platform, shellExecutable: string, shellOptions: IShellConfiguration | undefined, command: string | { value: string; quoting: ShellQuoting }, originalCommand: string | { value: string; quoting: ShellQuoting } | undefined, args: Array<string | { value: string; quoting: ShellQuoting }>): string {
		return super['_buildShellCommandLine'](platform, shellExecutable, shellOptions, command, originalCommand, args);
	}
}

suite('TerminalTaskSystem Command Line Building', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let terminalTaskSystem: TestableTerminalTaskSystem;

	setup(() => {
		// Create a minimal instance for testing
		terminalTaskSystem = new TestableTerminalTaskSystem() as any;
	});

	suite('Command Line Quoting', () => {
		test('should not double-quote already quoted commands', () => {
			// Issue: Commands already wrapped in quotes get double-wrapped
			const command = '"my command"';
			const args: string[] = [];
			
			const result = terminalTaskSystem._buildShellCommandLine(
				Platform.Platform.Windows,
				'cmd',
				undefined,
				command,
				command,
				args
			);
			
			// Should not have double quotes
			assert.strictEqual(result, '"my command"');
			assert.ok(!result.includes('""my command""'), 'Command should not be double-quoted');
		});

		test('should properly separate command and arguments', () => {
			// Issue: Arguments are concatenated with command instead of separated
			const command = 'Q:\\src\\script.ps1';
			const args = ['arg number one', 'arg"two'];
			
			const result = terminalTaskSystem._buildShellCommandLine(
				Platform.Platform.Windows,
				'pwsh',
				undefined,
				command,
				command,
				args
			);
			
			// Should have command and args as separate quoted elements
			// Expected: "Q:\src\script.ps1" "arg number one" "arg\"two"
			assert.ok(result.includes('"Q:\\src\\script.ps1"'), 'Command should be quoted');
			assert.ok(result.includes('"arg number one"'), 'First argument should be quoted');
			assert.ok(result.includes('arg'), 'Should contain arguments');
			
			// Should not concatenate everything into one quoted string
			assert.ok(!result.startsWith('"Q:\\src\\script.ps1 arg number one'), 'Should not concatenate command and args');
		});

		test('should properly escape quotes in arguments for PowerShell', () => {
			// Issue: Special characters in arguments not properly escaped
			const command = 'script.ps1';
			const args = ['arg"two'];
			
			const result = terminalTaskSystem._buildShellCommandLine(
				Platform.Platform.Windows,
				'pwsh',
				undefined,
				command,
				command,
				args
			);
			
			// For PowerShell, quotes should be escaped with backticks
			// Expected result should have properly escaped quotes
			assert.ok(result.includes('script.ps1'), 'Should contain command');
			assert.ok(result.includes('arg'), 'Should contain argument');
		});

		test('should handle cmd.exe properly without double wrapping', () => {
			// Issue: cmd.exe gets entire command line wrapped when it shouldn't
			const command = '"my_program.exe"';
			const args = ['arg1'];
			
			const result = terminalTaskSystem._buildShellCommandLine(
				Platform.Platform.Windows,
				'cmd',
				undefined,
				command,
				command,
				args
			);
			
			// Should not wrap entire command line for simple cases
			assert.ok(!result.startsWith('""'), 'Should not start with double quotes');
			assert.ok(!result.endsWith('""'), 'Should not end with double quotes');
		});

		test('should handle bash properly', () => {
			// Test bash behavior
			const command = 'my script';
			const args = ['arg with spaces', 'arg"with"quotes'];
			
			const result = terminalTaskSystem._buildShellCommandLine(
				Platform.Platform.Linux,
				'bash',
				undefined,
				command,
				command,
				args
			);
			
			// Bash should quote spaces and escape quotes
			assert.ok(result.includes('"my script"') || result.includes("'my script'"), 'Command with spaces should be quoted');
		});
	});
});