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
exports.PackageDocumentL10nSupport = void 0;
const vscode = __importStar(require("vscode"));
const jsonc_parser_1 = require("jsonc-parser");
const packageJsonSelector = { language: 'json', pattern: '**/package.json' };
const packageNlsJsonSelector = { language: 'json', pattern: '**/package.nls.json' };
class PackageDocumentL10nSupport {
    _disposables = [];
    constructor() {
        this._disposables.push(vscode.languages.registerDefinitionProvider(packageJsonSelector, this));
        this._disposables.push(vscode.languages.registerDefinitionProvider(packageNlsJsonSelector, this));
        this._disposables.push(vscode.languages.registerReferenceProvider(packageNlsJsonSelector, this));
        this._disposables.push(vscode.languages.registerReferenceProvider(packageJsonSelector, this));
    }
    dispose() {
        for (const d of this._disposables) {
            d.dispose();
        }
    }
    async provideDefinition(document, position, _token) {
        const basename = document.uri.path.split('/').pop()?.toLowerCase();
        if (basename === 'package.json') {
            return this.provideNlsValueDefinition(document, position);
        }
        if (basename === 'package.nls.json') {
            return this.provideNlsKeyDefinition(document, position);
        }
        return undefined;
    }
    async provideNlsValueDefinition(packageJsonDoc, position) {
        const nlsRef = this.getNlsReferenceAtPosition(packageJsonDoc, position);
        if (!nlsRef) {
            return undefined;
        }
        const nlsUri = vscode.Uri.joinPath(packageJsonDoc.uri, '..', 'package.nls.json');
        return this.resolveNlsDefinition(nlsRef, nlsUri);
    }
    async provideNlsKeyDefinition(nlsDoc, position) {
        const nlsKey = this.getNlsKeyDefinitionAtPosition(nlsDoc, position);
        if (!nlsKey) {
            return undefined;
        }
        return this.resolveNlsDefinition(nlsKey, nlsDoc.uri);
    }
    async resolveNlsDefinition(origin, nlsUri) {
        const target = await this.findNlsKeyDeclaration(origin.key, nlsUri);
        if (!target) {
            return undefined;
        }
        return [{
                originSelectionRange: origin.range,
                targetUri: target.uri,
                targetRange: target.range,
            }];
    }
    getNlsReferenceAtPosition(packageJsonDoc, position) {
        const location = (0, jsonc_parser_1.getLocation)(packageJsonDoc.getText(), packageJsonDoc.offsetAt(position));
        if (!location.previousNode || location.previousNode.type !== 'string') {
            return undefined;
        }
        const value = (0, jsonc_parser_1.getNodeValue)(location.previousNode);
        if (typeof value !== 'string') {
            return undefined;
        }
        const match = value.match(/^%(.+)%$/);
        if (!match) {
            return undefined;
        }
        const nodeStart = packageJsonDoc.positionAt(location.previousNode.offset);
        const nodeEnd = packageJsonDoc.positionAt(location.previousNode.offset + location.previousNode.length);
        return { key: match[1], range: new vscode.Range(nodeStart, nodeEnd) };
    }
    async provideReferences(document, position, context, _token) {
        const basename = document.uri.path.split('/').pop()?.toLowerCase();
        if (basename === 'package.nls.json') {
            return this.provideNlsKeyReferences(document, position, context);
        }
        if (basename === 'package.json') {
            return this.provideNlsValueReferences(document, position, context);
        }
        return undefined;
    }
    async provideNlsKeyReferences(nlsDoc, position, context) {
        const nlsKey = this.getNlsKeyDefinitionAtPosition(nlsDoc, position);
        if (!nlsKey) {
            return undefined;
        }
        const packageJsonUri = vscode.Uri.joinPath(nlsDoc.uri, '..', 'package.json');
        return this.findAllNlsReferences(nlsKey.key, packageJsonUri, nlsDoc.uri, context);
    }
    async provideNlsValueReferences(packageJsonDoc, position, context) {
        const nlsRef = this.getNlsReferenceAtPosition(packageJsonDoc, position);
        if (!nlsRef) {
            return undefined;
        }
        const nlsUri = vscode.Uri.joinPath(packageJsonDoc.uri, '..', 'package.nls.json');
        return this.findAllNlsReferences(nlsRef.key, packageJsonDoc.uri, nlsUri, context);
    }
    async findAllNlsReferences(nlsKey, packageJsonUri, nlsUri, context) {
        const locations = await this.findNlsReferencesInPackageJson(nlsKey, packageJsonUri);
        if (context.includeDeclaration) {
            const decl = await this.findNlsKeyDeclaration(nlsKey, nlsUri);
            if (decl) {
                locations.push(decl);
            }
        }
        return locations;
    }
    async findNlsKeyDeclaration(nlsKey, nlsUri) {
        try {
            const nlsDoc = await vscode.workspace.openTextDocument(nlsUri);
            const nlsTree = (0, jsonc_parser_1.parseTree)(nlsDoc.getText());
            if (!nlsTree) {
                return undefined;
            }
            const node = (0, jsonc_parser_1.findNodeAtLocation)(nlsTree, [nlsKey]);
            if (!node?.parent) {
                return undefined;
            }
            const keyNode = node.parent.children?.[0];
            if (!keyNode) {
                return undefined;
            }
            const start = nlsDoc.positionAt(keyNode.offset);
            const end = nlsDoc.positionAt(keyNode.offset + keyNode.length);
            return new vscode.Location(nlsUri, new vscode.Range(start, end));
        }
        catch {
            return undefined;
        }
    }
    async findNlsReferencesInPackageJson(nlsKey, packageJsonUri) {
        let packageJsonDoc;
        try {
            packageJsonDoc = await vscode.workspace.openTextDocument(packageJsonUri);
        }
        catch {
            return [];
        }
        const text = packageJsonDoc.getText();
        const needle = `%${nlsKey}%`;
        const locations = [];
        (0, jsonc_parser_1.visit)(text, {
            onLiteralValue(value, offset, length) {
                if (value === needle) {
                    const start = packageJsonDoc.positionAt(offset);
                    const end = packageJsonDoc.positionAt(offset + length);
                    locations.push(new vscode.Location(packageJsonUri, new vscode.Range(start, end)));
                }
            }
        });
        return locations;
    }
    getNlsKeyDefinitionAtPosition(nlsDoc, position) {
        const location = (0, jsonc_parser_1.getLocation)(nlsDoc.getText(), nlsDoc.offsetAt(position));
        // Must be on a top-level property key
        if (location.path.length !== 1 || !location.isAtPropertyKey || !location.previousNode) {
            return undefined;
        }
        const key = location.path[0];
        const start = nlsDoc.positionAt(location.previousNode.offset);
        const end = nlsDoc.positionAt(location.previousNode.offset + location.previousNode.length);
        return { key, range: new vscode.Range(start, end) };
    }
}
exports.PackageDocumentL10nSupport = PackageDocumentL10nSupport;
//# sourceMappingURL=packageDocumentL10nSupport.js.map