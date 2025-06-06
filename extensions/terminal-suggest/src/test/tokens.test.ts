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
		test('cursor immediately after pipe (no suggestions)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git |', cursorPosition: 'ls && git |'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('cursor immediately after simple pipe (no suggestions)', () => {
			strictEqual(getTokenType({ commandLine: 'git |', cursorPosition: 'git |'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('partial command after separator', () => {
			strictEqual(getTokenType({ commandLine: 'echo a ; echo', cursorPosition: 'echo a ; echo'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('cursor right after separator', () => {
			strictEqual(getTokenType({ commandLine: 'echo a ; ', cursorPosition: 'echo a ; '.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('command after double ampersand', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git', cursorPosition: 'ls && git'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('argument after command in multi-command', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git add', cursorPosition: 'ls && git add'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('cursor in middle of command after separator', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git add', cursorPosition: 'ls && gi'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('cursor in argument after separator', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git add file', cursorPosition: 'ls && git add fi'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
	});
	suite('separator whitespace requirements', () => {
		test('separator with space → command suggestions', () => {
			strictEqual(getTokenType({ commandLine: 'git commit ; ', cursorPosition: 'git commit ; '.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('separator without space → no command suggestions', () => {
			strictEqual(getTokenType({ commandLine: 'git commit;', cursorPosition: 'git commit;'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('separator with space then text → command context', () => {
			strictEqual(getTokenType({ commandLine: 'git commit ; echo', cursorPosition: 'git commit ; echo'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('ampersand separator with space', () => {
			strictEqual(getTokenType({ commandLine: 'ls && ', cursorPosition: 'ls && '.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('ampersand separator without space', () => {
			strictEqual(getTokenType({ commandLine: 'ls &&', cursorPosition: 'ls &&'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('pipe separator with space', () => {
			strictEqual(getTokenType({ commandLine: 'cat file | ', cursorPosition: 'cat file | '.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('pipe separator without space', () => {
			strictEqual(getTokenType({ commandLine: 'cat file|', cursorPosition: 'cat file|'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
	});
	suite('word length heuristics', () => {
		test('short second word → argument (git s)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git s', cursorPosition: 'ls && git s'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('short second word 2 chars → argument (git st)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git st', cursorPosition: 'ls && git st'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('longer second word → argument (git status)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git status', cursorPosition: 'ls && git status'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('multiple words → argument (git status --all)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git status --all', cursorPosition: 'ls && git status --all'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
	});
	suite('single word cursor position', () => {
		test('cursor within single word → command (gi|t)', () => {
			strictEqual(getTokenType({ commandLine: 'git', cursorPosition: 'gi'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('cursor at end of word with space → argument (git |)', () => {
			strictEqual(getTokenType({ commandLine: 'git ', cursorPosition: 'git '.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('cursor within word after separator → command (ls && gi|t)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git', cursorPosition: 'ls && gi'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('cursor after word with space after separator → argument (ls && git |)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git ', cursorPosition: 'ls && git '.length }, TerminalShellType.Bash), TokenType.Argument);
		});
	});
	suite('no spaces after separator', () => {
		test('partial command no spaces → command (ls && git)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && git', cursorPosition: 'ls && git'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('single char after separator → command (ls && g)', () => {
			strictEqual(getTokenType({ commandLine: 'ls && g', cursorPosition: 'ls && g'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('empty after separator with space → command (ls && )', () => {
			strictEqual(getTokenType({ commandLine: 'ls && ', cursorPosition: 'ls && '.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('empty after separator no space → argument (ls &&)', () => {
			strictEqual(getTokenType({ commandLine: 'ls &&', cursorPosition: 'ls &&'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
	});
	suite('shell-specific separators', () => {
		suite('bash/zsh specific', () => {
			test('pipe-and separator |& with space → command', () => {
				strictEqual(getTokenType({ commandLine: 'command |& ', cursorPosition: 'command |& '.length }, TerminalShellType.Bash), TokenType.Command);
			});
			test('pipe-and separator |& without space → argument', () => {
				strictEqual(getTokenType({ commandLine: 'command |&', cursorPosition: 'command |&'.length }, TerminalShellType.Bash), TokenType.Argument);
			});
			test('background & separator with space → command', () => {
				strictEqual(getTokenType({ commandLine: 'sleep 10 & ', cursorPosition: 'sleep 10 & '.length }, TerminalShellType.Bash), TokenType.Command);
			});
		});
		suite('zsh specific', () => {
			test('process substitution <( → command', () => {
				strictEqual(getTokenType({ commandLine: 'diff <( ', cursorPosition: 'diff <( '.length }, TerminalShellType.Zsh), TokenType.Command);
			});
			test('here-string <<< → command', () => {
				strictEqual(getTokenType({ commandLine: 'cat <<< ', cursorPosition: 'cat <<< '.length }, TerminalShellType.Zsh), TokenType.Command);
			});
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
			strictEqual(getTokenType({ commandLine: 'echo a ; echo', cursorPosition: 'echo a ; echo'.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('PowerShell comparison operators', () => {
			strictEqual(getTokenType({ commandLine: 'if ($a -eq $b) -and ', cursorPosition: 'if ($a -eq $b) -and '.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('PowerShell logical operators', () => {
			strictEqual(getTokenType({ commandLine: 'Get-Process -Name chrome -or ', cursorPosition: 'Get-Process -Name chrome -or '.length }, TerminalShellType.PowerShell), TokenType.Command);
		});
		test('PowerShell without space after operator → argument', () => {
			strictEqual(getTokenType({ commandLine: 'test -eq', cursorPosition: 'test -eq'.length }, TerminalShellType.PowerShell), TokenType.Argument);
		});
	});
	suite('command vs argument distinction', () => {
		test('git s → argument (git subcommand)', () => {
			strictEqual(getTokenType({ commandLine: 'git s', cursorPosition: 'git s'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('git st → argument (git subcommand)', () => {
			strictEqual(getTokenType({ commandLine: 'git st', cursorPosition: 'git st'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('git status → argument (git subcommand)', () => {
			strictEqual(getTokenType({ commandLine: 'git status', cursorPosition: 'git status'.length }, TerminalShellType.Bash), TokenType.Argument);
		});
		test('git → command (only command)', () => {
			strictEqual(getTokenType({ commandLine: 'git', cursorPosition: 'git'.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('git → argument (with trailing space)', () => {
			strictEqual(getTokenType({ commandLine: 'git ', cursorPosition: 'git '.length }, TerminalShellType.Bash), TokenType.Argument);
		});
	});
	suite('edge cases and fallbacks', () => {
		test('undefined shell type uses default', () => {
			strictEqual(getTokenType({ commandLine: 'ls && ', cursorPosition: 'ls && '.length }, undefined), TokenType.Command);
		});
		test('empty command line → command', () => {
			strictEqual(getTokenType({ commandLine: '', cursorPosition: 0 }, TerminalShellType.Bash), TokenType.Command);
		});
		test('whitespace only → command', () => {
			strictEqual(getTokenType({ commandLine: '   ', cursorPosition: 3 }, TerminalShellType.Bash), TokenType.Command);
		});
		test('cursor at beginning → command', () => {
			strictEqual(getTokenType({ commandLine: 'git status', cursorPosition: 0 }, TerminalShellType.Bash), TokenType.Command);
		});
		test('complex multi-separator scenario', () => {
			strictEqual(getTokenType({ commandLine: 'ls | grep test && echo found; ', cursorPosition: 'ls | grep test && echo found; '.length }, TerminalShellType.Bash), TokenType.Command);
		});
		test('nested separators with command context', () => {
			strictEqual(getTokenType({ commandLine: 'if test; then echo; fi && git', cursorPosition: 'if test; then echo; fi && git'.length }, TerminalShellType.Bash), TokenType.Command);
		});
	});
});
