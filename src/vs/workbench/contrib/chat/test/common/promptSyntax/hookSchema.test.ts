/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveHookCommand } from '../../../common/promptSyntax/hookSchema.js';
import { URI } from '../../../../../../base/common/uri.js';

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
					timeoutSec: 60
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: './scripts/validate.sh',
					cwd: URI.file('/workspace/src'),
					env: { NODE_ENV: 'test' },
					timeoutSec: 60
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

		suite('bash shorthand', () => {
			test('preserves bash property', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: 'echo "hello world"'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					bash: 'echo "hello world"',
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
					bash: './test.sh',
					cwd: URI.file('/workspace/scripts'),
					env: { DEBUG: '1' }
				});
			});

			test('empty bash returns object without bash', () => {
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

		suite('powershell shorthand', () => {
			test('preserves powershell property', () => {
				const result = resolveHookCommand({
					type: 'command',
					powershell: 'Write-Host "hello"'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					powershell: 'Write-Host "hello"',
					cwd: workspaceRoot
				});
			});

			test('powershell with timeoutSec', () => {
				const result = resolveHookCommand({
					type: 'command',
					powershell: 'Get-Process',
					timeoutSec: 30
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					powershell: 'Get-Process',
					cwd: workspaceRoot,
					timeoutSec: 30
				});
			});

			test('empty powershell returns object without powershell', () => {
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
			test('preserves both command and bash', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'direct-command',
					bash: 'bash-script.sh'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'direct-command',
					bash: 'bash-script.sh',
					cwd: workspaceRoot
				});
			});

			test('preserves both command and powershell', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'direct-command',
					powershell: 'ps-script.ps1'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'direct-command',
					powershell: 'ps-script.ps1',
					cwd: workspaceRoot
				});
			});

			test('preserves both bash and powershell when no command', () => {
				const result = resolveHookCommand({
					type: 'command',
					bash: 'bash-script.sh',
					powershell: 'ps-script.ps1'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					bash: 'bash-script.sh',
					powershell: 'ps-script.ps1',
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

			test('no command/bash/powershell returns object with just type and cwd', () => {
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

			test('ignores non-number timeoutSec', () => {
				const result = resolveHookCommand({
					type: 'command',
					command: 'echo hello',
					timeoutSec: '30'
				}, workspaceRoot, userHome);
				assert.deepStrictEqual(result, {
					type: 'command',
					command: 'echo hello',
					cwd: workspaceRoot
				});
			});
		});
	});
});
