/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectsCommonPromptPattern, detectsGenericPressAnyKeyPattern, detectsHighConfidenceInputPattern, detectsInputRequiredPattern, detectsLikelyInputRequiredPattern, detectsNonInteractiveHelpPattern, detectsVSCodeTaskFinishMessage } from '../../browser/tools/promptDetection.js';

suite('promptDetection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('detectsCommonPromptPattern', () => {
		test('detects bash prompts', () => {
			strictEqual(detectsCommonPromptPattern('user@host:~$ ').detected, true);
			strictEqual(detectsCommonPromptPattern('$ ').detected, true);
			strictEqual(detectsCommonPromptPattern('[user@host ~]$ ').detected, true);
		});

		test('detects zsh prompts', () => {
			strictEqual(detectsCommonPromptPattern('user@host ~ % ').detected, true);
			strictEqual(detectsCommonPromptPattern('host% ').detected, true);
		});

		test('detects fish prompts', () => {
			strictEqual(detectsCommonPromptPattern('user@host ~> ').detected, true);
			strictEqual(detectsCommonPromptPattern('user@host /c/repo> ').detected, true);
		});

		test('detects pwsh prompts', () => {
			strictEqual(detectsCommonPromptPattern('PS C:\\>').detected, true);
			strictEqual(detectsCommonPromptPattern('PS C:\\Windows\\System32>').detected, true);
			strictEqual(detectsCommonPromptPattern('PS C:\\Users\\test> ').detected, true);
		});

		test('detects cmd prompts', () => {
			strictEqual(detectsCommonPromptPattern('C:\\>').detected, true);
			strictEqual(detectsCommonPromptPattern('C:\\Windows\\System32>').detected, true);
			strictEqual(detectsCommonPromptPattern('D:\\test> ').detected, true);
		});

		test('detects root prompts', () => {
			strictEqual(detectsCommonPromptPattern('root@host:~# ').detected, true);
			strictEqual(detectsCommonPromptPattern('# ').detected, true);
			strictEqual(detectsCommonPromptPattern('[root@host ~]# ').detected, true);
		});

		test('detects Python REPL prompts', () => {
			strictEqual(detectsCommonPromptPattern('>>> ').detected, true);
			strictEqual(detectsCommonPromptPattern('>>>').detected, true);
		});

		test('detects starship prompts', () => {
			strictEqual(detectsCommonPromptPattern('~ ❯ ').detected, true);
			strictEqual(detectsCommonPromptPattern('/path/to/project ❯').detected, true);
		});

		test('detects debugger REPL prompts', () => {
			strictEqual(detectsCommonPromptPattern('(Pdb)').detected, true);
			strictEqual(detectsCommonPromptPattern('(Pdb) ').detected, true);
			strictEqual(detectsCommonPromptPattern('(gdb) ').detected, true);
			strictEqual(detectsCommonPromptPattern('(lldb) ').detected, true);
			strictEqual(detectsCommonPromptPattern('ipdb> ').detected, true);
		});

		test('provides a specific reason for the first matching pattern', () => {
			strictEqual(detectsCommonPromptPattern('PS C:\\> ').reason, 'PowerShell prompt pattern detected: "PS C:\\> "');
			strictEqual(detectsCommonPromptPattern('(Pdb) ').reason, 'Debugger REPL prompt pattern detected: "(Pdb) "');
		});

		test('rejects non-prompt content', () => {
			strictEqual(detectsCommonPromptPattern('just some output').detected, false);
			strictEqual(detectsCommonPromptPattern('error: command not found').detected, false);
			strictEqual(detectsCommonPromptPattern('').detected, false);
			strictEqual(detectsCommonPromptPattern('   ').detected, false);
			strictEqual(detectsCommonPromptPattern('(Pdb) some output after').detected, false);
		});
	});

	suite('detectsInputRequiredPattern', () => {
		test('detects yes/no confirmation prompts', () => {
			strictEqual(detectsInputRequiredPattern('Continue? (y/n) '), true);
			strictEqual(detectsInputRequiredPattern('Overwrite? [Y/n] '), true);
			strictEqual(detectsInputRequiredPattern('Proceed? (yes/no) '), true);
			strictEqual(detectsInputRequiredPattern('Do you want to continue? [y/N] '), true);
		});

		test('detects password prompts', () => {
			strictEqual(detectsInputRequiredPattern('Password:'), true);
			strictEqual(detectsInputRequiredPattern('Password: '), true);
			strictEqual(detectsInputRequiredPattern('[sudo] password for user:'), true);
		});

		test('detects press any key prompts', () => {
			strictEqual(detectsInputRequiredPattern('Press any key to continue...'), true);
			strictEqual(detectsInputRequiredPattern('press a key'), true);
		});

		test('detects debugger REPL prompts as input required', () => {
			strictEqual(detectsInputRequiredPattern('(Pdb) '), true);
			strictEqual(detectsInputRequiredPattern('(gdb) '), true);
			strictEqual(detectsInputRequiredPattern('(lldb)'), true);
		});

		test('detects pager end markers', () => {
			strictEqual(detectsInputRequiredPattern('(END)'), true);
		});

		test('detects prompts with parenthesized default values', () => {
			strictEqual(detectsInputRequiredPattern('package name: (test_npm_init) '), true);
			strictEqual(detectsInputRequiredPattern('version: (1.0.0) '), true);
		});

		test('rejects normal command output', () => {
			strictEqual(detectsInputRequiredPattern('Compiling module foo'), false);
			strictEqual(detectsInputRequiredPattern('Done in 3.2s'), false);
			strictEqual(detectsInputRequiredPattern('Last Command: '), false);
			strictEqual(detectsInputRequiredPattern('[INFO] Starting: '), false);
			// git-aware shell prompts must not match the parenthesized-default pattern
			strictEqual(detectsInputRequiredPattern('[user@host ~/myrepo (main)]$ '), false);
		});
	});

	suite('detectsLikelyInputRequiredPattern', () => {
		test('includes all high-confidence patterns', () => {
			strictEqual(detectsLikelyInputRequiredPattern('Continue? (y/n) '), true);
			strictEqual(detectsLikelyInputRequiredPattern('Password:'), true);
		});

		test('additionally matches broad trailing colon/question heuristics', () => {
			strictEqual(detectsLikelyInputRequiredPattern('Enter your name: '), true);
			strictEqual(detectsLikelyInputRequiredPattern('Continue? '), true);
			// but the same lines are not high-confidence
			strictEqual(detectsInputRequiredPattern('Enter your name: '), false);
			strictEqual(detectsInputRequiredPattern('Continue? '), false);
		});

		test('rejects lines without trailing space', () => {
			strictEqual(detectsLikelyInputRequiredPattern('header:'), false);
			strictEqual(detectsLikelyInputRequiredPattern('what?'), false);
		});
	});

	suite('detectsNonInteractiveHelpPattern', () => {
		test('detects help hints from long-running processes', () => {
			strictEqual(detectsNonInteractiveHelpPattern('press h to show help'), true);
			strictEqual(detectsNonInteractiveHelpPattern('press h + enter to show help'), true);
			strictEqual(detectsNonInteractiveHelpPattern('press ? for commands'), true);
			strictEqual(detectsNonInteractiveHelpPattern('press r to restart the server'), true);
			strictEqual(detectsNonInteractiveHelpPattern('press q to quit'), true);
			strictEqual(detectsNonInteractiveHelpPattern('press u to show urls'), true);
			strictEqual(detectsNonInteractiveHelpPattern('press o to open in the browser'), true);
		});

		test('rejects unrelated output', () => {
			strictEqual(detectsNonInteractiveHelpPattern('Compiled successfully'), false);
			strictEqual(detectsNonInteractiveHelpPattern('Press any key to continue...'), false);
		});
	});

	suite('detectsVSCodeTaskFinishMessage', () => {
		test('detects task finish messages', () => {
			strictEqual(detectsVSCodeTaskFinishMessage('Terminal will be reused by tasks, press any key to close it.'), true);
			strictEqual(detectsVSCodeTaskFinishMessage(' *  Terminal will be reused by tasks, press any key to close it. '), true);
			strictEqual(detectsVSCodeTaskFinishMessage('Press any key to close the terminal.'), true);
		});

		test('is tolerant to line wrapping that splits words', () => {
			strictEqual(detectsVSCodeTaskFinishMessage('Terminal will be reused by tasks, press any key t\no close it.'), true);
		});

		test('rejects generic press any key prompts', () => {
			strictEqual(detectsVSCodeTaskFinishMessage('Press any key to continue...'), false);
		});
	});

	suite('detectsGenericPressAnyKeyPattern', () => {
		test('detects generic press any key prompts', () => {
			strictEqual(detectsGenericPressAnyKeyPattern('Press any key to continue...'), true);
			strictEqual(detectsGenericPressAnyKeyPattern('press a key when ready'), true);
		});

		test('excludes VS Code task finish messages', () => {
			strictEqual(detectsGenericPressAnyKeyPattern('Terminal will be reused by tasks, press any key to close it.'), false);
			strictEqual(detectsGenericPressAnyKeyPattern('Press any key to close the terminal.'), false);
		});
	});

	suite('category consistency', () => {
		test('a prompt that requires input is detected by both views', () => {
			// The two consumers of this module — execute strategies (prompt) and the output
			// monitor (inputRequired) — must agree on debugger REPLs: the command has stopped
			// AND the user needs to act. This was the drift that motivated consolidating the
			// tables (see #309370).
			for (const line of ['(Pdb) ', '(gdb) ', '(lldb) ']) {
				strictEqual(detectsCommonPromptPattern(line).detected, true, `prompt view should detect "${line}"`);
				strictEqual(detectsInputRequiredPattern(line), true, `input view should detect "${line}"`);
			}
		});

		test('press any key is high-confidence input and generic press-any-key', () => {
			strictEqual(detectsHighConfidenceInputPattern('Press any key to continue...'), true);
			strictEqual(detectsGenericPressAnyKeyPattern('Press any key to continue...'), true);
		});
	});
});
