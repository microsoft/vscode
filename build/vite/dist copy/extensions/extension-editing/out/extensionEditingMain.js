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
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const packageDocumentHelper_1 = require("./packageDocumentHelper");
const packageDocumentL10nSupport_1 = require("./packageDocumentL10nSupport");
const extensionLinter_1 = require("./extensionLinter");
function activate(context) {
    //package.json suggestions
    context.subscriptions.push(registerPackageDocumentCompletions());
    //package.json code actions for lint warnings
    context.subscriptions.push(registerCodeActionsProvider());
    // package.json l10n support
    context.subscriptions.push(new packageDocumentL10nSupport_1.PackageDocumentL10nSupport());
    context.subscriptions.push(new extensionLinter_1.ExtensionLinter());
}
function registerPackageDocumentCompletions() {
    return vscode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/package.json' }, {
        provideCompletionItems(document, position, token) {
            return new packageDocumentHelper_1.PackageDocument(document).provideCompletionItems(position, token);
        }
    });
}
function registerCodeActionsProvider() {
    return vscode.languages.registerCodeActionsProvider({ language: 'json', pattern: '**/package.json' }, {
        provideCodeActions(document, range, context, token) {
            return new packageDocumentHelper_1.PackageDocument(document).provideCodeActions(range, context, token);
        }
    });
}
//# sourceMappingURL=extensionEditingMain.js.map