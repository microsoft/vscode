"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBashGlobals = getBashGlobals;
exports.getBuiltins = getBuiltins;
exports.generateDetailAndDocs = generateDetailAndDocs;
const vscode = __importStar(require("vscode"));
const common_1 = require("./common");
async function getBashGlobals(options, existingCommands) {
    return [
        ...await getAliases(options),
        ...await getBuiltins(options, 'compgen -b', existingCommands)
    ];
}
async function getAliases(options) {
    const args = process.platform === 'darwin' ? ['-icl', 'alias'] : ['-ic', 'alias'];
    return (0, common_1.getAliasesHelper)('bash', args, /^alias (?<alias>[a-zA-Z0-9\.:-]+)='(?<resolved>.+)'$/, options);
}
async function getBuiltins(options, scriptToRun, existingCommands) {
    const compgenOutput = await (0, common_1.execHelper)(scriptToRun, options);
    const filter = (cmd) => cmd && !existingCommands?.has(cmd);
    const builtins = compgenOutput.split('\n').filter(filter);
    const completions = [];
    if (builtins.find(r => r === '.')) {
        completions.push({
            label: '.',
            detail: 'Source a file in the current shell',
            kind: vscode.TerminalCompletionItemKind.Method
        });
    }
    for (const cmd of builtins) {
        if (typeof cmd === 'string') {
            try {
                const helpOutput = (await (0, common_1.execHelper)(`help ${cmd}`, options))?.trim();
                const helpLines = helpOutput?.split('\n');
                //TODO: This still has some extra spaces in it
                const outputDescription = helpLines.splice(1).map(line => line.trim()).join('');
                const args = helpLines?.[0]?.split(' ').slice(1).join(' ').trim();
                const { detail, documentation, description } = generateDetailAndDocs(outputDescription, args);
                completions.push({
                    label: { label: cmd, description },
                    detail,
                    documentation: new vscode.MarkdownString(documentation),
                    kind: vscode.TerminalCompletionItemKind.Method
                });
            }
            catch (e) {
                // Ignore errors
                console.log(`Error getting info for ${e}`);
                completions.push({
                    label: cmd,
                    kind: vscode.TerminalCompletionItemKind.Method
                });
            }
        }
    }
    return completions;
}
function generateDetailAndDocs(description, args) {
    let detail, documentation = '';
    const firstSentence = (text) => text.split('. ')[0] + '.';
    if (description) {
        description = firstSentence(description);
        detail = args;
        documentation = description;
    }
    return { detail, documentation, description };
}
//# sourceMappingURL=bash.js.map