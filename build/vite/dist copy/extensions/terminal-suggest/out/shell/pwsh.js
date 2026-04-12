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
exports.getPwshGlobals = getPwshGlobals;
exports.isObject = isObject;
const vscode = __importStar(require("vscode"));
const common_1 = require("./common");
async function getPwshGlobals(options, existingCommands) {
    return [
        ...await getAliases(options, existingCommands),
        ...await getCommands(options, existingCommands),
    ];
}
const pwshCommandTypeToCompletionKind = new Map([
    [1 /* PwshCommandType.Alias */, vscode.TerminalCompletionItemKind.Alias],
    [2 /* PwshCommandType.Function */, vscode.TerminalCompletionItemKind.Method],
    [4 /* PwshCommandType.Filter */, vscode.TerminalCompletionItemKind.Method],
    [8 /* PwshCommandType.Cmdlet */, vscode.TerminalCompletionItemKind.Method],
    [16 /* PwshCommandType.ExternalScript */, vscode.TerminalCompletionItemKind.Method],
    [32 /* PwshCommandType.Application */, vscode.TerminalCompletionItemKind.Method],
    [64 /* PwshCommandType.Script */, vscode.TerminalCompletionItemKind.Method],
    [256 /* PwshCommandType.Configuration */, vscode.TerminalCompletionItemKind.Argument],
]);
async function getAliases(options, existingCommands) {
    const output = await (0, common_1.execHelper)('Get-Command -CommandType Alias | Select-Object Name, CommandType, Definition, DisplayName, ModuleName, @{Name="Version";Expression={$_.Version.ToString()}} | ConvertTo-Json', {
        ...options,
        maxBuffer: 1024 * 1024 * 100 // This is a lot of content, increase buffer size
    });
    let json;
    try {
        json = JSON.parse(output);
    }
    catch (e) {
        console.error('Error parsing output:', e);
        return [];
    }
    if (!Array.isArray(json)) {
        return [];
    }
    return json
        .filter(isPwshGetCommandEntry)
        .map(e => {
        // Aliases sometimes use the same Name and DisplayName, show them as methods in this case.
        const isAlias = e.Name !== e.DisplayName;
        const detailParts = [];
        if (e.Definition) {
            detailParts.push(e.Definition);
        }
        if (e.ModuleName && e.Version) {
            detailParts.push(`${e.ModuleName} v${e.Version}`);
        }
        let definitionCommand = undefined;
        if (e.Definition) {
            let definitionIndex = e.Definition.indexOf(' ');
            if (definitionIndex === -1) {
                definitionIndex = e.Definition.length;
                definitionCommand = e.Definition.substring(0, definitionIndex);
            }
        }
        return {
            label: e.Name,
            detail: detailParts.join('\n\n'),
            kind: (isAlias
                ? vscode.TerminalCompletionItemKind.Alias
                : vscode.TerminalCompletionItemKind.Method),
            definitionCommand,
        };
    });
}
async function getCommands(options, existingCommands) {
    const output = await (0, common_1.execHelper)('Get-Command -All | Select-Object Name, CommandType, Definition, ModuleName, @{Name="Version";Expression={$_.Version.ToString()}} | ConvertTo-Json', {
        ...options,
        maxBuffer: 1024 * 1024 * 100 // This is a lot of content, increase buffer size
    });
    let json;
    try {
        json = JSON.parse(output);
    }
    catch (e) {
        console.error('Error parsing pwsh output:', e);
        return [];
    }
    if (!Array.isArray(json)) {
        return [];
    }
    return (json
        .filter(isPwshGetCommandEntry)
        .filter(e => e.CommandType !== 1 /* PwshCommandType.Alias */)
        .map(e => {
        const detailParts = [];
        if (e.Definition) {
            detailParts.push(e.Definition.trim());
        }
        if (e.ModuleName && e.Version) {
            detailParts.push(`${e.ModuleName} v${e.Version}`);
        }
        return {
            label: e.Name,
            detail: detailParts.join('\n\n'),
            kind: pwshCommandTypeToCompletionKind.get(e.CommandType)
        };
    }));
}
function isPwshGetCommandEntry(entry) {
    return (isObject(entry) &&
        'Name' in entry && typeof entry.Name === 'string' &&
        'CommandType' in entry && typeof entry.CommandType === 'number' &&
        (!('DisplayName' in entry) || typeof entry.DisplayName === 'string' || entry.DisplayName === null) &&
        (!('Definition' in entry) || typeof entry.Definition === 'string' || entry.Definition === null) &&
        (!('ModuleName' in entry) || typeof entry.ModuleName === 'string' || entry.ModuleName === null) &&
        (!('Version' in entry) || typeof entry.Version === 'string' || entry.Version === null));
}
/**
 * @returns whether the provided parameter is of type `object` but **not**
 *	`null`, an `array`, a `regexp`, nor a `date`.
 */
function isObject(obj) {
    // The method can't do a type cast since there are type (like strings) which
    // are subclasses of any put not positvely matched by the function. Hence type
    // narrowing results in wrong results.
    return typeof obj === 'object'
        && obj !== null
        && !Array.isArray(obj)
        && !(obj instanceof RegExp)
        && !(obj instanceof Date);
}
//# sourceMappingURL=pwsh.js.map