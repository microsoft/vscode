"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ansiColorMap = exports.ansiColorIdentifiers = void 0;
exports.ansiColorIdentifiers = [];
exports.ansiColorMap = {
    'terminal.ansiBlack': {
        index: 0,
    },
    'terminal.ansiRed': {
        index: 1,
    },
    'terminal.ansiGreen': {
        index: 2,
    },
    'terminal.ansiYellow': {
        index: 3,
    },
    'terminal.ansiBlue': {
        index: 4,
    },
    'terminal.ansiMagenta': {
        index: 5,
    },
    'terminal.ansiCyan': {
        index: 6,
    },
    'terminal.ansiWhite': {
        index: 7,
    },
    'terminal.ansiBrightBlack': {
        index: 8,
    },
    'terminal.ansiBrightRed': {
        index: 9,
    },
    'terminal.ansiBrightGreen': {
        index: 10,
    },
    'terminal.ansiBrightYellow': {
        index: 11,
    },
    'terminal.ansiBrightBlue': {
        index: 12,
    },
    'terminal.ansiBrightMagenta': {
        index: 13,
    },
    'terminal.ansiBrightCyan': {
        index: 14,
    },
    'terminal.ansiBrightWhite': {
        index: 15,
    }
};
for (const id in exports.ansiColorMap) {
    const entry = exports.ansiColorMap[id];
    const colorName = id.substring(13);
    exports.ansiColorIdentifiers[entry.index] = { colorName, colorValue: 'var(--vscode-' + id.replace('.', '-') + ')' };
}
//# sourceMappingURL=colorMap.js.map