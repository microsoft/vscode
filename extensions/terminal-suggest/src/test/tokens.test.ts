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
		strictEqual(getTokenType({ commandLine: 'echo', cursorIndex: 'echo'.length }, undefined), TokenType.Command);
	});
	test('simple argument', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorIndex: 'echo hello'.length }, undefined), TokenType.Argument);
	});
	test('simple command, cursor mid text', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorIndex: 'echo'.length }, undefined), TokenType.Command);
	});
	test('simple argument, cursor mid text', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorIndex: 'echo hel'.length }, undefined), TokenType.Argument);
	});
	suite('reset to command', () => {
		test('|', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello | ', cursorIndex: 'echo hello | '.length }, undefined), TokenType.Command);
		});
		test(';', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello; ', cursorIndex: 'echo hello; '.length }, undefined), TokenType.Command);
		});
		test('&&', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello && ', cursorIndex: 'echo hello && '.length }, undefined), TokenType.Command);
		});
		test('||', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello || ', cursorIndex: 'echo hello || '.length }, undefined), TokenType.Command);
		});
	});
	suite('pwsh', () => {
		test('simple command', () => {
			strictEqual(getTokenType({ commandLine: 'Write-Host', cursorIndex: 'Write-Host'.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('simple argument', () => {
			strictEqual(getTokenType({ commandLine: 'Write-Host hello', cursorIndex: 'Write-Host hello'.length }, TerminalShellType.PowerShell), TokenType.Argument);
		});
		test('reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello -and `, cursorIndex: `Write-Host hello -and `.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('arguments after reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello -and $true `, cursorIndex: `Write-Host hello -and $true `.length }, TerminalShellType.PowerShell), TokenType.Argument);
		});
		test('; reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello; `, cursorIndex: `Write-Host hello; `.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		suite('multiple commands on the line', () => {
			test('multiple commands, cursor at end', () => {
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && ech'.length }, undefined), TokenType.Command);
				// Bash
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && ech'.length }, TerminalShellType.Bash), TokenType.Command);
				// Zsh
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && ech'.length }, TerminalShellType.Zsh), TokenType.Command);
				// Fish (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; ech'.length }, TerminalShellType.Fish), TokenType.Command);
				// PowerShell (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; ech'.length }, TerminalShellType.PowerShell), TokenType.Command);
			});
			test('multiple commands, cursor mid text', () => {
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && echo w'.length }, undefined), TokenType.Argument);
				// Bash
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && echo w'.length }, TerminalShellType.Bash), TokenType.Argument);
				// Zsh
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && echo w'.length }, TerminalShellType.Zsh), TokenType.Argument);
				// Fish (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; echo w'.length }, TerminalShellType.Fish), TokenType.Argument);
				// PowerShell (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; echo w'.length }, TerminalShellType.PowerShell), TokenType.Argument);
			});
			test('multiple commands, cursor at end with reset char', () => {
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo world; '.length }, undefined), TokenType.Command);
				// Bash
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo world; '.length }, TerminalShellType.Bash), TokenType.Command);
				// Zsh
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo world; '.length }, TerminalShellType.Zsh), TokenType.Command);
				// Fish (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo world; '.length }, TerminalShellType.Fish), TokenType.Command);
				// PowerShell (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo world; '.length }, TerminalShellType.PowerShell), TokenType.Command);
			});
			test('multiple commands, cursor mid text with reset char', () => {
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo worl'.length }, undefined), TokenType.Argument);
				// Bash
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo worl'.length }, TerminalShellType.Bash), TokenType.Argument);
				// Zsh
				strictEqual(getTokenType({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo worl'.length }, TerminalShellType.Zsh), TokenType.Argument);
				// Fish (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo worl'.length }, TerminalShellType.Fish), TokenType.Argument);
				// PowerShell (use ';' as separator)
				strictEqual(getTokenType({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo worl'.length }, TerminalShellType.PowerShell), TokenType.Argument);
			});
		});
	});
});
