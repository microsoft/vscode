/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectsCommonPromptPattern, detectsInputRequiredPattern } from '../../browser/executeStrategy/executeStrategy.js';

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
	suite('detectsInputRequiredPattern', () => {
		test('detects yes/no confirmation prompts (pairs and variants)', () => {
			strictEqual(detectsInputRequiredPattern('Continue? (y/N) '), true);
			strictEqual(detectsInputRequiredPattern('Continue? (y/n) '), true);
			strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] '), true);
			strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) '), true);
			strictEqual(detectsInputRequiredPattern('Delete files? [y/N] '), true);
			strictEqual(detectsInputRequiredPattern('Proceed? (yes/no) '), true);
			strictEqual(detectsInputRequiredPattern('Proceed? [no/yes] '), true);
			strictEqual(detectsInputRequiredPattern('Continue? y/n '), true);
			strictEqual(detectsInputRequiredPattern('Overwrite: yes/no '), true);

			// No match if there's a response already
			strictEqual(detectsInputRequiredPattern('Continue? (y/N) y'), false);
			strictEqual(detectsInputRequiredPattern('Continue? (y/n) n'), false);
			strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] N'), false);
			strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) Y'), false);
			strictEqual(detectsInputRequiredPattern('Delete files? [y/N] y'), false);
			strictEqual(detectsInputRequiredPattern('Continue? y/n y\/n'), false);
			strictEqual(detectsInputRequiredPattern('Overwrite: yes/no yes\/n'), false);
		});

		test('detects PowerShell multi-option confirmation line', () => {
			strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): '),
				true
			);
			// also matches without default suffix
			strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [N] No '),
				true
			);

			// No match if there's a response already
			strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): Y'),
				false
			);
			strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [N] No N'),
				false
			);
		});
		test('Line ends with colon', () => {
			strictEqual(detectsInputRequiredPattern('Enter your name: '), true);
			strictEqual(detectsInputRequiredPattern('Password: '), true);
			strictEqual(detectsInputRequiredPattern('File to overwrite: '), true);
		});
	});
});
