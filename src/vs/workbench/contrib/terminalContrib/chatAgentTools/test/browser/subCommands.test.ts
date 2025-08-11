/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { extractInlineSubCommands, splitCommandLineIntoSubCommands } from '../../browser/subCommands.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('splitCommandLineIntoSubCommands', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should split command line into subcommands', () => {
		const commandLine = 'echo "Hello World" && ls -la || pwd';
		const expectedSubCommands = ['echo "Hello World"', 'ls -la', 'pwd'];
		const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
		deepStrictEqual(actualSubCommands, expectedSubCommands);
	});

	suite('bash/sh shell', () => {
		test('should split on logical operators', () => {
			const commandLine = 'echo test && ls -la || pwd';
			const expectedSubCommands = ['echo test', 'ls -la', 'pwd'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on pipes', () => {
			const commandLine = 'ls -la | grep test | wc -l';
			const expectedSubCommands = ['ls -la', 'grep test', 'wc -l'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on semicolons', () => {
			const commandLine = 'cd /tmp; ls -la; pwd';
			const expectedSubCommands = ['cd /tmp', 'ls -la', 'pwd'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on background operator', () => {
			const commandLine = 'sleep 5 & echo done';
			const expectedSubCommands = ['sleep 5', 'echo done'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on redirection operators', () => {
			const commandLine = 'echo test > output.txt && cat output.txt';
			const expectedSubCommands = ['echo test', 'output.txt', 'cat output.txt'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on stderr redirection', () => {
			const commandLine = 'command 2> error.log && echo success';
			const expectedSubCommands = ['command', 'error.log', 'echo success'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on append redirection', () => {
			const commandLine = 'echo line1 >> file.txt && echo line2 >> file.txt';
			const expectedSubCommands = ['echo line1', 'file.txt', 'echo line2', 'file.txt'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});
	});

	suite('zsh shell', () => {
		test('should split on zsh-specific operators', () => {
			const commandLine = 'echo test <<< "input" && ls';
			const expectedSubCommands = ['echo test', '"input"', 'ls'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on process substitution', () => {
			const commandLine = 'diff <(ls dir1) <(ls dir2)';
			const expectedSubCommands = ['diff', 'ls dir1)', 'ls dir2)'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on bidirectional redirection', () => {
			const commandLine = 'command <> file.txt && echo done';
			const expectedSubCommands = ['command', 'file.txt', 'echo done'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should handle complex zsh command chains', () => {
			const commandLine = 'ls | grep test && echo found || echo not found';
			const expectedSubCommands = ['ls', 'grep test', 'echo found', 'echo not found'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});
	});

	suite('PowerShell', () => {
		test('should not split on PowerShell logical operators', () => {
			const commandLine = 'Get-ChildItem -and Get-Location -or Write-Host "test"';
			const expectedSubCommands = ['Get-ChildItem -and Get-Location -or Write-Host "test"'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on PowerShell pipes', () => {
			const commandLine = 'Get-Process | Where-Object Name -eq "notepad" | Stop-Process';
			const expectedSubCommands = ['Get-Process', 'Where-Object Name -eq "notepad"', 'Stop-Process'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should split on PowerShell redirection', () => {
			const commandLine = 'Get-Process > processes.txt && Get-Content processes.txt';
			const expectedSubCommands = ['Get-Process', 'processes.txt', 'Get-Content processes.txt'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});
	});

	suite('edge cases', () => {
		test('should return single command when no operators present', () => {
			const commandLine = 'echo "hello world"';
			const expectedSubCommands = ['echo "hello world"'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should handle empty command', () => {
			const commandLine = '';
			const expectedSubCommands: string[] = [];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should trim whitespace from subcommands', () => {
			const commandLine = 'echo test   &&   ls -la   ||   pwd';
			const expectedSubCommands = ['echo test', 'ls -la', 'pwd'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'sh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should handle multiple consecutive operators', () => {
			const commandLine = 'echo test && && ls';
			const expectedSubCommands = ['echo test', 'ls'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should handle unknown shell as sh', () => {
			const commandLine = 'echo test && ls -la';
			const expectedSubCommands = ['echo test', 'ls -la'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'unknown-shell', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});
	});

	suite('shell type detection', () => {
		test('should detect PowerShell variants', () => {
			const commandLine = 'Get-Process ; Get-Location';
			const expectedSubCommands = ['Get-Process', 'Get-Location'];

			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'powershell', OperatingSystem.Linux), expectedSubCommands);
			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows), expectedSubCommands);
			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'pwsh', OperatingSystem.Linux), expectedSubCommands);
			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows), expectedSubCommands);
			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'powershell-preview', OperatingSystem.Linux), expectedSubCommands);
		});

		test('should detect zsh specifically', () => {
			const commandLine = 'echo test <<< input';
			const expectedSubCommands = ['echo test', 'input'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test('should default to sh for other shells', () => {
			const commandLine = 'echo test && ls';
			const expectedSubCommands = ['echo test', 'ls'];

			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux), expectedSubCommands);
			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'dash', OperatingSystem.Linux), expectedSubCommands);
			deepStrictEqual(splitCommandLineIntoSubCommands(commandLine, 'fish', OperatingSystem.Linux), expectedSubCommands);
		});
	});

	suite('redirection tests', () => {
		suite('output redirection', () => {
			test('should split on basic output redirection', () => {
				const commandLine = 'echo hello > output.txt';
				const expectedSubCommands = ['echo hello', 'output.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on append redirection', () => {
				const commandLine = 'echo hello >> output.txt';
				const expectedSubCommands = ['echo hello', 'output.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on multiple output redirections', () => {
				const commandLine = 'ls > files.txt && cat files.txt > backup.txt';
				const expectedSubCommands = ['ls', 'files.txt', 'cat files.txt', 'backup.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on numbered file descriptor redirection', () => {
				const commandLine = 'command 1> stdout.txt 2> stderr.txt';
				const expectedSubCommands = ['command', 'stdout.txt', 'stderr.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on stderr-only redirection', () => {
				const commandLine = 'make 2> errors.log';
				const expectedSubCommands = ['make', 'errors.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on all output redirection (&>)', () => {
				const commandLine = 'command &> all_output.txt';
				const expectedSubCommands = ['command', 'all_output.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('input redirection', () => {
			test('should split on input redirection', () => {
				const commandLine = 'sort < input.txt';
				const expectedSubCommands = ['sort', 'input.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on numbered input redirection', () => {
				const commandLine = 'program 0< input.txt';
				const expectedSubCommands = ['program', 'input.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on input/output combined', () => {
				const commandLine = 'sort < input.txt > output.txt';
				const expectedSubCommands = ['sort', 'input.txt', 'output.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('stream redirection', () => {
			test('should split on stdout to stderr redirection', () => {
				const commandLine = 'echo error 1>&2';
				const expectedSubCommands = ['echo error'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on stderr to stdout redirection', () => {
				const commandLine = 'command 2>&1';
				const expectedSubCommands = ['command'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on stream redirection with numbered descriptors', () => {
				const commandLine = 'exec 3>&1 && exec 4>&2';
				const expectedSubCommands = ['exec', 'exec'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on multiple stream redirections', () => {
				const commandLine = 'command 2>&1 1>&3 3>&2';
				const expectedSubCommands = ['command'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('here documents and here strings', () => {
			test('should split on here document', () => {
				const commandLine = 'cat << EOF && echo done';
				const expectedSubCommands = ['cat', 'EOF', 'echo done'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on here string (bash/zsh)', () => {
				const commandLine = 'grep pattern <<< "search this text"';
				const expectedSubCommands = ['grep pattern', '"search this text"'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on numbered here string', () => {
				const commandLine = 'command 3<<< "input data"';
				const expectedSubCommands = ['command', '"input data"'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('bidirectional redirection', () => {
			test('should split on read/write redirection', () => {
				const commandLine = 'dialog <> /dev/tty1';
				const expectedSubCommands = ['dialog', '/dev/tty1'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on numbered bidirectional redirection', () => {
				const commandLine = 'program 3<> data.file';
				const expectedSubCommands = ['program', 'data.file'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('PowerShell redirection', () => {
			test('should split on PowerShell output redirection', () => {
				const commandLine = 'Get-Process > processes.txt';
				const expectedSubCommands = ['Get-Process', 'processes.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell append redirection', () => {
				const commandLine = 'Write-Output "log entry" >> log.txt';
				const expectedSubCommands = ['Write-Output "log entry"', 'log.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell error stream redirection', () => {
				const commandLine = 'Get-Content nonexistent.txt 2> errors.log';
				const expectedSubCommands = ['Get-Content nonexistent.txt', 'errors.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell warning stream redirection', () => {
				const commandLine = 'Get-Process 3> warnings.log';
				const expectedSubCommands = ['Get-Process', 'warnings.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell verbose stream redirection', () => {
				const commandLine = 'Get-ChildItem 4> verbose.log';
				const expectedSubCommands = ['Get-ChildItem', 'verbose.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell debug stream redirection', () => {
				const commandLine = 'Invoke-Command 5> debug.log';
				const expectedSubCommands = ['Invoke-Command', 'debug.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell information stream redirection', () => {
				const commandLine = 'Write-Information "info" 6> info.log';
				const expectedSubCommands = ['Write-Information "info"', 'info.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell all streams redirection', () => {
				const commandLine = 'Get-Process *> all_streams.log';
				const expectedSubCommands = ['Get-Process', 'all_streams.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on PowerShell stream to stream redirection', () => {
				const commandLine = 'Write-Error "error" 2>&1';
				const expectedSubCommands = ['Write-Error "error"'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('complex redirection scenarios', () => {
			test('should split on command with multiple redirections', () => {
				const commandLine = 'command < input.txt > output.txt 2> errors.log';
				const expectedSubCommands = ['command', 'input.txt', 'output.txt', 'errors.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on redirection with pipes and logical operators', () => {
				const commandLine = 'cat file.txt | grep pattern > results.txt && echo "Found" || echo "Not found" 2> errors.log';
				const expectedSubCommands = ['cat file.txt', 'grep pattern', 'results.txt', 'echo "Found"', 'echo "Not found"', 'errors.log'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on chained redirections', () => {
				const commandLine = 'echo "step1" > temp.txt && cat temp.txt >> final.txt && rm temp.txt';
				const expectedSubCommands = ['echo "step1"', 'temp.txt', 'cat temp.txt', 'final.txt', 'rm temp.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should handle redirection with background processes', () => {
				const commandLine = 'long_running_command > output.log 2>&1 & echo "started"';
				const expectedSubCommands = ['long_running_command', 'output.log', 'echo "started"'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});

		suite('zsh-specific redirection', () => {
			test('should split on zsh noclobber override', () => {
				const commandLine = 'echo "force" >! existing_file.txt';
				const expectedSubCommands = ['echo "force"', 'existing_file.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on zsh clobber override', () => {
				const commandLine = 'echo "overwrite" >| protected_file.txt';
				const expectedSubCommands = ['echo "overwrite"', 'protected_file.txt'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on zsh process substitution for input', () => {
				const commandLine = 'diff <(sort file1.txt) <(sort file2.txt)';
				const expectedSubCommands = ['diff', 'sort file1.txt)', 'sort file2.txt)'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});

			test('should split on zsh multios', () => {
				const commandLine = 'echo "test" | tee >(gzip > file1.gz) >(bzip2 > file1.bz2)';
				const expectedSubCommands = ['echo "test"', 'tee', '(gzip', 'file1.gz)', '(bzip2', 'file1.bz2)'];
				const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
				deepStrictEqual(actualSubCommands, expectedSubCommands);
			});
		});
	});

	suite('complex command combinations', () => {
		test('should handle mixed operators in order', () => {
			const commandLine = 'ls | grep test && echo found > result.txt || echo failed';
			const expectedSubCommands = ['ls', 'grep test', 'echo found', 'result.txt', 'echo failed'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'bash', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});

		test.skip('should handle subshells and braces', () => {
			const commandLine = '(cd /tmp && ls) && { echo done; }';
			const expectedSubCommands = ['(cd /tmp', 'ls)', '{ echo done', '}'];
			const actualSubCommands = splitCommandLineIntoSubCommands(commandLine, 'zsh', OperatingSystem.Linux);
			deepStrictEqual(actualSubCommands, expectedSubCommands);
		});
	});
});

suite('extractInlineSubCommands', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function assertSubCommandsUnordered(result: Set<string>, expectedSubCommands: string[]) {
		deepStrictEqual(Array.from(result).sort(), expectedSubCommands.sort());
	}

	suite('POSIX shells (bash, zsh, sh)', () => {
		test('should extract command substitution with $()', () => {
			const commandLine = 'echo "Current date: $(date)"';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['date']);
		});

		test('should extract command substitution with backticks', () => {
			const commandLine = 'echo "Current date: `date`"';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['date']);
		});

		test('should extract process substitution with <()', () => {
			const commandLine = 'diff <(cat file1.txt) <(cat file2.txt)';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['cat file1.txt', 'cat file2.txt']);
		});

		test('should extract process substitution with >()', () => {
			const commandLine = 'tee >(wc -l) >(grep pattern) < input.txt';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['wc -l', 'grep pattern']);
		});

		test('should extract multiple inline commands', () => {
			const commandLine = 'echo "Today is $(date) and user is $(whoami)"';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['date', 'whoami']);
		});

		test('should extract nested inline commands', () => {
			const commandLine = 'echo "$(echo "Inner: $(date)")"';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['echo "Inner: $(date)"', 'date']);
		});

		test('should handle mixed substitution types', () => {
			const commandLine = 'echo "Date: $(date)" && cat `which ls` | grep <(echo pattern)';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['date', 'which ls', 'echo pattern']);
		});

		test('should handle empty substitutions', () => {
			const commandLine = 'echo $() test ``';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, []);
		});

		test('should handle commands with whitespace', () => {
			const commandLine = 'echo "$( ls -la | grep test )"';
			const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, ['ls -la | grep test']);
		});
	});

	suite('PowerShell (pwsh)', () => {
		test('should extract command substitution with $()', () => {
			const commandLine = 'Write-Host "Current date: $(Get-Date)"';
			const result = extractInlineSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['Get-Date']);
		});

		test('should extract array subexpression with @()', () => {
			const commandLine = 'Write-Host @(Get-ChildItem | Where-Object {$_.Name -like "*.txt"})';
			const result = extractInlineSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['Get-ChildItem | Where-Object {$_.Name -like "*.txt"}']);
		});

		test('should extract call operator with &()', () => {
			const commandLine = 'Write-Host &(Get-Command git)';
			const result = extractInlineSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['Get-Command git']);
		});

		test('should extract multiple PowerShell substitutions', () => {
			const commandLine = 'Write-Host "User: $(whoami) and date: $(Get-Date)"';
			const result = extractInlineSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['whoami', 'Get-Date']);
		});

		test('should extract nested PowerShell commands', () => {
			const commandLine = 'Write-Host "$(Write-Host "Inner: $(Get-Date)")"';
			const result = extractInlineSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['Write-Host "Inner: $(Get-Date)"', 'Get-Date']);
		});

		test('should handle mixed PowerShell substitution types', () => {
			const commandLine = 'Write-Host "$(Get-Date)" @(Get-ChildItem) &(Get-Command ls)';
			const result = extractInlineSubCommands(commandLine, 'pwsh.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['Get-Date', 'Get-ChildItem', 'Get-Command ls']);
		});

		test('should handle PowerShell commands with complex expressions', () => {
			const commandLine = 'Write-Host "$((Get-ChildItem).Count)"';
			const result = extractInlineSubCommands(commandLine, 'powershell.exe', OperatingSystem.Windows);
			assertSubCommandsUnordered(result, ['(Get-ChildItem).Count']);
		});

		test('should handle empty PowerShell substitutions', () => {
			const commandLine = 'Write-Host $() @() &()';
			const result = extractInlineSubCommands(commandLine, 'pwsh', OperatingSystem.Linux);
			assertSubCommandsUnordered(result, []);
		});
	});

	suite('Shell detection', () => {
		test('should detect PowerShell from various shell paths', () => {
			const commandLine = 'Write-Host "$(Get-Date)"';

			const powershellShells = [
				'powershell.exe',
				'pwsh.exe',
				'powershell',
				'pwsh',
				'powershell-preview',
				'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
				'/usr/bin/pwsh'
			];

			for (const shell of powershellShells) {
				const result = extractInlineSubCommands(commandLine, shell, commandLine.match(/\.exe/) ? OperatingSystem.Windows : OperatingSystem.Linux);
				assertSubCommandsUnordered(result, ['Get-Date']);
			}
		});

		test('should treat non-PowerShell shells as POSIX', () => {
			const commandLine = 'echo "$(date)"';

			const posixShells = [
				'/bin/bash',
				'/bin/sh',
				'/bin/zsh',
				'/usr/bin/fish',
				'bash',
				'sh',
				'zsh'
			];

			for (const shell of posixShells) {
				const result = extractInlineSubCommands(commandLine, shell, OperatingSystem.Linux);
				assertSubCommandsUnordered(result, ['date']);
			}
		});
	});

	// suite('Edge cases', () => {
	// 	test('should handle commands with no inline substitutions', () => {
	// 		const result1 = extractInlineSubCommands('echo hello world', '/bin/bash', OperatingSystem.Linux);
	// 		deepStrictEqual(Array.from(result1), []);

	// 		const result2 = extractInlineSubCommands('Write-Host "hello world"', 'pwsh', OperatingSystem.Linux);
	// 		deepStrictEqual(Array.from(result2), []);
	// 	});

	// 	test('should handle malformed substitutions gracefully', () => {
	// 		const commandLine = 'echo $( incomplete';
	// 		const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
	// 		assertSubCommandsUnordered(result, []);
	// 	});

	// 	test('should handle escaped substitutions (should still extract)', () => {
	// 		// Note: This implementation doesn't handle escaping - that would be a future enhancement
	// 		const commandLine = 'echo \\$(date)';
	// 		const result = extractInlineSubCommands(commandLine, '/bin/bash', OperatingSystem.Linux);
	// 		assertSubCommandsUnordered(result, ['date']);
	// 	});

	// 	test('should handle empty command line', () => {
	// 		const result = extractInlineSubCommands('', '/bin/bash', OperatingSystem.Linux);
	// 		assertSubCommandsUnordered(result, []);
	// 	});

	// 	test('should handle whitespace-only command line', () => {
	// 		const result = extractInlineSubCommands('   \t  \n  ', '/bin/bash', OperatingSystem.Linux);
	// 		assertSubCommandsUnordered(result, []);
	// 	});
	// });
});
