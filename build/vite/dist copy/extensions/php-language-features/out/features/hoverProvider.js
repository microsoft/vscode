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
const vscode_1 = require("vscode");
const markedTextUtil_1 = require("./utils/markedTextUtil");
const phpGlobals = __importStar(require("./phpGlobals"));
const phpGlobalFunctions = __importStar(require("./phpGlobalFunctions"));
class PHPHoverProvider {
    provideHover(document, position, _token) {
        const enable = vscode_1.workspace.getConfiguration('php').get('suggest.basic', true);
        if (!enable) {
            return undefined;
        }
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }
        const name = document.getText(wordRange);
        const entry = phpGlobalFunctions.globalfunctions[name] || phpGlobals.compiletimeconstants[name] || phpGlobals.globalvariables[name] || phpGlobals.keywords[name];
        if (entry && entry.description) {
            const signature = name + (entry.signature || '');
            const contents = [(0, markedTextUtil_1.textToMarkedString)(entry.description), { language: 'php', value: signature }];
            return new vscode_1.Hover(contents, wordRange);
        }
        return undefined;
    }
}
exports.default = PHPHoverProvider;
//# sourceMappingURL=hoverProvider.js.map