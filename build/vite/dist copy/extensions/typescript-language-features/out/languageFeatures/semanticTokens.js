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
const typescriptService_1 = require("../typescriptService");
const dependentRegistration_1 = require("./util/dependentRegistration");
// as we don't do deltas, for performance reasons, don't compute semantic tokens for documents above that limit
const CONTENT_LENGTH_LIMIT = 100000;
function register(selector, client) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        const provider = new DocumentSemanticTokensProvider(client);
        return vscode.languages.registerDocumentRangeSemanticTokensProvider(selector.semantic, provider, provider.getLegend());
    });
}
class DocumentSemanticTokensProvider {
    client;
    constructor(client) {
        this.client = client;
    }
    getLegend() {
        return new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
    }
    async provideDocumentSemanticTokens(document, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file || document.getText().length > CONTENT_LENGTH_LIMIT) {
            return null;
        }
        return this.provideSemanticTokens(document, { file, start: 0, length: document.getText().length }, token);
    }
    async provideDocumentRangeSemanticTokens(document, range, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file || (document.offsetAt(range.end) - document.offsetAt(range.start) > CONTENT_LENGTH_LIMIT)) {
            return null;
        }
        const start = document.offsetAt(range.start);
        const length = document.offsetAt(range.end) - start;
        return this.provideSemanticTokens(document, { file, start, length }, token);
    }
    async provideSemanticTokens(document, requestArg, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return null;
        }
        const versionBeforeRequest = document.version;
        const response = await this.client.execute('encodedSemanticClassifications-full', { ...requestArg, format: '2020' }, token, {
            cancelOnResourceChange: document.uri
        });
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        const versionAfterRequest = document.version;
        if (versionBeforeRequest !== versionAfterRequest) {
            // cannot convert result's offsets to (line;col) values correctly
            // a new request will come in soon...
            //
            // here we cannot return null, because returning null would remove all semantic tokens.
            // we must throw to indicate that the semantic tokens should not be removed.
            // using the string busy here because it is not logged to error telemetry if the error text contains busy.
            // as the new request will come in right after our response, we first wait for the document activity to stop
            await waitForDocumentChangesToEnd(document);
            throw new vscode.CancellationError();
        }
        const tokenSpan = response.body.spans;
        const builder = new vscode.SemanticTokensBuilder();
        for (let i = 0; i < tokenSpan.length;) {
            const offset = tokenSpan[i++];
            const length = tokenSpan[i++];
            const tsClassification = tokenSpan[i++];
            const tokenType = getTokenTypeFromClassification(tsClassification);
            if (tokenType === undefined) {
                continue;
            }
            const tokenModifiers = getTokenModifierFromClassification(tsClassification);
            // we can use the document's range conversion methods because the result is at the same version as the document
            const startPos = document.positionAt(offset);
            const endPos = document.positionAt(offset + length);
            for (let line = startPos.line; line <= endPos.line; line++) {
                const startCharacter = (line === startPos.line ? startPos.character : 0);
                const endCharacter = (line === endPos.line ? endPos.character : document.lineAt(line).text.length);
                builder.push(line, startCharacter, endCharacter - startCharacter, tokenType, tokenModifiers);
            }
        }
        return builder.build();
    }
}
function waitForDocumentChangesToEnd(document) {
    let version = document.version;
    return new Promise((resolve) => {
        const iv = setInterval(_ => {
            if (document.version === version) {
                clearInterval(iv);
                resolve();
            }
            version = document.version;
        }, 400);
    });
}
function getTokenTypeFromClassification(tsClassification) {
    if (tsClassification > 255 /* TokenEncodingConsts.modifierMask */) {
        return (tsClassification >> 8 /* TokenEncodingConsts.typeOffset */) - 1;
    }
    return undefined;
}
function getTokenModifierFromClassification(tsClassification) {
    return tsClassification & 255 /* TokenEncodingConsts.modifierMask */;
}
const tokenTypes = [];
tokenTypes[0 /* TokenType.class */] = 'class';
tokenTypes[1 /* TokenType.enum */] = 'enum';
tokenTypes[2 /* TokenType.interface */] = 'interface';
tokenTypes[3 /* TokenType.namespace */] = 'namespace';
tokenTypes[4 /* TokenType.typeParameter */] = 'typeParameter';
tokenTypes[5 /* TokenType.type */] = 'type';
tokenTypes[6 /* TokenType.parameter */] = 'parameter';
tokenTypes[7 /* TokenType.variable */] = 'variable';
tokenTypes[8 /* TokenType.enumMember */] = 'enumMember';
tokenTypes[9 /* TokenType.property */] = 'property';
tokenTypes[10 /* TokenType.function */] = 'function';
tokenTypes[11 /* TokenType.method */] = 'method';
const tokenModifiers = [];
tokenModifiers[2 /* TokenModifier.async */] = 'async';
tokenModifiers[0 /* TokenModifier.declaration */] = 'declaration';
tokenModifiers[3 /* TokenModifier.readonly */] = 'readonly';
tokenModifiers[1 /* TokenModifier.static */] = 'static';
tokenModifiers[5 /* TokenModifier.local */] = 'local';
tokenModifiers[4 /* TokenModifier.defaultLibrary */] = 'defaultLibrary';
//# sourceMappingURL=semanticTokens.js.map