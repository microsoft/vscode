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
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const api_1 = require("../tsServer/api");
const modifiers_1 = require("../tsServer/protocol/modifiers");
const PConst = __importStar(require("../tsServer/protocol/protocol.const"));
const typeConverters = __importStar(require("../typeConverters"));
const typescriptService_1 = require("../typescriptService");
const dependentRegistration_1 = require("./util/dependentRegistration");
class TypeScriptCallHierarchySupport {
    client;
    static minVersion = api_1.API.v380;
    constructor(client) {
        this.client = client;
    }
    async prepareCallHierarchy(document, position, token) {
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return undefined;
        }
        const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
        const response = await this.client.execute('prepareCallHierarchy', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return Array.isArray(response.body)
            ? response.body.map(fromProtocolCallHierarchyItem)
            : fromProtocolCallHierarchyItem(response.body);
    }
    async provideCallHierarchyIncomingCalls(item, token) {
        const filepath = this.client.toTsFilePath(item.uri);
        if (!filepath) {
            return undefined;
        }
        const args = typeConverters.Position.toFileLocationRequestArgs(filepath, item.selectionRange.start);
        const response = await this.client.execute('provideCallHierarchyIncomingCalls', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return response.body.map(fromProtocolCallHierarchyIncomingCall);
    }
    async provideCallHierarchyOutgoingCalls(item, token) {
        const filepath = this.client.toTsFilePath(item.uri);
        if (!filepath) {
            return undefined;
        }
        const args = typeConverters.Position.toFileLocationRequestArgs(filepath, item.selectionRange.start);
        const response = await this.client.execute('provideCallHierarchyOutgoingCalls', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return response.body.map(fromProtocolCallHierarchyOutgoingCall);
    }
}
function isSourceFileItem(item) {
    return item.kind === PConst.Kind.script || item.kind === PConst.Kind.module && item.selectionSpan.start.line === 1 && item.selectionSpan.start.offset === 1;
}
function fromProtocolCallHierarchyItem(item) {
    const useFileName = isSourceFileItem(item);
    const name = useFileName ? path.basename(item.file) : item.name;
    const detail = useFileName ? vscode.workspace.asRelativePath(path.dirname(item.file)) : item.containerName ?? '';
    const result = new vscode.CallHierarchyItem(typeConverters.SymbolKind.fromProtocolScriptElementKind(item.kind), name, detail, vscode.Uri.file(item.file), typeConverters.Range.fromTextSpan(item.span), typeConverters.Range.fromTextSpan(item.selectionSpan));
    const kindModifiers = item.kindModifiers ? (0, modifiers_1.parseKindModifier)(item.kindModifiers) : undefined;
    if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
        result.tags = [vscode.SymbolTag.Deprecated];
    }
    return result;
}
function fromProtocolCallHierarchyIncomingCall(item) {
    return new vscode.CallHierarchyIncomingCall(fromProtocolCallHierarchyItem(item.from), item.fromSpans.map(typeConverters.Range.fromTextSpan));
}
function fromProtocolCallHierarchyOutgoingCall(item) {
    return new vscode.CallHierarchyOutgoingCall(fromProtocolCallHierarchyItem(item.to), item.fromSpans.map(typeConverters.Range.fromTextSpan));
}
function register(selector, client) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireMinVersion)(client, TypeScriptCallHierarchySupport.minVersion),
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerCallHierarchyProvider(selector.semantic, new TypeScriptCallHierarchySupport(client));
    });
}
//# sourceMappingURL=callHierarchy.js.map