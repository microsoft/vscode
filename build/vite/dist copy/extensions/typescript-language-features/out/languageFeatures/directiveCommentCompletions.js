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
const api_1 = require("../tsServer/api");
const tsDirectives = [
    {
        value: '@ts-check',
        description: vscode.l10n.t("Enables semantic checking in a JavaScript file. Must be at the top of a file.")
    }, {
        value: '@ts-nocheck',
        description: vscode.l10n.t("Disables semantic checking in a JavaScript file. Must be at the top of a file.")
    }, {
        value: '@ts-ignore',
        description: vscode.l10n.t("Suppresses @ts-check errors on the next line of a file.")
    }
];
const tsDirectives390 = [
    ...tsDirectives,
    {
        value: '@ts-expect-error',
        description: vscode.l10n.t("Suppresses @ts-check errors on the next line of a file, expecting at least one to exist.")
    }
];
class DirectiveCommentCompletionProvider {
    client;
    constructor(client) {
        this.client = client;
    }
    provideCompletionItems(document, position, _token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return [];
        }
        const line = document.lineAt(position.line).text;
        const prefix = line.slice(0, position.character);
        const match = prefix.match(/^\s*\/\/+\s?(@[a-zA-Z\-]*)?$/);
        if (match) {
            const directives = this.client.apiVersion.gte(api_1.API.v390)
                ? tsDirectives390
                : tsDirectives;
            return directives.map(directive => {
                const item = new vscode.CompletionItem(directive.value, vscode.CompletionItemKind.Snippet);
                item.detail = directive.description;
                item.range = new vscode.Range(position.line, Math.max(0, position.character - (match[1] ? match[1].length : 0)), position.line, position.character);
                return item;
            });
        }
        return [];
    }
}
function register(selector, client) {
    return vscode.languages.registerCompletionItemProvider(selector.syntax, new DirectiveCommentCompletionProvider(client), '@');
}
//# sourceMappingURL=directiveCommentCompletions.js.map