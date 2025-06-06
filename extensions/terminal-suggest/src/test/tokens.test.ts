/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { strictEqual } from 'node:assert';
import { getTokenType, TokenType } from '../tokens';
import { TerminalShellType } from '../terminalSuggestMain';

suite('Terminal Suggest', () => {
	test('simple command', () => {
		strictEqual(getTokenType({ commandLine: 'echo', cursorPosition: 'echo'.length }, undefined), TokenType.Command);
	});
	test('simple argument', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorPosition: 'echo hello'.length }, undefined), TokenType.Argument);
	});
	test('simple command, cursor mid text', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorPosition: 'echo'.length }, undefined), TokenType.Command);
	});
	test('simple argument, cursor mid text', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorPosition: 'echo hel'.length }, undefined), TokenType.Argument);
	});
	suite('reset to command', () => {
		test('|', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello | ', cursorPosition: 'echo hello | '.length }, undefined), TokenType.Command);
		});
		test(';', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello; ', cursorPosition: 'echo hello; '.length }, undefined), TokenType.Command);
		});
		test('&&', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello && ', cursorPosition: 'echo hello && '.length }, undefined), TokenType.Command);
		});
		test('||', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello || ', cursorPosition: 'echo hello || '.length }, undefined), TokenType.Command);
		});
	});
	suite('multi-command scenarios', () => {
		test('command after pipe without space', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git |', cursorPosition: 'ls && git |'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('command after simple pipe', () => {
			strictEqual(getTokenType({ commandLine: 'git |', cursorPosition: 'git |'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('partial command after separator', () => {
			strictEqual(getTokenType({ commandLine: 'echo a ; echo', cursorPosition: 'echo a ; echo'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('cursor right after separator', () => {
			strictEqual(getTokenType({ commandLine: 'echo a ; ', cursorPosition: 'echo a ; '.length }, TerminalShellType.Bash), TokenType.Command);
		});
	});
	suite('pwsh', () => {
		test('simple command', () => {
			strictEqual(getTokenType({ commandLine: 'Write-Host', cursorPosition: 'Write-Host'.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('simple argument', () => {
			strictEqual(getTokenType({ commandLine: 'Write-Host hello', cursorPosition: 'Write-Host hello'.length }, TerminalShellType.PowerShell), TokenType.Argument);
		});
		test('reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello -and `, cursorPosition: `Write-Host hello -and `.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('arguments after reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello -and $true `, cursorPosition: `Write-Host hello -and $true `.length }, TerminalShellType.PowerShell), TokenType.Argument);
		});
		test('semicolon separator', () => {
			strictEqual(getTokenType({ commandLine: 'echo a ; ', cursorPosition: 'echo a ; '.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('command after semicolon', () => {
			strictEqual(getTokenType({ commandLine: 'echo a ; echo', cursorPosition: 'echo a ; echo'.length }, TerminalShellType.PowerShell), TokenType.Argument);
		});
	});
});
