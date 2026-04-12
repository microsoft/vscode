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
class SmartSelection {
    client;
    constructor(client) {
        this.client = client;
    }
    async provideSelectionRanges(document, positions, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return undefined;
        }
        const args = {
            file,
            locations: positions.map(typeConverters.Position.toLocation)
        };
        const response = await this.client.execute('selectionRange', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return response.body.map(SmartSelection.convertSelectionRange);
    }
    static convertSelectionRange(selectionRange) {
        return new vscode.SelectionRange(typeConverters.Range.fromTextSpan(selectionRange.textSpan), selectionRange.parent ? SmartSelection.convertSelectionRange(selectionRange.parent) : undefined);
    }
}
function register(selector, client) {
    return vscode.languages.registerSelectionRangeProvider(selector.syntax, new SmartSelection(client));
}
//# sourceMappingURL=smartSelect.js.map