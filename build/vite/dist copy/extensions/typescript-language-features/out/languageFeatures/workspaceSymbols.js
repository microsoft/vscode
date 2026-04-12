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
const fileSchemes = __importStar(require("../configuration/fileSchemes"));
const languageDescription_1 = require("../configuration/languageDescription");
const api_1 = require("../tsServer/api");
const modifiers_1 = require("../tsServer/protocol/modifiers");
const PConst = __importStar(require("../tsServer/protocol/protocol.const"));
const typeConverters = __importStar(require("../typeConverters"));
const arrays_1 = require("../utils/arrays");
const configuration_1 = require("../utils/configuration");
function getSymbolKind(item) {
    switch (item.kind) {
        case PConst.Kind.method: return vscode.SymbolKind.Method;
        case PConst.Kind.enum: return vscode.SymbolKind.Enum;
        case PConst.Kind.enumMember: return vscode.SymbolKind.EnumMember;
        case PConst.Kind.function: return vscode.SymbolKind.Function;
        case PConst.Kind.class: return vscode.SymbolKind.Class;
        case PConst.Kind.interface: return vscode.SymbolKind.Interface;
        case PConst.Kind.type: return vscode.SymbolKind.Class;
        case PConst.Kind.memberVariable: return vscode.SymbolKind.Field;
        case PConst.Kind.memberGetAccessor: return vscode.SymbolKind.Field;
        case PConst.Kind.memberSetAccessor: return vscode.SymbolKind.Field;
        case PConst.Kind.variable: return vscode.SymbolKind.Variable;
        default: return vscode.SymbolKind.Variable;
    }
}
class TypeScriptWorkspaceSymbolProvider {
    client;
    modeIds;
    constructor(client, modeIds) {
        this.client = client;
        this.modeIds = modeIds;
    }
    async provideWorkspaceSymbols(search, token) {
        let file;
        if (this.searchAllOpenProjects) {
            file = undefined;
        }
        else {
            const document = this.getDocument();
            file = document ? await this.toOpenedFiledPath(document) : undefined;
            if (!file && this.client.apiVersion.lt(api_1.API.v390)) {
                return [];
            }
        }
        const args = {
            file,
            searchValue: search,
            maxResultCount: 256,
        };
        const response = await this.client.execute('navto', args, token);
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return (0, arrays_1.coalesce)(response.body.map(item => this.toSymbolInformation(item)));
    }
    get searchAllOpenProjects() {
        return this.client.apiVersion.gte(api_1.API.v390)
            && (0, configuration_1.readUnifiedConfig)('workspaceSymbols.scope', 'allOpenProjects', { scope: null, fallbackSection: 'typescript' }) === 'allOpenProjects';
    }
    async toOpenedFiledPath(document) {
        if (document.uri.scheme === fileSchemes.git) {
            try {
                const path = vscode.Uri.file(JSON.parse(document.uri.query)?.path);
                if ((0, languageDescription_1.doesResourceLookLikeATypeScriptFile)(path) || (0, languageDescription_1.doesResourceLookLikeAJavaScriptFile)(path)) {
                    const document = await vscode.workspace.openTextDocument(path);
                    return this.client.toOpenTsFilePath(document);
                }
            }
            catch {
                // noop
            }
        }
        return this.client.toOpenTsFilePath(document);
    }
    toSymbolInformation(item) {
        if (item.kind === 'alias' && !item.containerName) {
            return;
        }
        const uri = this.client.toResource(item.file);
        if (fileSchemes.isOfScheme(uri, fileSchemes.chatCodeBlock)) {
            return;
        }
        const label = TypeScriptWorkspaceSymbolProvider.getLabel(item);
        const info = new vscode.SymbolInformation(label, getSymbolKind(item), item.containerName || '', typeConverters.Location.fromTextSpan(uri, item));
        const kindModifiers = item.kindModifiers ? (0, modifiers_1.parseKindModifier)(item.kindModifiers) : undefined;
        if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
            info.tags = [vscode.SymbolTag.Deprecated];
        }
        return info;
    }
    static getLabel(item) {
        const label = item.name;
        if (item.kind === 'method' || item.kind === 'function') {
            return label + '()';
        }
        return label;
    }
    getDocument() {
        // typescript wants to have a resource even when asking
        // general questions so we check the active editor. If this
        // doesn't match we take the first TS document.
        const activeDocument = vscode.window.activeTextEditor?.document;
        if (activeDocument) {
            if (this.modeIds.includes(activeDocument.languageId)) {
                return activeDocument;
            }
        }
        const documents = vscode.workspace.textDocuments;
        for (const document of documents) {
            if (this.modeIds.includes(document.languageId)) {
                return document;
            }
        }
        return undefined;
    }
}
function register(client, modeIds) {
    return vscode.languages.registerWorkspaceSymbolProvider(new TypeScriptWorkspaceSymbolProvider(client, modeIds));
}
//# sourceMappingURL=workspaceSymbols.js.map