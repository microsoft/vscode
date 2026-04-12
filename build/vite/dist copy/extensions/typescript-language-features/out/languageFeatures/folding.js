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
exports.register = register;
const vscode = __importStar(require("vscode"));
const typeConverters = __importStar(require("../typeConverters"));
const arrays_1 = require("../utils/arrays");
class TypeScriptFoldingProvider {
    client;
    constructor(client) {
        this.client = client;
    }
    async provideFoldingRanges(document, _context, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return;
        }
        const args = { file };
        const response = await this.client.execute('getOutliningSpans', args, token);
        if (response.type !== 'response' || !response.body) {
            return;
        }
        return (0, arrays_1.coalesce)(response.body.map(span => this.convertOutliningSpan(span, document)));
    }
    convertOutliningSpan(span, document) {
        const range = typeConverters.Range.fromTextSpan(span.textSpan);
        const kind = TypeScriptFoldingProvider.getFoldingRangeKind(span);
        // Workaround for #49904
        if (span.kind === 'comment') {
            const line = document.lineAt(range.start.line).text;
            if (/\/\/\s*#endregion/gi.test(line)) {
                return undefined;
            }
        }
        const start = range.start.line;
        const end = this.adjustFoldingEnd(range, document);
        return new vscode.FoldingRange(start, end, kind);
    }
    static foldEndPairCharacters = ['}', ']', ')', '`', '>'];
    adjustFoldingEnd(range, document) {
        // workaround for #47240
        if (range.end.character > 0) {
            const foldEndCharacter = document.getText(new vscode.Range(range.end.translate(0, -1), range.end));
            if (TypeScriptFoldingProvider.foldEndPairCharacters.includes(foldEndCharacter)) {
                return Math.max(range.end.line - 1, range.start.line);
            }
        }
        return range.end.line;
    }
    static getFoldingRangeKind(span) {
        switch (span.kind) {
            case 'comment': return vscode.FoldingRangeKind.Comment;
            case 'region': return vscode.FoldingRangeKind.Region;
            case 'imports': return vscode.FoldingRangeKind.Imports;
            case 'code':
            default: return undefined;
        }
    }
}
function register(selector, client) {
    return vscode.languages.registerFoldingRangeProvider(selector.syntax, new TypeScriptFoldingProvider(client));
}
//# sourceMappingURL=folding.js.map