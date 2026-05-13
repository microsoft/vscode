/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectsCommonPromptPattern, isContinuationPrompt } from '../../browser/executeStrategy/executeStrategy.js';

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

	test('detectsCommonPromptPattern should reject shell continuation prompts', () => {
		strictEqual(detectsCommonPromptPattern('dquote>').detected, false);
		strictEqual(detectsCommonPromptPattern('dquote> ').detected, false);
		strictEqual(detectsCommonPromptPattern('quote>').detected, false);
		strictEqual(detectsCommonPromptPattern('bquote>').detected, false);
		strictEqual(detectsCommonPromptPattern('pipe>').detected, false);
		strictEqual(detectsCommonPromptPattern('heredoc>').detected, false);
		strictEqual(detectsCommonPromptPattern('cmdsubst>').detected, false);
	});
});

suite('Execute Strategy - Continuation Prompt Detection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isContinuationPrompt should detect zsh continuation prompts', () => {
		strictEqual(isContinuationPrompt('dquote>'), true);
		strictEqual(isContinuationPrompt('dquote> '), true);
		strictEqual(isContinuationPrompt('quote>'), true);
		strictEqual(isContinuationPrompt('bquote>'), true);
		strictEqual(isContinuationPrompt('pipe>'), true);
		strictEqual(isContinuationPrompt('heredoc>'), true);
		strictEqual(isContinuationPrompt('cmdsubst>'), true);
	});

	test('isContinuationPrompt should handle whitespace', () => {
		strictEqual(isContinuationPrompt('  dquote>  '), true);
		strictEqual(isContinuationPrompt('\tdquote>\t'), true);
	});

	test('isContinuationPrompt should reject normal prompts', () => {
		strictEqual(isContinuationPrompt('$ '), false);
		strictEqual(isContinuationPrompt('# '), false);
		strictEqual(isContinuationPrompt('user@host:~$ '), false);
		strictEqual(isContinuationPrompt('PS C:\\>'), false);
	});

	test('isContinuationPrompt should reject command output', () => {
		strictEqual(isContinuationPrompt('some output'), false);
		strictEqual(isContinuationPrompt('error: command not found'), false);
		strictEqual(isContinuationPrompt(''), false);
		strictEqual(isContinuationPrompt('   '), false);
	});

	test('isContinuationPrompt should reject partial matches', () => {
		strictEqual(isContinuationPrompt('some dquote>'), false);
		strictEqual(isContinuationPrompt('dquote> some text'), false);
	});
});
