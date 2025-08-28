/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectsCommonPromptPattern, detectsFastResponsePattern } from '../../browser/executeStrategy/executeStrategy.js';

suite('Execute Strategy - Prompt Detection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detectsCommonPromptPattern should detect PowerShell prompts', () => {
		strictEqual(detectsCommonPromptPattern('PS C:\\>').detected, true);
		strictEqual(detectsCommonPromptPattern('PS C:\\Windows\\System32>').detected, true);
		strictEqual(detectsCommonPromptPattern('PS C:\\Users\\test> ').detected, true);
	});

	test('detectsCommonPromptPattern should detect Command Prompt', () => {
		strictEqual(detectsCommonPromptPattern('C:\\>').detected, true);
		strictEqual(detectsCommonPromptPattern('C:\\Windows\\System32>').detected, true);
		strictEqual(detectsCommonPromptPattern('D:\\test> ').detected, true);
	});

	test('detectsCommonPromptPattern should detect Bash prompts', () => {
		strictEqual(detectsCommonPromptPattern('user@host:~$ ').detected, true);
		strictEqual(detectsCommonPromptPattern('$ ').detected, true);
		strictEqual(detectsCommonPromptPattern('[user@host ~]$ ').detected, true);
	});

	test('detectsCommonPromptPattern should detect root prompts', () => {
		strictEqual(detectsCommonPromptPattern('root@host:~# ').detected, true);
		strictEqual(detectsCommonPromptPattern('# ').detected, true);
		strictEqual(detectsCommonPromptPattern('[root@host ~]# ').detected, true);
	});

	test('detectsCommonPromptPattern should detect Python REPL', () => {
		strictEqual(detectsCommonPromptPattern('>>> ').detected, true);
		strictEqual(detectsCommonPromptPattern('>>>').detected, true);
	});

	test('detectsCommonPromptPattern should detect starship prompts', () => {
		strictEqual(detectsCommonPromptPattern('~ \u276f ').detected, true);
		strictEqual(detectsCommonPromptPattern('/path/to/project \u276f').detected, true);
	});

	test('detectsCommonPromptPattern should detect generic prompts', () => {
		strictEqual(detectsCommonPromptPattern('test> ').detected, true);
		strictEqual(detectsCommonPromptPattern('someprompt% ').detected, true);
	});

	test('detectsCommonPromptPattern should detect colon prompts', () => {
		strictEqual(detectsCommonPromptPattern('Enter password: ').detected, true);
		strictEqual(detectsCommonPromptPattern('Choose an option: ').detected, true);
		strictEqual(detectsCommonPromptPattern('command: ').detected, true);
	});

	test('detectsCommonPromptPattern should detect confirmation prompts', () => {
		strictEqual(detectsCommonPromptPattern('Continue? (y/N): ').detected, true);
		strictEqual(detectsCommonPromptPattern('Overwrite file? [Y/n]: ').detected, true);
		strictEqual(detectsCommonPromptPattern('Are you sure? (Y/N): ').detected, true);
		strictEqual(detectsCommonPromptPattern('Delete files? [y/N]: ').detected, true);
	});

	test('detectsCommonPromptPattern should handle multiline content', () => {
		const multilineContent = `command output line 1
command output line 2
user@host:~$ `;
		strictEqual(detectsCommonPromptPattern(multilineContent).detected, true);
	});

	test('detectsCommonPromptPattern should reject non-prompt content', () => {
		strictEqual(detectsCommonPromptPattern('just some output').detected, false);
		strictEqual(detectsCommonPromptPattern('error: command not found').detected, false);
		strictEqual(detectsCommonPromptPattern('').detected, false);
		strictEqual(detectsCommonPromptPattern('   ').detected, false);
	});

	test('detectsCommonPromptPattern should handle edge cases', () => {
		strictEqual(detectsCommonPromptPattern('output\n\n\n').detected, false);
		strictEqual(detectsCommonPromptPattern('\n\n$ \n\n').detected, true); // prompt with surrounding whitespace
		strictEqual(detectsCommonPromptPattern('output\nPS C:\\> ').detected, true); // prompt at end after output
	});
});

suite('Execute Strategy - Fast Response Pattern Detection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detectsFastResponsePattern should detect colon prompts', () => {
		strictEqual(detectsFastResponsePattern('Enter password: ').detected, true);
		strictEqual(detectsFastResponsePattern('Choose an option: ').detected, true);
		strictEqual(detectsFastResponsePattern('command: ').detected, true);
		strictEqual(detectsFastResponsePattern('Username: ').detected, true);
	});

	test('detectsFastResponsePattern should detect confirmation prompts with parentheses', () => {
		strictEqual(detectsFastResponsePattern('Continue? (y/N): ').detected, true);
		strictEqual(detectsFastResponsePattern('Overwrite file? (Y/n): ').detected, true);
		strictEqual(detectsFastResponsePattern('Are you sure? (Y/N): ').detected, true);
		strictEqual(detectsFastResponsePattern('Delete files? (y/N): ').detected, true);
	});

	test('detectsFastResponsePattern should detect confirmation prompts with brackets', () => {
		strictEqual(detectsFastResponsePattern('Continue? [y/N]: ').detected, true);
		strictEqual(detectsFastResponsePattern('Overwrite file? [Y/n]: ').detected, true);
		strictEqual(detectsFastResponsePattern('Are you sure? [Y/N]: ').detected, true);
		strictEqual(detectsFastResponsePattern('Delete files? [y/N]: ').detected, true);
	});

	test('detectsFastResponsePattern should detect confirmation prompts without colon', () => {
		strictEqual(detectsFastResponsePattern('Continue? (y/N)').detected, true);
		strictEqual(detectsFastResponsePattern('Overwrite file? [Y/n]').detected, true);
		strictEqual(detectsFastResponsePattern('Are you sure? (Y/N)').detected, true);
		strictEqual(detectsFastResponsePattern('Delete files? [y/N]').detected, true);
	});

	test('detectsFastResponsePattern should reject non-fast-response content', () => {
		strictEqual(detectsFastResponsePattern('user@host:~$ ').detected, false);
		strictEqual(detectsFastResponsePattern('PS C:\\>').detected, false);
		strictEqual(detectsFastResponsePattern('just some output').detected, false);
		strictEqual(detectsFastResponsePattern('error: command not found').detected, false);
		strictEqual(detectsFastResponsePattern('').detected, false);
		strictEqual(detectsFastResponsePattern('   ').detected, false);
	});

	test('detectsFastResponsePattern should handle edge cases', () => {
		strictEqual(detectsFastResponsePattern('output\n\n\n').detected, false);
		strictEqual(detectsFastResponsePattern('\n\nEnter choice: \n\n').detected, true); // prompt with surrounding whitespace
		strictEqual(detectsFastResponsePattern('output\nContinue? (y/N): ').detected, true); // prompt at end after output
	});
});
