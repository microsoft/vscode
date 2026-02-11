/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveHookCommand, resolveEffectiveCommand, formatHookCommandLabel, IHookCommand } from '../../../common/promptSyntax/hookSchema.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';

suite('HookSchema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveHookCommand', () => {
		const workspaceRoot = URI.file('/workspace');
		const userHome = '/home/user';

		suite('command property', () => {
			test('resolves basic command', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello',
					cwd: workspaceRoot
				});
			});

			test('resolves command with all optional properties', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: './scripts/validate.sh',
					cwd: 'src',
					env: { NODE_ENV: 'test' },
					timeout: 60
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: './scripts/validate.sh',
					cwd: URI.file('/workspace/src'),
					env: { NODE_ENV: 'test' },
					timeout: 60
				});
			});

			test('empty command returns object without command', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: ''
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					cwd: workspaceRoot
				});
			});
		});

		suite('bash legacy mapping', () => {
			test('bash maps to linux and osx', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: 'echo "hello world"'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					linux: 'echo "hello world"',
					osx: 'echo "hello world"',
					linuxSource: 'bash',
					osxSource: 'bash',
					cwd: workspaceRoot
				});
			});

			test('bash with cwd and env', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: './test.sh',
					cwd: 'scripts',
					env: { DEBUG: '1' }
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					linux: './test.sh',
					osx: './test.sh',
					linuxSource: 'bash',
					osxSource: 'bash',
					cwd: URI.file('/workspace/scripts'),
					env: { DEBUG: '1' }
				});
			});

			test('empty bash returns object without platform overrides', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: ''
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					cwd: workspaceRoot
				});
			});
		});

		suite('powershell legacy mapping', () => {
			test('powershell maps to windows', () => {
				const result = resolveHookCommand({
					type: 'command',
					powershell: 'Write-Host "hello"'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					windows: 'Write-Host "hello"',
					windowsSource: 'powershell',
					cwd: workspaceRoot
				});
			});

			test('powershell with timeout', () => {
				const result = resolveHookCommand({
					type: 'command',
					powershell: 'Get-Process',
					timeout: 30
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					windows: 'Get-Process',
					windowsSource: 'powershell',
					cwd: workspaceRoot,
					timeout: 30
				});
			});

			test('empty powershell returns object without windows', () => {
				const result = resolveHookCommand({
					type: 'command',
					powershell: ''
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					cwd: workspaceRoot
				});
			});
		});

		suite('multiple properties specified', () => {
			test('preserves command with bash mapped to linux/osx', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'direct-command',
					bash: 'bash-script.sh'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'direct-command',
					linux: 'bash-script.sh',
					osx: 'bash-script.sh',
					linuxSource: 'bash',
					osxSource: 'bash',
					cwd: workspaceRoot
				});
			});

			test('preserves command with powershell mapped to windows', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'direct-command',
					powershell: 'ps-script.ps1'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'direct-command',
					windows: 'ps-script.ps1',
					windowsSource: 'powershell',
					cwd: workspaceRoot
				});
			});

			test('bash and powershell map to all platforms', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: 'bash-script.sh',
					powershell: 'ps-script.ps1'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					windows: 'ps-script.ps1',
					linux: 'bash-script.sh',
					osx: 'bash-script.sh',
					windowsSource: 'powershell',
					linuxSource: 'bash',
					osxSource: 'bash',
					cwd: workspaceRoot
				});
			});
		});

		suite('cwd resolution', () => {
			test('cwd is not resolved when no workspace root', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello',
					cwd: 'src'
				}, undefined, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello'
				});
			});

			test('cwd is resolved relative to workspace root', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello',
					cwd: 'nested/path'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello',
					cwd: URI.file('/workspace/nested/path')
				});
			});
		});

		suite('invalid inputs', () => {
			test('wrong type returns undefined', () => {
				const result = resolveHookCommand({
					type: 'script',
					command: 'echo hello'
				}, workspaceRoot, userHome);
				assert.strictEqual(result, undefined);
			});

			test('missing type returns undefined', () => {
				const result = resolveHookCommand({
					command: 'echo hello'
				}, workspaceRoot, userHome);
				assert.strictEqual(result, undefined);
			});

			test('no command returns object with just type and cwd', () => {
				const result = resolveHookCommand({
					type: 'command',
					cwd: '/workspace'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					cwd: URI.file('/workspace')
				});
			});

			test('ignores non-string cwd', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello',
					cwd: 123
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello',
					cwd: workspaceRoot
				});
			});

			test('ignores non-object env', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello',
					env: 'invalid'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello',
					cwd: workspaceRoot
				});
			});

			test('ignores non-number timeout', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello',
					timeout: '30'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello',
					cwd: workspaceRoot
				});
			});
		});

		suite('platform-specific overrides', () => {
			test('preserves windows override as string', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'default-command',
					windows: 'win-command'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'default-command',
					windows: 'win-command',
					windowsSource: 'windows',
					cwd: workspaceRoot
				});
			});

			test('preserves linux override as string', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'default-command',
					linux: 'linux-command'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'default-command',
					linux: 'linux-command',
					linuxSource: 'linux',
					cwd: workspaceRoot
				});
			});

			test('preserves osx override as string', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'default-command',
					osx: 'osx-command'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'default-command',
					osx: 'osx-command',
					osxSource: 'osx',
					cwd: workspaceRoot
				});
			});

			test('preserves all platform overrides', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'default-command',
					windows: 'win-command',
					linux: 'linux-command',
					osx: 'osx-command'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'default-command',
					windows: 'win-command',
					linux: 'linux-command',
					osx: 'osx-command',
					windowsSource: 'windows',
					linuxSource: 'linux',
					osxSource: 'osx',
					cwd: workspaceRoot
				});
			});

			test('explicit platform override takes precedence over bash/powershell mapping', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: 'default.sh',
					linux: 'explicit-linux.sh'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					linux: 'explicit-linux.sh',
					osx: 'default.sh',
					linuxSource: 'linux',
					osxSource: 'bash',
					cwd: workspaceRoot
				});
			});

			test('ignores empty platform override', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'default-command',
					windows: ''
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'default-command',
					cwd: workspaceRoot
				});
			});

			test('ignores non-string platform override', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'default-command',
					windows: { command: 'invalid' }
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'default-command',
					cwd: workspaceRoot
				});
			});
		});
	});

	suite('resolveEffectiveCommand', () => {
		test('returns base command when no platform override', () => {
			const hook: IHookCommand = {
				type: 'command',
				command: 'default-command'
			};
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), 'default-command');
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Macintosh), 'default-command');
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Linux), 'default-command');
		});

		test('applies platform override for each platform', () => {
			const hook: IHookCommand = {
				type: 'command',
				command: 'default-command',
				windows: 'win-command',
				linux: 'linux-command',
				osx: 'osx-command'
			};
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), 'win-command');
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Macintosh), 'osx-command');
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Linux), 'linux-command');
		});

		test('falls back to command when no platform-specific override', () => {
			const hook: IHookCommand = {
				type: 'command',
				command: 'default-command'
			};
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), 'default-command');
		});

		test('returns undefined when no command at all', () => {
			const hook: IHookCommand = {
				type: 'command'
			};
			assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), undefined);
		});
	});

	suite('formatHookCommandLabel', () => {
		test('formats command when present (no platform override)', () => {
			const hook: IHookCommand = {
				type: 'command',
				command: 'echo hello'
			};
			// No platform badge when using default command
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), 'echo hello');
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Macintosh), 'echo hello');
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Linux), 'echo hello');
		});

		test('returns empty string when no command', () => {
			const hook: IHookCommand = {
				type: 'command'
			};
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), '');
		});

		test('applies platform override for display with platform badge', () => {
			const hook: IHookCommand = {
				type: 'command',
				command: 'default-command',
				windows: 'win-command',
				linux: 'linux-command',
				osx: 'osx-command'
			};
			// Should include platform badge when using platform-specific override
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), '[Windows] win-command');
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Macintosh), '[macOS] osx-command');
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Linux), '[Linux] linux-command');
		});

		test('no platform badge when falling back to default command', () => {
			const hook: IHookCommand = {
				type: 'command',
				command: 'default-command'
				// No platform-specific overrides
			};
			// Should not include badge when using default command
			assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), 'default-command');
		});
	});
});
