"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const node_assert_1 = require("node:assert");
const tokens_1 = require("../tokens");
suite('Terminal Suggest', () => {
    test('simple command', () => {
        (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo', cursorIndex: 'echo'.length }, undefined), 0 /* TokenType.Command */);
    });
    test('simple argument', () => {
        (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello', cursorIndex: 'echo hello'.length }, undefined), 1 /* TokenType.Argument */);
    });
    test('simple command, cursor mid text', () => {
        (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello', cursorIndex: 'echo'.length }, undefined), 0 /* TokenType.Command */);
    });
    test('simple argument, cursor mid text', () => {
        (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello', cursorIndex: 'echo hel'.length }, undefined), 1 /* TokenType.Argument */);
    });
    suite('reset to command', () => {
        test('|', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello | ', cursorIndex: 'echo hello | '.length }, undefined), 0 /* TokenType.Command */);
        });
        test(';', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; ', cursorIndex: 'echo hello; '.length }, undefined), 0 /* TokenType.Command */);
        });
        test('&&', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && ', cursorIndex: 'echo hello && '.length }, undefined), 0 /* TokenType.Command */);
        });
        test('||', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello || ', cursorIndex: 'echo hello || '.length }, undefined), 0 /* TokenType.Command */);
        });
    });
    suite('pwsh', () => {
        test('simple command', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'Write-Host', cursorIndex: 'Write-Host'.length }, "pwsh" /* TerminalShellType.PowerShell */), 0 /* TokenType.Command */);
        });
        test('simple argument', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'Write-Host hello', cursorIndex: 'Write-Host hello'.length }, "pwsh" /* TerminalShellType.PowerShell */), 1 /* TokenType.Argument */);
        });
        test('reset char', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: `Write-Host hello -and `, cursorIndex: `Write-Host hello -and `.length }, "pwsh" /* TerminalShellType.PowerShell */), 0 /* TokenType.Command */);
        });
        test('arguments after reset char', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: `Write-Host hello -and $true `, cursorIndex: `Write-Host hello -and $true `.length }, "pwsh" /* TerminalShellType.PowerShell */), 1 /* TokenType.Argument */);
        });
        test('; reset char', () => {
            (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: `Write-Host hello; `, cursorIndex: `Write-Host hello; `.length }, "pwsh" /* TerminalShellType.PowerShell */), 0 /* TokenType.Command */);
        });
        suite('multiple commands on the line', () => {
            test('multiple commands, cursor at end', () => {
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && ech'.length }, undefined), 0 /* TokenType.Command */);
                // Bash
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && ech'.length }, "bash" /* TerminalShellType.Bash */), 0 /* TokenType.Command */);
                // Zsh
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && ech'.length }, "zsh" /* TerminalShellType.Zsh */), 0 /* TokenType.Command */);
                // Fish (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; ech'.length }, "fish" /* TerminalShellType.Fish */), 0 /* TokenType.Command */);
                // PowerShell (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; ech'.length }, "pwsh" /* TerminalShellType.PowerShell */), 0 /* TokenType.Command */);
            });
            test('multiple commands, cursor mid text', () => {
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && echo w'.length }, undefined), 1 /* TokenType.Argument */);
                // Bash
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && echo w'.length }, "bash" /* TerminalShellType.Bash */), 1 /* TokenType.Argument */);
                // Zsh
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world', cursorIndex: 'echo hello && echo w'.length }, "zsh" /* TerminalShellType.Zsh */), 1 /* TokenType.Argument */);
                // Fish (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; echo w'.length }, "fish" /* TerminalShellType.Fish */), 1 /* TokenType.Argument */);
                // PowerShell (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world', cursorIndex: 'echo hello; echo w'.length }, "pwsh" /* TerminalShellType.PowerShell */), 1 /* TokenType.Argument */);
            });
            test('multiple commands, cursor at end with reset char', () => {
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo world; '.length }, undefined), 0 /* TokenType.Command */);
                // Bash
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo world; '.length }, "bash" /* TerminalShellType.Bash */), 0 /* TokenType.Command */);
                // Zsh
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo world; '.length }, "zsh" /* TerminalShellType.Zsh */), 0 /* TokenType.Command */);
                // Fish (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo world; '.length }, "fish" /* TerminalShellType.Fish */), 0 /* TokenType.Command */);
                // PowerShell (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo world; '.length }, "pwsh" /* TerminalShellType.PowerShell */), 0 /* TokenType.Command */);
            });
            test('multiple commands, cursor mid text with reset char', () => {
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo worl'.length }, undefined), 1 /* TokenType.Argument */);
                // Bash
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo worl'.length }, "bash" /* TerminalShellType.Bash */), 1 /* TokenType.Argument */);
                // Zsh
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello && echo world; ', cursorIndex: 'echo hello && echo worl'.length }, "zsh" /* TerminalShellType.Zsh */), 1 /* TokenType.Argument */);
                // Fish (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo worl'.length }, "fish" /* TerminalShellType.Fish */), 1 /* TokenType.Argument */);
                // PowerShell (use ';' as separator)
                (0, node_assert_1.strictEqual)((0, tokens_1.getTokenType)({ commandLine: 'echo hello; echo world; ', cursorIndex: 'echo hello; echo worl'.length }, "pwsh" /* TerminalShellType.PowerShell */), 1 /* TokenType.Argument */);
            });
        });
    });
});
//# sourceMappingURL=tokens.test.js.map