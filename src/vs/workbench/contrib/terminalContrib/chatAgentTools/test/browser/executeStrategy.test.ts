/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectsCommonPromptPattern } from '../../browser/executeStrategy/executeStrategy.js';

suite('Execute Strategy - Prompt Detection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detectsCommonPromptPattern should detect PowerShell prompts', () => {
		strictEqual(detectsCommonPromptPattern('PS C:\\>'), true);
		strictEqual(detectsCommonPromptPattern('PS C:\\Windows\\System32>'), true);
		strictEqual(detectsCommonPromptPattern('PS C:\\Users\\test> '), true);
	});

	test('detectsCommonPromptPattern should detect Command Prompt', () => {
		strictEqual(detectsCommonPromptPattern('C:\\>'), true);
		strictEqual(detectsCommonPromptPattern('C:\\Windows\\System32>'), true);
		strictEqual(detectsCommonPromptPattern('D:\\test> '), true);
	});

	test('detectsCommonPromptPattern should detect Bash prompts', () => {
		strictEqual(detectsCommonPromptPattern('user@host:~$ '), true);
		strictEqual(detectsCommonPromptPattern('$ '), true);
		strictEqual(detectsCommonPromptPattern('[user@host ~]$ '), true);
	});

	test('detectsCommonPromptPattern should detect root prompts', () => {
		strictEqual(detectsCommonPromptPattern('root@host:~# '), true);
		strictEqual(detectsCommonPromptPattern('# '), true);
		strictEqual(detectsCommonPromptPattern('[root@host ~]# '), true);
	});

	test('detectsCommonPromptPattern should detect Python REPL', () => {
		strictEqual(detectsCommonPromptPattern('>>> '), true);
		strictEqual(detectsCommonPromptPattern('>>>'), true);
	});

	test('detectsCommonPromptPattern should detect starship prompts', () => {
		strictEqual(detectsCommonPromptPattern('~ ❯ '), true);
		strictEqual(detectsCommonPromptPattern('/path/to/project ❯'), true);
	});

	test('detectsCommonPromptPattern should detect generic prompts', () => {
		strictEqual(detectsCommonPromptPattern('test> '), true);
		strictEqual(detectsCommonPromptPattern('someprompt% '), true);
	});

	test('detectsCommonPromptPattern should handle multiline content', () => {
		const multilineContent = `command output line 1
command output line 2
user@host:~$ `;
		strictEqual(detectsCommonPromptPattern(multilineContent), true);
	});

	test('detectsCommonPromptPattern should reject non-prompt content', () => {
		strictEqual(detectsCommonPromptPattern('just some output'), false);
		strictEqual(detectsCommonPromptPattern('error: command not found'), false);
		strictEqual(detectsCommonPromptPattern(''), false);
		strictEqual(detectsCommonPromptPattern('   '), false);
	});

	test('detectsCommonPromptPattern should handle edge cases', () => {
		strictEqual(detectsCommonPromptPattern('output\n\n\n'), false);
		strictEqual(detectsCommonPromptPattern('\n\n$ \n\n'), true); // prompt with surrounding whitespace
		strictEqual(detectsCommonPromptPattern('output\nPS C:\\> '), true); // prompt at end after output
	});
});