"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultShellTypeResetChars = exports.shellTypeResetChars = void 0;
exports.getTokenType = getTokenType;
exports.shellTypeResetChars = new Map([
    ["bash" /* TerminalShellType.Bash */, ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<']],
    ["zsh" /* TerminalShellType.Zsh */, ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '<>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<', '<<<', '<(']],
    ["pwsh" /* TerminalShellType.PowerShell */, ['>', '>>', '<', '2>', '2>>', '*>', '*>>', '|', ';', ' -and ', ' -or ', ' -not ', '!', '&', ' -eq ', ' -ne ', ' -gt ', ' -lt ', ' -ge ', ' -le ', ' -like ', ' -notlike ', ' -match ', ' -notmatch ', ' -contains ', ' -notcontains ', ' -in ', ' -notin ']]
]);
exports.defaultShellTypeResetChars = exports.shellTypeResetChars.get("bash" /* TerminalShellType.Bash */);
function getTokenType(ctx, shellType) {
    const commandLine = ctx.commandLine;
    const cursorPosition = ctx.cursorIndex;
    const commandResetChars = shellType === undefined ? exports.defaultShellTypeResetChars : exports.shellTypeResetChars.get(shellType) ?? exports.defaultShellTypeResetChars;
    // Check for reset char before the current word
    const beforeCursor = commandLine.substring(0, cursorPosition);
    const wordStart = beforeCursor.lastIndexOf(' ') + 1;
    const beforeWord = commandLine.substring(0, wordStart);
    // Look for " <reset char> " before the word
    for (const resetChar of commandResetChars) {
        const pattern = shellType === "pwsh" /* TerminalShellType.PowerShell */ ? `${resetChar}` : ` ${resetChar} `;
        if (beforeWord.endsWith(pattern)) {
            return 0 /* TokenType.Command */;
        }
    }
    // Fallback to original logic for the very first command
    const spaceIndex = beforeCursor.lastIndexOf(' ');
    if (spaceIndex === -1) {
        return 0 /* TokenType.Command */;
    }
    const previousTokens = beforeCursor.substring(0, spaceIndex + 1).trim();
    if (commandResetChars.some(e => previousTokens.endsWith(e))) {
        return 0 /* TokenType.Command */;
    }
    return 1 /* TokenType.Argument */;
}
//# sourceMappingURL=tokens.js.map